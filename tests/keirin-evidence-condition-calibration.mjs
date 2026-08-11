import assert from"node:assert/strict";
import{loadResearchLearningRecords,summarizeResearchLearning}from"../public/prediction-store.mjs";
const rows=[];
for(let i=0;i<20;i++){
  rows.push({
    predictionSnapshotId:`C${i}`,learningMode:"NORMAL",
    conditionEvidence:[{
      evidenceKey:`FIRST:MAKURI_REACH_${i+1}`,conditionId:`MAKURI_REACH_${i+1}`,
      stage:"FIRST",kind:"natural",predictedProbability:.68,
      status:i<18?"CONFIRMED":"REFUTED",source:"official_winning_method",autoResolved:true
    }],
    verificationStatus:"PURCHASE_SELECTION_MISS",
    exactTerminalGenerated:true,firstPlaceFamilyGenerated:true,firstSecondPairGenerated:true
  });
}
rows.push({
  predictionSnapshotId:"PENDING",learningMode:"NORMAL",
  conditionEvidence:[{evidenceKey:"X",conditionId:"MAKURI_REACH_99",stage:"FIRST",kind:"natural",predictedProbability:.68,status:"EVIDENCE_PENDING"}]
});
rows.push({
  predictionSnapshotId:"EX",learningMode:"EXCEPTIONAL_SEPARATE",
  conditionEvidence:[{evidenceKey:"X2",conditionId:"MAKURI_REACH_98",stage:"FIRST",kind:"natural",predictedProbability:.68,status:"CONFIRMED"}]
});
const storage={getItem:k=>k==="chari-neko:keirin-research-learning:v1"?JSON.stringify(rows):null,setItem(){}};
const s=summarizeResearchLearning(storage);
assert.equal(s.conditionCalibration.decisiveSampleCount,20);
assert.equal(s.conditionCalibration.groupCount,1);
const g=s.conditionCalibration.groups[0];
assert.equal(g.family,"MAKURI_REACH_N");
assert.equal(g.sampleCount,20);
assert.equal(g.confirmedCount,18);
assert.ok(g.observedRate>.89);
assert.ok(g.gap>.20);
assert.equal(g.reviewStatus,"RECALIBRATION_CANDIDATE");
assert.equal(s.conditionCalibration.productionApplyEnabled,false);
console.log("PASS evidence-only condition calibration + production isolation");
