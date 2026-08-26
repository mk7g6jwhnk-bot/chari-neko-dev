import assert from "node:assert/strict";
import {allocate,classify,purchaseDiagnostics} from "../keirin/engine/purchase.mjs";

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
const distributionAudit=classified.find(x=>x.purchaseDistributionAudit)?.purchaseDistributionAudit;
assert.equal(distributionAudit?.boundaryDetected,true);
assert.equal(distributionAudit?.thirdVariantRemovedCount,0);
console.log(`Keirin adaptive third-variant purchase gate passed: adopted ${adopted.length}, rejected ${rejectedThird.length}`);

// D: The whole globally selected cluster belongs to one inseparable pair.
// Pair-local rejection may therefore still produce a genuine no-bet.
const ambiguous=[
  t(9,.300,.96),t(3,.299,.95),t(6,.298,.94),
  {...t(1,.100,.90),order:[5,1,2]},
  {...t(5,.090,.89),order:[7,8,1]}
];
const ambiguousClassified=classify(ambiguous,{});
const ambiguousAdopted=ambiguousClassified.filter(x=>x.purchaseStatus==="購入採用");
assert.equal(ambiguousAdopted.length,0);
const ambiguity=ambiguousClassified.find(x=>x.purchaseDistributionAudit)?.purchaseDistributionAudit.thirdVariantAmbiguity;
assert.equal(ambiguity.detected,true);
assert.equal(ambiguity.count,1);
assert.equal(ambiguity.pairs[0].pair,"2-4");
assert.equal(ambiguity.causesNoBet,true);
assert.equal(ambiguousClassified.filter(x=>x.thirdVariantLocalRejected).length,3);
assert.equal(ambiguousClassified.filter(x=>x.purchaseRejectCode==="THIRD_VARIANT_AMBIGUITY").length,3);
assert.equal(purchaseDiagnostics(ambiguousClassified,allocate(ambiguousClassified,3000),3000).noBetReason,"THIRD_VARIANT_AMBIGUITY");

// B: One ambiguous pair must not erase unrelated, globally selected pairs.
const mixed=[
  t(9,.300,.96),t(3,.299,.95),t(6,.298,.94),
  {...t(1,.297,.93),order:[5,1,2]},
  {...t(5,.296,.92),order:[7,8,1]},
  {...t(4,.100,.80),order:[6,3,4]}
];
const mixedClassified=classify(mixed,{});
const mixedAdopted=mixedClassified.filter(x=>x.purchaseStatus==="購入採用");
assert.deepEqual(mixedAdopted.map(x=>x.order.join("-")).sort(),["5-1-2","7-8-1"]);
assert.equal(mixedClassified.find(x=>x.purchaseDistributionAudit)?.purchaseDistributionAudit.thirdVariantAmbiguity.causesNoBet,false);
assert.ok(mixedClassified.filter(x=>x.order[0]===2).every(x=>x.thirdVariantAmbiguityPair==="2-4"&&x.thirdVariantLocalRejected));

// C: Multiple ambiguous pairs are still local; an unrelated pair survives.
const multiple=[
  t(9,.300,.96),t(3,.299,.95),t(6,.298,.94),
  {...t(7,.297,.93),order:[4,5,7]},
  {...t(8,.296,.92),order:[4,5,8]},
  {...t(1,.295,.91),order:[6,1,3]},
  {...t(4,.100,.80),order:[7,2,4]}
];
const multipleClassified=classify(multiple,{});
assert.deepEqual(multipleClassified.filter(x=>x.purchaseStatus==="購入採用").map(x=>x.order.join("-")),["6-1-3"]);
assert.equal(multipleClassified.find(x=>x.purchaseDistributionAudit)?.purchaseDistributionAudit.thirdVariantAmbiguity.count,2);

// E: A separable pair uses its own natural boundary without affecting another
// pair that passed the global boundary.
const bounded=[
  t(9,.300,.96),t(3,.299,.95),t(6,.298,.94),t(1,.270,.90),t(5,.269,.89),
  {...t(4,.268,.88),order:[6,3,4]},
  {...t(7,.100,.70),order:[7,2,7]}
];
const boundedClassified=classify(bounded,{});
assert.deepEqual(boundedClassified.filter(x=>x.purchaseStatus==="購入採用").map(x=>x.order.join("-")).sort(),["2-4-3","2-4-6","2-4-9","6-3-4"]);
assert.deepEqual(boundedClassified.filter(x=>x.thirdVariantBoundaryRejected).map(x=>x.order[2]).sort((a,b)=>a-b),[1,5]);

// Per-terminal audit fields are always present and remain scalar/lightweight.
for(const row of [...classified,...ambiguousClassified,...mixedClassified,...multipleClassified]){
  assert.ok(Object.hasOwn(row,"thirdVariantAmbiguityPair"));
  assert.ok(Object.hasOwn(row,"thirdVariantLocalRejected"));
  assert.ok(Object.hasOwn(row,"thirdVariantBoundaryRejected"));
}
console.log(`Keirin pair-local third-variant gate passed: A=${adopted.length} B=${mixedAdopted.length} C=${multipleClassified.filter(x=>x.purchaseStatus==="購入採用").length} D=${ambiguousAdopted.length} E=${boundedClassified.filter(x=>x.purchaseStatus==="購入採用").length}`);
