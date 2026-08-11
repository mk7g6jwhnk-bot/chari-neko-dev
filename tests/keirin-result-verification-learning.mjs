import assert from"node:assert/strict";
import{evaluateResult}from"../public/prediction-store.mjs";
const base={
 predictionSnapshotId:"P1",
 betSelections:[],
 terminalLedger:[
  {order:[5,1,4],probability:.08,purchaseStatus:"購入不採用",purchaseRejectCode:"X",purchaseReason:"条件不足",terminalGlobalRank:7,naturalConvergenceScore:.51,extraConditionCount:1,
   nodeSummary:{
    FIRST:{conditionalProbability:.30,newConditionCount:2,extraConditionCount:0,conditionLabels:["5が1着"]},
    SECOND:{conditionalProbability:.45,newConditionCount:1,extraConditionCount:0,conditionLabels:["1が2着"]},
    THIRD:{conditionalProbability:.40,newConditionCount:1,extraConditionCount:1,conditionLabels:["4が3着"]}
   }},
  {order:[5,4,1],probability:.07,purchaseStatus:"購入採用"}
 ]
};
const miss=evaluateResult(base,{status:"confirmed",finishOrder:[5,1,4],payout:12340},new Date("2026-08-10T06:00:00Z"));
assert.equal(miss.resultStatus,"miss");
assert.equal(miss.verification.status,"PURCHASE_SELECTION_MISS");
assert.equal(miss.verification.exactTerminalGenerated,true);
assert.equal(miss.verification.firstPlaceFamilyGenerated,true);
assert.equal(miss.verification.firstSecondPairGenerated,true);
assert.equal(miss.verification.stages.length,3);
assert.equal(miss.verification.stages[1].finishEventConfirmed,true);
assert.equal(miss.verification.stages[1].conditionValidation.status,"EVIDENCE_PENDING");
assert.equal(miss.verification.researchLearning.autoPromoteToProduction,false);
const missing=evaluateResult(base,{status:"confirmed",finishOrder:[3,2,1]},new Date("2026-08-10T06:00:00Z"));
assert.equal(missing.verification.status,"FIRST_FAMILY_GENERATION_MISS");
assert.equal(missing.verification.exactTerminalGenerated,false);
console.log("PASS result verification + research learning separation");
