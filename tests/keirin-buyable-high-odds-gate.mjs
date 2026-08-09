import assert from "node:assert/strict";
import {classify} from "../keirin/engine/purchase.mjs";

const terminal={
  order:[5,3,9],
  probability:.35,
  branchContributions:[{
    branchId:"ALT-A",
    branchLabel:"A先行押し切り",
    branchPriority:"contender",
    probability:.35,
    requiredFirstNumber:5,
    decisionRatios:{first:.97,second:.94,third:.93},
    positionScores:{},positionEvidence:{}
  }]
};
const companion={
  order:[7,9,3],
  probability:.30,
  branchContributions:[{
    branchId:"MAIN-C",
    branchLabel:"Cまくり",
    branchPriority:"main",
    probability:.30,
    requiredFirstNumber:7,
    decisionRatios:{first:.97,second:.94,third:.93},
    positionScores:{},positionEvidence:{}
  }]
};
const filler={
  order:[2,4,6],
  probability:.20,
  branchContributions:[{
    branchId:"SUB-B",
    branchLabel:"B先行押し切り",
    branchPriority:"sub",
    probability:.20,
    requiredFirstNumber:2,
    decisionRatios:{first:.90,second:.88,third:.87},
    positionScores:{},positionEvidence:{}
  }]
};

const noOdds=classify([terminal,companion,filler],{});
const altNoOdds=noOdds.find(x=>x.order.join("-")==="5-3-9");
assert.notEqual(altNoOdds.betClass,"BUYABLE_HIGH");
assert.equal(altNoOdds.highPayoutCandidate,true);
assert.equal(altNoOdds.oddsEvaluationStatus,"ODDS_PENDING");

const withOdds=classify([terminal,companion,filler],{"5-3-9":150});
const altWithOdds=withOdds.find(x=>x.order.join("-")==="5-3-9");
assert.equal(altWithOdds.betClass,"BUYABLE_HIGH");
assert.equal(altWithOdds.purchaseStatus,"購入採用");
assert.equal(altWithOdds.odds,150);
console.log("Keirin BUYABLE_HIGH odds gate passed");
