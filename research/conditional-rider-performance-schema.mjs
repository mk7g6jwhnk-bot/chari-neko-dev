export const RIDER_RESEARCH_LAYER_VERSION = "RIDER_RESEARCH_LAYERS_V1";
export const TRAIT_STATUS = Object.freeze(["verified", "research_only", "unknown"]);
export const BEHAVIOR_TRAITS = Object.freeze([
  "initiativePreference", "earlyMoveTendency", "leadBattlePersistence",
  "pullBackAndMakuriPreference", "banteSupport", "frontSaving",
  "banteSelfWinPriority", "blockTendency", "switchTendency",
  "lineTrackingReliability", "lineSeparationRisk", "soloRiseTendency"
]);
export const CONDITIONAL_METRICS = Object.freeze([
  "initiativeFirstRate", "initiativeTop2Rate", "initiativeTop3Rate",
  "leadHoldRate", "leadBantePassRate", "leadOvertakenByMakuriRate",
  "leadBattleSurvivalRate", "longLeadSurvivalRate", "twoRiderLineSurvivalRate",
  "threePlusRiderLineSurvivalRate", "bantePassRate", "banteFrontSaveRate",
  "banteSelfLaunchRate", "lineTrackingSuccessRate", "lineCollapseSwitchSuccessRate"
]);

export function createConditionalRiderPerformanceSchema({ riderId = null, abilityLayer = null, behavior = {}, conditional = {}, baseProfile = null } = {}) {
  return Object.freeze({
    version: RIDER_RESEARCH_LAYER_VERSION,
    riderId,
    abilityLayer: abilityLayer || baseProfile || null,
    behaviorLayer: layer(BEHAVIOR_TRAITS, behavior, behaviorProxy(baseProfile)),
    conditionalPerformanceLayer: layer(CONDITIONAL_METRICS, conditional),
    audit: Object.freeze({
      productionWriteAllowed: false, autoPromotion: false,
      currentDayProfilePriorityChanged: false,
      abilityBehaviorConditionalSeparated: true
    })
  });
}

export function unknownMeasurement(sourceType = "NONE") {
  return Object.freeze({ value: null, confidence: 0, evidenceCount: 0, evidenceWindow: null, sourceType, status: "unknown" });
}

export function normalizeMeasurement(input, { allowVerified = true } = {}) {
  if (!input || typeof input !== "object") return unknownMeasurement();
  const evidenceCount = finiteNonNegativeInteger(input.evidenceCount);
  const value = finiteUnit(input.value);
  const evidenceWindow = validWindow(input.evidenceWindow);
  const sourceType = String(input.sourceType || "UNKNOWN");
  if (value === null || evidenceCount === 0 || !evidenceWindow) return unknownMeasurement(sourceType);
  let status = TRAIT_STATUS.includes(input.status) ? input.status : "research_only";
  if (!allowVerified || !isVerifiedSource(sourceType)) status = "research_only";
  return Object.freeze({
    value, confidence: finiteUnit(input.confidence) ?? 0,
    evidenceCount, evidenceWindow, sourceType, status
  });
}

function layer(keys, explicit, proxies = {}) {
  return Object.freeze(Object.fromEntries(keys.map(key => [key, normalizeMeasurement(explicit[key] || proxies[key], { allowVerified: true })])));
}

function behaviorProxy(profile) {
  const recent = profile?.recent_4_months;
  const starts = finiteNonNegativeInteger(recent?.starts);
  const method = profile?.winning_method_share_among_top2;
  const top2 = finiteNonNegativeInteger(method?.denominator_top2);
  const window = profile?.metadata?.period || null;
  const out = {};
  if (starts > 0 && finiteNonNegativeInteger(recent?.back) > 0 && window) {
    out.initiativePreference = {
      value: Math.min(1, Number(recent.back) / starts), confidence: Math.min(1, starts / 30),
      evidenceCount: starts, evidenceWindow: window, sourceType: "OFFICIAL_BACK_FREQUENCY_WEAK_PROXY", status: "research_only"
    };
  }
  if (top2 > 0 && Number.isFinite(Number(method?.sprint)) && window) {
    out.pullBackAndMakuriPreference = {
      value: Math.max(0, Math.min(1, Number(method.sprint) / 100)), confidence: Math.min(1, top2 / 20),
      evidenceCount: top2, evidenceWindow: window, sourceType: "OFFICIAL_WINNING_METHOD_WEAK_PROXY", status: "research_only"
    };
  }
  return out;
}

function isVerifiedSource(source) { return ["OFFICIAL_VIDEO_TAGGED", "VALIDATED_MANUAL_OBSERVATION", "OFFICIAL_CONDITIONAL_AGGREGATE"].includes(source); }
function finiteUnit(value) { const number = Number(value); return Number.isFinite(number) && number >= 0 && number <= 1 ? number : null; }
function finiteNonNegativeInteger(value) { const number = Number(value); return Number.isInteger(number) && number >= 0 ? number : 0; }
function validWindow(value) { if (!value) return null; if (typeof value === "string") return value; if (typeof value === "object" && value.from && value.to) return Object.freeze({ from: String(value.from), to: String(value.to) }); return null; }
