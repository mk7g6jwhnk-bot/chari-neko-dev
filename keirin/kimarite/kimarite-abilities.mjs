const PRIOR_STRENGTH = 7;
const QUALITY_SHRINK = 3;
const IQR_TO_SIGMA = 1.349;
const MIN_SCALE = 0.01;

const CONFIG = {
  girls: {
    sprintPower: { key: "makuri", profileKey: "makuri", baseline: 0.251, median: 0.250502, iqr: 0.191615 },
    finishPower: { key: "sasi", profileKey: "difference", baseline: 0.224, median: 0.196769, iqr: 0.131557 },
    trackingSkill: { key: "mark", profileKey: "mark", baseline: 0.370, median: 0.294211, iqr: 0.236789 }
  },
  standard: {
    sprintPower: { key: "makuri", profileKey: "makuri", baseline: 0.230, median: 0.178889, iqr: 0.111494 },
    finishPower: { key: "sasi", profileKey: "difference", baseline: 0.360, median: 0.376667, iqr: 0.208571 },
    trackingSkill: { key: "mark", profileKey: "mark", baseline: 0.185, median: 0.163929, iqr: 0.166667 }
  }
};

export function applyKimariteAbilities(participant) {
  const category = participant?.raceCategory === "girls" ? "girls" : participant?.raceCategory === "standard" ? "standard" : null;
  const evidence = participant?.officialKimariteEvidence;
  const neutral = {
    sprintPower: 5,
    finishPower: 5,
    trackingSkill: 5,
    kimariteAbilityEvidence: {
      adopted: false,
      reason: !category ? "category-unavailable" : "kimarite-evidence-unavailable"
    }
  };
  if (!category) return { ...participant, ...neutral };
  if (!isUsableEvidence(evidence)) {
    return fromOfficialProfileRates(participant, category) || { ...participant, ...neutral };
  }

  const n = integer(evidence.totalQuinellaCount);
  if (n === null || n <= 0) {
    return {
      ...participant,
      ...neutral,
      kimariteAbilityEvidence: { adopted: false, reason: n === 0 ? "quinella-count-zero" : "quinella-count-missing", n }
    };
  }

  const result = {};
  const details = {};
  for (const [ability, cfg] of Object.entries(CONFIG[category])) {
    const count = integer(evidence?.[cfg.key]?.Sum_Cnt ?? evidence?.[cfg.key]?.sum ?? evidence?.[cfg.key]?.total);
    if (count === null || count < 0 || count > n) {
      result[ability] = 5;
      details[ability] = { value: 5, adopted: false, reason: `${cfg.key}-count-invalid`, count, n };
      continue;
    }
    const posterior = (count + PRIOR_STRENGTH * cfg.baseline) / (n + PRIOR_STRENGTH);
    const scale = Math.max(cfg.iqr / IQR_TO_SIGMA, MIN_SCALE);
    const z = (posterior - cfg.median) / scale;
    const latent = clamp(normalCdf(z) * 10, 0.25, 9.75);
    const quality = n / (n + QUALITY_SHRINK);
    const value = round(clamp(5 + quality * (latent - 5), 0.5, 9.5));
    result[ability] = value;
    details[ability] = {
      adopted: true,
      value,
      sourceKey: cfg.key,
      count,
      n,
      share: round(count / n),
      posterior: round(posterior),
      latent: round(latent),
      quality: round(quality),
      confidence: confidence(n),
      baseline: cfg.baseline,
      posteriorMedian: cfg.median,
      posteriorIqr: cfg.iqr,
      priorStrength: PRIOR_STRENGTH,
      qualityShrink: QUALITY_SHRINK
    };
  }
  return {
    ...participant,
    ...result,
    kimariteAbilityEvidence: {
      adopted: Object.values(details).some(item => item.adopted),
      category,
      n,
      confidence: confidence(n),
      sourceType: evidence.sourceType || "JSJ068",
      details
    }
  };
}


function fromOfficialProfileRates(participant, category) {
  const profile = participant?.officialProfileEvidence;
  if (!profile || profile.identityPassed !== true) return null;
  const rates = profile.winningStyleRates;
  if (!rates || typeof rates !== "object") return null;

  const result = {};
  const details = {};
  let adoptedAny = false;
  for (const [ability, cfg] of Object.entries(CONFIG[category])) {
    const share = normalizeProfileShare(rates?.[cfg.profileKey]);
    if (share === null) {
      result[ability] = 5;
      details[ability] = { value: 5, adopted: false, reason: `${cfg.profileKey}-rate-missing` };
      continue;
    }
    const scale = Math.max(cfg.iqr / IQR_TO_SIGMA, MIN_SCALE);
    const z = (share - cfg.median) / scale;
    const latent = clamp(normalCdf(z) * 10, 0.25, 9.75);
    // Profile percentages are a useful fallback but do not expose a clean
    // sample size here. Keep the effect deliberately softer than JSJ068.
    const quality = 0.45;
    const value = round(clamp(5 + quality * (latent - 5), 0.5, 9.5));
    result[ability] = value;
    details[ability] = {
      adopted: true,
      value,
      sourceKey: `officialProfileEvidence.winningStyleRates.${cfg.profileKey}`,
      share: round(share),
      latent: round(latent),
      quality,
      confidence: "low",
      posteriorMedian: cfg.median,
      posteriorIqr: cfg.iqr
    };
    adoptedAny = true;
  }
  if (!adoptedAny) return null;
  return {
    ...participant,
    ...result,
    kimariteAbilityEvidence: {
      adopted: true,
      category,
      n: null,
      confidence: "low",
      sourceType: "official-profile-winning-style-rates",
      details
    }
  };
}

function normalizeProfileShare(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  const share = number > 1 ? number / 100 : number;
  return share >= 0 && share <= 1 ? share : null;
}

function isUsableEvidence(evidence) {
  if (!evidence || typeof evidence !== "object") return false;
  if (evidence.identityPassed === false || evidence.targetIdentityPassed === false) return false;
  if (evidence.status && !["ok", "available", "verified"].includes(String(evidence.status).toLowerCase())) return false;
  return true;
}
function integer(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}
function confidence(n) { if (n <= 5) return "low"; if (n <= 10) return "medium-low"; if (n <= 20) return "medium"; return "high"; }
function normalCdf(x) { return 0.5 * (1 + erf(x / Math.SQRT2)); }
function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return sign * y;
}
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function round(value) { return Math.round(value * 1e6) / 1e6; }
