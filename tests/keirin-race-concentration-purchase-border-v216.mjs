import assert from "node:assert/strict";
import {classify} from "../keirin/engine/purchase.mjs";

function terminal(first,second,third,probability,{branchRatio=.52,thirdRatio=.60}={}){
  const id=`B-${first}-${second}-${third}`;
  return {
    order:[first,second,third],probability,relativeConditionPenalty:.94,
    relativeConditionTrace:[
      {stage:"BRANCH",ratio:branchRatio,count:branchRatio<1?1:0,factor:.99,penalty:.01},
      {stage:"FIRST",ratio:1,count:0,factor:1,penalty:0},
      {stage:"SECOND",ratio:.60,count:1,factor:.99,penalty:.01},
      {stage:"THIRD",ratio:thirdRatio,count:1,factor:.99,penalty:.01}
    ],
    branchContributions:[{
      branchId:id,branchLabel:id,branchPriority:"main",probability,
      requiredFirstNumber:first,decisionRatios:{first:.95,second:.92,third:.92},positionScores:{},positionEvidence:{}
    }]
  };
}

const terminals=[];
for(let first=1;first<=6;first++){
  const second=first===6?1:first+1;
  const third=second===6?1:second+1;
  const alt=third===6?1:third+1;
  terminals.push(terminal(first,second,third,.10,{branchRatio:.60,thirdRatio:.62}));
  terminals.push(terminal(first,second,alt,.09,{branchRatio:.52,thirdRatio:.55}));
}
const classified=classify(terminals,{});
const anchor=classified.find(x=>x.order.join("-")==="1-2-3");
const sibling=classified.find(x=>x.order.join("-")==="1-2-4");
assert.ok(anchor&&sibling);
assert.ok(["MEDIUM_DISPERSION","HIGH_DISPERSION"].includes(anchor.purchaseBorderMetrics.raceDispersionRegime));
assert.ok(anchor.purchaseBorderMetrics.raceDispersionSeverity>=.20);
assert.equal(anchor.purchaseBorderMetrics.raceConcentrationAnchor,true);
assert.equal(anchor.purchaseBorderEligible,true,"family anchor must survive race-dispersion tightening when it passes v215 local border");
assert.equal(sibling.purchaseBorderMetrics.raceConcentrationAnchor,false);
assert.equal(sibling.purchaseBorderEligible,false,"non-anchor marginal sibling should be rejected in a highly dispersed race");
assert.ok(sibling.purchaseBorderFailures.some(x=>x.startsWith("RACE_DISPERSION_")));
assert.equal(sibling.purchaseStatus,"購入不採用");
console.log("Keirin v216 race concentration border passed: anchor kept / marginal sibling rejected under high dispersion");
