import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { auditThick } from './thick-readonly-audit.mjs';

const DEFAULT_BASE = 'https://chari-neko-dev.netlify.app/.netlify/functions';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function getJson(base, name, raceKey, fetchImpl = fetch) {
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetchImpl(`${base}/${name}?raceKey=${encodeURIComponent(raceKey)}`, {
        headers: { accept: 'application/json' }, signal: AbortSignal.timeout(60000)
      });
      if (!response.ok) throw Error(`HTTP_${response.status}`);
      return await response.json();
    } catch (error) {
      last = error;
      if (attempt < 2) await sleep(250 * (attempt + 1));
    }
  }
  throw last;
}

async function fetchRace(baseUrl, raceKey, fetchImpl) {
  const [prediction, result, predictionAfter, resultAfter] = await Promise.all([
    getJson(baseUrl, 'keirin-saved-prediction-detail', raceKey, fetchImpl),
    getJson(baseUrl, 'keirin-sealed-result', raceKey, fetchImpl),
    getJson(baseUrl, 'keirin-saved-prediction-detail', raceKey, fetchImpl),
    getJson(baseUrl, 'keirin-sealed-result', raceKey, fetchImpl)
  ]);
  return { prediction, result, predictionAfter, resultAfter };
}

export async function fetch100rSource({ cohort, baseUrl = DEFAULT_BASE, fetchImpl = fetch, concurrency = 4 } = {}) {
  if (!cohort || cohort.raceKeys?.length !== 100 || cohort.protectedFinalIncluded !== 0) throw Error('FROZEN_100R_COHORT_REQUIRED');
  const records = [], exclusions = [], hashes = { predictionMismatch: 0, purchaseMismatch: 0, sealedResultMismatch: 0 };
  let cursor = 0;
  async function worker() {
    while (cursor < cohort.raceKeys.length) {
      const index = cursor++, raceKey = cohort.raceKeys[index];
      try {
        const { prediction, result, predictionAfter, resultAfter } = await fetchRace(baseUrl, raceKey, fetchImpl);
        if (prediction.raceKey !== raceKey || result.raceKey !== raceKey) {
          hashes.predictionMismatch++; exclusions.push({ raceKey, reason: 'RACE_KEY_MISMATCH' }); continue;
        }
        if (prediction.predictionHash !== result.predictionHash) {
          hashes.predictionMismatch++; exclusions.push({ raceKey, reason: 'PREDICTION_HASH_MISMATCH' }); continue;
        }
        if (prediction.predictionHash !== predictionAfter.predictionHash) {
          hashes.predictionMismatch++; exclusions.push({ raceKey, reason: 'PREDICTION_READBACK_MISMATCH' }); continue;
        }
        if (hash(result.purchaseEvaluation) !== hash(resultAfter.purchaseEvaluation)) {
          hashes.purchaseMismatch++; exclusions.push({ raceKey, reason: 'PURCHASE_READBACK_MISMATCH' }); continue;
        }
        if (result.resultHash !== resultAfter.resultHash) {
          hashes.sealedResultMismatch++; exclusions.push({ raceKey, reason: 'SEALED_RESULT_READBACK_MISMATCH' }); continue;
        }
        const sealedAt = Date.parse(prediction.predictionSealedAt), observedAt = Date.parse(result.resultObservedAt);
        records[index] = { raceKey, ratingRace: prediction.predictionPayload?.race || {},
          sealed: { predictionSealedAt: prediction.predictionSealedAt, researchPrediction: prediction.predictionPayload?.prediction },
          result: { result: result.officialResult }, temporalAudit: { passed: Number.isFinite(sealedAt) && Number.isFinite(observedAt) && sealedAt < observedAt },
          verification: { mutationDetected: prediction.integrityStatus !== 'VALID' || result.integrityValid !== true },
          sourceHashes: { predictionHash: prediction.predictionHash, inputHash: prediction.inputHash, resultHash: result.resultHash } };
      } catch (error) {
        exclusions.push({ raceKey, reason: String(error?.message || error) });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(8, concurrency)) }, worker));
  const audit = auditThick(records.filter(Boolean), { sourceTotalV2: cohort.raceKeys.length });
  const snapshotHashes = Object.fromEntries(records.filter(Boolean).map(record => [record.raceKey, record.sourceHashes]));
  const eligible = new Set(audit.races.filter(r => r.confirmed && r.temporalValid && r.verificationValid && /^\d+-\d+-\d+$/.test(r.finish) && r.payout !== null).map(r => r.raceKey));
  for (const row of audit.races) if (!eligible.has(row.raceKey)) exclusions.push({ raceKey: row.raceKey, reason: !row.confirmed ? 'RESULT_NOT_CONFIRMED' : !row.temporalValid ? 'TEMPORAL_INVALID' : !row.verificationValid ? 'INTEGRITY_INVALID' : row.payout === null ? 'PAYOUT_UNKNOWN' : 'FINISH_ORDER_INVALID' });
  const ticketDiagnostics = audit.races.map(r => ({ raceKey: r.raceKey, inConfirmedCohort: eligible.has(r.raceKey), quality: r.quality, qualitySource: r.qualitySource,
    rating: r.rating, concentration: r.concentration, canPurchase: r.canPurchase, display: r.display, qualificationBoundary: r.qualificationBoundary,
    tickets: r.tickets, mainTickets: r.tickets.filter(t => t.category === 'MAIN') }));
  const coverHits = audit.races.filter(r => eligible.has(r.raceKey)).flatMap(r => r.tickets.filter(t => t.category === 'COVER' && t.order === r.finish).map(t => ({ raceKey: r.raceKey, order: t.order, payout: r.payout })));
  return { schemaVersion: 'RECOMMENDATION_THICK_100R_SOURCE_V2', cohort, hashes, snapshotHashes, exclusions,
    ticketDiagnostics, thickPerformance: audit.thickPerformance, nonThickMainPerformance: audit.nonThickMainPerformance, coverPerformance: { hits: coverHits },
    safety: { protectedFinalIncluded: 0, productionWrite: 0, historicalMutation: 0, thresholdSearch: false } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cohort = JSON.parse(await fs.readFile(new URL('./recommendation-thick-100r-cohort.json', import.meta.url)));
  const source = await fetch100rSource({ cohort });
  const target = new URL('./recommendation-thick-100r-source.json', import.meta.url);
  await fs.writeFile(target, JSON.stringify(source, null, 2));
  console.log(JSON.stringify({ target: target.pathname, fetched: source.ticketDiagnostics.length, exclusions: source.exclusions, hashes: source.hashes }, null, 2));
}
