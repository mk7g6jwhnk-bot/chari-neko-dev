import { setImmediate as yieldTurn } from 'node:timers/promises';
import { hashEvidence } from './action-tag-schema.mjs';
import { isFinalTest } from './action-tag-schema.mjs';

const DEFAULT_BASE = 'https://chari-neko-dev.netlify.app/.netlify/functions';

export class ProductionActionTagSource {
  constructor({ store, baseUrl = DEFAULT_BASE, fetchImpl = fetch, maxPerRun = 5, timeoutMs = 30000, maxHeapBytes = 192 * 1024 * 1024, maxRetries = 1 } = {}) {
    Object.assign(this, { store, baseUrl: baseUrl.replace(/\/$/, ''), fetchImpl, maxPerRun, timeoutMs, maxHeapBytes, maxRetries });
    this.metrics = { mode:'READ_ONLY_PRODUCTION_SOURCE_LOCAL_RESEARCH_SINK', attempted:0, accepted:0, duplicates:0, excluded:0, failures:0, retryAttempts:0, retryableFailures:0, permanentFailures:0, unavailable:0, stale:0, http502:0, http503:0, timeouts:0, predictionHashMismatch:0, purchaseHashMismatch:0, sealedResultMismatch:0, peakHeapBytes:0, fetchLatencyMs:0, storageLatencyMs:0, lastError:null, startedAt:null, completedAt:null };
  }
  async run() {
    this.metrics.startedAt = new Date().toISOString();
    const status = await this.get('keirin-collector-status');
    if (status.statusReadFailed || status.autoCurrent === false || status.proxyCacheStatus === 'PARTIAL_STALE') this.metrics.stale++;
    const candidates=[];for(const row of status.races || []){const collected=Boolean(await this.store.getRace(row.raceKey));if(isActionTagCollectionEligible(row,{collected,enrollment:this.store.enrollment}))candidates.push(row);else if(collected)this.metrics.duplicates++;else this.metrics.excluded++;}candidates.sort((a,b) => Date.parse(a.resultObservedAt)-Date.parse(b.resultObservedAt));
    for (const row of candidates) {
      if (this.metrics.accepted >= this.maxPerRun) break;
      const heap = process.memoryUsage().heapUsed; this.metrics.peakHeapBytes = Math.max(this.metrics.peakHeapBytes, heap);
      if (heap > this.maxHeapBytes) { this.metrics.lastError='HEAP_GUARD'; break; }
      this.metrics.attempted++;
      try {
        const beforePrediction = await this.get(`keirin-saved-prediction-detail?raceKey=${encodeURIComponent(row.raceKey)}`);
        const beforeResult = await this.get(`keirin-sealed-result?raceKey=${encodeURIComponent(row.raceKey)}`);
        const record = composeRecord(row, beforePrediction, beforeResult);
        if (record.result.status !== 'confirmed') { this.metrics.excluded++; await yieldTurn(); continue; }
        const meta = { raceKey:row.raceKey, collectedAt:new Date().toISOString(), resultObservedAt:row.resultObservedAt, membershipSource:'PRODUCTION_LIVE_STATUS_V1', forwardOnly:true, statusSchemaVersion:status.schemaVersion, historical:false, backfill:false };
        const storageStarted=performance.now();if (await this.store.ingest(meta, record)) this.metrics.accepted++; else this.metrics.duplicates++;this.metrics.storageLatencyMs+=performance.now()-storageStarted;
        const afterPrediction = await this.get(`keirin-saved-prediction-detail?raceKey=${encodeURIComponent(row.raceKey)}`);
        const afterResult = await this.get(`keirin-sealed-result?raceKey=${encodeURIComponent(row.raceKey)}`);
        if (beforePrediction.predictionHash !== afterPrediction.predictionHash) this.metrics.predictionHashMismatch++;
        if (purchaseHash(beforeResult) !== purchaseHash(afterResult)) this.metrics.purchaseHashMismatch++;
        if (beforeResult.resultHash !== afterResult.resultHash) this.metrics.sealedResultMismatch++;
      } catch (error) { this.metrics.failures++; this.metrics.lastError=String(error?.message || error); if(/HTTP_(502|503)|timeout|abort/i.test(this.metrics.lastError))this.metrics.retryableFailures++;else if(/HTTP_404|INVALID|MEMBERSHIP/i.test(this.metrics.lastError))this.metrics.permanentFailures++;else this.metrics.unavailable++; }
      await yieldTurn();
    }
    this.metrics.completedAt = new Date().toISOString();
    return { ...this.metrics, statusHealth: health(status), productionWrite:0, historicalMutation:0 };
  }
  async get(path) {
    let response,error;const started=performance.now();for(let attempt=0;attempt<=this.maxRetries;attempt++){try{response=await this.fetchImpl(`${this.baseUrl}/${path}`, { headers:{accept:'application/json'}, signal:AbortSignal.timeout(this.timeoutMs) });error=null;}catch(caught){error=caught;if(/timeout|abort/i.test(String(caught)))this.metrics.timeouts++;}if(response?.ok||![502,503].includes(response?.status)&&!error)break;if(attempt<this.maxRetries)this.metrics.retryAttempts++;}this.metrics.fetchLatencyMs+=performance.now()-started;if(error)throw error;
    if (response.status === 502) this.metrics.http502++; if (response.status === 503) this.metrics.http503++;
    if (!response.ok) throw Error(`HTTP_${response.status}:${path}`);
    return response.json();
  }
}

