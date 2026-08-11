import assert from"node:assert/strict";import{attachShadowComparisonResult,buildShadowComparisonRecord,savePromotionReview,saveShadowComparison,summarizeShadowComparisons}from"../public/prediction-store.mjs";
const mem=new Map(),storage={getItem:k=>mem.get(k)||null,setItem:(k,v)=>mem.set(k,String(v))};
const pkg={status:"PROMOTION_PACKAGE_READY",packageKey:"FIRST|MAKURI_REACH_N|natural|0.6800|0.8000",currentProbability:.68,suggestedProbability:.80,delta:.12,methodologyEpoch:"PROMOTION-METHOD-2026-08-V2-SEALED-ISOLATED",approvalFingerprint:"TEST-FP"};
savePromotionReview(storage,{packageKey:pkg.packageKey,packageFingerprint:"TEST-FP",decision:"APPROVE_SHADOW"});
const snapshot={predictionSnapshotId:"S1",predictionVersion:"X",targetRace:{date:"20260810",venueName:"立川",raceNo:1},terminalLedger:[
 {order:[1,2,3],probability:.40,nodeSummary:{FIRST:{conditions:[{id:"MAKURI_REACH_1"}]}}},
 {order:[2,1,3],probability:.60,nodeSummary:{FIRST:{conditions:[{id:"LEADER_FINISH_2"}]}}}
]};
const cal={groups:[{stage:"FIRST",family:"MAKURI_REACH_N",kind:"natural",promotionPackage:pkg}]};
const rec=buildShadowComparisonRecord({snapshot,conditionCalibration:cal,storage});
assert.equal(rec.mode,"SHADOW_ONLY");assert.equal(rec.productionWriteAllowed,false);assert.ok(rec.shadowModel.terminalLedger[0].probability>.40);
saveShadowComparison(storage,rec);
const done=attachShadowComparisonResult(storage,rec.comparisonId,[1,2,3]);
assert.equal(done.status,"RESULT_ATTACHED");assert.equal(done.outcome.winner,"SHADOW");
const s=summarizeShadowComparisons(storage);assert.equal(s.completed,1);assert.equal(s.shadowBetter,1);assert.equal(s.productionWriteAllowed,false);
console.log("PASS shadow parallel comparison + result scoring");
