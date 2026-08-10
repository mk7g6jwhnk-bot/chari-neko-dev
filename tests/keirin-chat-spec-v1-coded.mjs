import assert from"node:assert/strict";
import{applyChatSpecV1}from"../keirin/engine/chat-spec-v1-policy.mjs";

const scored=[
 {number:1,roleScores:{first:9,second:6,third:5}},
 {number:2,roleScores:{first:6,second:9,third:8}},
 {number:3,roleScores:{first:5,second:7,third:9}},
 {number:4,roleScores:{first:7,second:6,third:6}}
];
const strong={first:.96,second:.92,third:.90};
const ok={first:.90,second:.82,third:.80};
const branches=[
 {id:"MAIN-A",label:"1先行→2番手残り",priority:"main",requiredFirstNumber:1,score:9,scoreTrace:[{key:"startPower",value:9,weight:.4,contribution:3.6}]},
 {id:"ALT-B",label:"4まくり",priority:"contender",requiredFirstNumber:4,score:7},
 {id:"POSS-C",label:"別線残り",priority:"sub",requiredFirstNumber:1,score:5}
];
const terminals=[
 {order:[1,2,3],probability:.30,branchContributions:[{branchId:"MAIN-A",branchLabel:"1先行→2番手残り",branchPriority:"main",requiredFirstNumber:1,probability:.30,decisionRatios:strong}]},
 {order:[1,3,2],probability:.18,branchContributions:[{branchId:"MAIN-A",branchLabel:"1先行→2番手残り",branchPriority:"main",requiredFirstNumber:1,probability:.18,decisionRatios:ok}]},
 {order:[4,2,3],probability:.16,branchContributions:[{branchId:"ALT-B",branchLabel:"4まくり",branchPriority:"contender",requiredFirstNumber:4,probability:.16,decisionRatios:strong}]},
 {order:[1,4,3],probability:.08,branchContributions:[{branchId:"POSS-C",branchLabel:"別線残り",branchPriority:"sub",requiredFirstNumber:1,probability:.08,decisionRatios:strong}]}
];
const odds={"1-2-3":8,"1-3-2":18,"4-2-3":24,"1-4-3":2};
const out=applyChatSpecV1({scored,branches,terminals,oddsByOrder:odds});
assert.equal(out.terminals.length,4);
assert.equal(out.audit.terminalDeletionCount,0);
assert.equal(out.audit.unexplainedPurchaseRejectCount,0);
assert.ok(out.terminals.some(x=>x.betClass==="MAIN"));
assert.ok(out.terminals.some(x=>x.betClass==="COVER"));
const possible=out.terminals.find(x=>x.order.join("-")==="1-4-3");
assert.equal(possible.chatForecastRole,"sub");
assert.equal(possible.purchaseStatus,"購入不採用");
assert.ok(possible.purchaseRejectCode);
assert.ok(out.scenarioSummary.some(x=>x.roleLabel==="中心予測"));
const psum=out.terminals.reduce((s,x)=>s+x.probability,0);
assert.ok(Math.abs(psum-1)<1e-9);
console.log("Keirin Chat Spec v1 coded policy passed");
