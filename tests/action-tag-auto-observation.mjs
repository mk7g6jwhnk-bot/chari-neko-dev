import assert from "node:assert/strict";
import { observeActionTags, summarizeAutoObservation } from "../research/action-tag-auto-observer.mjs";
import { forecastCoverage } from "../research/action-tag-coverage-forecast.mjs";
import { prioritizeReviewItems } from "../research/action-tag-review-priority.mjs";
import { createActionTagCollector } from "../research/action-tag-collector.mjs";
import { createFailOpenCollectorAdapter } from "../research/action-tag-collector-adapter.mjs";
import { ActionTagReviewQueue, MemoryActionTagStore } from "../research/action-tag-review-queue.mjs";

const now = () => "2026-09-10T03:00:00.000Z";
const participants = [
  { number: 1, registration: "R1", escapeCount: 8, backCount: 10, markCount: 0, officialTotalStarts: 30 },
  { number: 2, registration: "R2", escapeCount: 0, backCount: 0, markCount: 9, officialTotalStarts: 30 },
  { number: 3, registration: "R3", escapeCount: 5, backCount: 7, markCount: 0, officialTotalStarts: 30 }
];
const lines = [{ number: 1, lineId: "A", position: 1 }, { number: 2, lineId: "A", position: 2 }, { number: 3, lineId: "B", position: 1 }];
const escapeRace = { raceKey: "20260910-A-1", predictionSealedAt: "2026-09-10T01:00:00.000Z", participants, lines, officialEvidence: { source: "official-api", winningMethod: "逃げ", finishOrder: [1, 2, 3], markers: { backNumber: 1 }, observedAt: "2026-09-10T02:00:00.000Z" } };
const makuriRace = { ...escapeRace, raceKey: "20260910-A-2", officialEvidence: { source: "official-api", winningMethod: "捲り", finishOrder: [3, 1, 2], markers: { backNumber: 1 }, observedAt: "2026-09-10T02:30:00.000Z" } };
const preRace = { raceKey: "20260910-A-3", predictionSealedAt: "2026-09-10T02:45:00.000Z", participants, lines };

const escapeTags = observeActionTags(escapeRace, { now });
assert.ok(escapeTags.some(tag => tag.collectionLane === "AUTO_DIRECT" && tag.stateType === "INITIATIVE" && tag.stateValue === "ACQUIRED"));
assert.ok(escapeTags.some(tag => tag.collectionLane === "AUTO_CANDIDATE" && tag.stateValue === "LONG_LEAD" && tag.context.evidenceCount === 3));
assert.ok(escapeTags.some(tag => tag.stateType === "LINE_TRACKING" && tag.verificationStatus === "POSSIBLE"));
assert.ok(escapeTags.filter(tag => tag.collectionLane === "AUTO_CANDIDATE").every(tag => tag.verificationStatus === "POSSIBLE"));
const makuriTags = observeActionTags(makuriRace, { now });
assert.ok(makuriTags.some(tag => tag.collectionLane === "AUTO_DIRECT" && tag.stateValue === "MAKURI_SUCCESS"));
assert.equal(makuriTags.some(tag => tag.collectionLane === "AUTO_DIRECT" && tag.stateValue === "DEPLETED"), false);
assert.equal(makuriTags.some(tag => tag.collectionLane === "AUTO_DIRECT" && tag.stateValue === "SELF_LAUNCH"), false);

const summary = summarizeAutoObservation([escapeRace, makuriRace, preRace, { ...preRace, raceKey: "FINAL", comparisonNumber: 450 }], { now });
assert.equal(summary.races, 3); assert.ok(summary.direct >= 2); assert.ok(summary.strongProxy > summary.direct); assert.equal(summary.accuracyEvaluated, false);
const forecast = forecastCoverage({ observedRaces: 3, tags: [...escapeTags, ...makuriTags, ...observeActionTags(preRace, { now })] });
assert.ok(forecast.states.INITIATIVE.racesNeeded > 0); assert.ok(forecast.unavailableStates.some(row => row.stateType === "ENERGY_STATE" && row.racesNeeded === null));

const queueRows = [...escapeTags.filter(tag => tag.collectionLane === "AUTO_CANDIDATE"), ...escapeTags.filter(tag => tag.collectionLane === "AUTO_CANDIDATE")].map((tag, index) => ({ ...tag, tagId: `${tag.tagId}-${index}` }));
const prioritized = prioritizeReviewItems(queueRows, { states: { LEAD_PRESSURE: { confirmed: 0, supported: 0, target: 60 } } }, { maxPerRace: 2 });
assert.ok(prioritized.duplicateCollapsed > 0); assert.equal(prioritized.selected.length, 2); assert.ok(prioritized.deferred.length > 0);

const store = new MemoryActionTagStore(), queue = new ActionTagReviewQueue({ maxSize: 100 });
let collector = createActionTagCollector({ store, reviewQueue: queue, maxManualPerRace: 4, now });
const adapter = createFailOpenCollectorAdapter({ collector, maxHeapBytes: 100, heapUsed: () => 50 });
assert.equal(adapter.afterRaceSaved(preRace).accepted, true); const [processed] = await adapter.runBatch(1);
assert.equal(processed.manualQueueCount, 4); assert.ok(processed.manualDeferredCount > 0); assert.equal(processed.historicalMutation, false);
const checkpoint = collector.checkpoint();
collector = createActionTagCollector({ store, reviewQueue: queue, initialSeenRaces: checkpoint.seenRaces, now });
assert.equal(collector.offer(preRace).reason, "DUPLICATE_OR_INVALID");
const guarded = createFailOpenCollectorAdapter({ collector, maxHeapBytes: 10, heapUsed: () => 11 });
assert.equal(guarded.afterRaceSaved({ ...preRace, raceKey: "MEMORY" }).reason, "MEMORY_GUARD"); assert.equal(guarded.snapshot().productionBlocking, false);

const loadStore = new MemoryActionTagStore(), loadQueue = new ActionTagReviewQueue({ maxSize: 100 });
const loadCollector = createActionTagCollector({ store: loadStore, reviewQueue: loadQueue, now });
for (const record of [escapeRace, makuriRace, preRace]) assert.equal(loadCollector.offer(record).accepted, true);
const load = await loadCollector.drain({ limit: 3 });
const loadMetrics = { direct: load.reduce((sum, row) => sum + row.directCount, 0), strongProxy: load.reduce((sum, row) => sum + row.candidateCount, 0), manual: load.reduce((sum, row) => sum + row.manualQueueCount, 0) };
assert.deepEqual(loadMetrics, { direct: 2, strongProxy: 8, manual: 36 });

console.log(JSON.stringify({ summary, forecast, e2e: processed, defaultLoad: loadMetrics }, null, 2));
console.log("PASS action tag auto observation");
