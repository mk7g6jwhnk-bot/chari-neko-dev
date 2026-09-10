import crypto from "node:crypto";

export const ACTION_TAG_SCHEMA_VERSION = "ACTION_TAG_V1";
export const VERIFICATION_STATUSES = Object.freeze(["CONFIRMED", "STRONGLY_SUPPORTED", "POSSIBLE", "PENDING", "UNKNOWN", "CONTRADICTED"]);
export const COLLECTION_LANES = Object.freeze(["AUTO_DIRECT", "AUTO_CANDIDATE", "MANUAL_REVIEW"]);
export const STATE_VALUES = Object.freeze({
  INITIATIVE: ["ACQUIRED", "NOT_ACQUIRED", "UNKNOWN"],
  LEAD_PRESSURE: ["CLEAN_LEAD", "CONTESTED_LEAD", "LONG_LEAD", "UNKNOWN"],
  ENERGY_STATE: ["RESERVED", "NORMAL", "DEPLETED", "UNKNOWN"],
  BANTE_RESPONSE: ["SUPPORT_FRONT", "HOLD_POSITION", "SELF_LAUNCH", "SWITCH", "SEPARATED", "UNKNOWN"],
  LINE_TRACKING: ["SUCCESS", "FAILURE", "UNKNOWN"],
  ATTACK_OUTCOME: ["MAKURI_SUCCESS", "MAKURI_FAILED", "OVERTAKEN_BY_MAKURI", "UNKNOWN"],
  LINE_STATE: ["COLLAPSED", "PRESERVED", "UNKNOWN"],
  OTHER_LINE_SURVIVAL: ["SURVIVED", "DID_NOT_SURVIVE", "UNKNOWN"]
});

export function createActionTag(input = {}) {
  const required = ["raceKey", "riderId", "stateType", "stateValue", "observationTime", "evidenceType", "evidenceSource", "reviewer", "createdAt"];
  for (const key of required) if (!String(input[key] ?? "").trim()) throw new Error(`ACTION_TAG_REQUIRED:${key}`);
  const stateType = String(input.stateType).toUpperCase(), stateValue = String(input.stateValue).toUpperCase();
  if (!STATE_VALUES[stateType]?.includes(stateValue)) throw new Error(`ACTION_TAG_STATE_INVALID:${stateType}:${stateValue}`);
  const lane = String(input.collectionLane || "MANUAL_REVIEW").toUpperCase();
  if (!COLLECTION_LANES.includes(lane)) throw new Error(`ACTION_TAG_LANE_INVALID:${lane}`);
  let verificationStatus = String(input.verificationStatus || "PENDING").toUpperCase();
  if (!VERIFICATION_STATUSES.includes(verificationStatus)) throw new Error(`ACTION_TAG_STATUS_INVALID:${verificationStatus}`);
  if (lane === "AUTO_CANDIDATE" && ["CONFIRMED", "STRONGLY_SUPPORTED"].includes(verificationStatus)) throw new Error("AUTO_CANDIDATE_AUTO_PROMOTION_FORBIDDEN");
  if (verificationStatus === "CONFIRMED" && !directEvidence(input.evidenceType)) throw new Error("CONFIRMED_REQUIRES_DIRECT_EVIDENCE");
  if (verificationStatus === "CONFIRMED" && stateValue === "UNKNOWN") throw new Error("CONFIRMED_UNKNOWN_FORBIDDEN");
  const observationTime = iso(input.observationTime), createdAt = iso(input.createdAt);
  const predictionSealedAt = optionalIso(input.predictionSealedAt), resultObservedAt = optionalIso(input.resultObservedAt);
  const phase = resultObservedAt && Date.parse(observationTime) >= Date.parse(resultObservedAt)
    ? "POST_RESULT_OBSERVATION"
    : predictionSealedAt && Date.parse(observationTime) > Date.parse(predictionSealedAt)
      ? "POST_SEAL_OBSERVATION" : "PRE_RESULT_OBSERVATION";
  const finalTest = isFinalTest(input);
  const evidenceHash = String(input.evidenceHash || input.sourceHash || hashEvidence(input.evidenceSource));
  return Object.freeze({
    schemaVersion: ACTION_TAG_SCHEMA_VERSION,
    tagId: String(input.tagId || deterministicTagId({ ...input, stateType, stateValue, observationTime, lane, evidenceHash })),
    raceKey: String(input.raceKey), riderId: String(input.riderId), stateType, stateValue,
    observationTime, evidenceType: String(input.evidenceType).toUpperCase(), evidenceSource: String(input.evidenceSource),
    confidence: unit(input.confidence), reviewer: String(input.reviewer), verificationStatus,
    sourceHash: evidenceHash, evidenceHash, createdAt, collectionLane: lane, observationPhase: phase,
    predictionSealedAt, resultObservedAt,
    context: normalizeContext(input.context),
    trainingEligibility: Object.freeze({
      eligible: !finalTest && phase === "PRE_RESULT_OBSERVATION" && ["CONFIRMED", "STRONGLY_SUPPORTED"].includes(verificationStatus),
      finalTestExcluded: finalTest, postResultExcluded: phase === "POST_RESULT_OBSERVATION",
      tuningUseAllowed: !finalTest && phase === "PRE_RESULT_OBSERVATION"
    }),
    reviewerNote: input.reviewerNote ? String(input.reviewerNote) : null,
    provenance: Object.freeze({ productionWriteAllowed: false, autoPromotion: false, historicalMutationAllowed: false })
  });
}

