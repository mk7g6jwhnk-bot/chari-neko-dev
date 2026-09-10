import assert from "node:assert/strict";
import { observeActionTags } from "../research/action-tag-auto-observer.mjs";
import { buildActionTagCoverage } from "../research/action-tag-coverage.mjs";
import { buildRaceReviewCase, MemoryRaceReviewStore, submitRaceReview } from "../research/action-tag-race-review.mjs";
import { buildRaceReviewViewModel } from "../research/action-tag-review-ui.mjs";
import { measureRaceReviews } from "../research/action-tag-review-metrics.mjs";
import { prioritizeRaceReviews } from "../research/action-tag-review-priority.mjs";

const participants = [
  { number: 1, registration: "R1", name: "A", backCount: 10, officialTotalStarts: 30 },
  { number: 2, registration: "R2", name: "B", markCount: 9, officialTotalStarts: 30 },
  { number: 3, registration: "R3", name: "C", backCount: 8, officialTotalStarts: 30 }
];
const lines = [{ number: 1, lineId: "A", position: 1 }, { number: 2, lineId: "A", position: 2 }, { number: 3, lineId: "B", position: 1 }];
const base = { raceKey: "20260911-A-1", venueName: "立川", raceNo: 1, predictionSealedAt: "2026-09-11T01:00:00.000Z", participants, lines, evidenceSource: "https://research.invalid/evidence/1", officialEvidence: { source: "official", winningMethod: "逃げ", finishOrder: [1, 2, 3], markers: { backNumber: 1 }, observedAt: "2026-09-11T02:00:00.000Z" } };
const auto = observeActionTags(base, { now: () => "2026-09-11T02:01:00.000Z" });
const coverage = buildActionTagCoverage(auto);
const reviewCase = buildRaceReviewCase({ record: base, tags: auto, coverage });
assert.equal(reviewCase.decisionCount, 5); assert.equal(reviewCase.initiativeCandidate.riderId, "R1"); assert.equal(reviewCase.banteCandidate.riderId, "R2");
const view = buildRaceReviewViewModel(reviewCase);
assert.equal(view.estimatedClicks, 6); assert.equal(view.productionUi, false); assert.ok(view.evidence.some(row => row.openable)); assert.ok(view.candidateChips.every(row => row.selected === false));

const first = submitRaceReview(reviewCase, {
  leadPressure: { value: "CONTESTED", status: "CONFIRMED" }, energyState: { value: "DEPLETED", status: "STRONGLY_SUPPORTED" },
  banteResponse: { value: "SWITCH", status: "CONFIRMED" }, lineState: { value: "COLLAPSED", status: "CONFIRMED" }, otherLineSurvival: "UNKNOWN"
}, { reviewerId: "reviewer-A", reviewedAt: "2026-09-11T02:05:00.000Z", evidenceSource: "official-video-review:event-1", resultObservedAt: "2026-09-11T02:00:00.000Z" });
assert.equal(first.tagCount, 6); assert.equal(first.unknownCount, 1); assert.ok(first.tags.some(tag => tag.stateType === "LEAD_PRESSURE" && tag.stateValue === "CONTESTED_LEAD")); assert.ok(first.tags.some(tag => tag.stateType === "BANTE_RESPONSE" && tag.stateValue === "SWITCH" && tag.riderId === "R2")); assert.ok(first.tags.some(tag => tag.stateType === "LEAD_PRESSURE" && tag.stateValue === "LONG_LEAD" && tag.verificationStatus === "CONTRADICTED")); assert.ok(first.judgments.some(row => row.questionId === "leadPressure" && row.originalAutoCandidate && row.disagreement && row.contradictionTagId));

const store = new MemoryRaceReviewStore(); store.enqueue(reviewCase); store.checkpoint(base.raceKey, 2, "2026-09-11T02:03:00.000Z");
let restored = MemoryRaceReviewStore.restore(store.exportCheckpoint()); assert.equal(restored.resume(base.raceKey).checkpoint.questionIndex, 2);
assert.equal(restored.save(first).saved, true); assert.equal(restored.save(first).reason, "DUPLICATE_REVIEW");
const secondReviewer = submitRaceReview(reviewCase, { leadPressure: "CLEAN", energyState: "NORMAL", banteResponse: "HOLD_POSITION", lineState: "INTACT", otherLineSurvival: "SURVIVED" }, { reviewerId: "reviewer-B", reviewedAt: "2026-09-11T02:08:00.000Z", evidenceSource: "official-video-review:event-1", resultObservedAt: "2026-09-11T02:00:00.000Z" });
assert.equal(restored.save(secondReviewer).saved, true); assert.equal(restored.resume(base.raceKey).priorReviews.length, 2);

const secondCase = buildRaceReviewCase({ record: { ...base, raceKey: "20260911-A-2", raceNo: 2 }, tags: [], coverage, includeOptional: false });
const second = submitRaceReview(secondCase, { leadPressure: "LONG_LEAD", energyState: "NORMAL", banteResponse: "SUPPORT_FRONT", lineState: "PARTIAL_BREAK" }, { reviewerId: "reviewer-A", reviewedAt: "2026-09-11T03:05:00.000Z", evidenceSource: "manual-review:event-2" });
const metrics = measureRaceReviews([first, second]);
assert.equal(metrics.decisionsPerRace, 4.5); assert.equal(metrics.tagsPerRace, 5); assert.equal(metrics.estimatedSecondsPerRace, 44); assert.ok(metrics.afterManualRate < metrics.beforeManualRate); assert.equal(Number(metrics.workload[300].totalHours.toFixed(2)), 3.67);
const updatedCoverage = buildActionTagCoverage([...auto, ...first.tags, ...second.tags]); assert.ok(updatedCoverage.states.LEAD_PRESSURE.confirmed >= 2);
const ordered = prioritizeRaceReviews([secondCase, reviewCase], updatedCoverage, { now: Date.parse("2026-09-12T00:00:00.000Z") }); assert.equal(ordered.length, 2); assert.ok(ordered.every(row => row.priorityAudit.stateGap >= 0));
assert.throws(() => buildRaceReviewCase({ record: { ...base, raceKey: "FINAL", comparisonNumber: 450 }, tags: [] }), /INELIGIBLE/);

console.log(JSON.stringify({ metrics, generatedTags: first.tags.map(tag => `${tag.stateType}:${tag.stateValue}`), checkpoint: restored.resume(base.raceKey).checkpoint }, null, 2));
console.log("PASS action tag race review workflow");
