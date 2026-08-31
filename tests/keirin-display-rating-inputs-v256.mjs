import assert from"node:assert/strict";
import{buildDisplayPredictionPayload}from"../netlify/functions/keirin-predict.mjs";
import{createSnapshot}from"../public/prediction-store.mjs";

const participants=Array.from({length:7},(_,index)=>({number:index+1,name:`R${index+1}`,registration:`10000${index}`,startPowerEvidence:{confidence:"medium",missingInputs:[]}}));
function payload({blocked=false,weak=false,ev=.2}={}){
  const plan=blocked?[]:[
    {order:[1,2,3],betClass:"MAIN",probability:.25,expectedValueIndex:ev,naturalConvergenceScore:.9,originatingScenarioFamily:"LEAD-A",scenarioFamilyProbability:weak?.20:.48,scenarioFamilySupport:.62,mainCoverClassification:"MAIN",primaryBranch:"LEAD-A"},
    {order:[1,3,2],betClass:"MAIN",probability:.20,expectedValueIndex:ev,naturalConvergenceScore:.8,originatingScenarioFamily:"LEAD-A",scenarioFamilyProbability:weak?.20:.48,scenarioFamilySupport:.62,mainCoverClassification:"MAIN",primaryBranch:"LEAD-A"}
  ];
  const rows=weak?[{score:7,share:.08},{score:6.9,share:.079},{score:6.8,share:.078}]:[{score:9,share:.25},{score:6,share:.17},{score:4,share:.12}];
  return{ok:true,race:{date:"20260831",venueCode:"24",venue:"宇都宮",raceNo:1,participants},odds:{ok:true,odds:{}},prediction:{engineVersion:"TEST",lineConfidence:"高",scored:participants,branches:rows.map((row,index)=>({id:`B${index}`,score:row.score})),terminals:plan,purchasePlan:plan,standardPurchasePlan:plan,referencePurchasePlan:[],noBet:blocked,noBetReason:blocked?"NO_STANDARD_PURCHASE_CANDIDATE":null,purchaseEligibility:{state:blocked?"PURCHASE_BLOCKED":"PURCHASE_ALLOWED",canPurchase:!blocked},audit:{passed:true,terminalProbabilitySum:1,top3Mass:weak?.08:.30,top5Mass:weak?.12:.50,branchSelectionAudit:{tiering:{contenderCutGap:weak?.1:3},rows},adoptedTerminalAudit:plan.map(item=>({order:item.order,expectedValueIndex:ev}))}}};
}
for(const fixture of [payload({blocked:true}),payload({weak:true}),payload({ev:1.2}),payload({ev:.8})]){
  const blocked=fixture.prediction.purchaseEligibility.canPurchase===false;
  const full=createSnapshot(fixture).displayRatings,compactPayload=buildDisplayPredictionPayload(fixture),compact=createSnapshot(compactPayload).displayRatings;
  assert.equal(compact.confidence,full.confidence);assert.equal(compact.concentration,full.concentration);assert.equal(Number(compact.diagnostics.evaluationIndex.toFixed(8)),Number(full.diagnostics.evaluationIndex.toFixed(8)));assert.equal(compact.verdict,full.verdict);assert.equal(compact.diagnostics.allOddsEvaluated,full.diagnostics.allOddsEvaluated);assert.equal(compact.diagnostics.massStatus,full.diagnostics.massStatus);
  assert.deepEqual(compact.diagnostics.familyConcentration,full.diagnostics.familyConcentration);assert.equal(compact.diagnostics.familyConcentration.familyCount,blocked?0:1,"同一familyのterminalを重複加算した");
  assert.equal(compact.diagnostics.rawEvaluationIndex,full.diagnostics.rawEvaluationIndex);assert.equal(compact.diagnostics.confidenceAdjustedEvaluationIndex,full.diagnostics.confidenceAdjustedEvaluationIndex);assert.equal(compact.diagnostics.verdictCappedEvaluationIndex,compact.diagnostics.evaluationIndex);
  assert.ok(compactPayload.prediction.displayRatingInputs);assert.equal(compactPayload.prediction.audit.branchSelectionAudit,undefined);
}
assert.equal(createSnapshot(payload({blocked:true})).displayRatings.verdict,"見送り");
assert.equal(createSnapshot(payload({weak:true})).displayRatings.verdict,"注意");
assert.equal(createSnapshot(payload({ev:1.2})).displayRatings.verdict,"購入可");
assert.equal(createSnapshot(payload({ev:.8})).displayRatings.verdict,"妙味なし");
assert.equal(createSnapshot(payload({ev:1.2})).displayRatings.diagnostics.topFamilyShare,.48,"scenario family probabilityをrace-level shareとして接続できていない");
console.log("PASS display rating inputs FULL/COMPACT parity and four-label reachability");
