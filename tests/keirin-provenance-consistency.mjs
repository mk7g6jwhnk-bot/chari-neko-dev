import assert from "node:assert/strict";
import {classify} from "../keirin/engine/purchase.mjs";

const goodRatios={first:1,second:1,third:1};
const terminals=[
  {
    order:[1,5,3],probability:.60,
    branchContributions:[
      {branchId:"MAKURI-B",branchLabel:"Bまくり",branchPriority:"main",branchType:"MAKURI_SUCCESS",requiredFirstNumber:2,probability:.40,decisionRatios:goodRatios,positionEvidence:null},
      {branchId:"MAKURI-A",branchLabel:"Aまくり",branchPriority:"sub",branchType:"MAKURI_SUCCESS",requiredFirstNumber:1,probability:.20,decisionRatios:goodRatios,positionEvidence:null}
    ]
  },
  {
    order:[4,6,7],probability:.40,
    branchContributions:[
      {branchId:"LEAD-C",branchLabel:"C先行押し切り",branchPriority:"main",branchType:"LEADER_HOLD",requiredFirstNumber:4,probability:.40,decisionRatios:goodRatios,positionEvidence:null}
    ]
  }
];
const classified=classify(terminals,{});
const target=classified.find(item=>item.order.join("-")==="1-5-3");
assert.ok(target);
assert.equal(target.dominantBranchId,"MAKURI-A","incompatible B provenance must never become dominant");
assert.equal(target.dominantBranchLabel,"Aまくり");
assert.notEqual(target.purchaseReason.includes("Bまくり"),true);
assert.equal(target.branchSupport,1,"incompatible provenance must not count as branch support");
console.log("Branch provenance consistency tests passed.");
