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
  const rawBackCount = nullableNonNegativeInteger(profile?.backCount);
  const rawHomeCount = nullableNonNegativeInteger(profile?.homeCount);
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
  const invalidInputs = officialTotalStarts !== null && (
    (rawBackCount !== null && rawBackCount > officialTotalStarts) ||
    (rawHomeCount !== null && rawHomeCount > officialTotalStarts)
  ) ? ["B/H count exceeds officialTotalStarts"] : [];

  const neutral = overrides => ({
    value: 5,
    confidence: "low",
    officialTotalStarts,
    rawBackCount,
    rawHomeCount,
    bFrequency: null,
    hFrequency: null,
    rawBPercentileScore: null,
    rawHPercentileScore: null,
    shrunkBFrequency: null,
    shrunkHFrequency: null,
    latentScore: 5,
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
    missingInputs: [...missingInputs, ...invalidInputs],
    ...overrides
  });

  if (missingInputs.length > 0 || invalidInputs.length > 0) return neutral();
  if (officialTotalStarts === 0) {
    return neutral({
      inputsUsed: ["officialTotalStarts.actualZero"],
      missingInputs: []
    });
  }

  const bFrequency = rawBackCount / officialTotalStarts;
  const hFrequency = rawHomeCount / officialTotalStarts;
  const priorStrength = baseline.priorStrength;
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
  // The empirical-Bayes estimate is retained for auditability, but it must not
  // determine ability.  With a zero observed B/H record it made a 3-start
  // rider look *stronger* than the same 0/0 record over 24 starts, solely
  // because the prior dominated the smaller sample.  Starts measure certainty,
  // not demonstrated initiative; the score therefore maps observed rates.
  const rawBPercentileScore = empiricalQuantileScore(
    bFrequency,
    categoryBaseline.bFrequency
  );
  const rawHPercentileScore = empiricalQuantileScore(
    hFrequency,
    categoryBaseline.hFrequency
  );
  // These describe the counterfactual prior-smoothed estimate only.  They are
  // deliberately not fed into latentScore or any race branch.
  const bPercentileScore = empiricalQuantileScore(
    shrunkBFrequency,
    categoryBaseline.shrunkBFrequency
  );
  const hPercentileScore = empiricalQuantileScore(
    shrunkHFrequency,
    categoryBaseline.shrunkHFrequency
  );
  const latentScore = clamp((rawBPercentileScore + rawHPercentileScore), 0, 20) / 2;
  const startsQuality = officialTotalStarts / (officialTotalStarts + priorStrength);
  // Sample-size uncertainty is deliberately kept out of the ability value.
  // It is exposed as confidence/startsQuality so downstream consumers can
  // judge reliability without turning few starts into artificial initiative.
  const value = clamp(latentScore, 0, 10);

  return {
    value: round(value),
    confidence: confidenceFor({ officialTotalStarts, foreignFlag }),
    officialTotalStarts,
    rawBackCount,
    rawHomeCount,
    bFrequency: round(bFrequency),
    hFrequency: round(hFrequency),
    rawBPercentileScore: round(rawBPercentileScore),
    rawHPercentileScore: round(rawHPercentileScore),
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
    inputsUsed: [
      "officialProfileEvidence.officialTotalStarts",
      "officialProfileEvidence.backCount",
      "officialProfileEvidence.homeCount",
      `${raceCategory}.bFrequencyPriorMean`,
      `${raceCategory}.hFrequencyPriorMean`,
      `${raceCategory}.rawFrequencyEmpiricalQuantilesForAbility`,
      `${raceCategory}.shrunkFrequencyEmpiricalQuantiles`,
      `${raceCategory}.bhObservedFrequencyPercentileLatent`,
      "empiricalBayesDiagnosticOnly",
      "startsQualityConfidenceDiagnostic"
    ],
    missingInputs: []
  };
}

function shrinkFrequency(count, starts, priorStrength, priorMean) {
  return (count + priorStrength * priorMean) / (starts + priorStrength);
}

function empiricalQuantileScore(value, distribution) {
  // B/H contains a real point mass at zero.  The percentile of a tied value
  // is its empirical mid-rank, not the lowest endpoint.  zeroRate comes from
  // the official census, so observed 0/0 receives a data-derived score rather
  // than an arbitrary 0.5 (or an artificial score of 0).
  if (value === 0 && Number.isFinite(distribution.zeroRate)) return distribution.zeroRate * 5;
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
