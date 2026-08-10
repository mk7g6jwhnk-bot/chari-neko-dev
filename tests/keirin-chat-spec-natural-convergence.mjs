import assert from"node:assert/strict";
import{applyChatSpecV1}from"../keirin/engine/chat-spec-v1-policy.mjs";

const scored=Array.from({length:7},(_,i)=>({number:i+1,roleScores:{first:8-i*.35,second:7.5-i*.2,third:7.2-i*.15}}));
const branches=[
 {id:"M",label:"中心展開",priority:"main",requiredFirstNumber:1,score:9},
 {id:"C",label:"有力候補",priority:"contender",requiredFirstNumber:2,score:7}
];
const terminals=[];
let p=.020;
for(const first of [1,2]){
  for(const second of [1,2,3,4,5,6,7].filter(x=>x!==first)){
    for(const third of [1,2,3,4,5,6,7].filter(x=>x!==first&&x!==second)){
      const role=first===1?"main":"contender";
      terminals.push({
        order:[first,second,third],
        probability:p,
        branchContributions:[{
          branchId:first===1?"M":"C",branchLabel:first===1?"中心展開":"有力候補",
          branchPriority:role,requiredFirstNumber:first,probability:p,
          decisionRatios:{
            first:.95,
            second: second===2||second===3 ? .92 : .72,
            third: third===3||third===4 ? .90 : .71
          }
        }]
      });
      // Create a smooth long tail so coverage quotas would otherwise explode points.
      p*=.992;
    }
  }
}
const out=applyChatSpecV1({scored,branches,terminals,oddsByOrder:{}});
const adopted=out.terminals.filter(x=>x.purchaseStatus==="購入採用");
assert.equal(out.terminals.length,60);
assert.ok(adopted.length<15,`natural convergence should not explode; got ${adopted.length}`);
assert.equal(out.audit.terminalDeletionCount,0);
assert.equal(out.audit.unexplainedPurchaseRejectCount,0);
assert.ok(out.terminals.every(x=>x.lifecycle.generated===true));
console.log("Keirin Chat Spec natural convergence no-explosion passed:",adopted.length);
