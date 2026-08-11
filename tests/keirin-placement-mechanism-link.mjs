import assert from"node:assert/strict";
import{generateKeirinTerminals}from"../keirin/sports/keirin-terminals.mjs";
const r=(id,n,role,lineId,secondMechanisms,thirdMechanisms)=>({
 id,number:n,role,lineId,roleScores:{first:7,second:7,third:7},
 evidence:{recent:7,start:7,sprint:7,finish:7,tracking:7,stamina:7,lineTrust:7},
 riderEvaluationV2:{secondMechanisms,thirdMechanisms}
});
const scored=[
 r("1",1,"番手","A",{leaderRemain:6,lineFollower:7,otherLineRemain:5},{lineThird:5,positionRemain:6,otherLineRemain:5}),
 r("2",2,"自力","A",{leaderRemain:8.4,lineFollower:6,otherLineRemain:4},{lineThird:4,positionRemain:6.5,otherLineRemain:4}),
 r("3",3,"三番手","A",{leaderRemain:4,lineFollower:7.6,otherLineRemain:4},{lineThird:8.7,positionRemain:7,otherLineRemain:4}),
 r("4",4,"番手","B",{leaderRemain:4,lineFollower:5,otherLineRemain:8.1},{lineThird:4,positionRemain:5,otherLineRemain:7.9})
];
const branches=[{id:"BANTE",label:"A番手差し",branchType:"BANTE_SASHI",primaryLineId:"A",priority:"main",score:8,firstCandidates:["1"],firstCandidateScores:{"1":8}}];
const terminals=generateKeirinTerminals({scored,branches});
const same=terminals.find(t=>t.order.join("-")==="1-2-3");assert.ok(same);
const s2=same.nodeTrace[1].newRequiredConditions[0],s3=same.nodeTrace[2].newRequiredConditions[0];
assert.equal(s2.mechanism.key,"leaderRemain");assert.equal(s2.mechanism.score,8.4);assert.match(s2.label,/先行残り/);
assert.equal(s3.mechanism.key,"lineThird");assert.equal(s3.mechanism.score,8.7);assert.match(s3.label,/ライン3番手残り/);
assert.equal(same.nodeTrace[1].resultingState.facts.secondMechanism,"leaderRemain");
assert.equal(same.nodeTrace[2].resultingState.facts.thirdMechanism,"lineThird");
const other=terminals.find(t=>t.order[0]===1&&t.order[1]===4);assert.ok(other);
assert.equal(other.nodeTrace[1].newRequiredConditions[0].mechanism.key,"otherLineRemain");
console.log("PASS SECOND/THIRD mechanism-specific condition linkage");
