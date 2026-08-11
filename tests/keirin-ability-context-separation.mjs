import assert from"node:assert/strict";import{scoreKeirinParticipants}from"../keirin/sports/keirin-scoring.mjs";
const base={recentForm:6,startPower:6,sprintPower:6,trackingSkill:6,finishPower:6,stamina:6,attackTiming:6,lineTrust:6,venueSuitability:6};
const race={participants:[{...base,id:"a",number:1,role:"自力",lineId:"A",lineOrder:1},{...base,id:"b",number:2,role:"三番手",lineId:"A",lineOrder:3},{...base,id:"u",number:3,role:"三番手",lineId:"unknown-3",lineOrder:3}]};
const out=scoreKeirinParticipants({race});
for(const r of out){assert.equal(r.riderEvaluationV2.version,"RIDER-EVAL-3.0-ABILITY-CONTEXT-SEPARATED");assert.ok(r.riderEvaluationV2.rawAbilityPlacementScores);assert.ok(r.riderEvaluationV2.contextPriorScores);assert.ok(r.riderEvaluationV2.contextAdjustment);}
const third=out.find(x=>x.number===2),unknown=out.find(x=>x.number===3);
assert.ok(unknown.riderEvaluationV2.roleCertainty.contextWeight<third.riderEvaluationV2.roleCertainty.contextWeight);
assert.ok(Math.abs(unknown.riderEvaluationV2.contextAdjustment.third)<=Math.abs(third.riderEvaluationV2.contextAdjustment.third)+1e-9);
console.log("PASS raw ability separated from role context");