import { createActionTag, hashEvidence, isFinalTest } from "./action-tag-schema.mjs";

export const AUTO_OBSERVER_VERSION = "ACTION_TAG_AUTO_OBSERVER_V1";

export function observeActionTags(record, { now = () => new Date().toISOString() } = {}) {
  if (!record?.raceKey || isFinalTest(record)) return [];
  const createdAt = now();
  const participants = normalizeParticipants(record);
  const byNumber = new Map(participants.map(row => [row.number, row]));
  const official = record.officialEvidence || record.result?.officialEvidence || record.officialResult || {};
  const finishOrder = normalizeOrder(official.finishOrder || record.result?.officialFinishOrder || record.result?.finishOrder);
  const method = normalizeMethod(official.winningMethod);
  const winner = byNumber.get(finishOrder[0]);
  const resultObservedAt = official.observedAt || record.resultObservedAt || record.result?.checkedAt || null;
  const observationTime = resultObservedAt || record.predictionSealedAt || createdAt;
  const common = { raceKey: record.raceKey, predictionSealedAt: record.predictionSealedAt, resultObservedAt, createdAt };
  const tags = [];

  // Official winning method is an independently published race event. Finish order alone never enters this branch.
  if (winner && method === "MAKURI") tags.push(direct(common, winner, "ATTACK_OUTCOME", "MAKURI_SUCCESS", observationTime, official, method));
  if (winner && method === "ESCAPE") tags.push(direct(common, winner, "INITIATIVE", "ACQUIRED", observationTime, official, method));

  for (const rider of participants) {
    const signals = initiativeSignals(rider, official);
    if (signals.length >= 2) tags.push(candidate(common, rider, "INITIATIVE", "ACQUIRED", observationTime, signals, confidence(signals.length, .58, .82)));
  }

  // LONG_LEAD requires an explicit escape event plus two independent structural signals; it remains unverified.
  if (winner && method === "ESCAPE") {
    const signals = [signal("OFFICIAL_WINNING_METHOD", `method=${method}`)];
    if (markerNumber(official, "back") === winner.number) signals.push(signal("OFFICIAL_BACK_MARKER", `B=${winner.number}`));
    if (winner.linePosition === 1) signals.push(signal("OFFICIAL_LINE_POSITION", `line=${winner.lineId};position=1`));
    if (signals.length >= 3) tags.push(candidate(common, winner, "LEAD_PRESSURE", "LONG_LEAD", observationTime, signals, .82));
  }

  // Result adjacency is only one of three signals and can therefore never verify tracking by itself.
  for (const rider of participants.filter(row => row.linePosition > 1)) {
    const leader = participants.find(row => row.lineId && row.lineId === rider.lineId && row.linePosition === 1);
    const leaderFinish = finishOrder.indexOf(leader?.number) + 1;
    const riderFinish = finishOrder.indexOf(rider.number) + 1;
    const signals = [];
    if (leader && rider.lineId) signals.push(signal("OFFICIAL_LINE_STRUCTURE", `line=${rider.lineId};position=${rider.linePosition}`));
    if (trackingRate(rider) >= .2) signals.push(signal("OFFICIAL_MARK_FREQUENCY", `trackingRate=${trackingRate(rider).toFixed(4)}`));
    if (leaderFinish > 0 && riderFinish > 0 && Math.abs(leaderFinish - riderFinish) === 1) signals.push(signal("OFFICIAL_FINISH_ADJACENCY", `leaderFinish=${leaderFinish};riderFinish=${riderFinish}`));
    if (signals.length >= 3) tags.push(candidate(common, rider, "LINE_TRACKING", "SUCCESS", observationTime, signals, .76));
  }
  return deduplicate(tags);
}

export function summarizeAutoObservation(records = [], options = {}) {
  const totals = { races: 0, riders: 0, tags: 0, direct: 0, strongProxy: 0, weakProxy: 0, manual: 0, unknown: 0 };
  const states = {};
  for (const record of records) {
    if (isFinalTest(record)) continue;
    totals.races += 1; totals.riders += normalizeParticipants(record).length;
    for (const tag of observeActionTags(record, options)) {
      totals.tags += 1;
      const bucket = tag.collectionLane === "AUTO_DIRECT" ? "direct" : tag.verificationStatus === "POSSIBLE" && Number(tag.context?.evidenceCount) >= 2 ? "strongProxy" : "weakProxy";
      totals[bucket] += 1;
      states[tag.stateType] ||= { direct: 0, strongProxy: 0, weakProxy: 0 };
      states[tag.stateType][bucket] += 1;
    }
  }
  return { version: AUTO_OBSERVER_VERSION, ...totals, automaticRate: totals.tags ? (totals.direct + totals.strongProxy + totals.weakProxy) / totals.tags : null, tagsPerRace: totals.races ? totals.tags / totals.races : null, tagsPerRider: totals.riders ? totals.tags / totals.riders : null, states, accuracyEvaluated: false, productionWriteAllowed: false };
}

