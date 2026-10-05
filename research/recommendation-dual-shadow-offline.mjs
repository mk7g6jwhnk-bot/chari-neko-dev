import {buildDualRecommendationShadow} from "../keirin/engine/research-diagnostics-v1.mjs";

const base=String(process.env.KEIRIN_BROWSER_SERVICE_URL||"").replace(/\/$/,"");
const dates=process.argv.slice(2).filter(value=>/^\d{8}$/.test(value));
if(!base||!dates.length)throw new Error("KEIRIN_BROWSER_SERVICE_URL and YYYYMMDD arguments are required");

const summaries=(await Promise.all(dates.map(date=>get(`/keirin/read/predictions?date=${date}`)))).flatMap(value=>value.records||[]);
const candidates=summaries.filter(row=>row.resultAttached===true&&/^[a-f0-9]{64}$/.test(String(row.predictionHash||"")));
const details=await pool(candidates,4,async row=>get(`/keirin/read/predictions/${row.raceKey}`));
const excluded={HASH_VERSION:0,INTEGRITY:0,TEMPORAL:0,MULTI_WORLD:0,READ_FAILED:0},traces=[];
for(const detail of details){
  if(detail?.error){excluded.READ_FAILED++;continue}
  if(detail.predictionIdentity?.predictionHashVersion!=="PREDICTION_CANONICAL_SNAPSHOT_V2"){excluded.HASH_VERSION++;continue}
  if(detail.integrityStatus!=="VALID"){excluded.INTEGRITY++;continue}
  if(detail.temporalStatus!=="VALID"){excluded.TEMPORAL++;continue}
  const prediction=detail.predictionPayload?.prediction;
  if(prediction?.multiWorldScenario?.schemaVersion!=="SCENARIO_EVENT_TERMINAL_V1"||prediction.multiWorldScenario.purchase?.enabled!==true||!Array.isArray(prediction.multiWorldScenario.scenarios)||!prediction.multiWorldScenario.scenarios.length){excluded.MULTI_WORLD++;continue}
  const trace=buildDualRecommendationShadow({race:{raceKey:detail.raceKey},prediction,purchase:prediction,multiWorldScenario:prediction.multiWorldScenario,generatedAt:detail.predictionSealedAt});
  traces.push(trace);
}
const levels=["HIGH","MEDIUM","LOW","INSUFFICIENT"],count=(key,level)=>traces.filter(row=>row[key].shadowLevel===level).length;
const standard=Object.fromEntries(levels.map(level=>[level,count("standardHitShadow",level)])),highPayout=Object.fromEntries(levels.map(level=>[level,count("highPayoutOpportunityShadow",level)]));
const crossTab={};for(const left of levels)for(const right of levels)crossTab[`${left}__${right}`]=traces.filter(row=>row.standardHitShadow.shadowLevel===left&&row.highPayoutOpportunityShadow.shadowLevel===right).length;
console.log(JSON.stringify({ok:true,readOnly:true,historicalMutation:0,resultFeatureInputs:0,dates,summaryRecords:summaries.length,resultAttachedCandidates:candidates.length,evaluated:traces.length,excluded,standardHitShadow:standard,highPayoutOpportunityShadow:highPayout,crossTab,resultDataUsedFalse:traces.every(row=>row.resultDataUsed===false),configVersion:traces[0]?.configVersion||null},null,2));

async function get(path){const response=await fetch(`${base}${path}`,{headers:{accept:"application/json"},signal:AbortSignal.timeout(60000)});if(!response.ok)throw new Error(`${path} HTTP ${response.status}`);return response.json()}
async function pool(items,limit,worker){const output=new Array(items.length),cursor={value:0};await Promise.all(Array.from({length:limit},async()=>{for(;;){const index=cursor.value++;if(index>=items.length)return;try{output[index]=await worker(items[index])}catch(error){output[index]={error:String(error?.message||error),raceKey:items[index]?.raceKey||null}}}}));return output}
