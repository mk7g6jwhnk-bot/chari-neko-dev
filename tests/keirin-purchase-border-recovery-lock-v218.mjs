import assert from "node:assert/strict";
import {classify,purchaseDiagnostics,allocate} from "../keirin/engine/purchase.mjs";
function terminal(first,idx,probability,{thirdRatio=.90,branchRatio=.90,secondRatio=.90}={}){const second=((first+idx)%7)+1;let third=((first+idx+2)%7)+1;if(third===first||third===second)third=((third+2)%7)+1;const id=`B-${first}-${idx}`;return {order:[first,second,third],probability,relativeConditionPenalty:.97,relativeConditionTrace:[{stage:"BRANCH",ratio:branchRatio,count:branchRatio<1?1:0,factor:.99,penalty:.01},{stage:"FIRST",ratio:1,count:0,factor:1,penalty:0},{stage:"SECOND",ratio:secondRatio,count:secondRatio<1?1:0,factor:.99,penalty:.01},{stage:"THIRD",ratio:thirdRatio,count:thirdRatio<1?1:0,factor:.99,penalty:.01}],branchContributions:[{branchId:id,branchLabel:id,branchPriority:"main",probability,requiredFirstNumber:first,decisionRatios:{first:.96,second:.93,third:.93},positionScores:{},positionEvidence:{}}]};}
const terminals=[];for(let first=1;first<=6;first++){for(let idx=0;idx<10;idx++){if(first===1)terminals.push(terminal(first,idx,idx===0?.0195:.0183,{thirdRatio:idx===0?.90:.48,branchRatio:idx===0?.90:.65,secondRatio:idx===0?.90:.65}));else if(first===2&&idx===1)terminals.push(terminal(first,idx,.0184,{thirdRatio:.59,branchRatio:.61,secondRatio:.59}));else terminals.push(terminal(first,idx,idx===0?.019:.0181,{thirdRatio:idx===0?.90:.48,branchRatio:idx===0?.90:.65,secondRatio:idx===0?.90:.65}));}}
const classified=classify(terminals,{});
const flow=classified[0]?.purchaseBorderMetrics?.purchaseFlowAudit;
assert.ok(flow?.skipLinkedActive);
assert.equal(flow.firstPassPurchased,7);
assert.equal(flow.tightenedPurchased,6);
assert.equal(flow.secondRecoveryApplied,false);
assert.equal(flow.secondRecoveryAdded,0);
assert.equal(flow.finalPurchased,6);
assert.equal(flow.recoveryLockReason,"SKIP_LINKED_BORDER_AUTHORITATIVE");
const plan=allocate(classified,1000);
const audit=purchaseDiagnostics(classified,plan,1000).purchaseBorderAudit;
assert.deepEqual(audit.flowAudit,flow);
assert.equal(audit.policy,"COMPOSITE_RELATIVE_PLUS_RACE_CONCENTRATION_PLUS_SKIP_LINKED_RECOVERY_LOCK_V4");
console.log("Keirin v218 recovery lock passed: 7 -> 6 -> no second recovery -> 6");
