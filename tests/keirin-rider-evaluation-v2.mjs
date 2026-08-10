import assert from"node:assert/strict";
import{scoreKeirinParticipants}from"../keirin/sports/keirin-scoring.mjs";

const race={participants:[
 {id:"1",number:1,role:"自力",lineId:"A",lineOrder:1,recentForm:7.5,startPower:9,sprintPower:8.2,finishPower:5.5,trackingSkill:5.2,stamina:8.5,attackTiming:8,lineTrust:6,venueSuitability:6},
 {id:"2",number:2,role:"番手",lineId:"A",lineOrder:2,recentForm:7,startPower:4.5,sprintPower:4.8,finishPower:8.8,trackingSkill:9,stamina:7,attackTiming:7.5,lineTrust:9,venueSuitability:7},
 {id:"3",number:3,role:"三番手",lineId:"A",lineOrder:3,recentForm:6.5,startPower:4,sprintPower:4.5,finishPower:6.5,trackingSkill:8.5,stamina:6.5,attackTiming:6,lineTrust:8.5,venueSuitability:6.5}
]};
const out=scoreKeirinParticipants({race});
const leader=out[0],bante=out[1],third=out[2];
assert.ok(leader.riderEvaluationV2.firstMechanisms.escape>leader.riderEvaluationV2.firstMechanisms.sashi);
assert.ok(bante.riderEvaluationV2.firstMechanisms.banteSashi>bante.riderEvaluationV2.firstMechanisms.escape);
assert.ok(bante.roleScores.second>bante.roleScores.first-1);
assert.ok(third.roleScores.third>third.roleScores.first);
assert.equal(leader.riderEvaluationV2.version,"RIDER-EVAL-2.0");
assert.ok(["high","medium","low"].includes(leader.riderEvaluationV2.confidence));
console.log("PASS rider evaluation v2",out.map(x=>({n:x.number,role:x.riderEvaluationV2.role,s:x.roleScores})));
