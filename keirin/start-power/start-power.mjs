import { KEIRIN_START_POWER_BASELINE } from "../config/start-power-baseline-v1.mjs";

const ROBUST_IQR_TO_SIGMA = 1.349;
const MIN_ROBUST_SCALE = 0.01;
const INPUT_Z_CAP = 2.5;

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
    value: 5,
    confidence: "low",
    officialTotalStarts,
    rawBackCount,
    rawHomeCount,
    bFrequency: null,
    hFrequency: null,
    shrunkBFrequency: null,
    shrunkHFrequency: null,
    latentScore: 5,
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

  if (missingInputs.length > 0) return neutral();
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
  const bZ = clamp(robustZ(shrunkBFrequency, categoryBaseline.shrunkBFrequency), -INPUT_Z_CAP, INPUT_Z_CAP);
  const hZ = clamp(robustZ(shrunkHFrequency, categoryBaseline.shrunkHFrequency), -INPUT_Z_CAP, INPUT_Z_CAP);
  const sharedZ = (bZ + hZ) / 2;
  const latentScore = clamp(normalCdf(sharedZ) * 10, 0.25, 9.75);
  const startsQuality = officialTotalStarts / (officialTotalStarts + priorStrength);
  const value = clamp(5 + startsQuality * (latentScore - 5), 0.5, 9.5);

  return {
    value: round(value),
    confidence: confidenceFor({ officialTotalStarts, foreignFlag }),
    officialTotalStarts,
    rawBackCount,
    rawHomeCount,
    bFrequency: round(bFrequency),
    hFrequency: round(hFrequency),
    shrunkBFrequency: round(shrunkBFrequency),
    shrunkHFrequency: round(shrunkHFrequency),
    latentScore: round(latentScore),
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
      `${raceCategory}.shrunkFrequencyRobustScale`,
      `${raceCategory}.bhSharedLatent`,
      "startsQualityNeutralShrinkage"
    ],
    missingInputs: []
  };
}

function shrinkFrequency(count, starts, priorStrength, priorMean) {
  return (count + priorStrength * priorMean) / (starts + priorStrength);
}

function robustZ(value, distribution) {
  const scale = Math.max(distribution.iqr / ROBUST_IQR_TO_SIGMA, MIN_ROBUST_SCALE);
  return (value - distribution.median) / scale;
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

function normalCdf(value) {
  return 0.5 * (1 + erf(value / Math.sqrt(2)));
}

function erf(value) {
  const sign = value < 0 ? -1 : 1;
  const absolute = Math.abs(value);
  const t = 1 / (1 + 0.3275911 * absolute);
  const approximation = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) * Math.exp(-absolute * absolute);
  return sign * approximation;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
