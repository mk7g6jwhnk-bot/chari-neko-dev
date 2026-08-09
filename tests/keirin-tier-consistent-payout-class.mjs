import assert from "node:assert/strict";
import {classify} from "../keirin/engine/purchase.mjs";

function terminal(order,probability,branchId,branchLabel,branchPriority){
  return {order,probability,branchContributions:[{
    branchId,branchLabel,branchPriority,probability,requiredFirstNumber:order[0],
    decisionRatios:{first:.98,second:.96,third:.95},positionScores:{},positionEvidence:{}
  }]};
}

const main=terminal([1,2,3],.40,"MAIN-A","A先行押し切り","main");
const contender=terminal([4,5,6],.35,"CONT-B","Bまくり","contender");
const sub=terminal([7,8,9],.25,"SUB-C","Cまくり","sub");

const withOdds=classify([main,contender,sub],{"1-2-3":150,"4-5-6":180,"7-8-9":220});
const byOrder=Object.fromEntries(withOdds.map(item=>[item.order.join("-"),item]));
assert.equal(byOrder["1-2-3"].betClass,"MAIN");
assert.equal(byOrder["1-2-3"].highPayoutAttributeLabel,"本線高配当");
assert.equal(byOrder["4-5-6"].betClass,"COVER");
assert.equal(byOrder["4-5-6"].highPayoutAttributeLabel,"有力展開高配当");
assert.equal(byOrder["7-8-9"].betClass,"BUYABLE_HIGH");
assert.equal(byOrder["7-8-9"].highPayoutCandidate,true);

const noOdds=classify([main,contender,sub],{});
const subNoOdds=noOdds.find(item=>item.order.join("-")==="7-8-9");
assert.equal(subNoOdds.betClass,"NONE");
assert.equal(subNoOdds.purchaseStatus,"購入不採用");
assert.equal(subNoOdds.purchaseRejectCode,"SUB_ODDS_PENDING");
assert.equal(subNoOdds.oddsEvaluationStatus,"ODDS_PENDING");
console.log("Keirin tier-consistent payout classification passed");
