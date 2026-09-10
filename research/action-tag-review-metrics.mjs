export function measureRaceReviews(reviews = [], { secondsPerDecision = 8, setupSeconds = 6, submitSeconds = 2, automaticTagsPerRace = 3.33, beforeManualRate = .7826 } = {}) {
  const races = new Set(reviews.map(row => row.raceKey)).size, decisions = reviews.reduce((sum, row) => sum + row.questionCount, 0), tags = reviews.reduce((sum, row) => sum + row.tagCount, 0), unknown = reviews.reduce((sum, row) => sum + row.unknownCount, 0);
  const decisionsPerRace = races ? decisions / races : null, tagsPerRace = races ? tags / races : null;
  const estimatedSecondsPerRace = decisionsPerRace == null ? null : setupSeconds + decisionsPerRace * secondsPerDecision + submitSeconds;
  const confirmed = reviews.flatMap(row => row.tags).filter(tag => ["CONFIRMED", "STRONGLY_SUPPORTED"].includes(tag.verificationStatus)).length;
  const secondsPerConfirmedTag = confirmed ? (estimatedSecondsPerRace * races) / confirmed : null;
  const afterManualRate = decisionsPerRace == null ? null : decisionsPerRace / (decisionsPerRace + automaticTagsPerRace);
  return Object.freeze({ version: "ACTION_TAG_REVIEW_METRICS_V1", races, decisions, tags, decisionsPerRace, clicksPerRace: decisionsPerRace == null ? null : decisionsPerRace + 1, tagsPerRace, estimatedSecondsPerRace, timingMode: "OPERATION_COUNT_ESTIMATE", secondsPerConfirmedTag, unknownRate: tags ? unknown / tags : null, beforeManualRate, afterManualRate, promptReductionRate: decisionsPerRace == null ? null : 1 - decisionsPerRace / 12, workload: Object.freeze(Object.fromEntries([100, 300, 500].map(count => [count, Object.freeze({ races: count, totalSeconds: estimatedSecondsPerRace * count, totalHours: estimatedSecondsPerRace * count / 3600 })]))), accuracyEvaluated: false, productionWriteAllowed: false });
}
