import assert from"node:assert/strict";
import{aggregateOperationalMetrics,loadOperationalLearningState,loadOperationalV182ReviewDraft,runOperationalLearningPipeline}from"../public/research-auto-pipeline.mjs";
class Mem{constructor(){this.m=new Map()}getItem(k){return this.m.has(k)?this.m.get(k):null}setItem(k,v){this.m.set(k,String(v))}removeItem(k){this.m.delete(k)}}
const storage=new Mem(),snaps=[];
for(let i=0;i<135;i++){
  const hit=i%4===0,order=hit?[1,2,3]:[3,2,1];
  snaps.push({predictionSnapshotId:`p${i}`,createdAt:`2026-08-${String(1+(i%10)).padStart(2,"0")}T00:00:00Z`,targetRace:{date:"20260801",venueCode:"28",raceNo:(i%12)+1},betSelections:[{order:[1,2,3],category:"MAIN",stake:100,probability:.2,naturalConvergenceScore:.9},{order:[1,3,2],category:"COVER",stake:100,probability:.1,naturalConvergenceScore:.5}],terminalLedger:[{order:[1,2,3],probability:.2,purchaseStatus:"購入採用"},{order:[3,2,1],probability:.05,purchaseStatus:"購入不採用"}],result:{resultStatus:hit?"hit":"miss",officialFinishOrder:order,officialPayout:hit?1200:800,checkedAt:`2026-08-${String(1+(i%10)).padStart(2,"0")}T01:00:00Z`,learningDisposition:{mode:"NORMAL",includeInNormalLearning:true},verification:{version:"RESULT-VERIFY-1.0",status:hit?"PURCHASE_HIT":"PURCHASE_SELECTION_MISS",stages:[{stage:"FIRST"},{stage:"SECOND"},{stage:"THIRD"}],researchLearning:{mode:"NORMAL",savedToResearch:true,includeInNormalLearning:true}}}})
}
storage.setItem("chari-neko:keirin-predictions:v1",JSON.stringify(snaps));
const metrics=aggregateOperationalMetrics(snaps.slice(-100));assert.equal(metrics.races,100);assert.equal(metrics.betCount,2);
const out=runOperationalLearningPipeline(storage,{minimumRaces:100,baselineMinimumRaces:30,windowRaces:100,now:new Date("2026-08-11T00:00:00Z")});
assert.equal(out.state.currentWindowRaces,100);assert.equal(out.state.baselineWindowRaces,35);assert.equal(out.state.automaticCollectionConnected,true);assert.ok(["OPERATIONAL_V182_REVIEW_DRAFT_READY","OPERATIONAL_ROLLBACK_REVIEW_REQUIRED"].includes(out.state.status));assert.ok(out.reviewDraft);assert.equal(out.reviewDraft.sample.currentRaces,100);assert.equal(out.reviewDraft.sample.baselineRaces,35);assert.equal(out.reviewDraft.productionWriteAllowed,false);assert.equal(loadOperationalLearningState(storage).stateSeal,out.state.stateSeal);assert.equal(loadOperationalV182ReviewDraft(storage).reviewDraftSeal,out.reviewDraft.reviewDraftSeal);
const low=new Mem();low.setItem("chari-neko:keirin-predictions:v1",JSON.stringify(snaps.slice(0,40)));const lowOut=runOperationalLearningPipeline(low,{minimumRaces:100});assert.equal(lowOut.state.status,"OPERATIONAL_SAMPLE_BUILDING");assert.equal(lowOut.reviewDraft,null);
console.log("PASS operational result collection -> 100R metrics -> v182 review draft");
