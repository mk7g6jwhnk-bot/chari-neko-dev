import assert from "node:assert/strict";
import {classify} from "../keirin/engine/purchase.mjs";

const terminals=[
 {order:[1,2,3],probability:.50,branchContributions:[{branchId:"A",branchLabel:"A先行",branchPriority:"main",probability:.50,requiredFirstNumber:1,decisionRatios:{first:.95,second:.93,third:.92}}]},
 {order:[1,3,4],probability:.15,branchContributions:[{branchId:"A",branchLabel:"A先行",branchPriority:"main",probability:.15,requiredFirstNumber:1,decisionRatios:{first:.95,second:.90,third:.88}}]},
 {order:[4,5,6],probability:.05,branchContributions:[{branchId:"B",branchLabel:"Bまくり",branchPriority:"alternative",probability:.05,requiredFirstNumber:4,decisionRatios:{first:.70,second:.70,third:.70}}]}
];
const classified=classify(terminals,{});
const low=classified.find(item=>item.order.join("-")==="1-3-4");
assert.notEqual(low.purchaseRejectCode,"PROBABILITY_SUPPORT","42%未満の固定確率足切りが残っている");
console.log("Keirin no probability cutoff passed:",low.purchaseStatus,low.purchaseRejectCode);
