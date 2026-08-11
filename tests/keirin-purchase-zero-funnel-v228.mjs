import assert from "node:assert/strict";
import fs from "node:fs";
import {classify,allocate,purchaseDiagnostics} from "../keirin/engine/purchase.mjs";

function terminal(first,idx,probability){
  const second=((first+idx)%7)+1;
  let third=((first+idx+2)%7)+1;
  if(third===first||third===second)third=((third+2)%7)+1;
  const id=`ZERO-${first}-${idx}`;
  return {order:[first,second,third],probability,relativeConditionPenalty:.97,
    relativeConditionTrace:[
      {stage:"BRANCH",ratio:.25,count:1,factor:.99,penalty:.01},
      {stage:"FIRST",ratio:1,count:0,factor:1,penalty:0},
      {stage:"SECOND",ratio:.25,count:1,factor:.99,penalty:.01},
      {stage:"THIRD",ratio:.25,count:1,factor:.99,penalty:.01}],
    branchContributions:[{branchId:id,branchLabel:id,branchPriority:"main",probability,requiredFirstNumber:first,decisionRatios:{first:.96,second:.93,third:.93},positionScores:{},positionEvidence:{}}]};
}
const terminals=[];
for(let first=1;first<=6;first++)for(let idx=0;idx<6;idx++)terminals.push(terminal(first,idx,.01+(first===1&&idx===0?.001:0)));
const classified=classify(terminals,{});
const flow=classified[0]?.purchaseBorderMetrics?.purchaseFlowAudit;
assert.equal(flow?.policy,"PURCHASE_ZERO_FUNNEL_AUDIT_V228");
assert.equal(flow.terminalCount,36);
assert.equal(flow.baseBorderEligibleCount,0);
assert.equal(flow.finalPurchased,0);
assert.equal(flow.directReason,"COMPOSITE_BORDER_ZERO");
assert.ok(flow.baseTopFailures.some(row=>row.code==="BRANCH_RELATIVE"));
const audit=purchaseDiagnostics(classified,allocate(classified,1000),1000).purchaseBorderAudit;
assert.deepEqual(audit.flowAudit,flow);
const ui=fs.readFileSync(new URL("../public/app.mjs",import.meta.url),"utf8");
assert.match(ui,/標準0点の直接理由/);
assert.match(ui,/複合購入ボーダーの時点で通過0件/);
console.log("Keirin v228 purchase zero funnel audit passed");
