import assert from"node:assert/strict";import{summarizeResearchLearning}from"../public/prediction-store.mjs";
const rows=[];
for(let i=0;i<40;i++){
  const confirmed=(i%10)!==9;
  rows.push({predictionSnapshotId:`B${i}`,learningMode:"NORMAL",checkedAt:`2026-08-${String(1+Math.floor(i/4)).padStart(2,"0")}T00:00:00Z`,venueName:i<36?"立川":"平塚",conditionEvidence:[{evidenceKey:`X:${i}`,conditionId:`MAKURI_REACH_${i+1}`,stage:"FIRST",kind:"natural",predictedProbability:.68,status:confirmed?"CONFIRMED":"REFUTED"}],verificationStatus:"PURCHASE_SELECTION_MISS",exactTerminalGenerated:true,firstPlaceFamilyGenerated:true,firstSecondPairGenerated:true});
}
const storage={getItem:k=>k==="chari-neko:keirin-research-learning:v1"?JSON.stringify(rows):null,setItem(){}};
const g=summarizeResearchLearning(storage).conditionCalibration.groups[0];
assert.notEqual(g.contextRobustness.status,"CONTEXT_PASS");
assert.equal(g.promotionAudit.status,"PROMOTION_AUDIT_BLOCKED");
console.log("PASS promotion audit blocked without cross-venue coverage");
