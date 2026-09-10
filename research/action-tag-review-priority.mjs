const IMPACT = Object.freeze({ INITIATIVE: 100, LEAD_PRESSURE: 95, ENERGY_STATE: 90, BANTE_RESPONSE: 85, LINE_TRACKING: 80, ATTACK_OUTCOME: 75, LINE_STATE: 70, OTHER_LINE_SURVIVAL: 65 });
const MANUAL_ORDER = Object.freeze({ LEAD_PRESSURE: 700, ENERGY_STATE: 600, BANTE_RESPONSE: 500, LINE_STATE: 300, OTHER_LINE_SURVIVAL: 200 });

export function prioritizeReviewItems(items = [], coverage = {}, { maxPerRace = 12 } = {}) {
  const unique = new Map();
  for (const item of items) {
    const key = `${item.raceKey}|${item.riderId}|${item.stateType}`;
    const scored = { ...item, reviewPriority: priority(item, coverage) };
    if (!unique.has(key) || scored.reviewPriority > unique.get(key).reviewPriority) unique.set(key, scored);
  }
  const perRace = new Map(), selected = [], deferred = [];
  for (const item of [...unique.values()].sort((a, b) => b.reviewPriority - a.reviewPriority || a.tagId.localeCompare(b.tagId))) {
    const count = perRace.get(item.raceKey) || 0;
    if (count < maxPerRace) { selected.push(item); perRace.set(item.raceKey, count + 1); } else deferred.push({ ...item, deferredReason: "PER_RACE_REVIEW_CAP" });
  }
  return { selected, deferred, duplicateCollapsed: items.length - unique.size, maxPerRace };
}

export function prioritizeRaceReviews(cases = [], coverage = {}, { now = Date.now() } = {}) {
  return [...cases].map(reviewCase => {
    const gaps = reviewCase.questions.reduce((sum, question) => sum + Number(question.coverageGap || 0), 0);
    const cells = [reviewCase.initiativeCandidate, reviewCase.banteCandidate].flatMap(row => row?.conditionalCells || []);
    const cellGap = cells.reduce((sum, cell) => sum + Math.max(0, 50 - Number(coverage?.conditionalCells?.[cell]?.count || 0)), 0);
    const impact = reviewCase.questions.reduce((sum, question) => sum + (MANUAL_ORDER[stateForQuestion(question.id)] || 0), 0);
    const proxy = reviewCase.automaticCandidates.reduce((best, row) => Math.max(best, Number(row.confidence || 0)), 0);
    const ageHours = Math.max(0, (Number(now) - Date.parse(reviewCase.createdAt)) / 3600000);
    return { ...reviewCase, raceReviewPriority: gaps * 10000 + cellGap * 100 + impact + proxy * 20 + Math.min(99, ageHours), priorityAudit: { stateGap: gaps, cellGap, modelImpact: impact, proxyConfidence: proxy, ageHours } };
  }).sort((a, b) => b.raceReviewPriority - a.raceReviewPriority || a.raceKey.localeCompare(b.raceKey));
}

function priority(item, coverage) {
  const state = coverage?.states?.[item.stateType] || {};
  const stateGap = Math.max(0, Number(state.target || 60) - Number(state.confirmed || 0) - Number(state.supported || 0));
  const cells = item.context?.conditionalCells || [];
  const cellGap = cells.reduce((sum, key) => sum + Math.max(0, 50 - Number(coverage?.conditionalCells?.[`${item.stateType}:${key}`]?.count || 0)), 0);
  return (IMPACT[item.stateType] || 0) + Math.min(60, stateGap) + Math.min(50, cellGap) + Math.round(Number(item.confidence || 0) * 20);
}
function stateForQuestion(id) { return ({ leadPressure: "LEAD_PRESSURE", energyState: "ENERGY_STATE", banteResponse: "BANTE_RESPONSE", lineState: "LINE_STATE", otherLineSurvival: "OTHER_LINE_SURVIVAL" })[id] || "OTHER"; }
