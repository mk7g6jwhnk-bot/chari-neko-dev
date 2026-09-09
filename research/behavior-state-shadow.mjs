import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createConditionalRiderPerformanceSchema } from "./conditional-rider-performance-schema.mjs";

export const BEHAVIOR_STATE_SHADOW_VERSION = "BEHAVIOR_STATE_SHADOW_V1";
export const BEHAVIOR_STATE_ORDER = Object.freeze([
  "INITIATIVE", "LEAD_PRESSURE", "ENERGY_STATE", "BANTE_RESPONSE",
  "LINE_TRACKING", "ATTACK_OUTCOME", "OTHER_LINE_SURVIVAL",
  "FOURTH_CORNER_POSITION", "FINISH"
]);
const STATE_VALUES = Object.freeze({
  LEAD_PRESSURE: ["CLEAN_LEAD", "CONTESTED_LEAD", "LONG_LEAD", "UNKNOWN"],
  ENERGY_STATE: ["RESERVED", "NORMAL", "DEPLETED", "UNKNOWN"],
  BANTE_RESPONSE: ["SUPPORT_FRONT", "HOLD_POSITION", "SELF_LAUNCH", "SWITCH", "SEPARATED", "UNKNOWN"]
});

export function extractBehaviorStateFeatures({ riders = [], explicitLayers = {} } = {}) {
  return riders.map(rider => createConditionalRiderPerformanceSchema({
    riderId: rider.registration || rider.riderId || rider.id || rider.number || null,
    abilityLayer: rider.abilityLayer || rider,
    baseProfile: rider,
    behavior: explicitLayers[rider.registration || rider.riderId || rider.id || rider.number]?.behaviorLayer || {},
    conditional: explicitLayers[rider.registration || rider.riderId || rider.id || rider.number]?.conditionalPerformanceLayer || {}
  }));
}

export function generateBehaviorStates({ initiative = {}, context = {}, riderLayers = [] } = {}) {
  const initiativeRiderId = initiative.riderId || initiative.riderNumber || null;
  const initiativeLayer = riderLayers.find(row => String(row.riderId) === String(initiativeRiderId)) || null;
  const banteLayer = riderLayers.find(row => String(row.riderId) === String(context.banteRiderId || context.banteRiderNumber || "")) || null;
  const leadPressure = observedState("LEAD_PRESSURE", context.leadPressure);
  const energyState = observedState("ENERGY_STATE", context.energyState);
  const banteResponse = observedState("BANTE_RESPONSE", context.banteResponse);
  const transition = conditionalBranchTransition({
    leadPressure: leadPressure.value,
    energyState: energyState.value,
    banteResponse: banteResponse.value,
    initiativeLayer, banteLayer
  });
  return Object.freeze({
    version: BEHAVIOR_STATE_SHADOW_VERSION,
    mode: "RESEARCH_ONLY",
    stateOrder: BEHAVIOR_STATE_ORDER,
    initiative: Object.freeze({ riderId: initiativeRiderId, lineId: initiative.lineId || null, directFirstEvidence: false }),
    states: Object.freeze({ leadPressure, energyState, banteResponse }),
    conditionalTransition: transition,
    audit: Object.freeze({
      initiativeDirectlyRaisesFirst: false,
      unknownStateCount: [leadPressure, energyState, banteResponse].filter(row => row.value === "UNKNOWN").length,
      resultFieldsUsed: [], payoutUsed: false, thirdPositionUsed: false,
      productionWriteAllowed: false, autoPromotion: false, purchaseConnected: false
    })
  });
}

