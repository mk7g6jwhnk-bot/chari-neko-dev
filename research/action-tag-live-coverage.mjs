import { STATE_VALUES } from './action-tag-schema.mjs';
export async function liveCoverage(store) {
  const result = { taggedRaces: 0, reviewedRaces: 0, pendingRaces: 0, AUTO_DIRECT: 0, STRONG_PROXY: 0, CONFIRMED: 0, STRONGLY_SUPPORTED: 0, unknown: 0, judgments: 0, states: {}, conditionalCells: {}, goals: { races: 300, state: 60, cell: 50 } };
  for (const state of Object.keys(STATE_VALUES)) result.states[state] = { total: 0, confirmed: 0, supported: 0 };
  const add = tag => {
    const row = result.states[tag.stateType]; if (!row) return;
    row.total++;
    if (tag.collectionLane === 'AUTO_DIRECT') result.AUTO_DIRECT++;
    if (tag.evidenceType === 'MULTI_SOURCE_STRONG_PROXY') result.STRONG_PROXY++;
    if (tag.verificationStatus === 'CONFIRMED') { result.CONFIRMED++; row.confirmed++; }
    if (tag.verificationStatus === 'STRONGLY_SUPPORTED') { result.STRONGLY_SUPPORTED++; row.supported++; }
    if (['CONFIRMED', 'STRONGLY_SUPPORTED'].includes(tag.verificationStatus)) for (const cell of tag.context?.conditionalCells || []) {
      const key = `${tag.stateType}:${tag.stateValue}:${cell}`;
      result.conditionalCells[key] = (result.conditionalCells[key] || 0) + 1;
    }
  };
  for await (const race of store.events('races')) {
    result.taggedRaces++;
    let reviewed = false;
    // Stream per race rather than retaining a growing set of all review IDs.
    for await (const review of store.raceReviews(race.raceKey)) {
      reviewed = true;
      for (const judgment of review.judgments) { result.judgments++; if (judgment.finalHumanJudgment.stateValue === 'UNKNOWN') result.unknown++; }
    }
    if (reviewed) result.reviewedRaces++;
    for (const tag of race.tags) add(tag);
  }
  for await (const review of store.events('reviews')) for (const tag of review.tags) add(tag);
  result.pendingRaces = result.taggedRaces - result.reviewedRaces;
  result.unknownRate = result.judgments ? result.unknown / result.judgments : null;
  return result;
}
