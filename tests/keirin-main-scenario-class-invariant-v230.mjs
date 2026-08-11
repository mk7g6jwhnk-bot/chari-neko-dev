import assert from "node:assert/strict";
import {applyChatSpecV1} from "../keirin/engine/chat-spec-v1-policy.mjs";

const scored=[
  {number:1,roleScores:{first:7.2,second:8.0,third:7.0}},
  {number:2,roleScores:{first:8.0,second:7.2,third:7.0}},
  {number:3,roleScores:{first:6.5,second:6.8,third:7.8}},
  {number:4,roleScores:{first:6.0,second:6.0,third:6.5}}
];
const lines=[[2,1,3],[4]];
const branches=[{id:"M2",label:"2先行→1番手",priority:"main",requiredFirstNumber:2,score:7.5}];
// Legacy/provenance contribution keeps role=main but does not map to current mainBranchIds.
// v229 could classify this natural main-scenario purchase as COVER.
const terminals=[
  {order:[2,1,3],probability:.42,branchContributions:[{branchId:"LEGACY-MAIN",branchLabel:"2先行→1番手",branchPriority:"main",requiredFirstNumber:2,probability:.42,decisionRatios:{first:.95,second:.93,third:.90}}]},
  {order:[2,1,4],probability:.18,branchContributions:[{branchId:"LEGACY-MAIN",branchLabel:"2先行→1番手",branchPriority:"main",requiredFirstNumber:2,probability:.18,decisionRatios:{first:.94,second:.90,third:.84}}]}
];
const out=applyChatSpecV1({scored,lines,branches,terminals,oddsByOrder:{}});
const purchased=out.terminals.filter(x=>x.purchaseStatus==="購入採用");
assert.ok(purchased.length>0,"fixture must produce a standard purchase candidate");
assert.ok(purchased.some(x=>x.betClass==="MAIN"),"any standard purchase set must contain MAIN");
assert.equal(purchased.filter(x=>x.chatForecastRole==="main"&&x.betClass==="COVER").length,0,"main-scenario natural purchase must never be COVER");
assert.equal(out.audit.mainInvariant.passed,true);
assert.equal(out.audit.mainInvariant.semanticPolicy,"STANDARD_PURCHASE_REQUIRES_MAIN_AND_MAIN_SCENARIO_PURCHASE_IS_MAIN");
console.log("PASS v230 main scenario class invariant");
