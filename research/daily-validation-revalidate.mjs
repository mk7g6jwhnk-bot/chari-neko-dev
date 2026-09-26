import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {fetchDailySource,detectMilestones,csvRows,reportMd} from './daily-validation-run.mjs';
import {evaluateDailySource} from './daily-validation-core.mjs';
import {mergeStructureSummaries} from './daily-validation-structure.mjs';
import {mergeTerminalSurvivalSummaries} from './terminal-survival-audit.mjs';
import {mergeExactTerminalDistanceSummaries} from './exact-terminal-distance.mjs';
import {buildPublicValidationStatus,pushPublicValidationStatus} from './validation-status-public.mjs';

const root=path.dirname(fileURLToPath(import.meta.url)),dataRoot=path.join(root,'daily-validation');
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
async function atomic(file,value){await fs.mkdir(path.dirname(file),{recursive:true});const tmp=`${file}.${crypto.randomUUID()}.tmp`;await fs.writeFile(tmp,`${JSON.stringify(value,null,2)}\n`);await fs.rename(tmp,file)}
async function writeArtifacts(dir,summary){await fs.mkdir(dir,{recursive:true});const daily=summary.daily;await Promise.all([
  atomic(path.join(dir,'summary.json'),summary),atomic(path.join(dir,'prediction-distance.json'),daily.distance),
  atomic(path.join(dir,'exact-terminal-distance.json'),daily.exactTerminalDistance),atomic(path.join(dir,'terminal-survival.json'),daily.distance.terminalSurvival),
  atomic(path.join(dir,'terminal-trace-diagnosis.json'),daily.terminalTrace),atomic(path.join(dir,'terminal-trace-anomalies.json'),daily.terminalTrace.audit),
  atomic(path.join(dir,'trio.json'),daily.trio),atomic(path.join(dir,'rider-marks.json'),daily.riderMarks),
  atomic(path.join(dir,'shadow-parameter-lab.json'),daily.shadowLab),atomic(path.join(dir,'structure.json'),daily.structure),atomic(path.join(dir,'integrity.json'),daily.integrity),
  fs.writeFile(path.join(dir,'report.md'),reportMd(summary)),fs.writeFile(path.join(dir,'races.csv'),csvRows(daily)),
  fs.writeFile(path.join(dir,'execution.log'),`status=${daily.status}\nexitCode=0\nrevalidation=true\nreplacedRaces=${summary.targetRaceKeys.length}\n`)
])}

