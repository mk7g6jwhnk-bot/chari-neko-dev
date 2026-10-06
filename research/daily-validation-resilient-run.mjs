import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {fetchDailySource,selectUnprocessed,detectMilestones,reportMd,csvRows} from './daily-validation-run.mjs';
import {evaluateDailySourceWithMilestone500 as evaluateDailySource} from './daily-validation-core.mjs';
import {mergeStructureSummaries} from './daily-validation-structure.mjs';
import {mergeTerminalSurvivalSummaries} from './terminal-survival-audit.mjs';
import {mergeExactTerminalDistanceSummaries} from './exact-terminal-distance.mjs';
import {mergeShadowExperiment} from './shadow-confirmation-lab.mjs';
import {pushPublicValidationStatus,writePublicValidationStatus} from './validation-status-public.mjs';
import {buildPostDeployReview} from './post-deploy-rider-weak.mjs';
import {openDailyRunManifest,isTransientFailure,completionStatus} from './daily-pipeline-run.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const dataRoot=path.join(root,'daily-validation'),raceRoot=path.join(root,'action-tag-live-data','races');
const jstDate=date=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
const previousDate=value=>{const date=new Date(`${value}T00:00:00Z`);date.setUTCDate(date.getUTCDate()-1);return date.toISOString().slice(0,10)};
const readJson=async file=>JSON.parse(await fs.readFile(file,'utf8'));
async function atomicJson(file,value){await fs.mkdir(path.dirname(file),{recursive:true});const tmp=`${file}.${crypto.randomUUID()}.tmp`,handle=await fs.open(tmp,'w');try{await handle.writeFile(`${JSON.stringify(value,null,2)}\n`);await handle.sync()}finally{await handle.close()}await fs.rename(tmp,file)}

async function localEvents(){
  let names=[];try{names=(await fs.readdir(raceRoot)).filter(name=>name.endsWith('.json'))}catch(error){if(error.code!=='ENOENT')throw error}
  const values=[];for(const name of names)values.push(await readJson(path.join(raceRoot,name)));return values;
}

async function initialCheckpoint(now){
  for(const name of ['recommendation-thick-150r-cohort.json','recommendation-thick-100r-cohort.json','recommendation-thick-50r-cohort.json'])try{
    const cohort=await readJson(path.join(root,name));
    return{schemaVersion:'DAILY_VALIDATION_CHECKPOINT_V1',lastSuccessfulTimestamp:now.toISOString(),processedRaceKeys:[...cohort.raceKeys],lastTargetDate:cohort.raceKeys.at(-1)?.slice(0,8).replace(/(\d{4})(\d{2})(\d{2})/,'$1-$2-$3')||null,scriptVersion:'DAILY_PIPELINE_RECOVERY_V1',executionId:`INITIAL-${crypto.randomUUID()}`,status:'SUCCESS',initialCheckpointSource:name,cumulativeBaseline:{basic:null,predictionDistance:'prediction-distance-100r-evaluation.json',trio:'trio-diagnostic-100r-evaluation.json',riderMarks:'STARTS_WITH_DAILY_PIPELINE'},dailyRuns:0};
  }catch{}
  throw Error('INITIAL_CHECKPOINT_SOURCE_NOT_FOUND');
}

async function getCheckpoint(now,directory){const file=path.join(directory,'checkpoint.json');try{return await readJson(file)}catch(error){if(error.code!=='ENOENT')throw error;const value=await initialCheckpoint(now);await atomicJson(file,value);return value}}

