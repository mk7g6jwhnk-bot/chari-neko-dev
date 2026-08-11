import assert from"node:assert/strict";
import{applyChatSpecV1}from"../keirin/engine/chat-spec-v1-policy.mjs";

const scored=[
 {number:1,roleScores:{first:8,second:8,third:7}},
 {number:2,roleScores:{first:7,second:7,third:7}},
 {number:3,roleScores:{first:6,second:7,third:8}},
 {number:4,roleScores:{first:9,second:6,third:6}}
];
const lines=[[4,2],[1,3]];
const branches=[
 {id:"M4",label:"4先行",priority:"main",requiredFirstNumber:4,score:9},
 {id:"M1",label:"1差し",priority:"main",requiredFirstNumber:1,score:8}
];
const terminals=[
 {order:[4,2,3],probability:.30,branchContributions:[{branchId:"M4",branchLabel:"4先行",branchPriority:"main",requiredFirstNumber:4,probability:.30,decisionRatios:{first:.95,second:.92,third:.85}}]},
 {order:[1,3,4],probability:.25,branchContributions:[{branchId:"M1",branchLabel:"1差し",branchPriority:"main",requiredFirstNumber:1,probability:.25,decisionRatios:{first:.94,second:.91,third:.84}}]},
 {order:[4,1,3],probability:.22,branchId:"M1",branchPriority:"main",branchLabel:"1差し",branchContributions:[{branchId:"M1",branchLabel:"1差し",branchPriority:"main",requiredFirstNumber:1,probability:.22,decisionRatios:{first:.95,second:.90,third:.88}}]}
];

const out=applyChatSpecV1({scored,lines,branches,terminals,oddsByOrder:{}});
const bad=out.terminals.find(x=>x.order.join("-")==="4-1-3");
assert.equal(bad.branchHeadMatched,false);
assert.equal(bad.purchaseStatus,"購入不採用");
assert.notEqual(bad.betClass,"MAIN");
assert.equal(out.audit.mainInvariant.passed,true);
assert.ok(out.terminals.filter(x=>x.betClass==="MAIN"&&x.purchaseStatus==="購入採用").length>=1);
assert.equal(out.terminals.filter(x=>x.purchaseStatus==="購入採用"&&x.branchHeadMatched===false).length,0);
console.log("Keirin branch-head + main invariant passed");
