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
assert.equal(diag.rejectCodeCounts.PURCHASE_CUTOFF,2);
assert.ok(Object.keys(diag.rejectCodeCounts).length>0);
assert.equal(diag.fixedBranchRankCapApplied,false);
const funnel=diag.purchaseDistributionAudit.purchaseFunnel;
assert.deepEqual(funnel.map(row=>row.stage),["GENERATED_TERMINALS","NATURAL_CANDIDATES","PURCHASE_BORDER_PASS","INITIAL_ADOPTED","FAMILY_RECOVERY","MASS_RECOVERY","VALUE_ADDITION","FINAL_PURCHASE"]);
assert.ok(funnel.every(row=>["count","addedCount","removedCount","probabilityMass","familyCount","pairCount","thirdVariantCount"].every(key=>Object.hasOwn(row,key))));
assert.equal(diag.purchaseDistributionAudit.purchaseConcentrationAudit.policy,"AUDIT_ONLY_UNTIL_MULTI_RACE_CALIBRATION");
console.log("Keirin purchase funnel audit passed:",JSON.stringify(diag.rejectCodeCounts));
