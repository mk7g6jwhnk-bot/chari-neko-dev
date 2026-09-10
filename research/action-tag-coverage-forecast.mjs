export function forecastCoverage({ observedRaces = 0, tags = [], raceGoal = 300, stateGoal = 60, cellGoal = 50 } = {}) {
  const races = Math.max(0, Number(observedRaces) || 0), byState = {}, byCell = {};
  for (const tag of tags) {
    if (!automatic(tag)) continue;
    byState[tag.stateType] = (byState[tag.stateType] || 0) + 1;
    for (const cell of tag.context?.conditionalCells || []) byCell[`${tag.stateType}:${cell}`] = (byCell[`${tag.stateType}:${cell}`] || 0) + 1;
  }
  const stateForecast = Object.fromEntries(Object.entries(byState).map(([key, count]) => [key, estimate(count, races, stateGoal)]));
  const cellForecast = Object.fromEntries(Object.entries(byCell).map(([key, count]) => [key, estimate(count, races, cellGoal)]));
  return { version: "ACTION_TAG_COVERAGE_FORECAST_V1", observedRaces: races, raceGoal, racesUntilRaceGoal: Math.max(0, raceGoal - races), states: stateForecast, conditionalCells: cellForecast, unavailableStates: ["ENERGY_STATE", "BANTE_RESPONSE", "LINE_STATE", "OTHER_LINE_SURVIVAL"].filter(key => !byState[key]).map(stateType => ({ stateType, automaticRatePerRace: 0, racesNeeded: null, reason: "INDEPENDENT_ACTION_EVIDENCE_REQUIRED" })), accuracyUsed: false, finalTestUsed: false, productionWriteAllowed: false };
}
function estimate(count, races, target) { const rate = races ? count / races : 0; return { observed: count, target, automaticRatePerRace: rate, racesNeeded: rate > 0 ? Math.ceil(target / rate) : null, additionalRaces: rate > 0 ? Math.max(0, Math.ceil((target - count) / rate)) : null }; }
function automatic(tag) { return tag.collectionLane === "AUTO_DIRECT" || (tag.collectionLane === "AUTO_CANDIDATE" && tag.verificationStatus === "POSSIBLE"); }
