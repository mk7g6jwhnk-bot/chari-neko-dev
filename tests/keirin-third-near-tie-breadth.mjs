import assert from "node:assert/strict";
import {applyChatSpecV1} from "../keirin/engine/chat-spec-v1-policy.mjs";
const mk=(third,p,thirdRatio=.86)=>({order:[3,7,third],probability:p,branchId:"B",branchPriority:"main",branchLabel:"主展開",branchContributions:[{branchId:"B",branchLabel:"主展開",branchPriority:"main",requiredFirstNumber:3,probability:p,decisionRatios:{first:.95,second:.91,third:thirdRatio}}],lifecycle:{generated:true,terminalDeleted:false}});
const terminals=[mk(1,.25,.88),mk(2,.24,.86),mk(4,.23,.84)];
const scored=[1,2,3,4,5,6,7].map(n=>({number:n,roleScores:{first:n===3?8:6,second:n===7?8:6,third:6}}));
const branches=[{id:"B",label:"主展開",priority:"main",requiredFirstNumber:3,score:9}];
const out=applyChatSpecV1({terminals,branches,scored,lines:[],oddsByOrder:new Map()});
const row=out.audit.thirdPurchaseBridgeAudit.rows.find(r=>r.first===3&&r.second===7);
assert.ok(row);
assert.equal(row.selectionMode,"THIRD_NEAR_TIE_BREADTH");
assert.equal(row.selectedCount,3,"near-tied natural THIRD candidates should remain together");
for(const n of [1,2,4]){
  const t=out.terminals.find(x=>Number(x.order?.[2])===n);
  assert.equal(t.thirdPurchaseBridgeStatus,"SELECTED_FOR_CLASSIFICATION");
}
console.log('PASS third near-tie breadth',row.selectedCount,row.selectionMode);
