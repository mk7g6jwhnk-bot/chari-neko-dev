import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createActionTag, transitionActionTag } from "../research/action-tag-schema.mjs";
import { createActionTagCollector } from "../research/action-tag-collector.mjs";
import { buildActionTagCoverage } from "../research/action-tag-coverage.mjs";
import { ActionTagReviewQueue, JsonlActionTagStore, MemoryActionTagStore } from "../research/action-tag-review-queue.mjs";

const now = () => "2026-09-10T01:10:00.000Z";
const record = {
  raceKey: "20260910-TEST-1", predictionSealedAt: "2026-09-10T01:00:00.000Z",
  participants: [{ registration: "R1", recent_4_months: { starts: 20, back: 8 } }, { registration: "R2", recent_4_months: { starts: 20, back: 0 } }],
  directActionObservations: [{ riderId: "R1", stateType: "ATTACK_OUTCOME", stateValue: "MAKURI_SUCCESS", observationTime: "2026-09-10T00:59:00.000Z", evidenceType: "OFFICIAL_VIDEO_TAG", evidenceSource: "official-video:event-100", confidence: .95, reviewer: "DUAL_REVIEW" }]
};
const store = new MemoryActionTagStore(), queue = new ActionTagReviewQueue({ maxSize: 100 });
const collector = createActionTagCollector({ store, reviewQueue: queue, maxBufferedRaces: 2, now });
assert.equal(collector.offer(record).accepted, true);
assert.equal(collector.offer(record).reason, "DUPLICATE_OR_INVALID");
assert.equal(collector.offer({ ...record, raceKey: "FINAL", comparisonNumber: 450 }).reason, "FINAL_TEST_EXCLUDED");
assert.equal(collector.offer({ ...record, raceKey: "OLD", historical: true }).reason, "HISTORICAL_BACKFILL_FORBIDDEN");
const [processed] = await collector.drain({ limit: 1 });
assert.equal(processed.directCount, 1);
assert.equal(processed.candidateCount, 2);
assert.ok(processed.manualQueueCount > 0);
assert.ok(queue.groupedPending({ raceKey: record.raceKey }).every(group => group.raceKey === record.raceKey && group.stateType && group.evidence.length));
assert.equal(processed.historicalMutation, false);
const direct = store.list().find(tag => tag.collectionLane === "AUTO_DIRECT");
assert.equal(direct.verificationStatus, "CONFIRMED");
assert.equal(direct.trainingEligibility.eligible, true);
const candidate = store.list().find(tag => tag.collectionLane === "AUTO_CANDIDATE" && tag.verificationStatus === "POSSIBLE");
assert.throws(() => transitionActionTag(candidate, { verificationStatus: "CONFIRMED" }), /INDEPENDENT_REVIEW_REQUIRED/);
const manual = store.list().find(tag => tag.collectionLane === "MANUAL_REVIEW" && tag.stateType === "LEAD_PRESSURE");
const reviewed = queue.review(manual.tagId, { stateValue: "CONTESTED_LEAD", verificationStatus: "CONFIRMED", reviewer: "reviewer-1", evidenceType: "VALIDATED_DUAL_REVIEW", evidenceSource: "video:event-100", observationTime: "2026-09-10T02:01:00.000Z", resultObservedAt: "2026-09-10T02:00:00.000Z", confidence: .9 }, store);
assert.equal(reviewed.observationPhase, "POST_RESULT_OBSERVATION");
assert.equal(reviewed.trainingEligibility.eligible, false);
const coverage = buildActionTagCoverage(store.list());
assert.equal(coverage.totalActionTaggedRaces, 1);
assert.ok(coverage.pendingCount > 0);
assert.equal(coverage.finalTestUsed, false);
assert.equal(collector.status.productionBlocking, false);
assert.equal(collector.status.productionWriteAllowed, false);

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "action-tag-test-"));
const jsonl = new JsonlActionTagStore(path.join(tempDirectory, "tags.jsonl"));
jsonl.append(direct); const streamed = []; for await (const tag of jsonl.stream()) streamed.push(tag);
assert.equal(streamed.length, 1); assert.equal(streamed[0].tagId, direct.tagId);
fs.rmSync(tempDirectory, { recursive: true, force: true });

assert.throws(() => createActionTag({ ...record.directActionObservations[0], raceKey: "X", createdAt: now(), collectionLane: "AUTO_CANDIDATE", verificationStatus: "CONFIRMED" }), /AUTO_CANDIDATE_AUTO_PROMOTION_FORBIDDEN/);
console.log("PASS action tag collection pipeline");