function emptyDaily(){return{status:'DAILY_VALIDATION_OK',basic:{collected:0,evaluable:0,excluded:0,purchaseable:0,ineligible:0,all:{tickets:0,hits:0,investment:0,return:0,roi:null},main:{tickets:0,hits:0,investment:0,return:0,roi:null},cover:{tickets:0,hits:0,investment:0,return:0,roi:null},thick:{tickets:0,hits:0,investment:0,return:0,roi:null}},distance:{status:'NO_NEW_RACES',races:[],terminalSurvival:{schemaVersion:'TERMINAL_SURVIVAL_AUDIT_V1',summary:mergeTerminalSurvivalSummaries(),races:[]}},exactTerminalDistance:{schemaVersion:'EXACT_TERMINAL_DISTANCE_V1',summary:mergeExactTerminalDistanceSummaries(),races:[]},terminalTrace:{schemaVersion:'TERMINAL_TRACE_DAILY_V1',summary:{traceAuditStatus:'TRACE_AUDIT_OK'},details:[],audit:{summary:{},failures:[]}},trio:{status:'NO_NEW_RACES',payout:{status:'DATA_NOT_AVAILABLE',roi:null}},riderMarks:{details:[],summary:{races:0,unknown:0}},shadowLab:{schemaVersion:'SHADOW_PARAMETER_LAB_V1',cohorts:{evaluatedRaces:0,protectedFinalUsed:0},results:[],safety:{productionHashMismatch:0,resultUsedForShadowGeneration:false,historicalMutation:0}},structure:{schemaVersion:'DAILY_STRUCTURE_OBSERVATION_V1',races:[],summary:{available:0,unknown:0,girls:0,byFieldSize:[],byLineCount:[],bySoloCount:[],byLineSizePattern:[]}},integrity:{issues:[],predictionMismatch:0,purchaseMismatch:0,sealedResultMismatch:0,temporalViolation:0,resultAwareLeakage:0,historicalMutation:0,productionWrite:0},monitoring:{noNewConfirmedRaces:true,automaticAdjustment:false},safety:{productionPredictionChanged:false,productionPurchaseChanged:false,tuningPerformed:false}}}

function mergeSource(base,next){
  if(!base)return next;
  const byKey=new Map(base.rows.map(row=>[row.raceKey,row]));for(const row of next.rows||[])byKey.set(row.raceKey,row);
  const diagnostics=new Map((base.validationDiagnostics||[]).map(row=>[row.raceKey,row]));for(const row of next.validationDiagnostics||[])diagnostics.set(row.raceKey,row);
  return{...base,rows:[...byKey.values()],validationDiagnostics:[...diagnostics.values()],exclusions:next.exclusions||[],hashes:{predictionMismatch:(base.hashes?.predictionMismatch||0)+(next.hashes?.predictionMismatch||0),purchaseMismatch:(base.hashes?.purchaseMismatch||0)+(next.hashes?.purchaseMismatch||0),sealedResultMismatch:(base.hashes?.sealedResultMismatch||0)+(next.hashes?.sealedResultMismatch||0)},sourceFetch:{mode:'RECOVERABLE_INCREMENTAL',attempts:(base.sourceFetch?.attempts||1)+1,bytes:(base.sourceFetch?.bytes||0)+(next.sourceFetch?.bytes||0),materializedFullResponse:false},safety:base.safety};
}

async function fetchWithIsolation(cohort,fetchSource,{maxRetries=2,baseDelayMs=600000,sleep}={}){
  let aggregate=null,pending=[...cohort.raceKeys],quarantined=[],retryCount=0;
  while(pending.length){
    const partial=await fetchSource({cohort:{...cohort,raceKeys:pending}}),retry=[];
    aggregate=mergeSource(aggregate,partial);
    for(const exclusion of partial.exclusions||[])(isTransientFailure(exclusion)&&retryCount<maxRetries?retry:quarantined).push(exclusion);
    if(!retry.length)break;
    const delayMs=baseDelayMs*(2**retryCount++);if(sleep)await sleep(delayMs);else await new Promise(resolve=>setTimeout(resolve,delayMs));pending=retry.map(item=>item.raceKey);
  }
  const acceptedKeys=new Set((aggregate?.rows||[]).map(row=>row.raceKey));
  quarantined=quarantined.filter(item=>!acceptedKeys.has(item.raceKey));
  return{source:{...aggregate,cohort:{...cohort,raceKeys:cohort.raceKeys.filter(key=>acceptedKeys.has(key))},requestedCohort:cohort,exclusions:[]},quarantined,retryCount};
}

