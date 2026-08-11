import assert from"node:assert/strict";import{applyChatSpecV1}from"../keirin/engine/chat-spec-v1-policy.mjs";
const mk=(third,p,ratio)=>({order:[3,7,third],probability:p,branchId:"B",branchPriority:"main",branchLabel:"主展開",branchContributions:[{branchId:"B",branchLabel:"主展開",branchPriority:"main",probability:p,decisionRatios:{first:.95,second:.90,third:ratio}}],nodeTrace:[{stage:"FIRST",conditionalProbability:.8,newRequiredConditions:[{kind:"natural",probability:.8,critical:true}]},{stage:"SECOND",conditionalProbability:.75,newRequiredConditions:[{kind:"natural",probability:.75,critical:true}]},{stage:"THIRD",conditionalProbability:.6,newRequiredConditions:[{kind:"natural",probability:.6,critical:true}]}],lifecycle:{generated:true,terminalDeleted:false}});
const terminals=[mk(1,.30,.92),mk(2,.27,.82),mk(4,.24,.62),mk(5,.12,.55),mk(6,.07,.30)];
const scored=[1,2,3,4,5,6,7].map(n=>({number:n,roleScores:{first:n===3?8:6,second:n===7?8:6,third:6}}));
const branches=[{id:"B",label:"主展開",priority:"main",requiredFirstNumber:3,score:9}];
const out=applyChatSpecV1({terminals,branches,scored,lines:[],oddsByOrder:new Map()});
const audit=out.audit.thirdPurchaseBridgeAudit;assert.ok(audit);assert.equal(audit.passed,true);
const pair=audit.rows.find(r=>r.first===3&&r.second===7);assert.ok(pair);assert.equal(pair.candidateCount,5);
for(const third of [1,2,4,5,6]){const item=out.terminals.find(x=>x.order.join("-")===`3-7-${third}`);assert.ok(item);assert.ok(["SELECTED_FOR_CLASSIFICATION","EVALUATED_NOT_SELECTED"].includes(item.thirdPurchaseBridgeStatus),`3-7-${third}`)}
assert.ok(audit.lowThirdRatioEvaluatedCount>=1);
console.log("PASS all thirds reach purchase bridge");