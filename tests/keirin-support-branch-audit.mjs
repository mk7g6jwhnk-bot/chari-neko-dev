import assert from 'node:assert/strict';
import { classify, purchaseDiagnostics } from '../keirin/engine/purchase.mjs';

const strongRatios={first:1,second:1,third:1};
const terminals=[
  {
    order:[1,2,3], probability:.8,
    branchContributions:[
      {branchId:'LEAD-A',branchLabel:'A先行押し切り',branchPriority:'main',probability:.8,requiredFirstNumber:1,decisionRatios:strongRatios},
      {branchId:'ALT-A',branchLabel:'A先行押し切り',branchPriority:'sub',probability:.74,requiredFirstNumber:1,decisionRatios:strongRatios},
      {branchId:'MAKURI-A',branchLabel:'Aまくり',branchPriority:'sub',probability:.70,requiredFirstNumber:1,decisionRatios:strongRatios}
    ]
  },
  {
    order:[1,3,2], probability:.2,
    branchContributions:[
      {branchId:'LEAD-A',branchLabel:'A先行押し切り',branchPriority:'main',probability:.2,requiredFirstNumber:1,decisionRatios:{first:.8,second:.7,third:.7}}
    ]
  }
];
const classified=classify(terminals,{});
const audit=purchaseDiagnostics(classified,[],3000);
assert.equal(audit.adoptedTerminalCount,1);
const item=audit.adoptedTerminalAudit[0];
assert.equal(item.order,'1-2-3');
assert.equal(item.branchSupport,3);
assert.equal(item.uniqueSupportBranchCount,3);
assert.equal(item.supportBranches.length,3);
assert.deepEqual(item.supportBranches.map(x=>x.branchId),['LEAD-A','ALT-A','MAKURI-A']);
assert.deepEqual(item.duplicateSupportLabels,[{label:'A先行押し切り',count:2}]);
console.log('Keirin supporting branch detail audit passed:', item.supportBranches.map(x=>x.branchId).join(','));
