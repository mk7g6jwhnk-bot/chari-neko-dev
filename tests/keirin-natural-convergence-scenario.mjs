import assert from"node:assert/strict";
import{applyChatSpecV1}from"../keirin/engine/chat-spec-v1-policy.mjs";

const scored=[
 {number:1,roleScores:{first:7.0,second:8.6,third:8.0}},
 {number:2,roleScores:{first:6.4,second:7.9,third:7.8}},
 {number:3,roleScores:{first:6.2,second:7.6,third:7.6}},
 {number:4,roleScores:{first:7.2,second:7.0,third:6.8}},
 {number:5,roleScores:{first:9.2,second:6.8,third:6.2}},
 {number:6,roleScores:{first:5.5,second:6.0,third:6.0}},
 {number:7,roleScores:{first:6.8,second:6.5,third:6.4}}
];
const lines=[[5,1],[4,2,6],[7,3]];
const branches=[
 {id:"M5",label:"5が4を捲る",priority:"main",requiredFirstNumber:5,score:9.0,
  scoreTrace:[{key:"makuri",contribution:2},{key:"line",contribution:1.5}]}
];
const terminals=[
 {order:[5,1,2],probability:.22,branchContributions:[{branchId:"M5",branchLabel:"5が4を捲る",branchPriority:"main",requiredFirstNumber:5,probability:.22,decisionRatios:{first:.95,second:.92,third:.84}}]},
 {order:[5,2,3],probability:.24,branchContributions:[{branchId:"M5",branchLabel:"5が4を捲る",branchPriority:"main",requiredFirstNumber:5,probability:.24,decisionRatios:{first:.95,second:.88,third:.86}}]},
 {order:[5,3,2],probability:.20,branchContributions:[{branchId:"M5",branchLabel:"5が4を捲る",branchPriority:"main",requiredFirstNumber:5,probability:.20,decisionRatios:{first:.95,second:.86,third:.84}}]}
];

const out=applyChatSpecV1({scored,lines,branches,terminals,oddsByOrder:{"5-1-2":14,"5-2-3":33,"5-3-2":50}});
const a=out.terminals.find(x=>x.order.join("-")==="5-1-2");
const b=out.terminals.find(x=>x.order.join("-")==="5-2-3");
assert.ok(a.naturalConvergenceScore>b.naturalConvergenceScore,"5-1-* should be more natural when 1 follows 5");
assert.equal(a.betClass,"MAIN");
assert.notEqual(b.betClass,"MAIN","5-2-3 should not be main without extra-condition support");
assert.ok((b.naturalConvergenceReasons||[]).some(x=>x.includes("追走失敗")));
assert.equal(out.audit.naturalConvergence.purchasedLow,0);
console.log("Keirin natural convergence scenario coherence passed",{
  main:a.naturalConvergenceScore,
  alt:b.naturalConvergenceScore,
  altClass:b.betClass
});
