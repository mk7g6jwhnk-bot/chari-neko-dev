import { createActionTag, hashEvidence, isFinalTest } from "./action-tag-schema.mjs";

export function createActionTagCollector({ store, reviewQueue, maxBufferedRaces = 20, maxSeenRaces = 2000, now = () => new Date().toISOString() } = {}) {
  if (!store || !reviewQueue) throw new Error("ACTION_TAG_COLLECTOR_DEPENDENCY_REQUIRED");
  const seen = new Set(), seenOrder = [], buffer = [];
  return {
    offer(record) {
      if (!record?.raceKey || seen.has(record.raceKey)) return { accepted: false, reason: "DUPLICATE_OR_INVALID" };
      if (isFinalTest(record)) return { accepted: false, reason: "FINAL_TEST_EXCLUDED" };
      if (record.historical === true || record.backfill === true) return { accepted: false, reason: "HISTORICAL_BACKFILL_FORBIDDEN" };
      if (buffer.length >= maxBufferedRaces) return { accepted: false, reason: "BOUNDED_BUFFER_FULL" };
      seen.add(record.raceKey); seenOrder.push(record.raceKey); if (seenOrder.length > maxSeenRaces) seen.delete(seenOrder.shift()); buffer.push(record); return { accepted: true, queued: buffer.length };
    },
    async drain({ limit = 5 } = {}) {
      const outputs = [];
      while (buffer.length && outputs.length < limit) { const record = buffer.shift(); outputs.push(processRecord(record, { store, reviewQueue, now })); await Promise.resolve(); }
      return outputs;
    },
    get status() { return { bufferedRaces: buffer.length, seenRaces: seen.size, maxBufferedRaces, productionBlocking: false, productionWriteAllowed: false }; }
  };
}

export function generateObservationCandidates(record, { now = () => new Date().toISOString() } = {}) {
  const tags = [], createdAt = now(), common = { raceKey: record.raceKey, predictionSealedAt: record.predictionSealedAt || record.sealed?.predictionSealedAt, resultObservedAt: record.resultObservedAt || record.result?.observedAt, createdAt };
  for (const observation of record.directActionObservations || []) {
    tags.push(createActionTag({ ...common, ...observation, collectionLane: "AUTO_DIRECT", verificationStatus: "CONFIRMED", reviewer: observation.reviewer || "AUTO_DIRECT_VALIDATOR" }));
  }
  for (const rider of record.participants || record.sealed?.participants || []) {
    const riderId = rider.registration || rider.riderId || rider.id || rider.number;
    const starts = Number(rider.recent_4_months?.starts), back = Number(rider.recent_4_months?.back);
    if (starts > 0 && Number.isFinite(back)) tags.push(createActionTag({ ...common, raceKey: record.raceKey, riderId, stateType: "INITIATIVE", stateValue: back > 0 ? "ACQUIRED" : "UNKNOWN", observationTime: common.predictionSealedAt || createdAt, evidenceType: "OFFICIAL_BACK_FREQUENCY_PROXY", evidenceSource: `rolling starts=${starts};back=${back}`, evidenceHash: hashEvidence(`${riderId}|${starts}|${back}`), confidence: Math.min(.7, starts / 50), reviewer: "AUTO_CANDIDATE", verificationStatus: back > 0 ? "POSSIBLE" : "UNKNOWN", collectionLane: "AUTO_CANDIDATE" }));
  }
  const manualRiderIds = [...new Set((record.participants || record.sealed?.participants || []).map(rider => String(rider.registration || rider.riderId || rider.id || rider.number)).filter(Boolean))];
  for (const riderId of manualRiderIds) for (const stateType of ["LEAD_PRESSURE", "ENERGY_STATE", "BANTE_RESPONSE", "LINE_TRACKING", "ATTACK_OUTCOME", "LINE_STATE"]) {
    tags.push(createActionTag({ ...common, riderId, stateType, stateValue: "UNKNOWN", observationTime: common.predictionSealedAt || createdAt, evidenceType: "MANUAL_REVIEW_REQUIRED", evidenceSource: record.evidenceSource || `race:${record.raceKey}`, confidence: 0, reviewer: "UNASSIGNED", verificationStatus: "PENDING", collectionLane: "MANUAL_REVIEW" }));
  }
  return tags;
}

function processRecord(record, dependencies) {
  const tags = generateObservationCandidates(record, dependencies), saved = [], queued = [];
  for (const tag of tags) { const stored = dependencies.store.append(tag); saved.push(stored); if (stored.collectionLane !== "AUTO_DIRECT") queued.push(dependencies.reviewQueue.enqueue(stored)); }
  return { raceKey: record.raceKey, savedCount: saved.length, manualQueueCount: queued.length, directCount: saved.filter(tag => tag.collectionLane === "AUTO_DIRECT").length, candidateCount: saved.filter(tag => tag.collectionLane === "AUTO_CANDIDATE").length, historicalMutation: false };
}
