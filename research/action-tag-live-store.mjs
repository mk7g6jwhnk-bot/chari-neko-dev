import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { hashEvidence, isFinalTest } from './action-tag-schema.mjs';
import { generateObservationCandidates } from './action-tag-collector.mjs';
import { buildRaceReviewCase, submitRaceReview } from './action-tag-race-review.mjs';
import { buildManualReviewV2, createManualReviewV2 } from './manual-review-v2.mjs';

export const MAX_RECORD_BYTES = 2 * 1024 * 1024;
export function eligibleMetadata(meta, enrollment = null) {
  if (!/^\d{8}-[A-Za-z0-9]+-\d{1,2}$/.test(meta?.raceKey || '')) return false;
  if (isFinalTest(meta)) return false;
  // Unknown membership fails closed. This live lane only starts AFTER the frozen test.
  if (meta.historical || meta.backfill) return false;
  if (Number.isInteger(meta?.sequence)) return meta.sequence > 502;
  // Production status has no synthetic comparison sequence.  A live certificate is
  // accepted only for races/results strictly after this collector's enrollment day.
  // This is a separate forward cohort; it never assigns or guesses a sequence.
  if (meta?.membershipSource !== 'PRODUCTION_LIVE_STATUS_V1' || meta?.forwardOnly !== true || !enrollment?.startedAt) return false;
  const enrolled = Date.parse(enrollment.startedAt), observed = Date.parse(meta.resultObservedAt), collected = Date.parse(meta.collectedAt);
  const enrollmentJstDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date(enrolled)).replaceAll('-', '');
  return Number.isFinite(observed) && observed >= enrolled && Number.isFinite(collected) && collected >= observed && meta.raceKey.slice(0, 8) > enrollmentJstDay;
}

