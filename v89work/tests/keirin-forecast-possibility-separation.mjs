import assert from "node:assert/strict";
import {selectNaturalBranchTiers} from "../keirin/sports/keirin-branches.mjs";
import {classify} from "../keirin/engine/purchase.mjs";

const tiers=selectNaturalBranchTiers([
  {id:"core",score:8.0},{id:"p1",score:7.7},{id:"p2",score:7.4},{id:"p3",score:7.1}
]);
assert.deepEqual(tiers.main.map(x=>x.id),["core"]);
assert.equal(tiers.contender.length,0);
assert.deepEqual(tiers.sub.map(x=>x.id),["p1","p2","p3"]);

function t(order,probability,priority,id,odds){return {order,probability,odds,branchContributions:[{branchId:id,branchLabel:id,branchPriority:priority,probability,requiredFirstNumber:order[0],decisionRatios:{first:.98,second:.96,third:.95},positionScores:{},positionEvidence:{}}]};}
const classified=classify([
  t([1,2,3],.20,"main","CORE"),
  t([7,2,3],.35,"sub","POSSIBLE-HIGH-MASS"),
  t([7,3,2],.25,"sub","POSSIBLE-HIGH-MASS-2")
],{});
const by=Object.fromEntries(classified.map(x=>[x.order.join("-"),x]));
assert.equal(by["1-2-3"].purchaseStatus,"購入採用");
assert.equal(by["7-2-3"].purchaseStatus,"購入不採用","possible-only family must not become a normal purchase just from probability mass");
assert.equal(by["7-3-2"].purchaseStatus,"購入不採用");
console.log("Keirin forecast/possibility separation passed");
