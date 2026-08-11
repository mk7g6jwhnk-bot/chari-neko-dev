import assert from"node:assert/strict";import{summarizeResearchLearning}from"../public/prediction-store.mjs";
const rows=[],venues=["立川","平塚","前橋","富山"];
for(let i=0;i<60;i++){
  const confirmed=(i%10)!==9;
  rows.push({
    predictionSnapshotId:`S${i}`,learningMode:"NORMAL",checkedAt:`2026-08-${String(1+Math.floor(i/5)).padStart(2,"0")}T${String(i%5).padStart(2,"0")}:00:00Z`,
    venueName:venues[i%4],
    conditionEvidence:[{evidenceKey:`E${i}`,conditionId:`MAKURI_REACH_${i+1}`,stage:"FIRST",kind:"natural",predictedProbability:.68,status:confirmed?"CONFIRMED":"REFUTED"}],
    verificationStatus:"PURCHASE_SELECTION_MISS",exactTerminalGenerated:true,firstPlaceFamilyGenerated:true,firstSecondPairGenerated:true
  });
}
const storage={getItem:k=>k==="chari-neko:keirin-research-learning:v1"?JSON.stringify(rows):null,setItem(){}};
const g=summarizeResearchLearning(storage).conditionCalibration.groups[0];
assert.equal(g.trainCandidate.sampleCount,42);
assert.equal(g.trainCandidate.proposal.status,"READY_FOR_RESEARCH_REVIEW");
assert.equal(g.holdoutValidation.selectionLeakagePrevented,true);
if(g.contextRobustness.status==="CONTEXT_PASS"){
  assert.equal(g.contextRobustness.validationScope,"SEALED_HOLDOUT_ONLY");
  assert.equal(g.contextRobustness.fixedCurrentProbability,g.trainCandidate.predictedAvg);
  assert.equal(g.contextRobustness.fixedProposedProbability,g.trainCandidate.proposal.suggestedProbability);
}
if(g.promotionPackage.status==="PROMOTION_PACKAGE_READY"){
  assert.equal(g.promotionPackage.currentProbability,g.trainCandidate.predictedAvg);
  assert.equal(g.promotionPackage.suggestedProbability,g.trainCandidate.proposal.suggestedProbability);
  assert.equal(g.promotionPackage.proposalSource,"TRAIN_ONLY_FIXED");
  assert.equal(g.promotionPackage.validationScope,"SEALED_HOLDOUT_ONLY");
  assert.equal(g.promotionPackage.selectionLeakagePrevented,true);
}
console.log("PASS sealed downstream validation provenance");
