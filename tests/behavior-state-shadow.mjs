import assert from "node:assert/strict";
import { createConditionalRiderPerformanceSchema, unknownMeasurement } from "../research/conditional-rider-performance-schema.mjs";
import { applyBehaviorStateShadow, compareBehaviorStateShadow, conditionalBranchTransition, extractBehaviorStateFeatures, generateBehaviorStates } from "../research/behavior-state-shadow.mjs";

const profile = { registration: "1", recent_4_months: { starts: 20, back: 10 }, winning_method_share_among_top2: { status: "observed", denominator_top2: 10, sprint: 40 }, metadata: { period: "rolling 4 months" } };
const layers = extractBehaviorStateFeatures({ riders: [profile] });
assert.equal(layers[0].behaviorLayer.initiativePreference.status, "research_only");
assert.equal(layers[0].behaviorLayer.initiativePreference.value, .5);
assert.equal(layers[0].behaviorLayer.blockTendency.status, "unknown");
assert.deepEqual(unknownMeasurement(), { value: null, confidence: 0, evidenceCount: 0, evidenceWindow: null, sourceType: "NONE", status: "unknown" });
const invalid = createConditionalRiderPerformanceSchema({ conditional: { initiativeFirstRate: { value: .5, evidenceCount: 0, evidenceWindow: "x", sourceType: "OFFICIAL_CONDITIONAL_AGGREGATE", status: "verified" } } });
assert.equal(invalid.conditionalPerformanceLayer.initiativeFirstRate.status, "unknown");
const external = createConditionalRiderPerformanceSchema({ behavior: { blockTendency: { value: .5, confidence: .5, evidenceCount: 4, evidenceWindow: "four posts", sourceType: "SNS", status: "verified" } } });
assert.equal(external.behaviorLayer.blockTendency.status, "research_only");

const unknown = generateBehaviorStates({ initiative: { riderId: "1" }, riderLayers: layers });
assert.equal(unknown.audit.unknownStateCount, 3);
assert.equal(unknown.conditionalTransition.branchMultipliers.LEADER_HOLD, 1);
assert.equal(unknown.audit.initiativeDirectlyRaisesFirst, false);
assert.equal(unknown.audit.productionWriteAllowed, false);
assert.equal(unknown.audit.autoPromotion, false);

const observed = key => ({ value: key, confidence: .8, evidenceCount: 12, evidenceWindow: "tagged 12 races", sourceType: "OFFICIAL_VIDEO_TAGGED" });
const pressured = generateBehaviorStates({ initiative: { riderId: "1" }, context: { leadPressure: observed("CONTESTED_LEAD"), energyState: observed("DEPLETED"), banteResponse: observed("SELF_LAUNCH") }, riderLayers: layers });
assert.ok(pressured.conditionalTransition.branchMultipliers.LEADER_HOLD < 1);
assert.ok(pressured.conditionalTransition.branchMultipliers.BANTE_SASHI > 1);
assert.ok(pressured.conditionalTransition.branchMultipliers.MAKURI_SUCCESS > 1);

const prediction = { scenarioProvenanceSchemaVersion: "SCENARIO_PROVENANCE_V1", scenarioProvenances: { a: { branchType: "LEADER_HOLD" }, b: { branchType: "BANTE_SASHI" }, c: { branchType: "MAKURI_SUCCESS" } }, terminals: [
  { order: [1, 2, 3], probability: .5, scenarioProvenanceId: "a" },
  { order: [2, 1, 3], probability: .3, scenarioProvenanceId: "b" },
  { order: [4, 5, 1], probability: .2, scenarioProvenanceId: "c" }
] };
const source = JSON.stringify(prediction);
const shadow = applyBehaviorStateShadow({ prediction, stateModel: pressured });
assert.equal(JSON.stringify(prediction), source);
assert.equal(shadow[0].order[0], 2);
const record = { raceKey: "X", sealed: { researchPrediction: prediction }, result: { result: { status: "confirmed", finishOrder: [2, 1, 3] } } };
assert.equal(compareBehaviorStateShadow({ record }).outcomeComparable, false);
const compared = compareBehaviorStateShadow({ record, context: { leadPressure: observed("CONTESTED_LEAD"), energyState: observed("DEPLETED"), banteResponse: observed("SELF_LAUNCH") } });
assert.equal(compared.outcomeComparable, true);
record.result.result.finishOrder = [4, 5, 1];
const differentResult = compareBehaviorStateShadow({ record, context: { leadPressure: observed("CONTESTED_LEAD"), energyState: observed("DEPLETED"), banteResponse: observed("SELF_LAUNCH") } });
assert.deepEqual(differentResult.stateModel, compared.stateModel);
assert.deepEqual(differentResult.distribution, compared.distribution);
const protectedRecord = structuredClone(record); protectedRecord.comparisonNumber = 450;
assert.equal(compareBehaviorStateShadow({ record: protectedRecord }).reason, "FINAL_TEST_403_502");
console.log("PASS behavior state shadow");