export async function revalidateInvalidCohort({incidentDate='2026-09-26',baselineDate='2026-09-25',dryRun=true,sync=false,directory=dataRoot}={}){
  const lock=path.join(directory,'daily-validation.lock');await fs.mkdir(directory,{recursive:true});let handle;
  try{handle=await fs.open(lock,'wx');await handle.writeFile(JSON.stringify({pid:process.pid,startedAt:new Date().toISOString(),mode:'REVALIDATION'}));}catch(error){if(error.code==='EEXIST')throw Error('REVALIDATION_OVERLAP');throw error;}
  try{
  const checkpointFile=path.join(directory,'checkpoint.json'),checkpoint=await read(checkpointFile),incident=await read(path.join(directory,incidentDate,'summary.json')),baseline=await read(path.join(directory,baselineDate,'summary.json')),config=await read(path.join(root,'daily-validation.config.json')),shadowConfig=await read(path.join(root,'shadow-confirmation.config.json')).catch(()=>null),raceKeys=incident.targetRaceKeys||[],total=checkpoint.processedRaceKeys.length;
  if(!raceKeys.length||new Set(raceKeys).size!==raceKeys.length)throw Error('REVALIDATION_COHORT_INVALID');
  if(!raceKeys.every(key=>checkpoint.processedRaceKeys.includes(key)))throw Error('REVALIDATION_KEYS_NOT_CHECKPOINTED');
  if(Number(baseline.cumulative?.processedRaces)+raceKeys.length!==total)throw Error(`REVALIDATION_BASELINE_MISMATCH:${baseline.cumulative?.processedRaces}+${raceKeys.length}/${total}`);
  const cohort={schemaVersion:'DAILY_VALIDATION_COHORT_V1',raceKeys,protectedFinalIncluded:0},source=await fetchDailySource({cohort});
  if(source.exclusions.length||source.rows.length!==raceKeys.length||source.hashes.predictionMismatch||source.hashes.purchaseMismatch||source.hashes.sealedResultMismatch)throw Error('REVALIDATION_SOURCE_GATE_FAILED');
  const daily=evaluateDailySource(source,{config,previous:baseline.daily,shadowConfig});
  const failedIntegrityIssues=daily.integrity.issues.filter(issue=>issue.severity==='FAILED');
  if(failedIntegrityIssues.length||daily.integrity.predictionMismatch||daily.integrity.purchaseMismatch||daily.integrity.sealedResultMismatch||daily.integrity.resultAwareLeakage||daily.integrity.historicalMutation)throw Error(`REVALIDATION_INTEGRITY_FAILED:${JSON.stringify(failedIntegrityIssues)}`);
  const completedAt=new Date().toISOString(),structureCumulative=mergeStructureSummaries(baseline.cumulative.structure,daily.structure.summary),terminalSurvivalCumulative=mergeTerminalSurvivalSummaries(baseline.cumulative.terminalSurvival,daily.distance.terminalSurvival.summary),exactTerminalDistanceCumulative=mergeExactTerminalDistanceSummaries(baseline.cumulative.exactTerminalDistance,daily.exactTerminalDistance.summary),milestoneState=detectMilestones(total,total,config);
  const summary={schemaVersion:'DAILY_VALIDATION_SUMMARY_V2',executionId:`REVALIDATION-${crypto.randomUUID()}`,targetDate:incidentDate,startedAt:new Date().toISOString(),completedAt,targetRaceKeys:raceKeys,daily,cumulative:{processedRaces:total,baseline:checkpoint.cumulativeBaseline,dailyRuns:checkpoint.dailyRuns,structure:structureCumulative,terminalSurvival:terminalSurvivalCumulative,exactTerminalDistance:exactTerminalDistanceCumulative,shadowConfirmation:baseline.cumulative.shadowConfirmation||null},milestones:[],milestoneState,checkpoint:{lastTargetDate:checkpoint.lastTargetDate,lastSuccessfulTimestamp:checkpoint.lastSuccessfulTimestamp,processedRaceCount:total,revalidationBaselineRaces:baseline.cumulative.processedRaces},scheduler:{status:'READY',schedule:'06:30 JST',startWhenAvailable:true,multipleInstances:'IgnoreNew'},reportPath:`research/daily-validation/${incidentDate}/report.md`,dryRun,revalidation:{mode:'REPLACE_INVALID_COHORT',baselineDate,incidentDate,replacedRaces:raceKeys.length,processedRaceCountUnchanged:true},sourceFetch:source.sourceFetch};
  if(dryRun)return summary;
  const next={...checkpoint,lastSuccessfulTimestamp:completedAt,processedRaceKeys:[...checkpoint.processedRaceKeys],lastTargetDate:incidentDate,executionId:summary.executionId,status:'SUCCESS',dailyRuns:checkpoint.dailyRuns,lastDaily:daily,structureCumulative,terminalSurvivalCumulative,exactTerminalDistanceCumulative,shadowConfirmationCumulative:baseline.cumulative.shadowConfirmation||checkpoint.shadowConfirmationCumulative};
  if(next.processedRaceKeys.length!==total)throw Error('REVALIDATION_DOUBLE_COUNT_GUARD');
  await writeArtifacts(path.join(directory,incidentDate),summary);await atomic(checkpointFile,next);
  const publicStatus=buildPublicValidationStatus(summary,{generatedAt:completedAt});await atomic(path.join(directory,'public','latest.json'),publicStatus);
  if(sync){summary.sync={status:'SYNC_OK',...(await pushPublicValidationStatus(publicStatus))};await atomic(path.join(directory,incidentDate,'summary.json'),summary);await atomic(path.join(directory,incidentDate,'sync.json'),summary.sync)}
  return summary;
  }finally{await handle?.close();await fs.unlink(lock).catch(()=>{});}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const commit=process.argv.includes('--commit'),value=await revalidateInvalidCohort({dryRun:!commit,sync:commit});console.log(JSON.stringify({status:value.daily.status,dryRun:value.dryRun,races:value.targetRaceKeys.length,cumulative:value.cumulative.processedRaces,exactTerminalFound:(value.daily.distance.races||[]).filter(r=>r.terminal?.generated).length,P:value.daily.distance.summary.riderSelection,survival:value.daily.distance.terminalSurvival.summary.stages,marks:value.daily.riderMarks.summary.races,tickets:value.daily.basic.all.tickets,hits:value.daily.basic.all.hits,roi:value.daily.basic.all.roi,trace:value.daily.terminalTrace.summary,integrity:value.daily.integrity,sourceFetch:value.sourceFetch,statusVersion:value.sync?.statusVersion||null},null,2))}
