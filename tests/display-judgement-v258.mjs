import assert from "node:assert/strict";
import {purchaseDisplayState} from "../public/purchase-funding.mjs";

const main=(extra={})=>({order:[1,2,3],category:"MAIN",probability:.4,naturalConvergenceScore:.8,...extra});
assert.deepEqual(purchaseDisplayState({betSelections:[main(),main({order:[1,3,2],probability:.1,naturalConvergenceScore:.2})]},{confidence:4,concentration:4}).quality,"高");
assert.equal(purchaseDisplayState({betSelections:[main()]},{confidence:3,concentration:3}).label,"注意");
const blocked=purchaseDisplayState({noBet:true,betSelections:[main()]},{confidence:5,concentration:5});
assert.equal(blocked.label,"見送り");assert.equal(blocked.purchase,"購入不可");assert.equal(blocked.funding,"なし");assert.equal(blocked.thick,false);
console.log("PASS display judgement axes and purchase-forbidden thick gate");
