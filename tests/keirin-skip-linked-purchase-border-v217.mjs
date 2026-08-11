import assert from "node:assert/strict";
import {classify} from "../keirin/engine/purchase.mjs";

function terminal(first,idx,probability,{thirdRatio=.90,branchRatio=.90,secondRatio=.90}={}){
  const second=((first+idx)%7)+1;
  let third=((first+idx+2)%7)+1;
  if(third===first||third===second)third=((third+2)%7)+1;
  const id=`B-${first}-${idx}`;
  return {
    order:[first,second,third],probability,relativeConditionPenalty:.97,
    relativeConditionTrace:[
      {stage:"BRANCH",ratio:branchRatio,count:branchRatio<1?1:0,factor:.99,penalty:.01},
      {stage:"FIRST",ratio:1,count:0,factor:1,penalty:0},
      {stage:"SECOND",ratio:secondRatio,count:secondRatio<1?1:0,factor:.99,penalty:.01},
      {stage:"THIRD",ratio:thirdRatio,count:thirdRatio<1?1:0,factor:.99,penalty:.01}
    ],
    branchContributions:[{
      branchId:id,branchLabel:id,branchPriority:"main",probability,
      requiredFirstNumber:first,decisionRatios:{first:.96,second:.93,third:.93},positionScores:{},positionEvidence:{}
    }]
  };
}

const terminals=[];
for(let first=1;first<=6;first++){
  // Each head has similar total mass, keeping top-head concentration below 20%.
  // Head 1: only the anchor should survive first pass, making initial top-head coverage <12%.
  for(let idx=0;idx<10;idx++){
    if(first===1){
      terminals.push(terminal(first,idx,idx===0?.0195:.0183,{thirdRatio:idx===0?.90:.48,branchRatio:idx===0?.90:.65,secondRatio:idx===0?.90:.65}));
    }else if(first===2&&idx===1){
      // Marginal derivative: passes v216 adaptive floor, but should fail the extra v217 skip-linked tightening.
      terminals.push(terminal(first,idx,.0184,{thirdRatio:.59,branchRatio:.61,secondRatio:.59}));
    }else{
      terminals.push(terminal(first,idx,idx===0?.019:.0181,{thirdRatio:idx===0?.90:.48,branchRatio:idx===0?.90:.65,secondRatio:idx===0?.90:.65}));
    }
  }
}

const classified=classify(terminals,{});
const active=classified.filter(x=>x.purchaseBorderMetrics?.skipLinkedActive);
assert.ok(active.length>0,"skip-linked second pass should activate");
const sample=active[0].purchaseBorderMetrics;
assert.ok(sample.skipLinkedTopBranchShare<.12);
assert.ok(sample.skipLinkedTopFamilyShare<.20);
assert.ok(sample.skipLinkedTopFamilyCoverage<.12);

const adopted=classified.filter(x=>x.purchaseStatus==="購入採用");
assert.ok(adopted.length>=6,"one structurally strongest terminal per head should remain available; v216 anchor behavior is covered separately");

const rejected=classified.filter(x=>(x.purchaseBorderFailures||[]).some(code=>code.startsWith("SKIP_LINKED_")));
assert.ok(rejected.length>0,"marginal derivatives should be rejected by skip-linked border");
assert.ok(rejected.every(x=>x.purchaseStatus==="購入不採用"));
console.log(`Keirin v217 skip-linked border passed: active / adopted ${adopted.length} kept / skip-linked rejects ${rejected.length}`);