async function writeOutputs(directory,summary,log){
  await fs.mkdir(directory,{recursive:true});
  const trace=summary.daily.terminalTrace||{};
  await Promise.all([
    atomicJson(path.join(directory,'summary.json'),summary),fs.writeFile(path.join(directory,'report.md'),reportMd(summary)),fs.writeFile(path.join(directory,'races.csv'),csvRows(summary.daily)),
    atomicJson(path.join(directory,'prediction-distance.json'),summary.daily.distance),atomicJson(path.join(directory,'exact-terminal-distance.json'),summary.daily.exactTerminalDistance),atomicJson(path.join(directory,'mark-hybrid-forward-results.json'),summary.daily.markHybridForward||{schemaVersion:'MARK_HYBRID_FORWARD_DAILY_V1',records:[],summary:{evaluatedRaces:0}}),atomicJson(path.join(directory,'terminal-trace-diagnosis.json'),trace),
    atomicJson(path.join(directory,'terminal-trace-anomalies.json'),{schemaVersion:trace.audit?.schemaVersion||'TERMINAL_TRACE_QUALITY_AUDIT_V1',generatedAt:summary.completedAt,summary:trace.audit?.summary||{},failures:trace.audit?.failures||[]}),
    atomicJson(path.join(directory,'terminal-survival.json'),summary.daily.distance?.terminalSurvival||{schemaVersion:'TERMINAL_SURVIVAL_AUDIT_V1',summary:mergeTerminalSurvivalSummaries(),races:[]}),atomicJson(path.join(directory,'trio.json'),summary.daily.trio),atomicJson(path.join(directory,'rider-marks.json'),summary.daily.riderMarks),atomicJson(path.join(directory,'shadow-parameter-lab.json'),summary.daily.shadowLab),atomicJson(path.join(directory,'rider-weak-post-deploy.json'),summary.riderWeakPostDeploy||buildPostDeployReview([])),atomicJson(path.join(directory,'structure.json'),summary.daily.structure),atomicJson(path.join(directory,'integrity.json'),summary.daily.integrity),fs.writeFile(path.join(directory,'execution.log'),log)
  ]);
}

