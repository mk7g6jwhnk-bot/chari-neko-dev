import assert from "node:assert/strict";
import {classify} from "../keirin/engine/purchase.mjs";

function t(third,probability,thirdRatio){
  return {
    order:[2,4,third],
    probability,
    branchContributions:[{
      branchId:"B-LEAD",
      branchLabel:"B先行押し切り",
      branchPriority:"main",
      probability,
      requiredFirstNumber:2,
      decisionRatios:{first:.97,second:.94,third:thirdRatio},
      positionScores:{},positionEvidence:{}
    }]
  };
}

// 3着支持が 9,3,6 の上位群と 1,5 の下位群へ自然に割れる形。
// 固定順位ではなく、同一branch・同一1-2着内の支持分布の自然境界を使う。
const terminals=[
  t(9,.300,.96),
  t(3,.297,.95),
  t(6,.294,.94),
  t(1,.267,.90),
  t(5,.264,.89)
];
const classified=classify(terminals,{});
const adopted=classified.filter(x=>x.purchaseStatus==="購入採用");
const rejectedThird=classified.filter(x=>x.purchaseStatus==="購入不採用");
assert.deepEqual(adopted.map(x=>x.order[2]).sort((a,b)=>a-b),[3,6,9]);
assert.deepEqual(rejectedThird.map(x=>x.order[2]).sort((a,b)=>a-b),[1,5]);
assert.ok(adopted.every(x=>x.purchaseDistributionAudit?.boundaryDetected===true));
assert.ok(adopted.every(x=>x.purchaseDistributionAudit?.thirdVariantRemovedCount===0));
console.log(`Keirin adaptive third-variant purchase gate passed: adopted ${adopted.length}, rejected ${rejectedThird.length}`);