function direct(common, rider, stateType, stateValue, observationTime, official, method) {
  const source = `official-result:${official.source || "official"};winningMethod=${method};rider=${rider.number}`;
  return createActionTag({ ...common, riderId: rider.riderId, stateType, stateValue, observationTime, evidenceType: "OFFICIAL_RESULT_EVENT", evidenceSource: source, sourceHash: hashEvidence(source), confidence: 1, reviewer: "AUTO_DIRECT_OFFICIAL", verificationStatus: "CONFIRMED", collectionLane: "AUTO_DIRECT", context: context(rider, common, 1) });
}
function candidate(common, rider, stateType, stateValue, observationTime, signals, value) {
  const source = signals.map(row => `${row.type}:${row.value}`).sort().join("|");
  return createActionTag({ ...common, riderId: rider.riderId, stateType, stateValue, observationTime, evidenceType: "MULTI_SOURCE_STRONG_PROXY", evidenceSource: source, sourceHash: hashEvidence(source), confidence: value, reviewer: "AUTO_CANDIDATE", verificationStatus: "POSSIBLE", collectionLane: "AUTO_CANDIDATE", context: context(rider, common, signals.length) });
}
function context(rider, common, evidenceCount) { return { riderNumber: rider.number, lineId: rider.lineId, linePosition: rider.linePosition, lineSize: rider.lineSize, role: rider.role, finishPosition: rider.finishPosition, resultStatus: common.resultObservedAt ? "OBSERVED" : "PENDING", sourceRecordId: common.raceKey, conditionalCells: conditionalCells(rider), evidenceCount }; }
function conditionalCells(rider) { const cells = []; if (rider.linePosition === 1) cells.push("LINE_LEADER"); if (rider.linePosition === 2) cells.push("BANTE"); if (rider.lineSize === 2) cells.push("TWO_RIDER_LINE"); if (rider.lineSize >= 3) cells.push("THREE_PLUS_RIDER_LINE"); return cells; }
function initiativeSignals(rider, official) { const rows = []; if (rider.linePosition === 1) rows.push(signal("OFFICIAL_LINE_POSITION", `line=${rider.lineId};position=1`)); if (markerNumber(official, "back") === rider.number) rows.push(signal("OFFICIAL_BACK_MARKER", `B=${rider.number}`)); if (backRate(rider) >= .2) rows.push(signal("OFFICIAL_BACK_FREQUENCY", `backRate=${backRate(rider).toFixed(4)}`)); if (escapeRate(rider) >= .15) rows.push(signal("OFFICIAL_ESCAPE_FREQUENCY", `escapeRate=${escapeRate(rider).toFixed(4)}`)); return rows; }
function normalizeParticipants(record) { const rows = record.participants || record.sealed?.participants || []; const lineRows = record.lines || record.officialData?.lines || record.sealed?.lines || []; const lineMap = new Map(lineRows.map(row => [Number(row.number), row])); const sizes = new Map(); for (const row of lineRows) sizes.set(String(row.lineId), (sizes.get(String(row.lineId)) || 0) + 1); return rows.map((row, index) => { const line = lineMap.get(Number(row.number)) || row; const recent = row.recent_4_months || {}, methods = row.winning_method_share_among_top2 || {}; const starts = positive(row.officialTotalStarts ?? recent.starts), methodDenominator = positive(methods.denominator_top2); return { raw: row, riderId: String(row.registration || row.riderId || row.id || row.number), number: Number(row.number ?? index + 1), lineId: line.lineId == null ? null : String(line.lineId), linePosition: finite(line.position ?? line.linePosition ?? row.linePosition), lineSize: finite(row.lineSize) || sizes.get(String(line.lineId)) || null, role: row.role || null, starts, backCount: finite(row.backCount ?? recent.back), escapeCount: finite(row.escapeCount ?? recent.escape), markCount: finite(row.markCount ?? recent.mark), escapeShare: methodDenominator ? finite(methods.escape) / 100 : null, markShare: methodDenominator ? finite(methods.mark) / 100 : null, finishPosition: null }; }); }
function normalizeOrder(value) { return (Array.isArray(value) ? value : String(value || "").match(/\d+/g) || []).map(Number); }
function normalizeMethod(value) { const text = String(value || "").trim().toLowerCase(); if (/捲|まくり|makuri/.test(text)) return "MAKURI"; if (/逃|nige|escape/.test(text)) return "ESCAPE"; return null; }
function markerNumber(official, name) { return finite(official?.markers?.[`${name}Number`] ?? official?.markers?.[name === "back" ? "B" : "S"]); }
function backRate(rider) { return rider.starts ? (rider.backCount || 0) / rider.starts : 0; }
function escapeRate(rider) { return Number.isFinite(rider.escapeShare) ? rider.escapeShare : rider.starts ? (rider.escapeCount || 0) / rider.starts : 0; }
function trackingRate(rider) { return Number.isFinite(rider.markShare) ? rider.markShare : rider.starts ? (rider.markCount || 0) / rider.starts : 0; }
function confidence(count, low, high) { return Math.min(high, low + Math.max(0, count - 2) * .1); }
function signal(type, value) { return { type, value }; }
function deduplicate(tags) { const map = new Map(); for (const tag of tags) { const key = `${tag.raceKey}|${tag.riderId}|${tag.stateType}|${tag.stateValue}`; const old = map.get(key); if (!old || tag.confidence > old.confidence) map.set(key, tag); } return [...map.values()]; }
function finite(value) { const number = Number(value); return Number.isFinite(number) ? number : null; }
function positive(value) { const number = finite(value); return number > 0 ? number : 0; }
