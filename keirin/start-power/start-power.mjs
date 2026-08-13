import { KEIRIN_START_POWER_BASELINE } from "../config/start-power-baseline-v1.mjs";


export function applyStartPowerEvidence(participants, {
  baseline = KEIRIN_START_POWER_BASELINE
} = {}) {
  return (Array.isArray(participants) ? participants : []).map(participant => {
    const evidence = buildStartPowerEvidence(participant, baseline);
    return {
      ...participant,
      startPower: evidence.value,
      startPowerEvidence: evidence
    };
  });
}

export function buildStartPowerEvidence(participant, baseline = KEIRIN_START_POWER_BASELINE) {
  const profile = participant?.officialProfileEvidence;
  const raceCategory = resolveCategory(participant?.raceCategory);
  const categoryBaseline = raceCategory ? baseline.categories?.[raceCategory] : null;
  const profileIdentityPassed = profile?.identityPassed === true;
  const officialTotalStarts = nullableNonNegativeInteger(profile?.officialTotalStarts);
  const rawBackCount = nullableNonNegativeNumber(profile?.backCount);
  const rawHomeCount = nullableNonNegativeNumber(profile?.homeCount);
  const ridingStyle = nullableText(profile?.ridingStyle);
  const escapeRate = nullableNonNegativeNumber(profile?.winningStyleRates?.escape);
  const foreignFlag = participant?.officialForeignFlag === true;
  const sparseSampleFlag = officialTotalStarts !== null && officialTotalStarts <= 10;
  const missingInputs = [
    !profileIdentityPassed ? "verifiedOfficialProfile" : null,
    officialTotalStarts === null ? "officialTotalStarts" : null,
    rawBackCount === null ? "backCount" : null,
    rawHomeCount === null ? "homeCount" : null,
    !categoryBaseline ? "raceCategoryBaseline" : null
  ].filter(Boolean);

  const neutral = overrides => ({
    value: null,
    usable: false,
    evidenceStatus: "UNUSABLE",
    confidence: "low",
    officialTotalStarts,
    rawBackCount,
    rawHomeCount,
    bFrequency: null,
    hFrequency: null,
    shrunkBFrequency: null,
    shrunkHFrequency: null,
    latentScore: null,
    bPercentileScore: null,
    hPercentileScore: null,
    startsQuality: 0,
    sparseSampleFlag: officialTotalStarts === 0 ? true : sparseSampleFlag,
    raceCategory,
    ridingStyle,
    ridingStyleConsistency: null,
    escapeRate,
    foreignFlag,
    profileIdentityPassed,
    priorStrength: baseline.priorStrength,
    baselineVersion: baseline.baselineVersion,
    baselineSchemaVersion: baseline.schemaVersion,
    inputsUsed: [],
    missingInputs,
    ...overrides
  });

  if (missingInputs.length > 0) return neutral({ evidenceStatus: "MISSING_INPUTS" });
  if (officialTotalStarts === 0) {
    return neutral({
      evidenceStatus: "ZERO_STARTS",
      inputsUsed: ["officialTotalStarts.actualZero"],
      missingInputs: []
    });
  }

  const bFrequency = rawBackCount / officialTotalStarts;
  const hFrequency = rawHomeCount / officialTotalStarts;
  const priorStrength = baseline.priorStrength;

  // No observed B/H events is not evidence of either high or low initiative.
  // The empirical-Bayes prior is useful for sparse non-zero samples, but when
  // both observed counts are exactly zero it can move a short sample toward
  // the population mean and, after percentile mapping, create a falsely high
  // "ability" score (e.g. 0/0 over 3 starts > 0/0 over 24 starts).
  // Keep this case neutral and expose the condition in the audit trail.
  const noObservedBH = rawBackCount === 0 && rawHomeCount === 0;
  const shrunkBFrequency = shrinkFrequency(
    rawBackCount,
    officialTotalStarts,
    priorStrength,
    categoryBaseline.bFrequency.mean
  );
  const shrunkHFrequency = shrinkFrequency(
    rawHomeCount,
    officialTotalStarts,
    priorStrength,
    categoryBaseline.hFrequency.mean
  );
  // Convert each shrunk B/H frequency against the actual active-racer census
  // rather than assuming the distribution is normal.  The previous robust-Z
  // + normal-CDF mapping saturated too quickly: a rider only a little above
  // the empirical p75 could jump into the 9.x range.  Piecewise empirical
  // quantile mapping keeps the score interpretable (roughly population
  // percentile / 10) and preserves the observed skew of B/H frequencies.
  const bPercentileScore = noObservedBH
    ? 5
    : empiricalQuantileScore(
        shrunkBFrequency,
        categoryBaseline.shrunkBFrequency
      );
  const hPercentileScore = noObservedBH
    ? 5
    : empiricalQuantileScore(
        shrunkHFrequency,
        categoryBaseline.shrunkHFrequency
      );
  const latentScore = noObservedBH
    ? 5
    : clamp((bPercentileScore + hPercentileScore) / 2, 0.5, 9.5);
  const startsQuality = officialTotalStarts / (officialTotalStarts + priorStrength);
  // Sample-size uncertainty is already handled once by the empirical-Bayes
  // shrinkFrequency() step above. Do not pull the resulting latent ability
  // toward neutral 5 a second time; that double shrink was collapsing most
  // riders into a narrow 5.x band. Keep startsQuality as diagnostics/confidence
  // metadata only.
  const value = clamp(latentScore, 0.5, 9.5);

  return {
    value: round(value),
    usable: true,
    evidenceStatus: "VERIFIED",
    confidence: confidenceFor({ officialTotalStarts, foreignFlag }),
    officialTotalStarts,
    rawBackCount,
    rawHomeCount,
    bFrequency: round(bFrequency),
    hFrequency: round(hFrequency),
    shrunkBFrequency: round(shrunkBFrequency),
    shrunkHFrequency: round(shrunkHFrequency),
    latentScore: round(latentScore),
    bPercentileScore: round(bPercentileScore),
    hPercentileScore: round(hPercentileScore),
    startsQuality: round(startsQuality),
    sparseSampleFlag,
    raceCategory,
    ridingStyle,
    ridingStyleConsistency: ridingStyleConsistency({
      ridingStyle,
      bFrequency,
      hFrequency,
      categoryBaseline
    }),
    escapeRate,
    foreignFlag,
    profileIdentityPassed,
    priorStrength,
    baselineVersion: baseline.baselineVersion,
    baselineSchemaVersion: baseline.schemaVersion,
    noObservedBH,
    bhEvidenceStatus: noObservedBH ? "NO_OBSERVED_BH_NEUTRAL" : "OBSERVED_BH",
    inputsUsed: [
      "officialProfileEvidence.officialTotalStarts",
      "officialProfileEvidence.backCount",
      "officialProfileEvidence.homeCount",
      `${raceCategory}.bFrequencyPriorMean`,
      `${raceCategory}.hFrequencyPriorMean`,
      `${raceCategory}.shrunkFrequencyEmpiricalQuantiles`,
      `${raceCategory}.bhEmpiricalPercentileLatent`,
      "startsQualityConfidenceDiagnostic"
    ],
    missingInputs: []
  };
}

