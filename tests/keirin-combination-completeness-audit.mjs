import assert from"node:assert/strict";
import{applyChatSpecV1}from"../keirin/engine/chat-spec-v1-policy.mjs";
const mk=(third,p,thirdRatio,thirdNode)=>({
  order:[3,7,third],probability:p,branchId:"B",branchPriority:"main",branchLabel:"主展開",
  branchContributions:[{branchId:"B",branchLabel:"主展開",branchPriority:"main",requiredFirstNumber:3,probability:p,decisionRatios:{first:.95,second:.92,third:thirdRatio}}],
  nodeTrace:[
    {stage:"FIRST",conditionalProbability:.88,newRequiredConditions:[{kind:"natural",probability:.88,critical:true}]},
    {stage:"SECOND",conditionalProbability:.82,newRequiredConditions:[{kind:"natural",probability:.82,critical:true}]},
    {stage:"THIRD",conditionalProbability:thirdNode,newRequiredConditions:[{kind:"natural",probability:thirdNode,critical:true}]}
  ],lifecycle:{generated:true,terminalDeleted:false}
});
// Highest-probability THIRD is intentionally poor as a full 1-2-3 convergence.
// The lower-probability sibling is a normal classifiable combination.
const terminals=[mk(1,.34,.05,.01),mk(2,.21,.86,.78),mk(4,.08,.52,.30)];
const scored=[1,2,3,4,5,6,7].map(n=>({number:n,roleScores:{first:n===3?8:6,second:n===7?8:6,third:6}}));
const branches=[{id:"B",label:"主展開",priority:"main",requiredFirstNumber:3,score:9}];
const out=applyChatSpecV1({terminals,branches,scored,lines:[],oddsByOrder:new Map()});
const audit=out.audit.combinationCompletenessAudit;
assert.ok(audit);assert.equal(audit.passed,true);assert.equal(audit.pairCount,1);
const row=audit.rows[0];
assert.equal(row.first,3);assert.equal(row.second,7);
assert.equal(row.missingSelectedOrders.length,0);
assert.ok(row.classifiableCandidateCount>=1);
assert.equal(row.combinationRecoveryKey,"3-7-2","classifiable sibling should be recovered inside the same 1-2 pair");
assert.equal(audit.recoveredPairCount,1);
assert.ok(row.purchasedSelectedCount>=1,"selected 1-2 pair must retain a usable 1-2-3 purchase terminal");
assert.ok(out.terminals.some(x=>x.order.join("-")==="3-7-2"&&x.purchaseStatus==="購入採用"),"classifiable sibling should survive");
console.log("PASS combination completeness audit",row);
