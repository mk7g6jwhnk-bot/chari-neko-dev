import assert from"node:assert/strict";
import{generateKeirinTerminals}from"../keirin/sports/keirin-terminals.mjs";
const r=(id,n,role,lineId,secondMechanisms,thirdMechanisms)=>({
 id,number:n,role,lineId,roleScores:{first:7,second:7,third:7},
 evidence:{recent:7,start:7,sprint:7,finish:7,tracking:7,stamina:7,lineTrust:7},
 riderEvaluationV2:{secondMechanisms,thirdMechanisms}
});
const scored=[
 r("1",1,"番手","A",{leaderRemain:5,lineFollower:5,otherLineRemain:5},{lineThird:5,positionRemain:5,otherLineRemain:5}),
 r("2",2,"自力","A",{leaderRemain:9,lineFollower:5,otherLineRemain:5},{lineThird:5,positionRemain:5,otherLineRemain:5}),
 r("3",3,"三番手","A",{leaderRemain:5,lineFollower:5,otherLineRemain:5},{lineThird:9,positionRemain:5,otherLineRemain:5}),
 r("4",4,"番手","B",{leaderRemain:5,lineFollower:5,otherLineRemain:2},{lineThird:5,positionRemain:5,otherLineRemain:2})
];
const branches=[{id:"BANTE",label:"A番手差し",branchType:"BANTE_SASHI",primaryLineId:"A",priority:"main",score:8,firstCandidates:["1"],firstCandidateScores:{"1":8}}];
const terminals=generateKeirinTerminals({scored,branches});
const same=terminals.find(t=>t.order.join("-")==="1-2-3");assert.ok(same);
const s2=same.nodeTrace[1].newRequiredConditions[0],s3=same.nodeTrace[2].newRequiredConditions[0];
assert.equal(s2.mechanism.baseProbability,.80);assert.ok(s2.probability>.80);assert.equal(s2.mechanism.adjustedProbability,s2.probability);
assert.equal(s3.mechanism.baseProbability,.78);assert.ok(s3.probability>.78);
const other=terminals.find(t=>t.order[0]===1&&t.order[1]===4);assert.ok(other);
const o2=other.nodeTrace[1].newRequiredConditions[0];
assert.equal(o2.mechanism.baseProbability,.52);assert.ok(o2.probability<.52);
assert.ok(s2.probability<=.95&&o2.probability>=.12);
console.log("PASS mechanism score -> bounded condition probability bridge");
