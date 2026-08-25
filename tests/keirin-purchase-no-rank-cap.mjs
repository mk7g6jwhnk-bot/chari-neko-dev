import assert from "node:assert/strict";
import {classify} from "../keirin/engine/purchase.mjs";
import {generateKeirinTerminals} from "../keirin/sports/keirin-terminals.mjs";

function terminals(probabilities){return probabilities.map((probability,index)=>({
  order:[1,index+2,index+8],
  probability,
  branchContributions:[{
    branchId:"B1",branchLabel:"仮説枝",branchPriority:"hypothesis",probability,
    requiredFirstNumber:1,decisionRatios:{first:.95,second:.93,third:.92},
    positionScores:{first:8.2,second:8.0,third:7.8},positionEvidence:{}
  }]
}));}

const cases=[
  {name:"strong",probabilities:[.50,.18,.12,.10,.06,.04],expected:1},
  {name:"medium",probabilities:[.30,.29,.28,.06,.04,.03],expected:3},
  {name:"multiple",probabilities:[.20,.195,.19,.185,.18,.05],expected:5},
  {name:"diffuse",probabilities:[.20,.195,.19,.185,.18,.175],expected:0}
];
const counts=[];
for(const testCase of cases){
  const classified=classify(terminals(testCase.probabilities),{});
  const adopted=classified.filter(item=>item.purchaseStatus==="購入採用");
  assert.equal(adopted.length,testCase.expected,`${testCase.name} distribution boundary mismatch`);
  counts.push(adopted.length);
}
const many=classify(terminals(cases[2].probabilities),{}).filter(item=>item.purchaseStatus==="購入採用");
assert.ok(many.some(item=>item.branchRank>=4),"自然競合している枝内4位以下が固定順位上限で落とされている");
const withoutOdds=classify(terminals(cases[1].probabilities),{}).map(item=>[item.order.join("-"),item.purchaseStatus]);
const odds=Object.fromEntries(terminals(cases[1].probabilities).map((item,index)=>[item.order.join("-"),10+index*100]));
const withOdds=classify(terminals(cases[1].probabilities),odds).map(item=>[item.order.join("-"),item.purchaseStatus]);
assert.deepEqual(withOdds,withoutOdds,"odds changed prediction ranking or purchase adoption");

const rider=(number,roleScores,role,lineId)=>({id:String(number),number,roleScores,role,lineId,evidence:{recent:6,start:6,sprint:6,finish:6,tracking:6,stamina:6,timing:6,lineTrust:6}});
const scored=[rider(1,{first:9,second:2,third:2},"自力","A"),rider(2,{first:2,second:9,third:2},"番手","A"),rider(3,{first:2,second:2,third:9},"単騎","B")];
const branches=[
  {id:"LEAD",label:"主導権",branchType:"LEADER_HOLD",primaryLineId:"A",score:1,probability:1/3,firstCandidates:["1","2","3"]},
  {id:"BANTE",label:"番手差し",branchType:"BANTE_SASHI",primaryLineId:"A",score:1,probability:1/3,firstCandidates:["1","2","3"]},
  {id:"SOLO",label:"単騎浮上",branchType:"SOLO_RISE",primaryLineId:"B",score:1,probability:1/3,firstCandidates:["1","2","3"]}
];
const generated=generateKeirinTerminals({scored,branches});
const naturalOrder=generated.find(item=>item.order.join("-")==="1-2-3");
const reverseOrder=generated.find(item=>item.order.join("-")==="3-2-1");
assert.ok(naturalOrder.probability>reverseOrder.probability,"independent first/second/third ability did not affect terminal ranking");
const branchWeights=naturalOrder.branchContributions.map(item=>item.pathScore);
assert.equal(new Set(branchWeights.map(value=>value.toFixed(12))).size,1,"initiative/bante/solo template changed identical terminal position score");
console.log(`Keirin natural distribution selection passed: ${counts.join(" -> ")}`);
