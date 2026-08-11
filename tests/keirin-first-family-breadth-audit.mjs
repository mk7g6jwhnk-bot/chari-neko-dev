import assert from"node:assert/strict";
import{applyChatSpecV1}from"../keirin/engine/chat-spec-v1-policy.mjs";
const mk=(first,second,third,p,id)=>({order:[first,second,third],probability:p,branchId:id,branchPriority:"main",branchLabel:`主展開${id}`,branchContributions:[{branchId:id,branchLabel:`主展開${id}`,branchPriority:"main",probability:p,requiredFirstNumber:first,decisionRatios:{first:.96,second:.91,third:.88}}],nodeTrace:[{stage:"FIRST",conditionalProbability:.84,newRequiredConditions:[{kind:"natural",probability:.84,critical:true}]},{stage:"SECOND",conditionalProbability:.78,newRequiredConditions:[{kind:"natural",probability:.78,critical:true}]},{stage:"THIRD",conditionalProbability:.70,newRequiredConditions:[{kind:"natural",probability:.70,critical:true}]}],lifecycle:{generated:true,terminalDeleted:false}});
const terminals=[mk(3,7,1,.20,"A"),mk(3,1,7,.17,"A"),mk(5,2,6,.19,"B"),mk(5,6,2,.16,"B")];
const scored=[1,2,3,4,5,6,7].map(n=>({number:n,roleScores:{first:[3,5].includes(n)?8:6,second:7.5,third:7}}));
const branches=[{id:"A",label:"主展開A",priority:"main",requiredFirstNumber:3,score:9},{id:"B",label:"主展開B",priority:"main",requiredFirstNumber:5,score:8.8}];
const out=applyChatSpecV1({terminals,branches,scored,lines:[],oddsByOrder:new Map()});
const audit=out.audit.firstPurchaseBreadthAudit;
assert.ok(audit);assert.equal(audit.passed,true);assert.equal(audit.expectedHeadCount,2);assert.equal(audit.candidateHeadCount,2);assert.equal(audit.retainedHeadCount,2);
for(const first of [3,5]){const row=audit.rows.find(r=>r.first===first);assert.ok(row);assert.ok(row.naturalPairCandidateCount>0);assert.ok(row.adoptedCount>0);assert.ok(out.terminals.some(x=>x.order[0]===first&&x.purchaseStatus==="購入採用"&&x.betClass==="MAIN"));}
console.log("PASS first-family breadth audit retains every natural MAIN head");