export async function runDailyValidationResilient({now=new Date(),directory=dataRoot,dryRun=false,fetchSource=fetchDailySource,events=null,cohortDateJst=null,syncStatus=false,syncImpl=pushPublicValidationStatus,maxSourceRetries=2,sourceRetryBaseMs=600000,sleep=null,failStage=null}={}){
  const targetDate=jstDate(now),targetCohortDate=cohortDateJst||previousDate(targetDate),lock=path.join(directory,'daily-validation.lock');await fs.mkdir(directory,{recursive:true});
  let lockHandle;try{lockHandle=await fs.open(lock,'wx');await lockHandle.writeFile(JSON.stringify({pid:process.pid,startedAt:now.toISOString()}))}catch(error){if(error.code==='EEXIST')return{status:'SKIPPED_OVERLAP',targetDate};throw error}
  const run=await openDailyRunManifest({directory,targetDate,now}),started=Date.now();run.manifest.targetRaceDateJst=targetCohortDate;await run.save();
  try{
    await run.stage('SCHEDULER',{status:'STARTED'});
    const checkpoint=await getCheckpoint(now,directory);
    if(!dryRun&&checkpoint.lastTargetDate===targetDate){await run.finish('COMPLETE');return{status:'ALREADY_VALIDATED',executionId:run.manifest.runId,targetDate,newRaces:0,pipelineRun:run.manifest}}
    const loadedEvents=events||await localEvents(),all=events?loadedEvents:loadedEvents.filter(item=>item.raceKey?.startsWith(targetCohortDate.replaceAll('-',''))),pending=selectUnprocessed(all,checkpoint),requestedCohort={schemaVersion:'DAILY_VALIDATION_COHORT_V1',raceKeys:pending.map(item=>item.raceKey),protectedFinalIncluded:0,targetRaceDateJst:targetCohortDate};
    run.manifest.totalRaces=requestedCohort.raceKeys.length;await run.save();
    let source=null,quarantined=run.manifest.quarantinedRaces||[];
    const sourceFile=run.artifactFile('source.json'),evaluationFile=run.artifactFile('evaluation.json');
    if(run.manifest.stageResults.RESULT_FETCH?.status==='COMPLETE')try{source=await readJson(sourceFile)}catch{}
    if(!source&&requestedCohort.raceKeys.length){
      const fetched=await fetchWithIsolation(requestedCohort,fetchSource,{maxRetries:maxSourceRetries,baseDelayMs:sourceRetryBaseMs,sleep});source=fetched.source;quarantined=fetched.quarantined;run.manifest.retryCount=(run.manifest.retryCount||0)+fetched.retryCount;run.manifest.quarantinedRaces=quarantined;run.manifest.resultFetchCount=source.rows.length;await atomicJson(sourceFile,source);await run.stage('RESULT_FETCH',{status:'COMPLETE',requested:requestedCohort.raceKeys.length,saved:source.rows.length,quarantined:quarantined.length,retries:fetched.retryCount,artifact:path.relative(directory,sourceFile)});
    }else if(!requestedCohort.raceKeys.length){source={cohort:requestedCohort,rows:[],exclusions:[],hashes:{predictionMismatch:0,purchaseMismatch:0,sealedResultMismatch:0},validationDiagnostics:[]};await run.stage('RESULT_FETCH',{status:'COMPLETE',requested:0,saved:0,quarantined:0})}
    if(failStage==='RESULT_FETCH')throw Error('INJECTED_RESULT_FETCH_FAILURE');
    let daily=null;
    if(run.manifest.stageResults.RESULT_EVALUATION?.status==='COMPLETE')try{daily=await readJson(evaluationFile)}catch{}
    if(!daily){daily=source.rows.length?evaluateDailySource(source,{config:await readJson(path.join(root,'daily-validation.config.json')),previous:checkpoint.lastDaily,shadowConfig:await readJson(path.join(root,'shadow-confirmation.config.json')).catch(()=>null)}):emptyDaily();await atomicJson(evaluationFile,daily);run.manifest.evaluationCount=source.rows.length;await run.stage('RESULT_EVALUATION',{status:'COMPLETE',evaluated:source.rows.length,quarantined:quarantined.length,artifact:path.relative(directory,evaluationFile)})}
    if(failStage==='RESULT_EVALUATION')throw Error('INJECTED_RESULT_EVALUATION_FAILURE');
    run.manifest.performanceCount=daily.basic?.evaluable??source.rows.length;await run.stage('PURCHASE_PERFORMANCE',{status:'COMPLETE',aggregated:run.manifest.performanceCount,idempotencyKey:`${targetDate}:${run.manifest.runId}`});
    if(failStage==='PURCHASE_PERFORMANCE')throw Error('TEMPORARY_PURCHASE_PERFORMANCE_FAILURE');
    const validKeys=source.rows.map(row=>row.raceKey),shadowSeed=checkpoint.shadowConfirmationCumulative||await readJson(path.join(root,'shadow-confirmation-state.json')).catch(()=>null),shadowConfirmationCumulative=daily.shadowLab?.schemaVersion==='SHADOW_CONFIRMATION_FROM_234_V1'?mergeShadowExperiment(shadowSeed,daily.shadowLab):shadowSeed;if(shadowConfirmationCumulative)daily.shadowLab=shadowConfirmationCumulative;
    const total=checkpoint.processedRaceKeys.length+validKeys.length,structureCumulative=mergeStructureSummaries(checkpoint.structureCumulative,daily.structure?.summary);
    let survivalBaseline=checkpoint.terminalSurvivalCumulative;if(!survivalBaseline)try{const backfill=await readJson(path.join(root,'terminal-survival-backfill-v2.json'));if(backfill.summary?.races===checkpoint.processedRaceKeys.length)survivalBaseline=backfill.summary}catch{}if(!survivalBaseline)survivalBaseline={races:checkpoint.processedRaceKeys.length,reconstructed:0,unreconstructable:checkpoint.processedRaceKeys.length};
    const terminalSurvivalCumulative=mergeTerminalSurvivalSummaries(survivalBaseline,daily.distance?.terminalSurvival?.summary),exactTerminalDistanceCumulative=mergeExactTerminalDistanceSummaries(checkpoint.exactTerminalDistanceCumulative,daily.exactTerminalDistance?.summary),milestoneState=detectMilestones(checkpoint.processedRaceKeys.length,total,await readJson(path.join(root,'daily-validation.config.json'))),milestones=[...milestoneState.observed.map(n=>`OBSERVATION_MILESTONE_${n}`),...milestoneState.adjustment.map(n=>`ADJUSTMENT_REVIEW_MILESTONE_${n}`)];
    const status=completionStatus({quarantined:quarantined.length}),completedAt=new Date().toISOString(),summary={schemaVersion:'DAILY_VALIDATION_SUMMARY_V3',status,executionId:run.manifest.runId,targetDate,targetRaceDateJst:targetCohortDate,startedAt:run.manifest.startedAt,completedAt,targetRaceKeys:validKeys,requestedRaceKeys:requestedCohort.raceKeys,quarantinedRaces:quarantined,daily,cumulative:{processedRaces:total,baseline:checkpoint.cumulativeBaseline,dailyRuns:checkpoint.dailyRuns+(dryRun?0:1),structure:structureCumulative,terminalSurvival:terminalSurvivalCumulative,exactTerminalDistance:exactTerminalDistanceCumulative,shadowConfirmation:shadowConfirmationCumulative},milestones,milestoneState,checkpoint:{lastTargetDate:checkpoint.lastTargetDate,lastSuccessfulTimestamp:checkpoint.lastSuccessfulTimestamp,processedRaceCount:checkpoint.processedRaceKeys.length},scheduler:{status:'READY',schedule:'06:30 JST',startWhenAvailable:true,multipleInstances:'IgnoreNew'},reportPath:`research/daily-validation/${dryRun?'sample-dry-run':targetDate}/report.md`,dryRun};
    if(failStage==='DAILY_AGGREGATION')throw Error('TEMPORARY_DAILY_AGGREGATION_FAILURE');
    const output=dryRun?path.join(directory,'sample-dry-run'):path.join(directory,targetDate);await writeOutputs(output,summary,`status=${status}\nexitCode=0\ndurationMs=${Date.now()-started}\nnewRaces=${validKeys.length}\nquarantined=${quarantined.length}\n`);await run.stage('DAILY_AGGREGATION',{status:'COMPLETE',output:path.relative(directory,output),valid:validKeys.length,quarantined:quarantined.length});
    if(!dryRun){
      const processed=[...new Set([...(checkpoint.processedRaceKeys||[]),...validKeys])],next={...checkpoint,lastSuccessfulTimestamp:completedAt,processedRaceKeys:processed,lastTargetDate:quarantined.length?checkpoint.lastTargetDate:targetDate,lastPartialTargetDate:quarantined.length?targetDate:null,scriptVersion:'DAILY_PIPELINE_RECOVERY_V1',executionId:run.manifest.runId,status,quarantinedRaces:quarantined,dailyRuns:checkpoint.dailyRuns+1,lastDaily:daily,structureCumulative,terminalSurvivalCumulative,exactTerminalDistanceCumulative,shadowConfirmationCumulative};await atomicJson(path.join(directory,'checkpoint.json'),next);
      const publicStatus=await writePublicValidationStatus(summary,path.join(directory,'public','latest.json'),{generatedAt:completedAt});if(syncStatus)try{summary.sync={status:'SYNC_OK',...(await syncImpl(publicStatus))}}catch(error){summary.sync={status:'SYNC_WARNING',code:String(error?.code||error?.message||error),attempts:error?.attempts||null};await atomicJson(path.join(directory,'sync-warning.json'),{...summary.sync,at:new Date().toISOString(),statusVersion:publicStatus.statusVersion})}await atomicJson(path.join(output,'summary.json'),summary)
    }
    run.manifest.completedRaces=validKeys.length;await run.finish(status);summary.pipelineRun=run.manifest;return summary;
  }catch(error){
    const retryable=isTransientFailure(error),nextRetryAt=retryable?new Date(Date.now()+600000).toISOString():null;await run.fail(error,{retryable,nextRetryAt});const failed={status:retryable?'RETRYING':'FAILED_NEEDS_ATTENTION',executionId:run.manifest.runId,targetDate,error:String(error?.message||error),pipelineRun:run.manifest};await atomicJson(path.join(directory,`failed-${run.manifest.runId}.json`),failed);return failed;
  }finally{await lockHandle?.close();await fs.unlink(lock).catch(()=>{})}
}