export function transitionActionTag(tag, transition = {}) {
  const status = String(transition.verificationStatus || "").toUpperCase();
  if (!VERIFICATION_STATUSES.includes(status)) throw new Error(`ACTION_TAG_STATUS_INVALID:${status}`);
  if (tag.collectionLane === "AUTO_CANDIDATE" && ["CONFIRMED", "STRONGLY_SUPPORTED"].includes(status) && !transition.independentReview) throw new Error("AUTO_CANDIDATE_INDEPENDENT_REVIEW_REQUIRED");
  return createActionTag({
    ...tag, verificationStatus: status, stateValue: transition.stateValue || tag.stateValue,
    collectionLane: transition.independentReview ? "MANUAL_REVIEW" : tag.collectionLane,
    reviewer: transition.reviewer || tag.reviewer,
    reviewerNote: transition.reviewerNote ?? tag.reviewerNote,
    evidenceType: transition.evidenceType || tag.evidenceType,
    evidenceSource: transition.evidenceSource || tag.evidenceSource,
    evidenceHash: transition.evidenceHash || tag.evidenceHash,
    confidence: transition.confidence ?? tag.confidence,
    observationTime: transition.observationTime || tag.observationTime,
    resultObservedAt: transition.resultObservedAt || tag.resultObservedAt,
    createdAt: transition.createdAt || tag.createdAt
  });
}

export function hashEvidence(value) { return crypto.createHash("sha256").update(String(value)).digest("hex"); }
export function isFinalTest(input) { return [input?.sequence, input?.recordNumber, input?.comparisonNumber, input?.validationIndex].some(value => Number(value) >= 403 && Number(value) <= 502); }
function deterministicTagId(input) { return `AT1-${hashEvidence([input.raceKey, input.riderId, input.stateType, input.stateValue, input.observationTime, input.lane, input.evidenceHash].join("|")) .slice(0, 20)}`; }
function directEvidence(value) { return ["OFFICIAL_RACE_TELEMETRY", "OFFICIAL_VIDEO_TAG", "OFFICIAL_RESULT_EVENT", "OFFICIAL_RACE_MARKER", "VALIDATED_DUAL_REVIEW"].includes(String(value).toUpperCase()); }
function normalizeContext(value) {
  if (!value || typeof value !== "object") return null;
  const allowed = ["riderNumber", "lineId", "linePosition", "lineSize", "role", "finishPosition", "resultStatus", "sourceRecordId", "conditionalCells", "evidenceCount"];
  return Object.freeze(Object.fromEntries(allowed.filter(key => value[key] !== undefined).map(key => [key, Array.isArray(value[key]) ? Object.freeze(value[key].map(String)) : value[key]])));
}
function unit(value) { const number = Number(value); return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0; }
function iso(value) { const time = new Date(value); if (!Number.isFinite(time.getTime())) throw new Error("ACTION_TAG_TIME_INVALID"); return time.toISOString(); }
function optionalIso(value) { return value ? iso(value) : null; }
