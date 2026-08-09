import assert from "node:assert/strict";
import {classify} from "../keirin/engine/purchase.mjs";

const probabilities=[0.20,0.195,0.19,0.185,0.18,0.175];
const terminals=probabilities.map((probability,index)=>({
  order:[1,index+2,index+8],
  probability,
  branchContributions:[{
    branchId:"B1",
    branchLabel:"A先行押し切り",
    branchPriority:"main",
    probability,
    requiredFirstNumber:1,
    decisionRatios:{first:.95,second:.93,third:.92},
    positionScores:{},
    positionEvidence:{}
  }]
}));

const classified=classify(terminals,{});
const adopted=classified.filter(item=>item.purchaseStatus==="購入採用");
assert.ok(adopted.length>=4,"枝内4位以下が固定順位上限で落とされている");
assert.ok(adopted.some(item=>item.branchRank>=4),"枝内4位以下の自然候補が採用されていない");
console.log(`Keirin no fixed branch-rank cap passed: ${adopted.length} adopted`);
