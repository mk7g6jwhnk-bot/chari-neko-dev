import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {runDailyValidation} from './daily-validation-run.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const defaultAuditFile=path.join(root,'daily-validation','scheduler-latest.json');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const statusOf=result=>String(result?.status||result?.daily?.status||'DAILY_VALIDATION_FAILED');
const successful=status=>['DAILY_VALIDATION_OK','DAILY_VALIDATION_WARNING','ALREADY_VALIDATED'].includes(status);
async function save(file,value){if(!file)return;await fs.mkdir(path.dirname(file),{recursive:true});const tmp=`${file}.${process.pid}.tmp`;await fs.writeFile(tmp,`${JSON.stringify(value,null,2)}\n`);await fs.rename(tmp,file);}

export async function runScheduledValidation({maxRetries=2,retryIntervalMs=600000,run=runDailyValidation,sleep=wait,now=()=>new Date(),auditFile=defaultAuditFile}={}){
  const attempts=[];
  for(let retry=0;retry<=maxRetries;retry++){
    const startedAt=now().toISOString();let result;
    try{result=await run({syncStatus:true});}catch(error){result={status:'DAILY_VALIDATION_FAILED',error:String(error?.message||error)}}
    const status=statusOf(result),ok=successful(status),entry={attempt:retry+1,retryNumber:retry,startedAt,completedAt:now().toISOString(),status,exitCode:ok?0:1,targetDate:result?.targetDate??null,newRaces:result?.targetRaceKeys?.length??result?.newRaces??null,error:result?.error??null,syncStatus:result?.sync?.status??null};attempts.push(entry);
    const audit={schemaVersion:'DAILY_VALIDATION_SCHEDULER_AUDIT_V1',policy:{retryIntervalMinutes:retryIntervalMs/60000,maxRetries},finalStatus:status,finalExitCode:ok?0:1,retryTriggered:attempts.length>1,retryCount:attempts.length-1,attempts,updatedAt:entry.completedAt};
    if(ok){await save(auditFile,audit);return{...result,schedulerRetry:audit};}
    if(retry<maxRetries){entry.nextRetryAt=new Date(now().getTime()+retryIntervalMs).toISOString();audit.nextRetryAt=entry.nextRetryAt;await save(auditFile,audit);await sleep(retryIntervalMs);}
    else{await save(auditFile,audit);return{...result,schedulerRetry:audit};}
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const result=await runScheduledValidation(),status=statusOf(result),ok=successful(status);console.log(JSON.stringify({status,targetDate:result.targetDate??null,newRaces:result.targetRaceKeys?.length??result.newRaces??null,retryCount:result.schedulerRetry.retryCount,attempts:result.schedulerRetry.attempts.map(x=>({attempt:x.attempt,startedAt:x.startedAt,status:x.status,exitCode:x.exitCode,error:x.error}))},null,2));if(!ok)process.exitCode=1;}
