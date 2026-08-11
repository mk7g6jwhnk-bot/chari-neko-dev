import assert from "node:assert/strict";
import {classify} from "../keirin/engine/purchase.mjs";

function t(third,probability,thirdTraceRatio){
  return {
    order:[9,3,third],
    probability,
    relativeConditionCount: thirdTraceRatio < 1 ? 2 : 1,
    relativeConditionPenalty: thirdTraceRatio < .50 ? .965 : .982,
    relativeConditionTrace:[
      {stage:"BRANCH",ratio:.9683,count:1,factor:.9913,penalty:.0087},
      {stage:"FIRST",ratio:1,count:0,factor:1,penalty:0},
      {stage:"SECOND",ratio:.90,count:1,factor:.985,count:1,penalty:.015},
      {stage:"THIRD",ratio:thirdTraceRatio,count:thirdTraceRatio<1?1:0,factor:thirdTraceRatio<1?.981:1,penalty:thirdTraceRatio<1?.019:0}
    ],
    branchContributions:[{
      branchId:"D-LEAD",branchLabel:"D先行押し切り",branchPriority:"main",probability,
      requiredFirstNumber:9,
      decisionRatios:{first:.97,second:.93,third:.95},positionScores:{},positionEvidence:{}
    }]
  };
}

const classified=classify([
  t(5,.60,.9413),
  t(2,.40,.4861)
],{});
const strong=classified.find(x=>x.order[2]===5);
const weak=classified.find(x=>x.order[2]===2);
assert.ok(strong);
assert.ok(weak);
assert.equal(strong.purchaseBorderEligible,true);
assert.equal(strong.purchaseStatus,"購入採用");
assert.equal(weak.purchaseBorderEligible,false);
assert.ok(weak.purchaseBorderFailures.includes("THIRD_RELATIVE"));
assert.equal(weak.purchaseRejectCode,"PURCHASE_BORDER");
assert.equal(weak.purchaseStatus,"購入不採用");
assert.ok(Math.abs(weak.purchaseBorderMetrics.thirdRelative-.4861)<1e-12);
assert.ok(Math.abs(strong.purchaseBorderMetrics.thirdRelative-.9413)<1e-12);
console.log("Keirin v215 composite purchase border passed: 94.13% kept / 48.61% rejected");