// A complete, fsynced event is linked into place exclusively. A process crash leaves
// either no event or one complete event; stale temp files are never interpreted.
export async function appendEvent(file, event) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  const handle = await fs.open(temp, 'wx');
  try { await handle.writeFile(JSON.stringify(event)); await handle.sync(); } finally { await handle.close(); }
  try { await fs.link(temp, file); return true; }
  catch (error) { if (error.code === 'EEXIST') return false; throw error; }
  finally { await fs.unlink(temp).catch(() => {}); }
}
async function read(file) {
  try { const stat = await fs.stat(file); if (stat.size > MAX_RECORD_BYTES) throw Error('RECORD_TOO_LARGE'); return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
export class LiveActionStore {
  constructor(directory) { this.directory = path.resolve(directory); }
  file(kind, key) {
    if (kind === 'reviews' || kind === 'reviews-v2') { const split = key.indexOf('|'); return path.join(this.directory, kind, hashEvidence(key.slice(0, split)), `${hashEvidence(key.slice(split + 1))}.json`); }
    return path.join(this.directory, kind, `${hashEvidence(key)}.json`);
  }
  async init() {
    await fs.mkdir(this.directory, { recursive: true });
    await appendEvent(path.join(this.directory, 'enrollment.json'), { startedAt: new Date().toISOString(), version: 1 });
    this.enrollment = await read(path.join(this.directory, 'enrollment.json'));
    return this;
  }
  async *events(kind) {
    let directory;
    try { directory = await fs.opendir(path.join(this.directory, kind)); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    for await (const entry of directory) {
      if (entry.isFile() && entry.name.endsWith('.json')) yield await read(path.join(this.directory, kind, entry.name));
      else if (entry.isDirectory() && kind === 'reviews') yield* this.events(path.join(kind, entry.name));
    }
  }
  async *raceReviews(key) { yield* this.events(path.join('reviews', hashEvidence(key))); }
  async getRace(key) { return read(this.file('races', key)); }
  async ingest(meta, record) {
    if (!eligibleMetadata(meta, this.enrollment) || isFinalTest(record) || record.raceKey !== meta.raceKey) throw Error('FINAL_TEST_OR_UNKNOWN_MEMBERSHIP');
    if (record.historical || record.backfill || !(Date.parse(meta.collectedAt) >= Date.parse(this.enrollment.startedAt))) throw Error('HISTORICAL_BACKFILL_FORBIDDEN');
    if (await this.getRace(meta.raceKey)) return false;
    const normalized = normalizeProductionRecord(record);
    if (!normalized.resultObservedAt || normalized.result?.status !== 'confirmed') throw Error('RESULT_NOT_READY');
    if (!(Date.parse(normalized.resultObservedAt) >= Date.parse(this.enrollment.startedAt))) throw Error('PRE_ENROLLMENT_RESULT_EXCLUDED');
    if (!normalized.participants.length) throw Error('PARTICIPANTS_MISSING');
    if (normalized.participants.length > 9 || normalized.lines.length > 18) throw Error('RACE_STRUCTURE_TOO_LARGE');
    const tags = generateObservationCandidates(normalized).filter(tag => tag.collectionLane !== 'AUTO_CANDIDATE' || tag.evidenceType === 'MULTI_SOURCE_STRONG_PROXY');
    const reviewCase = buildRaceReviewCase({ record: normalized, tags });
    const event = {
      version: 1, metadata: meta, collectedAt: new Date().toISOString(), raceKey: meta.raceKey,
      record: normalized, tags, reviewCase, inputHash: hashEvidence(JSON.stringify(record)), researchOnly: true
    };
    if (Buffer.byteLength(JSON.stringify(event)) > MAX_RECORD_BYTES) throw Error('EVENT_TOO_LARGE');
    return appendEvent(this.file('races', meta.raceKey), event);
  }
  async saveReview(key, input) {
    const event = await this.getRace(key);
    if (!event || !eligibleMetadata(event.metadata, this.enrollment) || isFinalTest(event.record)) throw Error('RACE_INELIGIBLE');
    const reviewerId = String(input.reviewerId || '').trim();
    if (!reviewerId || reviewerId.length > 100) throw Error('REVIEWER_REQUIRED');
    const answers = input.answers || {};
    const known = event.reviewCase.questions.filter(q => answers[q.id] && String(answers[q.id].value || answers[q.id]).toUpperCase() !== 'UNKNOWN');
    if (known.length && (!input.independentEvidence || !String(input.evidenceSource || '').trim())) throw Error('INDEPENDENT_EVIDENCE_REQUIRED');
    // No guessed rider attribution: explicit reviewer selections override the candidate.
    const reviewCase = structuredClone(event.reviewCase);
    const riders = reviewCase.lineup.flatMap(line => line.riders);
    for (const question of reviewCase.questions) {
      const selected = question.id === 'banteResponse' ? input.banteRiderId : question.id === 'otherLineSurvival' ? input.otherRiderId : input.initiativeRiderId;
      const target = riders.find(rider => rider.riderId === selected);
      if (known.includes(event.reviewCase.questions.find(q => q.id === question.id)) && !target) throw Error(`REVIEW_TARGET_REQUIRED:${question.id}`);
      question.targetRiderId = target?.riderId || `RACE:${key}`;
      const line = target && reviewCase.lineup.find(line => line.riders.some(rider => rider.riderId === target.riderId));
      question.targetContext = { sourceRecordId: key, evidenceCount: 1, applicability: question.applicability || 'APPLICABLE',
        ...(target ? { riderNumber: target.number, lineId: line.lineId, linePosition: target.position, lineSize: line.riders.length,
          conditionalCells: [target.position === 1 ? 'LINE_LEADER' : target.position === 2 ? 'BANTE' : null, line.riders.length === 2 ? 'TWO_RIDER_LINE' : line.riders.length >= 3 ? 'THREE_PLUS_RIDER_LINE' : null].filter(Boolean) } : {}) };
    }
    // Context from an unverified candidate must not enter conditional cells.
    reviewCase.initiativeCandidate = null; reviewCase.banteCandidate = null;
    const review = submitRaceReview(reviewCase, answers, {
      reviewerId, evidenceSource: input.evidenceSource || 'unavailable:UNKNOWN',
      evidenceType: 'VALIDATED_MANUAL_OBSERVATION', resultObservedAt: event.record.resultObservedAt
    });
    const enriched = { ...review, evidenceHash: hashEvidence(input.evidenceSource || 'unavailable:UNKNOWN'),
      humanJudgment: review.judgments.map(row => row.finalHumanJudgment),
      verificationStatus: review.tags.map(tag => tag.verificationStatus),
      originalAutoCandidate: event.tags.filter(tag => tag.collectionLane !== 'MANUAL_REVIEW'),
      disagreement: review.judgments.some(row => row.disagreement), independentEvidence: Boolean(input.independentEvidence),
      targetRiders: { initiative: input.initiativeRiderId || null, bante: input.banteRiderId || null, other: input.otherRiderId || null } };
    if (!await appendEvent(this.file('reviews', `${key}|${reviewerId}`), enriched)) throw Error('DUPLICATE_REVIEW');
    return enriched;
  }
  async reviewed(key, reviewerId) { return read(this.file('reviews', `${key}|${reviewerId}`)); }
  async saveReviewV2(key,input){const event=await this.getRace(key);if(!event||!eligibleMetadata(event.metadata,this.enrollment)||isFinalTest(event.record))throw Error('RACE_INELIGIBLE');const review=createManualReviewV2(buildManualReviewV2(event.record),input);if(!await appendEvent(this.file('reviews-v2',`${key}|${review.reviewerId}`),review))throw Error('DUPLICATE_REVIEW');return review;}
  async reviewedV2(key,reviewerId){return read(this.file('reviews-v2',`${key}|${reviewerId}`));}
}

export function officialReplayLinks(record) {
  const urls = [record.officialReplayUrl, record.replayUrl, record.result?.replayUrl, ...(record.officialVideoUrls || [])];
  return [...new Set(urls.filter(value => {
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && ['keirin.jp', 'www.keirin.jp'].includes(url.hostname); } catch { return false; }
  }))];
}
export function normalizeProductionRecord(record) {
  const sealed = record.sealed || {}, pre = record.preRaceInput || {};
  const result = record.result?.result || record.result || {};
  const race = pre.race || record.race || record.raceMetadata || {}, basic = sealed.officialData?.basic || {};
  return {
    raceKey: record.raceKey, venueName: record.venueName || race.venueName || basic.venueName || null,
    raceNo: record.raceNo || race.raceNo || Number(record.raceKey.split('-')[2]),
    scheduledStartAt: record.scheduledStartAt || race.scheduledStartAt || null,
    predictionSealedAt: record.predictionSealedAt || sealed.predictionSealedAt || null,
    resultObservedAt: record.resultObservedAt || record.result?.resultObservedAt || record.result?.observedAt || result.checkedAt || null,
    participants: record.participants || sealed.participants || pre.participants || [],
    lines: record.lines || sealed.lines || sealed.officialData?.lines || pre.lines || [],
    result: { status: result.status, finishOrder: result.finishOrder },
    // Only explicit official fields; never infer a winning method from finish order.
    officialEvidence: record.officialEvidence || result.officialEvidence || {},
    officialVideoUrls: officialReplayLinks(record)
  };
}
