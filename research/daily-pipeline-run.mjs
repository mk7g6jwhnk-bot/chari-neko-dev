import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const STAGES=['SCHEDULER','RESULT_FETCH','RESULT_EVALUATION','PURCHASE_PERFORMANCE','DAILY_AGGREGATION','COMPLETED'];
const transientPattern=/(HTTP_5\d\d|TIMEOUT|TIMED OUT|ECONN|ENET|EAI_AGAIN|BROWSER_LAUNCH_DEFERRED_MEMORY_PRESSURE|MEMORY_PRESSURE|TEMPORARY|TRANSIENT|STORAGE_READ|INCOMPLETE_DAILY_SOURCE|INCOMPLETE_COHORT_STREAM)/i;

async function durableJson(file,value){
  await fs.mkdir(path.dirname(file),{recursive:true});
  const tmp=`${file}.${crypto.randomUUID()}.tmp`,handle=await fs.open(tmp,'w');
  try{await handle.writeFile(`${JSON.stringify(value,null,2)}\n`);await handle.sync()}finally{await handle.close()}
  await fs.rename(tmp,file);
}

export function isTransientFailure(value){return transientPattern.test(String(value?.code||value?.reason||value?.message||value||''))||value?.retryable===true}

export function completionStatus({quarantined=0,pendingRetry=0,fatal=false}={}){
  if(fatal)return'FAILED_NEEDS_ATTENTION';
  if(pendingRetry)return'RETRYING';
  if(quarantined)return'COMPLETE_WITH_QUARANTINE';
  return'COMPLETE';
}

export function japanesePipelineStatus(status){return({COMPLETE:'正常',COMPLETE_WITH_QUARANTINE:'一部保留あり',RETRYING:'自動再試行中',FAILED_NEEDS_ATTENTION:'要対応',RUNNING:'処理中'})[status]||'要対応'}

export async function openDailyRunManifest({directory,targetDate,now=new Date(),runId=null}={}){
  const latestFile=path.join(directory,'runs',targetDate,'latest.json');
  let previous=null;
  try{previous=JSON.parse(await fs.readFile(latestFile,'utf8'))}catch{}
  const resumable=previous&&['RUNNING','RETRYING','FAILED_NEEDS_ATTENTION'].includes(previous.status);
  const id=runId||(resumable?previous.runId:crypto.randomUUID()),file=path.join(directory,'runs',targetDate,`${id}.json`);
  let manifest=resumable?previous:{schemaVersion:'DAILY_PIPELINE_RUN_V1',targetDateJst:targetDate,runId:id,scheduledAt:now.toISOString(),startedAt:now.toISOString(),completedAt:null,currentStage:'SCHEDULER',status:'RUNNING',totalRaces:0,completedRaces:0,quarantinedRaces:[],pendingRetryRaces:[],retryCount:0,stageResults:{},lastErrorCode:null,lastErrorAt:null,nextRetryAt:null,resultFetchCount:0,evaluationCount:0,performanceCount:0,aggregationCompleted:false,version:'DAILY_PIPELINE_RECOVERY_V1'};
  manifest={...manifest,status:'RUNNING',currentStage:manifest.currentStage||'SCHEDULER',resumedFromRun:resumable?manifest.runId:null,updatedAt:now.toISOString()};
  const save=async()=>{manifest.updatedAt=new Date().toISOString();await durableJson(file,manifest);await durableJson(latestFile,manifest)};
  const stage=async(name,result={})=>{
    if(!STAGES.includes(name))throw Error(`INVALID_DAILY_STAGE:${name}`);
    manifest.currentStage=name;
    manifest.stageResults[name]={...(manifest.stageResults[name]||{}),...result,completedAt:new Date().toISOString()};
    await save();
  };
  const fail=async(error,{retryable=isTransientFailure(error),nextRetryAt=null}={})=>{
    manifest.status=retryable?'RETRYING':'FAILED_NEEDS_ATTENTION';
    manifest.lastErrorCode=String(error?.code||error?.message||error);
    manifest.lastErrorAt=new Date().toISOString();
    manifest.nextRetryAt=nextRetryAt;
    await save();
  };
  const finish=async(status)=>{manifest.status=status;manifest.currentStage='COMPLETED';manifest.completedAt=new Date().toISOString();manifest.aggregationCompleted=true;manifest.stageResults.COMPLETED={status,completedAt:manifest.completedAt};await save()};
  await save();
  return{manifest,file,latestFile,save,stage,fail,finish,artifactFile:name=>path.join(directory,'runs',targetDate,id,name)};
}

export async function retryWithBackoff(operation,{maxRetries=2,baseDelayMs=600000,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),onRetry=async()=>{}}={}){
  let last;
  for(let attempt=0;attempt<=maxRetries;attempt++)try{return await operation(attempt)}catch(error){last=error;if(attempt>=maxRetries||!isTransientFailure(error))throw error;const delayMs=baseDelayMs*(2**attempt);await onRetry({attempt:attempt+1,delayMs,error});await sleep(delayMs)}
  throw last;
}

export async function runRecoverableStages({stages,state={},onStage=async()=>{}}={}){
  for(const item of stages){
    if(state[item.name]?.completed){continue}
    try{state[item.name]={completed:true,value:await item.run(),error:null};await onStage(item.name,state[item.name])}
    catch(error){state[item.name]={completed:false,error:String(error?.message||error)};await onStage(item.name,state[item.name]);throw error}
  }
  return state;
}
