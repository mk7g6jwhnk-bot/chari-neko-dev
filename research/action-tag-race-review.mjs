import { createHash } from "node:crypto";
import { createActionTag, hashEvidence, isFinalTest } from "./action-tag-schema.mjs";

export const RACE_REVIEW_VERSION = "ACTION_TAG_RACE_REVIEW_V1";
export const RACE_REVIEW_QUESTIONS = Object.freeze([
  Object.freeze({ id: "leadPressure", label: "主導権争い", values: ["CLEAN", "CONTESTED", "LONG_LEAD", "UNKNOWN"], priority: 1 }),
  Object.freeze({ id: "energyState", label: "主導権選手の脚状態", values: ["RESERVED", "NORMAL", "DEPLETED", "UNKNOWN"], priority: 2 }),
  Object.freeze({ id: "banteResponse", label: "番手の反応", values: ["SUPPORT_FRONT", "HOLD_POSITION", "SELF_LAUNCH", "SWITCH", "SEPARATED", "UNKNOWN"], priority: 3 }),
  Object.freeze({ id: "lineState", label: "ライン状態", values: ["INTACT", "PARTIAL_BREAK", "COLLAPSED", "UNKNOWN"], priority: 4 }),
  Object.freeze({ id: "otherLineSurvival", label: "別線の残存", values: ["SURVIVED", "DID_NOT_SURVIVE", "UNKNOWN"], priority: 5, optional: true })
]);
const STATUS_CONFIDENCE = Object.freeze({ CONFIRMED: 1, STRONGLY_SUPPORTED: .85, POSSIBLE: .55, UNKNOWN: 0 });

export function buildRaceReviewCase({ record, tags = [], coverage = {}, includeOptional = true } = {}) {
  if (!record?.raceKey || isFinalTest(record)) throw new Error("RACE_REVIEW_INELIGIBLE");
  const participants = normalizeParticipants(record), automatic = tags.filter(tag => tag.raceKey === record.raceKey && tag.collectionLane !== "MANUAL_REVIEW");
  const initiative = selectInitiative(participants, automatic), bante = initiative ? participants.find(row => row.lineId === initiative.lineId && row.linePosition === 2) || null : null;
  const questions = RACE_REVIEW_QUESTIONS.filter(question => includeOptional || !question.optional).map(question => ({ ...question, suggestedValue: suggestion(question.id, automatic), targetRiderId: target(question.id, initiative, bante)?.riderId || null, coverageGap: coverageGap(question.id, coverage) }));
  return Object.freeze({ version: RACE_REVIEW_VERSION, caseId: id("CASE", record.raceKey), raceKey: record.raceKey, createdAt: record.reviewQueuedAt || new Date().toISOString(), lineup: lineSummary(participants), initiativeCandidate: initiative, banteCandidate: bante, automaticCandidates: automatic.map(compactTag), preRace: Object.freeze({ predictionSealedAt: record.predictionSealedAt || null, venue: record.venueName || record.venue || null, raceNo: record.raceNo || null }), evidence: evidenceRows(record, automatic), questions, decisionCount: questions.length, productionUi: false });
}

export function submitRaceReview(reviewCase, answers = {}, options = {}) {
  const reviewerId = required(options.reviewerId, "REVIEWER_REQUIRED"), reviewedAt = iso(options.reviewedAt || new Date()), source = required(options.evidenceSource, "EVIDENCE_SOURCE_REQUIRED");
  const evidenceType = String(options.evidenceType || "VALIDATED_MANUAL_OBSERVATION").toUpperCase();
  const tags = [], judgments = [];
  for (const question of reviewCase.questions) {
    const answer = normalizeAnswer(answers[question.id]);
    if (!answer) { if (question.optional) continue; throw new Error(`RACE_REVIEW_ANSWER_REQUIRED:${question.id}`); }
    if (!question.values.includes(answer.value)) throw new Error(`RACE_REVIEW_VALUE_INVALID:${question.id}:${answer.value}`);
    const mapping = mapAnswer(question.id, answer.value);
    const original = reviewCase.automaticCandidates.find(tag => tag.stateType === mapping.stateType) || null;
    const status = answer.value === "UNKNOWN" ? "UNKNOWN" : answer.status;
    const disagreement = Boolean(original && original.stateValue !== mapping.stateValue && mapping.stateValue !== "UNKNOWN");
    const targetRiderId = question.targetRiderId || reviewCase.initiativeCandidate?.riderId || `RACE:${reviewCase.raceKey}`;
    const evidenceSource = `${source}#${question.id}`;
    const tag = createActionTag({ raceKey: reviewCase.raceKey, riderId: targetRiderId, stateType: mapping.stateType, stateValue: mapping.stateValue, observationTime: reviewedAt, evidenceType, evidenceSource, sourceHash: hashEvidence(`${evidenceSource}|${reviewCase.raceKey}`), confidence: STATUS_CONFIDENCE[status], reviewer: reviewerId, verificationStatus: status, collectionLane: "MANUAL_REVIEW", predictionSealedAt: reviewCase.preRace.predictionSealedAt, resultObservedAt: options.resultObservedAt || null, createdAt: reviewedAt, reviewerNote: answer.note || options.reviewerNote || null, context: targetContext(question.id, reviewCase) });
    tags.push(tag);
    let contradictionTagId = null;
    if (disagreement) {
      const contradictionHash = hashEvidence(`${evidenceSource}|contradicts|${original.tagId}`);
      const contradicted = createActionTag({ ...tag, tagId: undefined, stateValue: original.stateValue, verificationStatus: "CONTRADICTED", evidenceSource: `${evidenceSource}:contradicts:${original.tagId}`, sourceHash: contradictionHash, evidenceHash: contradictionHash, confidence: answer.status === "CONFIRMED" ? 1 : .85, createdAt: reviewedAt });
      tags.push(contradicted); contradictionTagId = contradicted.tagId;
    }
    judgments.push(Object.freeze({ questionId: question.id, reviewerId, reviewedAt, originalAutoCandidate: original, finalHumanJudgment: Object.freeze({ stateType: tag.stateType, stateValue: tag.stateValue, verificationStatus: tag.verificationStatus }), disagreement, contradictionTagId }));
  }
  return Object.freeze({ version: RACE_REVIEW_VERSION, reviewId: id("REVIEW", `${reviewCase.raceKey}|${reviewerId}|${reviewedAt}`), caseId: reviewCase.caseId, raceKey: reviewCase.raceKey, reviewerId, reviewedAt, evidenceSource: source, evidenceType, judgments, tags, questionCount: judgments.length, tagCount: tags.length, unknownCount: tags.filter(tag => tag.stateValue === "UNKNOWN").length, completed: true, productionWriteAllowed: false, historicalMutation: false });
}

