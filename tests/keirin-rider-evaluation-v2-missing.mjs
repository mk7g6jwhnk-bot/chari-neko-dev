import assert from"node:assert/strict";
import{scoreKeirinParticipants}from"../keirin/sports/keirin-scoring.mjs";
const race={participants:[{id:"1",number:1,role:"番手",recentForm:7,startPower:5,sprintPower:null,finishPower:8,trackingSkill:null,stamina:null,attackTiming:6,lineTrust:8,venueSuitability:null}]};
const [r]=scoreKeirinParticipants({race});
assert.equal(r.riderEvaluationV2.missingAbilities.includes("sprintPower"),true);
assert.equal(r.riderEvaluationV2.missingAbilities.includes("trackingSkill"),true);
assert.notEqual(r.riderEvaluationV2.firstMechanisms.banteSashi,5);
assert.ok(["medium","low"].includes(r.riderEvaluationV2.confidence));
console.log("PASS rider evaluation v2 missing renormalization");
