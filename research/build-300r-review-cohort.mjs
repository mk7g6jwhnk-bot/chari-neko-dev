import fs from'node:fs/promises';
import path from'node:path';
import crypto from'node:crypto';
import{fileURLToPath,pathToFileURL}from'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const compareRaceKey=(a,b)=>{const aa=String(a).split('-').map(Number),bb=String(b).split('-').map(Number);for(let i=0;i<Math.max(aa.length,bb.length);i++){const d=(aa[i]||0)-(bb[i]||0);if(d)return d;}return String(a).localeCompare(String(b),'en');};
async function json(file){return JSON.parse(await fs.readFile(file,'utf8'));}

export async function build300rReviewCohort({liveRoot=here,outputFile=path.join(here,'300r-review-cohort.json')}={}){
  const checkpoint=await json(path.join(liveRoot,'daily-validation','checkpoint.json'));
  const cohortRules=await json(path.join(here,'shadow-parameter-lab-v1-cohorts.json'));
  const protectedKeys=new Set([...(cohortRules.protectedFinal||[]),...(cohortRules.finalHoldout||[])]),done=new Set(checkpoint.processedRaceKeys||[]),raceDir=path.join(liveRoot,'action-tag-live-data','races');
  const names=(await fs.readdir(raceDir)).filter(name=>name.endsWith('.json')),fresh=[];
  for(const name of names){const event=await json(path.join(raceDir,name));if(event?.record?.result?.status==='confirmed'&&!done.has(event.raceKey))fresh.push(event.raceKey);}
  const available=[...new Set([...(checkpoint.processedRaceKeys||[]),...fresh])].sort(compareRaceKey),eligible=available.filter(key=>!protectedKeys.has(key)),raceKeys=eligible.slice(0,300),overflow=eligible.slice(300);
  if(raceKeys.length<300)throw Error(`EVALUABLE_RACES_BELOW_300:${raceKeys.length}`);
  const value={schemaVersion:'300R_REVIEW_COHORT_V1',name:'300R_REVIEW_COHORT',ordering:'raceKey date/venue/race numeric ascending',fixedAt:new Date().toISOString(),checkpointBefore:{date:checkpoint.lastTargetDate,processedRaces:(checkpoint.processedRaceKeys||[]).length},availableConfirmedRaces:available.length,excludedProtectedFinal:available.filter(key=>protectedKeys.has(key)),protectedFinalIncluded:0,raceKeys,overflowRaceKeys:overflow,cohortKeyHash:hash(raceKeys),safety:{historicalMutation:0,productionWrite:0,resultAwareSelection:false}};
  await fs.writeFile(outputFile,`${JSON.stringify(value,null,2)}\n`);return value;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const liveRoot=process.argv[2]?path.resolve(process.argv[2]):here,outputFile=process.argv[3]?path.resolve(process.argv[3]):path.join(here,'300r-review-cohort.json');const value=await build300rReviewCohort({liveRoot,outputFile});console.log(JSON.stringify({outputFile,races:value.raceKeys.length,available:value.availableConfirmedRaces,protectedExcluded:value.excludedProtectedFinal.length,overflow:value.overflowRaceKeys.length,hash:value.cohortKeyHash},null,2));}
