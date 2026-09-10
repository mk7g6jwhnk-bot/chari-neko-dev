import { STATE_VALUES } from "./action-tag-schema.mjs";

export function buildActionTagCoverage(tags = [], { raceGoal = 300, stateGoal = 60, cellGoal = 50 } = {}) {
  const valid = tags.filter(tag => tag?.schemaVersion === "ACTION_TAG_V1" && !tag.trainingEligibility?.finalTestExcluded);
  const races = new Set(valid.map(tag => tag.raceKey));
  const states = {};
  for (const stateType of Object.keys(STATE_VALUES)) {
    const rows = valid.filter(tag => tag.stateType === stateType);
    const confirmed = rows.filter(tag => tag.verificationStatus === "CONFIRMED").length;
    const supported = rows.filter(tag => tag.verificationStatus === "STRONGLY_SUPPORTED").length;
    const pending = rows.filter(tag => ["PENDING", "POSSIBLE"].includes(tag.verificationStatus)).length;
    const unknown = rows.filter(tag => tag.verificationStatus === "UNKNOWN" || tag.stateValue === "UNKNOWN").length;
    states[stateType] = { confirmed, supported, pending, unknown, unknownRate: rows.length ? unknown / rows.length : null, target: stateGoal, progress: Math.min(1, (confirmed + supported) / stateGoal) };
  }
  const cells = {};
  for (const tag of valid.filter(tag => ["CONFIRMED", "STRONGLY_SUPPORTED"].includes(tag.verificationStatus))) {
    const key = `${tag.stateType}:${tag.stateValue}`; cells[key] = (cells[key] || 0) + 1;
  }
  return { schemaVersion: "ACTION_TAG_COVERAGE_V1", totalActionTaggedRaces: races.size, raceGoal, raceProgress: Math.min(1, races.size / raceGoal), states, pendingCount: valid.filter(tag => ["PENDING", "POSSIBLE"].includes(tag.verificationStatus)).length, unknownRate: valid.length ? valid.filter(tag => tag.stateValue === "UNKNOWN" || tag.verificationStatus === "UNKNOWN").length / valid.length : null, conditionalCells: Object.fromEntries(Object.entries(cells).map(([key, count]) => [key, { count, target: cellGoal, progress: Math.min(1, count / cellGoal) }])), cellGoal, productionWriteAllowed: false, finalTestUsed: false };
}