export function conditionalBranchTransition({ leadPressure = "UNKNOWN", energyState = "UNKNOWN", banteResponse = "UNKNOWN" } = {}) {
  const multipliers = { LEADER_HOLD: 1, BANTE_SASHI: 1, MAKURI_SUCCESS: 1, LEAD_BATTLE: 1, LINE_SEPARATION: 1, OTHER_LINE_RISE: 1, SOLO_RISE: 1 };
  const applied = [];
  if ([leadPressure, energyState, banteResponse].includes("UNKNOWN")) return transition(multipliers, applied, "INSUFFICIENT_INDEPENDENT_EVIDENCE");
  if (leadPressure === "CLEAN_LEAD" && energyState === "RESERVED" && ["SUPPORT_FRONT", "HOLD_POSITION"].includes(banteResponse)) {
    multipliers.LEADER_HOLD = 1.15; multipliers.BANTE_SASHI = .95; applied.push("CLEAN_RESERVED_TRACKED_FRONT");
  }
  if (["CONTESTED_LEAD", "LONG_LEAD"].includes(leadPressure) || energyState === "DEPLETED") {
    multipliers.LEADER_HOLD *= .72; multipliers.BANTE_SASHI *= 1.12; multipliers.MAKURI_SUCCESS *= 1.18; multipliers.LEAD_BATTLE *= 1.12; applied.push("PRESSURE_OR_DEPLETION");
  }
  if (banteResponse === "SELF_LAUNCH") { multipliers.LEADER_HOLD *= .75; multipliers.BANTE_SASHI *= 1.28; applied.push("BANTE_SELF_LAUNCH"); }
  if (banteResponse === "SWITCH") { multipliers.LINE_SEPARATION *= 1.20; multipliers.OTHER_LINE_RISE *= 1.12; applied.push("BANTE_SWITCH"); }
  if (banteResponse === "SEPARATED") { multipliers.LINE_SEPARATION *= 1.28; multipliers.MAKURI_SUCCESS *= 1.10; applied.push("BANTE_SEPARATED"); }
  return transition(multipliers, applied, applied.length ? "SUPPORTED_CONDITIONAL_SHADOW" : "NEUTRAL_SUPPORTED_STATE");
}

export function applyBehaviorStateShadow({ prediction, stateModel }) {
  const dictionary = prediction?.scenarioProvenances || {};
  const source = prediction?.terminals || prediction?.prediction?.terminals || [];
  const multipliers = stateModel?.conditionalTransition?.branchMultipliers || {};
  const rows = source.map(row => {
    const branchType = dictionary[row.scenarioProvenanceId]?.branchType || row.branchType || "UNKNOWN";
    const multiplier = Number(multipliers[branchType]) || 1;
    return { ...row, behaviorShadowBranchType: branchType, behaviorShadowMultiplier: multiplier, behaviorShadowRawWeight: terminalMass(row) * multiplier };
  });
  const total = rows.reduce((sum, row) => sum + row.behaviorShadowRawWeight, 0);
  return rows.map(row => ({ ...row, behaviorShadowProbability: total ? row.behaviorShadowRawWeight / total : 0 }))
    .sort((a, b) => b.behaviorShadowProbability - a.behaviorShadowProbability || orderKey(a).localeCompare(orderKey(b), "en"));
}

export function compareBehaviorStateShadow({ record, context = {}, riderLayers = [] } = {}) {
  if (isFinalTestRecord(record)) return { excluded: true, reason: "FINAL_TEST_403_502" };
  const prediction = record?.sealed?.researchPrediction || record?.researchPrediction || record?.prediction || record;
  const terminals = prediction?.terminals || prediction?.prediction?.terminals || [];
  const initiative = prediction?.initiativeAssessment?.selected || prediction?.initiativeAssessment?.top || {};
  const stateModel = generateBehaviorStates({ initiative, context, riderLayers });
  const shadow = applyBehaviorStateShadow({ prediction, stateModel });
  const finish = confirmedFinish(record);
  return {
    excluded: false, raceKey: record?.raceKey || null, stateModel,
    current: finish ? rankMetrics(terminals, finish, terminalMass) : null,
    shadow: finish ? rankMetrics(shadow, finish, row => row.behaviorShadowProbability) : null,
    outcomeComparable: Boolean(finish) && stateModel.audit.unknownStateCount === 0,
    distribution: distributionAudit(prediction, terminals, shadow),
    outputMutation: false
  };
}

export function evaluateBehaviorShadowDirectory(directory) {
  const aggregate = createAggregate();
  let peakRecordBytes = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const text = fs.readFileSync(path.join(directory, entry.name), "utf8");
    peakRecordBytes = Math.max(peakRecordBytes, Buffer.byteLength(text));
    const record = JSON.parse(text);
    const riders = record?.sealed?.participants || [];
    aggregate.add(compareBehaviorStateShadow({ record, riderLayers: extractBehaviorStateFeatures({ riders }) }));
  }
  return { ...aggregate.finish(), peakRecordBytes, boundedStreamingRead: true };
}

