import assert from "node:assert/strict";
import {classify,purchaseDiagnostics} from "../keirin/engine/purchase.mjs";

function main(order,probability,secondRatio,thirdRatio){
  return{
    order,probability,
    branchContributions:[{
      branchId:"MAIN-A",branchLabel:"A先行押し切り",branchPriority:"main",probability,
      requiredFirstNumber:1,
      decisionRatios:{first:.98,second:secondRatio,third:thirdRatio},
      positionScores:{},positionEvidence:{}
    }]
  };
}

const terminals=[
  main([1,2,3],.45,.98,.97),
  // global branchFit is intentionally weak, but 2nd and 3rd are independently in the natural upper group.
  main([1,4,3],.12,.92,.95),
  // Same 1-2, but 3rd is below a clear natural boundary.
  main([1,4,6],.04,.92,.30),
  main([1,4,7],.035,.92,.25),
  // 2nd itself is below a clear natural boundary.
  main([1,5,3],.03,.25,.96),
  {order:[2,1,3],probability:.325,branchContributions:[{
    branchId:"ALT",branchLabel:"Bまくり",branchPriority:"contender",probability:.325,
    requiredFirstNumber:2,decisionRatios:{first:.96,second:.94,third:.93},positionScores:{},positionEvidence:{}
  }]}
];

const classified=classify(terminals,{});
const byOrder=new Map(classified.map(item=>[item.order.join("-"),item]));
assert.equal(byOrder.get("1-2-3").betClass,"MAIN");
assert.equal(byOrder.get("1-2-3").purchaseStatus,"購入採用");
assert.equal(byOrder.get("1-4-3").purchaseStatus,"購入不採用","v215の買い目化ボーダーを下回る2・3着違いが購入へ残っている");
assert.equal(byOrder.get("1-4-3").purchaseRejectCode,"PURCHASE_BORDER");
assert.ok(byOrder.get("1-4-3").purchaseBorderFailures.includes("TERMINAL_RELATIVE"));
assert.ok(byOrder.get("1-4-3").branchFit<.87,"テストが従来のcredibleVariantで通ってしまっている");
assert.equal(byOrder.get("1-4-6").purchaseStatus,"購入不採用","3着の自然境界下位まで強制採用している");
assert.equal(byOrder.get("1-5-3").purchaseStatus,"購入不採用","2着の自然境界下位まで強制採用している");
assert.notEqual(byOrder.get("2-1-3").adoptionMode,"PRIMARY_FAMILY_MAIN_COVERAGE","別の1着まで本命1着ファミリーとして扱っている");
const diag=purchaseDiagnostics(classified,[],3000);
assert.ok(diag.mainHeadSiblingAudit.candidateCount>=3);
assert.ok(diag.mainHeadSiblingAudit.rejectedCount>=1);
console.log("Keirin main-head sibling purchase passed:",JSON.stringify(diag.mainHeadSiblingAudit));
