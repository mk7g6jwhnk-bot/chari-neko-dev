import assert from"node:assert/strict";
import{applyChatSpecV1}from"../keirin/engine/chat-spec-v1-policy.mjs";

const scored=Array.from({length:7},(_,i)=>({number:i+1,roleScores:{first:8.5-i*.25,second:8-i*.15,third:7.8-i*.12}}));
const branches=[
 {id:"M",label:"中心展開",priority:"main",requiredFirstNumber:1,score:9},
 {id:"C",label:"有力候補",priority:"contender",requiredFirstNumber:2,score:7}
];
const terminals=[];
let rank=0;
for(const first of [1,2]){
  for(const second of [1,2,3,4,5,6,7].filter(x=>x!==first)){
    for(const third of [1,2,3,4,5,6,7].filter(x=>x!==first&&x!==second)){
      rank++;
      const role=first===1?"main":"contender";
      const p=(first===1?.030:.020)*(1-rank*.0025);
      terminals.push({
        order:[first,second,third],
        probability:p,
        branchContributions:[{
          branchId:first===1?"M":"C",
          branchLabel:first===1?"中心展開":"有力候補",
          branchPriority:role,
          requiredFirstNumber:first,
          probability:p,
          decisionRatios:{
            first:.95,
            second: second<=3?.90:.74,
            third: third<=4?.88:.73
          }
        }]
      });
    }
  }
}
const out=applyChatSpecV1({scored,branches,terminals,oddsByOrder:{}});
const adopted=out.terminals.filter(x=>x.purchaseStatus==="購入採用");
const primary=[...out.families].sort((a,b)=>b.probability-a.probability)[0];
const primaryAdopted=adopted.filter(x=>x.firstFamilyNumber===primary.first);
const coverage=primaryAdopted.reduce((s,x)=>s+x.probability,0)/primary.probability;

assert.equal(out.terminals.length,60);
assert.ok(adopted.length>=5,`should recover from over-pruning; got ${adopted.length}`);
assert.ok(adopted.length<20,`should not explode; got ${adopted.length}`);
assert.ok(coverage>=.20,`primary-family coverage too low: ${coverage}`);
assert.equal(out.audit.terminalDeletionCount,0);
assert.equal(out.audit.unexplainedPurchaseRejectCount,0);
console.log("Keirin balanced undercoverage guard passed:",{adopted:adopted.length,coverage:Number(coverage.toFixed(3))});
