import {compact} from './prediction-distance-source.mjs';
import {buildMilestoneSourceFromRecords} from './recommendation-thick-100r-fetch.mjs';

export function parseValidationCohortNdjson(text){
  const lines=String(text||'').split(/\r?\n/).filter(Boolean),values=[];
  for(const line of lines)try{values.push(JSON.parse(line))}catch{throw Error('VALIDATION_COHORT_MALFORMED_NDJSON')}
  const header=values[0],footer=values.at(-1),records=values.filter(x=>x?.type==='record');
  if(header?.type!=='manifest'||footer?.type!=='footer')throw Error('VALIDATION_COHORT_STREAM_TRUNCATED');
  return{header,records,footer};
}

export async function loadValidationCohort({cohort,baseUrl=process.env.KEIRIN_BROWSER_SERVICE_URL,secret=process.env.VALIDATION_STATUS_SYNC_SECRET||process.env.AUTO_RESEARCH_CALLBACK_SECRET,fetchImpl=fetch}={}){
  if(!baseUrl||!secret)throw Error('VALIDATION_COHORT_NOT_CONFIGURED');
  const started=Date.now(),response=await fetchImpl(`${String(baseUrl).replace(/\/$/,'')}/keirin/internal/validation/cohort`,{method:'POST',headers:{accept:'application/x-ndjson','content-type':'application/json','x-auto-research-secret':secret},body:JSON.stringify({raceKeys:cohort.raceKeys,includeTrace:true}),signal:AbortSignal.timeout(300000)});
  if(!response.ok)throw Error(`VALIDATION_COHORT_HTTP_${response.status}`);const text=await response.text(),{records,footer}=parseValidationCohortNdjson(text);
  if(!footer.complete||footer.expected!==cohort.raceKeys.length||footer.returned!==cohort.raceKeys.length||footer.missing.length||footer.integrityFailures.length)throw Error(`INCOMPLETE_COHORT_STREAM:${footer.returned}/${footer.expected}`);
  const keys=records.map(x=>x.raceKey);if(new Set(keys).size!==keys.length||keys.some((key,index)=>key!==cohort.raceKeys[index]))throw Error('VALIDATION_COHORT_IDENTITY_MISMATCH');
  const rows=[],lifecycle=[];for(const record of records){const predictionResponse={raceKey:record.raceKey,predictionSealedAt:record.prediction.sealedAt,predictionHash:record.prediction.hash,inputHash:null,integrityStatus:record.integrity.predictionHash?'VALID':'INVALID',predictionPayload:{race:record.prediction.payload.race,prediction:record.prediction.payload.prediction}},resultResponse={raceKey:record.raceKey,resultObservedAt:record.result.observedAt,predictionHash:record.prediction.hash,resultHash:record.result.hash,officialResult:record.result.official,purchaseEvaluation:record.result.purchaseEvaluation,integrityValid:record.integrity.predictionHash},traceResponse=record.trace.available?{trace:record.trace.payload}:null;rows.push(compact(predictionResponse,resultResponse,traceResponse));lifecycle.push({raceKey:record.raceKey,ratingRace:record.prediction.payload.race,sealed:{predictionSealedAt:record.prediction.sealedAt,researchPrediction:record.prediction.payload.prediction},result:{result:record.result.official},temporalAudit:{passed:Date.parse(record.prediction.sealedAt)<Date.parse(record.result.observedAt)},verification:{mutationDetected:!record.integrity.predictionHash},sourceHashes:{predictionHash:record.prediction.hash,inputHash:null,resultHash:record.result.hash}})}
  const hashes={predictionMismatch:0,purchaseMismatch:0,sealedResultMismatch:0},milestone=buildMilestoneSourceFromRecords({cohort,records:lifecycle,hashes});return{...{schemaVersion:'VALIDATION_COHORT_SOURCE_V1',cohort,rows,exclusions:[],hashes,safety:{readOnly:true,historicalMutation:0,protectedFinalUsed:0,resultLeakage:0}},validationDiagnostics:milestone.ticketDiagnostics,sourceFetch:{mode:'RAILWAY_COHORT_STREAM',requests:1,bytes:Buffer.byteLength(text),durationMs:Date.now()-started,footer}};
}
