import { createActionTag, hashEvidence, isFinalTest } from "./action-tag-schema.mjs";
import { observeActionTags } from "./action-tag-auto-observer.mjs";

export function createActionTagCollector({ store, reviewQueue, maxBufferedRaces = 20, maxSeenRaces = 2000, maxManualPerRace = 12, initialSeenRaces = [], now = () => new Date().toISOString() } = {}) {
  if (!store || !reviewQueue) throw new Error("ACTION_TAG_COLLECTOR_DEPENDENCY_REQUIRED");
  const seenOrder = [...new Set(initialSeenRaces.map(String))].slice(-maxSeenRaces), seen = new Set(seenOrder), buffer = [];
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
      while (buffer.length && outputs.length < limit) { const record = buffer.shift(); outputs.push(processRecord(record, { store, reviewQueue, now, maxManualPerRace })); await Promise.resolve(); }
      return outputs;
    },
    checkpoint() { return { version: "ACTION_TAG_COLLECTOR_CHECKPOINT_V1", seenRaces: [...seenOrder], bufferedRaceKeys: buffer.map(row => row.raceKey) }; },
    get status() { return { bufferedRaces: buffer.length, seenRaces: seen.size, maxBufferedRaces, maxManualPerRace, productionBlocking: false, productionWriteAllowed: false }; }
  };
}

export function generateObservationCandidates(record, { now = () => new Date().toISOString() } = {}) {
  const tags = [], createdAt = now(), common = { raceKey: record.raceKey, predictionSealedAt: record.predictionSealedAt || record.sealed?.predictionSealedAt, resultObservedAt: record.resultObservedAt || record.result?.observedAt, createdAt };
  tags.push(...observeActionTags(record, { now }));
  for (const observation of record.directActionObservations || []) {
    tags.push(createActionTag({ ...common, ...observation, collectionLane: "AUTO_DIRECT", verificationStatus: "CONFIRMED", reviewer: observation.reviewer || "AUTO_DIRECT_VALIDATOR" }));
  }
  for (const rider of record.participants || record.sealed?.participants || []) {
    const riderId = rider.registration || rider.riderId || rider.id || rider.number;
    const starts = Number(rider.recent_4_months?.starts), back = Number(rider.recent_4_months?.back);
    if (starts > 0 && Number.isFinite(back)) tags.push(createActionTag({ ...common, raceKey: record.raceKey, riderId, stateType: "INITIATIVE", stateValue: back > 0 ? "ACQUIRED" : "UNKNOWN", observationTime: common.predictionSealedAt || createdAt, evidenceType: "OFFICIAL_BACK_FREQUENCY_PROXY", evidenceSource: `rolling starts=${starts};back=${back}`, evidenceHash: hashEvidence(`${riderId}|${starts}|${back}`), confidence: Math.min(.7, starts / 50), reviewer: "AUTO_CANDIDATE", verificationStatus: back > 0 ? "POSSIBLE" : "UNKNOWN", collectionLane: "AUTO_CANDIDATE" }));
  }
  const manualRiderIds = [...new Set((record.participants || record.sealed?.participants || []).map(rider => String(rider.registration || rider.riderId || rider.id || rider.number)).filter(Boolean))];
  const existing = new Set(tags.map(tag => `${tag.riderId}|${tag.stateType}`));
  for (const riderId of manualRiderIds) for (const stateType of ["LEAD_PRESSURE", "ENERGY_STATE", "BANTE_RESPONSE", "LINE_TRACKING", "ATTACK_OUTCOME", "LINE_STATE", "OTHER_LINE_SURVIVAL"]) {
    if (existing.has(`${riderId}|${stateType}`)) continue;
    tags.push(createActionTag({ ...common, riderId, stateType, stateValue: "UNKNOWN", observationTime: common.predictionSealedAt || createdAt, evidenceType: "MANUAL_REVIEW_REQUIRED", evidenceSource: record.evidenceSource || `race:${record.raceKey}`, confidence: 0, reviewer: "UNASSIGNED", verificationStatus: "PENDING", collectionLane: "MANUAL_REVIEW" }));
  }
  const deduplicated = new Map();
  for (const tag of tags) {
    const key = `${tag.riderId}|${tag.stateType}|${tag.stateValue}`;
    const current = deduplicated.get(key);
    if (!current || lanePriority(tag) > lanePriority(current) || (lanePriority(tag) === lanePriority(current) && tag.confidence > current.confidence)) deduplicated.set(key, tag);
  }
  return [...deduplicated.values()];
}

function processRecord(record, dependencies) {
  const tags = generateObservationCandidates(record, dependencies), saved = [], queued = [];
  const automatic = tags.filter(tag => tag.collectionLane !== "MANUAL_REVIEW"), manual = tags.filter(tag => tag.collectionLane === "MANUAL_REVIEW").sort((a, b) => stateImpact(b.stateType) - stateImpact(a.stateType)).slice(0, dependencies.maxManualPerRace);
  for (const tag of [...automatic, ...manual]) { const stored = dependencies.store.append(tag); saved.push(stored); if (stored.collectionLane !== "AUTO_DIRECT") queued.push(dependencies.reviewQueue.enqueue(stored)); }
  return { raceKey: record.raceKey, savedCount: saved.length, manualQueueCount: manual.length, reviewQueueCount: queued.length, directCount: saved.filter(tag => tag.collectionLane === "AUTO_DIRECT").length, candidateCount: saved.filter(tag => tag.collectionLane === "AUTO_CANDIDATE").length, manualDeferredCount: Math.max(0, tags.filter(tag => tag.collectionLane === "MANUAL_REVIEW").length - manual.length), historicalMutation: false };
}
function stateImpact(value) { return ({ LEAD_PRESSURE: 95, ENERGY_STATE: 90, BANTE_RESPONSE: 85, LINE_TRACKING: 80, ATTACK_OUTCOME: 75, LINE_STATE: 70, OTHER_LINE_SURVIVAL: 65 })[value] || 0; }
function lanePriority(tag) { return tag.collectionLane === "AUTO_DIRECT" ? 3 : tag.collectionLane === "AUTO_CANDIDATE" ? 2 : 1; }
