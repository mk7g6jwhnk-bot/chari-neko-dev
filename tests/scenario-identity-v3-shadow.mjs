import assert from "node:assert/strict";
import {
  CANDIDATES, classifyScenarioTuple, createShadowAccumulator,
  evaluateRaceRecord, groupPredictionScenarios, SCENARIO_IDENTITY_V3_VERSION
} from "../research/scenario-identity-v3-shadow.mjs";

const dictionary = {
  a: { branchType: "LEADER_HOLD", branchId: "LEAD-A", initiativeLineId: "A", firstLineId: "A", firstRole: "LEADER", secondLineId: "A", secondRole: "BANTE", firstSecondRelation: "SAME_LINE_FORWARD" },
  b: { branchType: "LEADER_HOLD", branchId: "LEAD-A", initiativeLineId: "A", firstLineId: "A", firstRole: "LEADER", secondLineId: "B", secondRole: "LEADER", firstSecondRelation: "CROSS_LINE" },
  c: { branchType: "LINE_SEPARATION", branchId: "SEP-B", initiativeLineId: "B", firstLineId: "A", firstRole: "BANTE", secondLineId: "B", secondRole: "LEADER", firstSecondRelation: "CROSS_LINE" },
  u: { branchType: "UNKNOWN", branchId: "UNKNOWN", initiativeLineId: "UNKNOWN", firstLineId: "UNKNOWN", firstRole: "UNKNOWN", secondLineId: "UNKNOWN", secondRole: "UNKNOWN", firstSecondRelation: "UNKNOWN" }
};
const terminals = [
  { order: [1, 2, 3], probability: .35, dominantBranchId: "LEAD-A", scenarioProvenanceId: "a" },
  { order: [1, 4, 2], probability: .25, dominantBranchId: "LEAD-A", scenarioProvenanceId: "b" },
  { order: [4, 2, 1], probability: .20, dominantBranchId: "SEP-B", scenarioProvenanceId: "c" },
  { order: [5, 6, 1], probability: .20, dominantBranchId: "UNKNOWN", scenarioProvenanceId: "u" }
];
const prediction = { scenarioProvenanceSchemaVersion: "SCENARIO_PROVENANCE_V1", scenarioProvenances: dictionary, terminals };
const record = { raceKey: "X", sealed: { researchPrediction: prediction }, result: { result: { status: "confirmed", finishOrder: [1, 4, 2], payout: 99999 } } };

assert.deepEqual(CANDIDATES, ["S0", "S1", "S2"]);
assert.equal(classifyScenarioTuple(dictionary.a, "S0").id, classifyScenarioTuple(dictionary.b, "S0").id);
assert.equal(classifyScenarioTuple(dictionary.a, "S1").id, "LEADER_HOLD|INITIATIVE_LINE_SWEEP");
assert.equal(classifyScenarioTuple(dictionary.b, "S1").id, "LEADER_HOLD|INITIATIVE_LINE_SURVIVES");
assert.equal(classifyScenarioTuple(dictionary.a, "S2").id, classifyScenarioTuple(dictionary.a, "S1").id);
assert.match(classifyScenarioTuple(dictionary.c, "S2").id, /CROSS_LINE$/);
assert.equal(classifyScenarioTuple(dictionary.u, "S2").id, "UNKNOWN");
const renamed = { ...dictionary.a, branchId: "OTHER-ID", initiativeLineId: "X", firstLineId: "X", secondLineId: "X", firstRole: "LINE_TAIL", secondRole: "LEADER" };
assert.equal(classifyScenarioTuple(renamed, "S1").id, classifyScenarioTuple(dictionary.a, "S1").id);
assert.equal(classifyScenarioTuple(dictionary.a, "S2").thirdPositionUsed, false);
assert.deepEqual(classifyScenarioTuple(dictionary.a, "S2").resultFieldsUsed, []);
for (const candidate of CANDIDATES) {
  for (const scenario of groupPredictionScenarios(prediction, candidate)) {
    assert.equal(scenario.resultFieldsUsed, undefined);
    assert.ok(scenario.mass >= 0 && scenario.mass <= 1);
  }
}
const before = JSON.stringify(record.sealed.researchPrediction);
const evaluated = evaluateRaceRecord(record);
record.result.result.finishOrder = [4, 2, 1]; record.result.result.payout = 1;
const changedResult = evaluateRaceRecord(record);
assert.deepEqual(
  Object.fromEntries(CANDIDATES.map(name => [name, evaluated.candidates[name].scenarios])),
  Object.fromEntries(CANDIDATES.map(name => [name, changedResult.candidates[name].scenarios]))
);
assert.equal(JSON.stringify(record.sealed.researchPrediction), before);
const accumulator = createShadowAccumulator(); accumulator.add(record); const summary = accumulator.finish();
assert.equal(summary.version, SCENARIO_IDENTITY_V3_VERSION);
assert.equal(summary.sampleSize, 1);
assert.equal(summary.candidates.S0.scenarioCount.max, 3);
assert.equal(summary.candidates.S2.correctScenario.sampleSize, 1);

const protectedRecord = structuredClone(record); protectedRecord.sequence = 450;
assert.equal(evaluateRaceRecord(protectedRecord).resultEvaluated, false);
assert.equal(evaluateRaceRecord(protectedRecord).finalTestExcluded, true);
console.log("PASS scenario identity v3 shadow");
