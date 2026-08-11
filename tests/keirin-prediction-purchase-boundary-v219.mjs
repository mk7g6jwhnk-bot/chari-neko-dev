import assert from"node:assert/strict";
import{runKeirinPredictionEngine}from"../keirin/engine/prediction-engine.mjs";
import{runKeirinPurchaseEngine}from"../keirin/engine/purchase-engine.mjs";

const participants=[
 {id:"1",number:1,role:"自力",lineId:"A",lineOrder:1,recentForm:8,startPower:9,sprintPower:7,trackingSkill:5,finishPower:6,stamina:8,attackTiming:7,lineTrust:6,venueSuitability:6},
 {id:"2",number:2,role:"番手",lineId:"A",lineOrder:2,recentForm:7,startPower:4,sprintPower:5,trackingSkill:9,finishPower:8,stamina:7,attackTiming:6,lineTrust:9,venueSuitability:6},
 {id:"3",number:3,role:"三番手",lineId:"A",lineOrder:3,recentForm:6,startPower:3,sprintPower:4,trackingSkill:8,finishPower:6,stamina:7,attackTiming:5,lineTrust:8,venueSuitability:6},
 {id:"4",number:4,role:"自力",lineId:"B",lineOrder:1,recentForm:7,startPower:8,sprintPower:9,trackingSkill:5,finishPower:7,stamina:7,attackTiming:8,lineTrust:5,venueSuitability:6},
 {id:"5",number:5,role:"番手",lineId:"B",lineOrder:2,recentForm:6,startPower:4,sprintPower:5,trackingSkill:8,finishPower:8,stamina:6,attackTiming:5,lineTrust:8,venueSuitability:6},
 {id:"6",number:6,role:"三番手",lineId:"B",lineOrder:3,recentForm:5,startPower:3,sprintPower:4,trackingSkill:7,finishPower:5,stamina:6,attackTiming:4,lineTrust:7,venueSuitability:5},
 {id:"7",number:7,role:"単騎",lineId:"unknown-7",recentForm:6,startPower:6,sprintPower:7,trackingSkill:6,finishPower:7,stamina:6,attackTiming:7,lineTrust:5,venueSuitability:6}
];
const race={id:"V219-BOUNDARY",raceCategory:"standard",lineConfidence:"高",participants};
const prediction=runKeirinPredictionEngine({race});
assert.ok(prediction.terminals.length>0);
for(const t of prediction.terminals){
  assert.equal(Object.hasOwn(t,"betClass"),false);
  assert.equal(Object.hasOwn(t,"purchaseStatus"),false);
  assert.equal(Object.hasOwn(t,"purchaseReason"),false);
  assert.equal(Object.hasOwn(t,"purchaseBorderEligible"),false);
}
assert.equal(prediction.audit.predictionBoundaryAudit.passed,true);
const before=JSON.stringify(prediction.terminals.map(t=>[t.order,t.probability,t.score,t.contributingBranches]));
const purchase=runKeirinPurchaseEngine({prediction,oddsByOrder:{},budget:3000});
const after=JSON.stringify(prediction.terminals.map(t=>[t.order,t.probability,t.score,t.contributingBranches]));
assert.equal(before,after);
assert.equal(purchase.terminals.length,prediction.terminals.length);
assert.equal(purchase.audit.predictionPurchaseBoundaryAudit.passed,true);
console.log("keirin prediction/purchase boundary v219 passed");