export class MemoryRaceReviewStore {
  #cases = new Map(); #reviews = new Map(); #checkpoints = new Map();
  enqueue(reviewCase) { if (!this.#cases.has(reviewCase.caseId)) this.#cases.set(reviewCase.caseId, reviewCase); return this.#cases.get(reviewCase.caseId); }
  save(review) { const key = `${review.raceKey}|${review.reviewerId}`; if (this.#reviews.has(key)) return { saved: false, reason: "DUPLICATE_REVIEW", review: this.#reviews.get(key) }; this.#reviews.set(key, review); this.#checkpoints.set(review.raceKey, Object.freeze({ raceKey: review.raceKey, caseId: review.caseId, status: "COMPLETED", questionIndex: review.questionCount, reviewId: review.reviewId, updatedAt: review.reviewedAt })); return { saved: true, review }; }
  checkpoint(raceKey, questionIndex, updatedAt = new Date().toISOString()) { const row = Object.freeze({ raceKey, caseId: id("CASE", raceKey), status: "IN_PROGRESS", questionIndex: Math.max(0, Number(questionIndex) || 0), updatedAt: iso(updatedAt) }); this.#checkpoints.set(raceKey, row); return row; }
  resume(raceKey) { return Object.freeze({ reviewCase: [...this.#cases.values()].find(row => row.raceKey === raceKey) || null, checkpoint: this.#checkpoints.get(raceKey) || null, priorReviews: [...this.#reviews.values()].filter(row => row.raceKey === raceKey) }); }
  exportCheckpoint() { return Object.freeze({ version: "RACE_REVIEW_CHECKPOINT_V1", cases: [...this.#cases.values()], reviews: [...this.#reviews.values()], checkpoints: [...this.#checkpoints.values()] }); }
  static restore(snapshot = {}) { const store = new MemoryRaceReviewStore(); for (const row of snapshot.cases || []) store.#cases.set(row.caseId, row); for (const row of snapshot.reviews || []) store.#reviews.set(`${row.raceKey}|${row.reviewerId}`, row); for (const row of snapshot.checkpoints || []) store.#checkpoints.set(row.raceKey, row); return store; }
  listReviews() { return [...this.#reviews.values()]; }
}

function normalizeAnswer(value) { if (typeof value === "string") return { value: value.toUpperCase(), status: value.toUpperCase() === "UNKNOWN" ? "UNKNOWN" : "CONFIRMED", note: null }; if (!value) return null; const status = String(value.status || (String(value.value).toUpperCase() === "UNKNOWN" ? "UNKNOWN" : "CONFIRMED")).toUpperCase(); if (!(status in STATUS_CONFIDENCE)) throw new Error(`RACE_REVIEW_STATUS_INVALID:${status}`); return { value: String(value.value).toUpperCase(), status, note: value.note || null }; }
function mapAnswer(id, value) { if (id === "leadPressure") return { stateType: "LEAD_PRESSURE", stateValue: value === "CLEAN" ? "CLEAN_LEAD" : value === "CONTESTED" ? "CONTESTED_LEAD" : value }; if (id === "energyState") return { stateType: "ENERGY_STATE", stateValue: value }; if (id === "banteResponse") return { stateType: "BANTE_RESPONSE", stateValue: value }; if (id === "lineState") return { stateType: "LINE_STATE", stateValue: value === "INTACT" ? "PRESERVED" : value }; return { stateType: "OTHER_LINE_SURVIVAL", stateValue: value }; }
function target(id, initiative, bante) { return id === "banteResponse" ? bante : initiative; }
function targetContext(id, review) { const rider = id === "banteResponse" ? review.banteCandidate : review.initiativeCandidate; return rider ? { riderNumber: rider.number, lineId: rider.lineId, linePosition: rider.linePosition, lineSize: rider.lineSize, role: rider.role, sourceRecordId: review.raceKey, conditionalCells: rider.conditionalCells || [], evidenceCount: 1 } : { sourceRecordId: review.raceKey, evidenceCount: 1 }; }
function selectInitiative(participants, tags) { const candidates = tags.filter(tag => tag.stateType === "INITIATIVE" && tag.stateValue === "ACQUIRED").sort((a, b) => b.confidence - a.confidence); const rider = participants.find(row => row.riderId === candidates[0]?.riderId) || participants.find(row => row.linePosition === 1) || null; return rider ? Object.freeze(rider) : null; }
function suggestion(id, tags) { const state = ({ leadPressure: "LEAD_PRESSURE", energyState: "ENERGY_STATE", banteResponse: "BANTE_RESPONSE", lineState: "LINE_STATE", otherLineSurvival: "OTHER_LINE_SURVIVAL" })[id]; const tag = tags.filter(row => row.stateType === state).sort((a, b) => b.confidence - a.confidence)[0]; return tag ? Object.freeze({ value: tag.stateValue, confidence: tag.confidence, verificationStatus: tag.verificationStatus, autoSelected: false }) : null; }
function coverageGap(id, coverage) { const state = ({ leadPressure: "LEAD_PRESSURE", energyState: "ENERGY_STATE", banteResponse: "BANTE_RESPONSE", lineState: "LINE_STATE", otherLineSurvival: "OTHER_LINE_SURVIVAL" })[id]; const row = coverage?.states?.[state] || {}; return Math.max(0, Number(row.target || 60) - Number(row.confirmed || 0) - Number(row.supported || 0)); }
function normalizeParticipants(record) { const rows = record.participants || record.sealed?.participants || [], lines = record.lines || record.sealed?.lines || []; const lineMap = new Map(lines.map(row => [Number(row.number), row])), sizes = new Map(); for (const row of lines) sizes.set(String(row.lineId), (sizes.get(String(row.lineId)) || 0) + 1); return rows.map((row, index) => { const line = lineMap.get(Number(row.number)) || row, lineId = line.lineId == null ? null : String(line.lineId), linePosition = Number(line.position ?? line.linePosition ?? row.linePosition) || null, lineSize = Number(row.lineSize) || sizes.get(lineId) || null; return { riderId: String(row.registration || row.riderId || row.id || row.number), number: Number(row.number ?? index + 1), name: row.name || null, lineId, linePosition, lineSize, role: row.role || (linePosition === 1 ? "LINE_HEAD" : linePosition === 2 ? "BANTE" : null), conditionalCells: [linePosition === 1 ? "LINE_LEADER" : linePosition === 2 ? "BANTE" : null, lineSize === 2 ? "TWO_RIDER_LINE" : lineSize >= 3 ? "THREE_PLUS_RIDER_LINE" : null].filter(Boolean) }; }); }
function lineSummary(rows) { const lines = new Map(); for (const row of rows) { const key = row.lineId || `SOLO-${row.number}`; if (!lines.has(key)) lines.set(key, []); lines.get(key).push(row); } return [...lines].map(([lineId, riders]) => Object.freeze({ lineId, riders: riders.sort((a, b) => (a.linePosition || 99) - (b.linePosition || 99)).map(row => Object.freeze({ riderId: row.riderId, number: row.number, name: row.name, position: row.linePosition, role: row.role })) })); }
function evidenceRows(record, tags) { const rows = tags.map(tag => ({ type: tag.evidenceType, source: tag.evidenceSource, timestamp: tag.observationTime, link: /^https?:\/\//.test(tag.evidenceSource) ? tag.evidenceSource : null })); if (record.evidenceSource) rows.push({ type: "RACE_EVIDENCE", source: record.evidenceSource, timestamp: record.evidenceTimestamp || null, link: /^https?:\/\//.test(record.evidenceSource) ? record.evidenceSource : null }); return Object.freeze(rows.map(Object.freeze)); }
function compactTag(tag) { return Object.freeze({ tagId: tag.tagId, riderId: tag.riderId, stateType: tag.stateType, stateValue: tag.stateValue, confidence: tag.confidence, verificationStatus: tag.verificationStatus, evidenceSource: tag.evidenceSource }); }
function id(prefix, value) { return `${prefix}-${createHash("sha256").update(String(value)).digest("hex").slice(0, 20)}`; }
function required(value, code) { if (!String(value || "").trim()) throw new Error(code); return String(value); }
function iso(value) { const date = new Date(value); if (!Number.isFinite(date.getTime())) throw new Error("RACE_REVIEW_TIME_INVALID"); return date.toISOString(); }
