import assert from"node:assert/strict";
import{generateKeirinTerminals}from"../keirin/sports/keirin-terminals.mjs";
const r=(id,n,role,lineId)=>({id,number:n,role,lineId,roleScores:{first:7,second:7,third:7},evidence:{recent:7,start:7,sprint:7,finish:7,tracking:7,stamina:7,lineTrust:7}});
const scored=[r("1",1,"自力","A"),r("2",2,"番手","A"),r("3",3,"三番手","A"),r("4",4,"自力","B"),r("5",5,"番手","B")];
const branches=[{id:"LEAD-A",label:"A先行押し切り",scenario:"先行押し切り",branchType:"LEADER_HOLD",primaryLineId:"A",requiredFirstNumber:1,priority:"main",score:8,firstCandidates:["1"],firstCandidateScores:{"1":8}}];
const terminals=generateKeirinTerminals({scored,branches});
const same=terminals.find(x=>x.order.join("-")==="1-2-3");
const other=terminals.find(x=>x.order.join("-")==="1-4-5");
assert.ok(same&&other);
for(const t of [same,other]){
  assert.equal(t.nodeTrace.length,3);
  for(const node of t.nodeTrace){
    assert.ok(node.conditionalProbability>=0&&node.conditionalProbability<=1);
    assert.ok(Array.isArray(node.newRequiredConditions));
    for(const c of node.newRequiredConditions)assert.ok(c.probability>=0&&c.probability<=1);
  }
}
assert.ok(same.nodeTrace[1].newRequiredConditions.every(c=>c.kind!=="extra"));
assert.ok(other.nodeTrace[1].newRequiredConditions.some(c=>c.kind==="extra"));
assert.ok(terminals.generationAudit.nodeStateAudit.conditionStats.SECOND.newConditions>0);
console.log("PASS node condition probability + incremental condition burden");
