import assert from "node:assert/strict";
import {allocate,purchaseDiagnostics} from "../keirin/engine/purchase.mjs";
const base={purchaseStatus:"購入採用",betClass:"COVER",probability:.1,odds:20,branchContributions:[]};
const rows=[
 {...base,order:[1,2,3],probability:.12},
 {...base,order:[1,2,3],probability:.11},
 {...base,order:[1,2,4],probability:.10},
 {...base,order:[1,2,5],probability:.09},
 {...base,order:[1,2,6],probability:.08},
 {...base,order:[1,2,7],probability:.07}
];
const plan=allocate(rows,1000);
assert.equal(plan.filter(x=>x.order.join("-")==="1-2-3").length,1,"same trifecta must not be funded twice");
assert.equal(plan.length,5,"only exact duplicates should be collapsed");
const d=purchaseDiagnostics(rows,plan,1000);
assert.equal(d.purchaseOverlapAudit.exactDuplicateOrderCount,1);
assert.equal(d.purchaseOverlapAudit.maxThirdVariantsPerPair,5);
assert.deepEqual(d.purchaseOverlapAudit.highOverlapPairs,["1-2"]);
assert.equal(d.purchaseOverlapAudit.policy,"EXACT_ORDER_DEDUPE_ONLY_KEEP_NATURAL_THIRD_VARIANTS");
console.log("PASS purchase overlap audit");