function shrinkFrequency(count, starts, priorStrength, priorMean) {
  return (count + priorStrength * priorMean) / (starts + priorStrength);
}

function empiricalQuantileScore(value, distribution) {
  const anchors = [
    [distribution.min, 0],
    [distribution.p10, 1],
    [distribution.p25, 2.5],
    [distribution.median, 5],
    [distribution.p75, 7.5],
    [distribution.p90, 9],
    [distribution.max, 10]
  ];

  if (value <= anchors[0][0]) return 0;
  if (value >= anchors[anchors.length - 1][0]) return 10;

  for (let index = 1; index < anchors.length; index += 1) {
    const [upperValue, upperScore] = anchors[index];
    if (value > upperValue) continue;
    const [lowerValue, lowerScore] = anchors[index - 1];
    if (upperValue <= lowerValue) return upperScore;
    const ratio = (value - lowerValue) / (upperValue - lowerValue);
    return lowerScore + ratio * (upperScore - lowerScore);
  }

  return 10;
}

function confidenceFor({ officialTotalStarts, foreignFlag }) {
  if (officialTotalStarts <= 10) return "low";
  if (officialTotalStarts <= 20 || foreignFlag) return "medium";
  return "high";
}

function ridingStyleConsistency({ ridingStyle, bFrequency, hFrequency, categoryBaseline }) {
  const normalized = String(ridingStyle || "").normalize("NFKC");
  const observed = (bFrequency + hFrequency) / 2;
  const categoryMean = (categoryBaseline.bFrequency.mean + categoryBaseline.hFrequency.mean) / 2;
  if (normalized === "逃") return observed >= categoryMean ? "consistent" : "not-aligned";
  if (normalized === "追") return observed <= categoryMean ? "consistent" : "not-aligned";
  if (normalized === "両") return "mixed-style";
  return null;
}

function resolveCategory(value) {
  return value === "girls" || value === "standard" ? value : null;
}

function nullableNonNegativeInteger(value) {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function nullableNonNegativeNumber(value) {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function nullableText(value) {
  const text = String(value ?? "").trim();
  return text && text !== "-" ? text : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
