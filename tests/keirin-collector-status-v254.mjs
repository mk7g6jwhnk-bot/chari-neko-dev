import assert from "node:assert/strict";
import handler from "../netlify/functions/keirin-collector-status.mjs";

process.env.KEIRIN_BROWSER_SERVICE_URL="https://browser.example";
const auto={ok:true,statusGeneratedAt:"2026-08-30T08:00:00Z",collectorProcessHealthy:true,collectorHealthy:false,collectorOperational:false,storageWritable:false,storageHealthy:false,storageWarning:"STORAGE_FULL",todayRaceCount:75,sealedPredictionCount:0,resultLoadedCount:0,verifiedCount:0,waitingPredictionCount:5,races:[{raceKey:"20260830-61-7",predictionSealedAt:"2026-08-30T07:00:00Z",resultObservedAt:null},{raceKey:"20260830-61-8",predictionSealedAt:null,resultObservedAt:null}]};
const research={ok:true,statusGeneratedAt:"2026-08-30T07:59:00Z",comparedCount:23,researchAudit:{progressTo50:{count:23},activeEvaluationCohort:"COHORT_A_DIAGNOSIS"}};
let researchFails=false;
globalThis.fetch=async url=>{
  if(String(url).endsWith("/keirin/auto-research/status"))return Response.json(auto);
  if(researchFails)return new Response("upstream unavailable",{status:502,headers:{"content-type":"text/plain"}});
  return Response.json(research);
};

let response=await handler({method:"GET"}),body=await response.json();
assert.equal(response.status,200);
assert.equal(body.sealedPredictionCount,0,"an actual daily zero must remain zero");
assert.equal(body.pendingResultCount,1,"pending must count sealed races without results, not all discovered races");
assert.equal(body.researchProgress.progress50,23);
assert.equal(body.collectorProcessHealthy,true);
assert.equal(body.collectorOperational,false);
assert.equal(body.storageWritable,false);
assert.equal(body.autoCurrent,true);
assert.equal(body.researchCurrent,true);

researchFails=true;
response=await handler({method:"GET"});body=await response.json();
assert.equal(response.status,200);
assert.equal(body.statusReadFailed,true);
assert.equal(body.researchCurrent,false);
assert.equal(body.researchStatusAvailable,true,"last-known research component remains independently available");
assert.equal(body.researchProgress.progress50,23,"partial failure must not synthesize research zero");
assert.equal(body.researchObservedAt,"2026-08-30T07:59:00Z","stale component must retain original observation time");
assert.equal(body.pendingResultCount,1);
console.log("PASS collector status proxy actual-zero/partial-failure/observation-time separation");