function observedState(type, input) {
  const allowed = STATE_VALUES[type];
  const value = String(input?.value || "UNKNOWN").toUpperCase();
  const evidenceCount = Number(input?.evidenceCount || 0);
  const evidenceWindow = input?.evidenceWindow || null;
  const sourceType = String(input?.sourceType || "NONE");
  const accepted = allowed.includes(value) && value !== "UNKNOWN" && evidenceCount > 0 && evidenceWindow && ["OFFICIAL_VIDEO_TAGGED", "VALIDATED_MANUAL_OBSERVATION", "OFFICIAL_RACE_TELEMETRY"].includes(sourceType);
  return Object.freeze({ value: accepted ? value : "UNKNOWN", confidence: accepted ? clamp(input.confidence) : 0, evidenceCount: accepted ? evidenceCount : 0, evidenceWindow: accepted ? evidenceWindow : null, sourceType, status: accepted ? "verified" : "unknown" });
}
function transition(branchMultipliers, appliedRules, status) { return Object.freeze({ branchMultipliers: Object.freeze(branchMultipliers), appliedRules: Object.freeze(appliedRules), status, calibratedProbability: null }); }
function distributionAudit(prediction, current, shadow) {
  const dictionary = prediction?.scenarioProvenances || {};
  const branchMass = rows => rows.reduce((out, row) => { const type = dictionary[row.scenarioProvenanceId]?.branchType || row.behaviorShadowBranchType || "UNKNOWN"; out[type] = (out[type] || 0) + (row.behaviorShadowProbability ?? terminalMass(row)); return out; }, {});
  const initiativeRider = Number(prediction?.initiativeAssessment?.selected?.riderNumber || prediction?.initiativeAssessment?.top?.riderNumber);
  return { currentBranchMass: branchMass(current), shadowBranchMass: branchMass(shadow), currentScenarioDiversity: new Set(current.map(row => dictionary[row.scenarioProvenanceId]?.branchType).filter(Boolean)).size, shadowScenarioDiversity: new Set(shadow.map(row => row.behaviorShadowBranchType).filter(Boolean)).size, initiativeFirstTop1Current: Number(current[0]?.order?.[0]) === initiativeRider, initiativeFirstTop1Shadow: Number(shadow[0]?.order?.[0]) === initiativeRider };
}
function createAggregate() {
  const rows = [];
  return { add(row) { if (row && !row.excluded) rows.push(compact(row)); }, finish() { const comparable = rows.filter(row => row.outcomeComparable), current = summarize(comparable.map(row => row.current)), shadow = summarize(comparable.map(row => row.shadow)); return { version: BEHAVIOR_STATE_SHADOW_VERSION, sampleSize: rows.length, comparableOutcomeSampleSize: comparable.length, allUnknownStateRaces: rows.filter(row => row.unknownStateCount > 0).length, current, shadow, tailDegradation: Number.isFinite(current.exactP90Rank) && Number.isFinite(shadow.exactP90Rank) ? shadow.exactP90Rank - current.exactP90Rank : null, scenarioDiversity: { current: mean(rows.map(row => row.currentScenarioDiversity)), shadow: mean(rows.map(row => row.shadowScenarioDiversity)) }, branchMass: { current: meanObjects(rows.map(row => row.currentBranchMass)), shadow: meanObjects(rows.map(row => row.shadowBranchMass)) }, initiativeFirstTop1Rate: { current: rate(comparable, row => row.initiativeFirstTop1Current), shadow: rate(comparable, row => row.initiativeFirstTop1Shadow) }, decision: comparable.length ? "BEHAVIOR_STATE_MODEL_PROMISING_REQUIRES_REVIEW" : "DATA_NOT_ENOUGH", productionWriteAllowed: false, autoPromotion: false, finalTestUsed: false }; } };
}
function compact(row) { return { outcomeComparable: row.outcomeComparable, unknownStateCount: row.stateModel.audit.unknownStateCount, current: row.current, shadow: row.shadow, ...row.distribution }; }
function rankMetrics(rows, order, probabilityOf) { const sorted = [...rows].sort((a, b) => probabilityOf(b) - probabilityOf(a) || orderKey(a).localeCompare(orderKey(b), "en")); const exact = sorted.findIndex(row => orderKey(row) === order.join("-")); const first = groupedRank(sorted, row => String(row.order?.[0]), String(order[0]), probabilityOf); const pair = groupedRank(sorted, row => `${row.order?.[0]}-${row.order?.[1]}`, `${order[0]}-${order[1]}`, probabilityOf); const third = groupedRank(sorted.filter(row => Number(row.order?.[0]) === order[0] && Number(row.order?.[1]) === order[1]), row => String(row.order?.[2]), String(order[2]), probabilityOf); return { exactRank: exact < 0 ? null : exact + 1, firstRank: first, pairRank: pair, thirdRank: third }; }
function groupedRank(rows, keyOf, target, probabilityOf) { const groups = new Map(); for (const row of rows) groups.set(keyOf(row), (groups.get(keyOf(row)) || 0) + probabilityOf(row)); const index = [...groups].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "en")).findIndex(([key]) => key === target); return index < 0 ? null : index + 1; }
function summarize(rows) { const top = (key, n) => rows.length ? rows.filter(row => Number(row?.[key]) > 0 && row[key] <= n).length / rows.length : null, exact = rows.map(row => row?.exactRank).filter(Number.isFinite); return { sampleSize: rows.length, exactMeanRank: mean(exact), exactP90Rank: quantile(exact, .9), exactNotGeneratedRate: rows.length ? rows.filter(row => !Number.isFinite(row?.exactRank)).length / rows.length : null, firstMeanRank: mean(rows.map(row => row?.firstRank)), pairMeanRank: mean(rows.map(row => row?.pairRank)), thirdMeanRank: mean(rows.map(row => row?.thirdRank)), top10: top("exactRank", 10), top20: top("exactRank", 20), top30: top("exactRank", 30), firstTop1: top("firstRank", 1), firstTop3: top("firstRank", 3), pairTop3: top("pairRank", 3), pairTop5: top("pairRank", 5), thirdTop3: top("thirdRank", 3), thirdTop5: top("thirdRank", 5) }; }
function confirmedFinish(record) { const result = record?.result?.result || record?.result; if (String(result?.status || "").toLowerCase() !== "confirmed") return null; const order = (result.finishOrder || []).map(Number).slice(0, 3); return order.length === 3 ? order : null; }
function isFinalTestRecord(record) { return [record?.sequence, record?.recordNumber, record?.comparisonNumber, record?.validationIndex, record?.sealed?.sequence].some(value => Number(value) >= 403 && Number(value) <= 502); }
function terminalMass(row) { for (const key of ["normalizedWeight", "normalizedProbability", "probability", "modelWeight", "weight"]) { const value = Number(row?.[key]); if (Number.isFinite(value) && value >= 0) return value; } return 0; }
function orderKey(row) { return Array.isArray(row?.order) ? row.order.slice(0, 3).map(Number).join("-") : ""; }
function clamp(value) { const number = Number(value); return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0; }
function mean(values) { const valid = values.filter(Number.isFinite); return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null; }
function rate(rows, predicate) { return rows.length ? rows.filter(predicate).length / rows.length : null; }
function quantile(values, p) { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b), index = (sorted.length - 1) * p, low = Math.floor(index), high = Math.ceil(index); return sorted[low] + (sorted[high] - sorted[low]) * (index - low); }
function meanObjects(objects) { const keys = new Set(objects.flatMap(object => Object.keys(object || {}))); return Object.fromEntries([...keys].sort().map(key => [key, mean(objects.map(object => Number(object?.[key] || 0)))])); }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) throw new Error("usage: node research/behavior-state-shadow.mjs <sealed-record-directory>");
  process.stdout.write(`${JSON.stringify(evaluateBehaviorShadowDirectory(process.argv[2]), null, 2)}\n`);
}
