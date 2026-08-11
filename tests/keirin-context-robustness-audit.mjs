import assert from"node:assert/strict";import{summarizeResearchLearning}from"../public/prediction-store.mjs";
const rows=[],venues=["立川","平塚","前橋","富山"];
for(let i=0;i<48;i++){
  const confirmed=(i%10)!==9;
  rows.push({
    predictionSnapshotId:`C${i}`,learningMode:"NORMAL",
    checkedAt:`2026-08-${String(1+Math.floor(i/4)).padStart(2,"0")}T${String((i%4)*3).padStart(2,"0")}:00:00Z`,
    venueName:venues[i%venues.length],venueCode:String(i%venues.length+1),
    conditionEvidence:[{evidenceKey:`F:${i}`,conditionId:`MAKURI_REACH_${i+1}`,stage:"FIRST",kind:"natural",predictedProbability:.68,status:confirmed?"CONFIRMED":"REFUTED"}],
    verificationStatus:"PURCHASE_SELECTION_MISS",exactTerminalGenerated:true,firstPlaceFamilyGenerated:true,firstSecondPairGenerated:true
  });
}
const storage={getItem:k=>k==="chari-neko:keirin-research-learning:v1"?JSON.stringify(rows):null,setItem(){}};
const cal=summarizeResearchLearning(storage).conditionCalibration,g=cal.groups[0];
assert.equal(g.shadowProposal.status,"READY_FOR_RESEARCH_REVIEW");
assert.equal(g.holdoutValidation.status,"HOLDOUT_PASS");
assert.equal(g.contextRobustness.status,"CONTEXT_PASS");
assert.ok(g.contextRobustness.venueCount>=3);
assert.ok(g.contextRobustness.directionShare>=.70);
assert.ok(g.contextRobustness.improvementShare>=.70);
assert.equal(g.promotionAudit.status,"PROMOTION_AUDIT_READY");
assert.equal(cal.contextPassedCount,1);
assert.equal(cal.promotionAuditReadyCount,1);
assert.equal(cal.productionApplyEnabled,false);
console.log("PASS cross-venue robustness + independent promotion audit readiness");
