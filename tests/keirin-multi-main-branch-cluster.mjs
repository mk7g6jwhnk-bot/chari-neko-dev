import assert from"node:assert/strict";
import{applyChatSpecV1}from"../keirin/engine/chat-spec-v1-policy.mjs";
const scored=[
 {number:1,roleScores:{first:8.8,second:8.7,third:7.8}},
 {number:2,roleScores:{first:8.6,second:8.8,third:7.8}},
 {number:3,roleScores:{first:9.0,second:8.4,third:7.8}},
 {number:4,roleScores:{first:7.2,second:7.5,third:7.5}},
 {number:5,roleScores:{first:8.7,second:8.9,third:7.8}}
];
const lines=[[1,5,4],[3,2]];
const branches=[
 {id:"A1",label:"1先行成功",priority:"main",requiredFirstNumber:1,score:9.0},
 {id:"A5",label:"1先行→5番手差し",priority:"main",requiredFirstNumber:5,score:8.8},
 {id:"B3",label:"3捲り成功",priority:"main",requiredFirstNumber:3,score:8.9},
 {id:"B2",label:"3捲り→2差し",priority:"main",requiredFirstNumber:2,score:8.7}
];
const terminals=[
 {order:[1,5,4],probability:.12,branchContributions:[{branchId:"A1",branchLabel:"1先行成功",branchPriority:"main",requiredFirstNumber:1,probability:.12,decisionRatios:{first:.95,second:.94,third:.90}}]},
 {order:[5,1,4],probability:.11,branchContributions:[{branchId:"A5",branchLabel:"1先行→5番手差し",branchPriority:"main",requiredFirstNumber:5,probability:.11,decisionRatios:{first:.94,second:.93,third:.90}}]},
 {order:[5,4,1],probability:.075,branchContributions:[{branchId:"A5",branchLabel:"1先行→5番手差し",branchPriority:"main",requiredFirstNumber:5,probability:.075,decisionRatios:{first:.92,second:.88,third:.84}}]},
 {order:[3,2,5],probability:.115,branchContributions:[{branchId:"B3",branchLabel:"3捲り成功",branchPriority:"main",requiredFirstNumber:3,probability:.115,decisionRatios:{first:.95,second:.94,third:.86}}]},
 {order:[3,2,1],probability:.10,branchContributions:[{branchId:"B3",branchLabel:"3捲り成功",branchPriority:"main",requiredFirstNumber:3,probability:.10,decisionRatios:{first:.94,second:.93,third:.85}}]},
 {order:[2,3,5],probability:.09,branchContributions:[{branchId:"B2",branchLabel:"3捲り→2差し",branchPriority:"main",requiredFirstNumber:2,probability:.09,decisionRatios:{first:.93,second:.92,third:.84}}]}
];
const out=applyChatSpecV1({scored,lines,branches,terminals,oddsByOrder:{}});
const main=out.terminals.filter(x=>x.purchaseStatus==="購入採用"&&x.betClass==="MAIN").map(x=>x.order.join("-"));
for(const k of ["1-5-4","5-1-4","3-2-5","2-3-5"])assert.ok(main.includes(k),`${k} should be MAIN`);
assert.ok((out.terminals.find(x=>x.order.join("-")==="5-1-4").naturalConvergenceReasons||[]).some(x=>x.includes("同ライン")));
assert.equal(out.audit.mainInvariant.passed,true);
console.log("PASS multi-main branch cluster",main);
