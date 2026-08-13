import assert from"node:assert/strict";
import{classify,purchaseDiagnostics}from"../keirin/engine/purchase.mjs";
const terminals=[
 {order:[1,2,3],probability:.50,branchContributions:[{branchId:"A",branchLabel:"A先行",branchPriority:"main",probability:.50,requiredFirstNumber:1,decisionRatios:{first:.95,second:.93,third:.92}}]},
 {order:[1,3,2],probability:.20,branchContributions:[{branchId:"A",branchLabel:"A先行",branchPriority:"main",probability:.20,requiredFirstNumber:1,decisionRatios:{first:.95,second:.70,third:.70}}]},
 {order:[4,5,6],probability:.10,branchContributions:[{branchId:"B",branchLabel:"Bまくり",branchPriority:"alternative",probability:.10,requiredFirstNumber:4,decisionRatios:{first:.70,second:.70,third:.70}}]}
];
const classified=classify(terminals,{});
const diag=purchaseDiagnostics(classified,[],3000);
assert.equal(diag.generatedTerminalCount,3);
assert.equal(diag.probabilityEvaluatedTerminalCount,3);
assert.equal(diag.adoptedTerminalCount,1);
assert.equal(diag.rejectedTerminalCount,2);
assert.ok(Object.keys(diag.rejectCodeCounts).length>0);
assert.equal(diag.fixedBranchRankCapApplied,false);
console.log("Keirin purchase funnel audit passed:",JSON.stringify(diag.rejectCodeCounts));
