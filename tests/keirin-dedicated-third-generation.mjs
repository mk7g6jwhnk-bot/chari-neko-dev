import assert from"node:assert/strict";
import{generateKeirinTerminals}from"../keirin/sports/keirin-terminals.mjs";
const rider=(n,role,lineId,third)=>({id:String(n),number:n,name:`R${n}`,role,lineId,lineOrder:1,roleScores:{first:6,second:6,third},evidence:{recent:6,start:6,sprint:6,finish:6,tracking:6,stamina:6,lineTrust:6},riderEvaluationV2:{secondMechanisms:{leaderRemain:6,lineFollower:6,otherLineRemain:6},thirdMechanisms:{lineThird:6,positionRemain:6,otherLineRemain:6}}});
const scored=[
 rider(1,"番手","B",1.1),rider(2,"自力","C",.2),rider(3,"自力","A",8),rider(4,"三番手","C",.05),rider(5,"番手","C",.3),rider(6,"単騎","D",.01),rider(7,"番手","A",8)
];
const branches=[{id:"BANTE-A",label:"7番手差し",branchType:"BANTE_SASHI",primaryLineId:"A",priority:"main",score:9,firstCandidates:["7"],firstCandidateScores:{"7":9}}];
const terminals=generateKeirinTerminals({scored,branches});
const audit=terminals.generationAudit.reevaluationCoverageAudit.thirdDedicatedAudit;
assert.equal(audit.passed,true);
const row=audit.rows.find(r=>r.order.join("-")==="7-3");
assert.ok(row,"7-3 pair dedicated third row");
assert.deepEqual(row.candidateNumbers.sort((a,b)=>a-b),[1,2,4,5,6]);
assert.equal(row.scoreBasedGenerationPruningApplied,false);
assert.equal(row.probabilityAssignedAfterConditionGeneration,true);
for(const n of [1,2,4,5,6])assert.ok(terminals.some(t=>t.order.join("-")===`7-3-${n}`),`7-3-${n} terminal retained`);
console.log("PASS dedicated third generation retains every remaining third before probability");