export function isActionTagCollectionEligible(race,{collected=false,enrollment}={}){
  if(collected||!/^\d{8}-[A-Za-z0-9]+-\d{1,2}$/.test(String(race?.raceKey||''))||race?.resultLifecycleState!=='RESULT_CONFIRMED'||!race?.predictionSealedAt||isFinalTest(race))return false;
  const observed=Date.parse(race.resultObservedAt),started=Date.parse(enrollment?.startedAt);if(!Number.isFinite(observed)||!Number.isFinite(started)||observed<started)return false;
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(started)).replaceAll('-','');return race.raceKey.slice(0,8)>day;
}

export function composeRecord(status, prediction, sealedResult) {
  const payload = prediction.predictionPayload || {}, race = payload.race || {}, official = sealedResult.officialResult || {};
  const participants = (race.participants || payload.participants || []).map(participant => {
    const profile = participant.officialProfileEvidence || {};
    return { ...participant, recent_4_months: participant.recent_4_months || {
      starts: profile.officialTotalStarts ?? participant.officialTotalStarts,
      back: profile.backCount ?? participant.backCount,
      home: profile.homeCount ?? participant.homeCount,
      escape: profile.winningStyleRates?.escape,
      mark: profile.winningStyleRates?.mark
    }, winning_method_share_among_top2: participant.winning_method_share_among_top2 || (profile.winningStyleRates ? {
      denominator_top2: 100, escape: profile.winningStyleRates.escape, makuri: profile.winningStyleRates.makuri,
      difference: profile.winningStyleRates.difference, mark: profile.winningStyleRates.mark
    } : undefined) };
  });
  const lines = participants.filter(p => p.lineId != null).map(p => ({ number:Number(p.number), lineId:String(p.lineId), position:Number(p.lineOrder) || null }));
  return { raceKey:status.raceKey, venueName:status.venueName || race.venueName, raceNo:status.raceNumber, scheduledStartAt:status.scheduledStartTime,
    predictionSealedAt:prediction.predictionSealedAt, resultObservedAt:sealedResult.resultObservedAt, participants, lines,
    result:{ status: official.status === 'confirmed' ? 'confirmed' : official.status, finishOrder:official.finishOrder },
    officialEvidence:{ source:official.source, observedAt:sealedResult.resultObservedAt, finishOrder:official.finishOrder, winningMethod:official.winningMethod, markers:official.markers },
    sourceIntegrity:{ predictionHash:prediction.predictionHash, inputHash:prediction.inputHash, resultHash:sealedResult.resultHash, immutable:prediction.immutable === true && sealedResult.immutable === true } };
}

function purchaseHash(result) { return hashEvidence(JSON.stringify(result.purchaseEvaluation ?? null)); }
function health(status) { return { collectorProcessHealthy:status.collectorProcessHealthy, storageHealthy:status.storageHealthy, browserConnected:status.browserConnected, failureCount:status.failureCount, lastError:status.lastError, checkedAt:status.checkedAt }; }
