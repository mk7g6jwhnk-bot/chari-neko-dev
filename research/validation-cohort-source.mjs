import {compact} from './prediction-distance-source.mjs';
import {buildMilestoneSourceFromRecords} from './recommendation-thick-100r-fetch.mjs';

export function parseValidationCohortNdjson(text){
  const lines=String(text||'').split(/\r?\n/).filter(Boolean),values=[];
  for(const line of lines)try{values.push(JSON.parse(line))}catch{throw Error('VALIDATION_COHORT_MALFORMED_NDJSON')}
  const header=values[0],footer=values.at(-1),records=values.filter(x=>x?.type==='record');
  if(header?.type!=='manifest'||footer?.type!=='footer')throw Error('VALIDATION_COHORT_STREAM_TRUNCATED');
  return{header,records,footer};
}

function projectRecord(record){
  const predictionResponse={raceKey:record.raceKey,predictionSealedAt:record.prediction.sealedAt,predictionHash:record.prediction.hash,inputHash:null,integrityStatus:record.integrity.predictionHash?'VALID':'INVALID',predictionPayload:{race:record.prediction.payload.race,prediction:record.prediction.payload.prediction}};
  const resultResponse={raceKey:record.raceKey,resultObservedAt:record.result.observedAt,predictionHash:record.prediction.hash,resultHash:record.result.hash,officialResult:record.result.official,purchaseEvaluation:record.result.purchaseEvaluation,integrityValid:record.integrity.predictionHash};
  const traceResponse=record.trace.available?{trace:record.trace.payload}:null;
  return{
    row:compact(predictionResponse,resultResponse,traceResponse),
    lifecycle:{raceKey:record.raceKey,ratingRace:record.prediction.payload.race,sealed:{predictionSealedAt:record.prediction.sealedAt,researchPrediction:record.prediction.payload.prediction},result:{result:record.result.official},temporalAudit:{passed:Date.parse(record.prediction.sealedAt)<Date.parse(record.result.observedAt)},verification:{mutationDetected:!record.integrity.predictionHash},sourceHashes:{predictionHash:record.prediction.hash,inputHash:null,resultHash:record.result.hash}}
  };
}

async function consumeNdjson(response,onValue){
  if(!response.body||typeof response.body.getReader!=='function'){
    const text=await response.text(),parsed=parseValidationCohortNdjson(text);
    for(const value of parsed.records)await onValue(value);
    return{header:parsed.header,footer:parsed.footer,bytes:Buffer.byteLength(text)};
  }
  const reader=response.body.getReader(),decoder=new TextDecoder();
  let pending='',header=null,footer=null,bytes=0;
  const accept=async line=>{
    if(!line.trim())return;
    let value;try{value=JSON.parse(line)}catch{throw Error('VALIDATION_COHORT_MALFORMED_NDJSON')}
    if(value?.type==='manifest'){
      if(header)throw Error('VALIDATION_COHORT_DUPLICATE_MANIFEST');
      header=value;
    }else if(value?.type==='record')await onValue(value);
    else if(value?.type==='footer')footer=value;
  };
  while(true){
    const{done,value}=await reader.read();
    if(done)break;
    bytes+=value.byteLength;
    pending+=decoder.decode(value,{stream:true});
    let newline;
    while((newline=pending.indexOf('\n'))>=0){const line=pending.slice(0,newline).replace(/\r$/,'');pending=pending.slice(newline+1);await accept(line)}
  }
  pending+=decoder.decode();
  if(pending)await accept(pending.replace(/\r$/,''));
  if(!header||!footer)throw Error('VALIDATION_COHORT_STREAM_TRUNCATED');
  return{header,footer,bytes};
}

function exclusionRows(footer){
  const exclusions=[];
  for(const item of footer?.missing||[])exclusions.push({raceKey:item.raceKey,reason:item.reason||'SOURCE_INPUT_MISSING',retryable:['RACE_NOT_FOUND','RESULT_MISSING'].includes(item.reason)});
  for(const item of footer?.integrityFailures||[])exclusions.push({raceKey:item.raceKey,reason:'HASH_INTEGRITY_FAILURE',integrity:item.integrity||null,retryable:false});
  return exclusions;
}

export async function loadValidationCohort({cohort,baseUrl=process.env.KEIRIN_BROWSER_SERVICE_URL,secret=process.env.VALIDATION_STATUS_SYNC_SECRET||process.env.AUTO_RESEARCH_CALLBACK_SECRET,fetchImpl=fetch}={}){
  if(!baseUrl||!secret)throw Error('VALIDATION_COHORT_NOT_CONFIGURED');
  const started=Date.now(),response=await fetchImpl(`${String(baseUrl).replace(/\/$/,'')}/keirin/internal/validation/cohort`,{method:'POST',headers:{accept:'application/x-ndjson','content-type':'application/json','x-auto-research-secret':secret},body:JSON.stringify({raceKeys:cohort.raceKeys,includeTrace:true}),signal:AbortSignal.timeout(300000)});
  if(!response.ok)throw Error(`VALIDATION_COHORT_HTTP_${response.status}`);
  const projected=new Map();
  const{header,footer,bytes}=await consumeNdjson(response,record=>{
    if(projected.has(record.raceKey))throw Error('VALIDATION_COHORT_IDENTITY_MISMATCH');
    projected.set(record.raceKey,projectRecord(record));
  });
  if(header.expected!==cohort.raceKeys.length||footer.expected!==cohort.raceKeys.length)throw Error('VALIDATION_COHORT_EXPECTED_COUNT_MISMATCH');
  const exclusions=exclusionRows(footer),excludedKeys=new Set(exclusions.map(x=>x.raceKey));
  const keys=[...projected.keys()];
  if(keys.some(key=>!cohort.raceKeys.includes(key)))throw Error('VALIDATION_COHORT_IDENTITY_MISMATCH');
  for(const key of cohort.raceKeys)if(!projected.has(key)&&!excludedKeys.has(key))exclusions.push({raceKey:key,reason:'VALIDATION_COHORT_STREAM_MISSING',retryable:true});
  const accepted=cohort.raceKeys.filter(key=>projected.has(key)&&!excludedKeys.has(key)),rows=accepted.map(key=>projected.get(key).row),lifecycle=accepted.map(key=>projected.get(key).lifecycle);
  const hashes={predictionMismatch:exclusions.filter(x=>x.integrity?.predictionHash===false).length,purchaseMismatch:exclusions.filter(x=>x.integrity?.purchaseHash===false).length,sealedResultMismatch:exclusions.filter(x=>x.integrity?.resultHash===false).length};
  const acceptedCohort={...cohort,raceKeys:accepted},milestone=buildMilestoneSourceFromRecords({cohort:acceptedCohort,records:lifecycle,hashes});
  return{schemaVersion:'VALIDATION_COHORT_SOURCE_V2',cohort:acceptedCohort,requestedCohort:cohort,rows,exclusions,hashes,safety:{readOnly:true,historicalMutation:0,protectedFinalUsed:0,resultLeakage:0},validationDiagnostics:milestone.ticketDiagnostics,sourceFetch:{mode:'RAILWAY_COHORT_NDJSON_INCREMENTAL',requests:1,bytes,durationMs:Date.now()-started,footer,materializedFullResponse:false}};
}
