import assert from 'node:assert/strict';
import {classify,purchaseDiagnostics} from '../keirin/engine/purchase.mjs';

const near={first:.90,second:.88,third:.88};
const strong={first:1,second:1,third:1};
const terminals=[
  {
    order:[1,2,3],probability:.20,
    branchContributions:[
      {branchId:'A',branchLabel:'Aまくり',branchPriority:'risk',probability:.09,requiredFirstNumber:1,decisionRatios:near},
      {branchId:'B',branchLabel:'踏み合い',branchPriority:'risk',probability:.08,requiredFirstNumber:1,decisionRatios:near}
    ]
  },
  {
    order:[4,5,6],probability:.80,
    branchContributions:[
      {branchId:'A',branchLabel:'Aまくり',branchPriority:'risk',probability:.10,requiredFirstNumber:4,decisionRatios:strong},
      {branchId:'B',branchLabel:'踏み合い',branchPriority:'risk',probability:.70,requiredFirstNumber:4,decisionRatios:strong}
    ]
  }
];
const classified=classify(terminals,{});
const weak=classified.find(item=>item.order.join('-')==='1-2-3');
assert.equal(weak.branchSupport,2,'provenance must retain both connected branches');
assert.ok(weak.weightedBranchSupport<2,'two weak branches must not count as two full-strength votes');
assert.equal(weak.purchaseStatus,'購入不採用','raw branch count alone must not adopt a COVER terminal');
assert.equal(weak.rawBranchCountUsedForAdoption,false);
const audit=purchaseDiagnostics(classified,[],3000);
const adopted=audit.adoptedTerminalAudit.find(item=>item.order==='4-5-6');
assert.ok(adopted);
assert.equal(audit.purchaseThresholds.rawBranchCountUsedForAdoption,false);
assert.equal(audit.purchaseThresholds.weightedMultiBranchSupportEquivalentMin,2);
assert.ok(adopted.supportBranches.every(branch=>Number.isFinite(branch.withinBranchFit)&&Number.isFinite(branch.branchStrengthRatio)&&Number.isFinite(branch.weightedSupport)));
console.log('Keirin weighted branch support passed:', weak.branchSupport, weak.weightedBranchSupport.toFixed(3), weak.purchaseStatus);
