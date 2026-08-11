import assert from "node:assert/strict";
import {buildPredictionExplanation} from "../keirin/engine/prediction-explanation.mjs";
import fs from "node:fs";

const rider=(number,name,first,escape,start,recent,finish)=>({number,name,roleScores:{first},riderEvaluationV2:{firstMechanisms:{escape}},evidence:{start,recent,finish}});
const scored=[
  rider(1,"番手一郎",6.8,4.0,4.5,6.4,6.6),
  rider(2,"先行二郎",6.5,6.0,7.3,7.6,5.8),
  rider(3,"先行三郎",6.1,6.2,8.6,5.9,4.2),
  rider(4,"番手四郎",5.9,4.0,4.5,5.0,5.1)
];
const lines=[
  {id:"A",type:"ライン",leader:{number:2},bante:{number:1},members:[{number:2,role:"先頭"},{number:1,role:"番手"}]},
  {id:"B",type:"ライン",leader:{number:3},bante:{number:4},members:[{number:3,role:"先頭"},{number:4,role:"番手"}]}
];
const trace=(first,escape,start,recent,finish)=>[
  {key:"firstPlacement",value:first,effectiveWeight:.22,contribution:first*.22},
  {key:"escapeMechanism",value:escape,effectiveWeight:.43,contribution:escape*.43},
  {key:"startPower",value:start,effectiveWeight:.20,contribution:start*.20},
  {key:"recentForm",value:recent,effectiveWeight:.10,contribution:recent*.10},
  {key:"finishPower",value:finish,effectiveWeight:.05,contribution:finish*.05}
];
const branches=[
 {id:"LEAD-A",label:"A先行押し切り",branchType:"LEADER_HOLD",primaryLineId:"A",requiredFirstNumber:2,score:6.48,scoreTrace:trace(6.5,6.0,7.3,7.6,5.8),forecastRole:"CENTER_SIBLING",priority:"main"},
 {id:"BANTE-A",label:"A番手差し",branchType:"BANTE_SASHI",primaryLineId:"A",requiredFirstNumber:1,score:6.70,scoreTrace:[{key:"banteSashiMechanism",value:6.8}],forecastRole:"CENTER",priority:"main"},
 {id:"LEAD-B",label:"B先行押し切り",branchType:"LEADER_HOLD",primaryLineId:"B",requiredFirstNumber:3,score:6.20,scoreTrace:trace(6.1,6.2,8.6,5.9,4.2),forecastRole:"SECONDARY",priority:"sub"}
];
const terminals=[
 {order:[1,2,4],probability:.2,branchContributions:[{branchId:"BANTE-A",probability:.12,nodeTrace:[]}]},
 {order:[2,1,4],probability:.1,branchContributions:[{branchId:"LEAD-A",probability:.08,nodeTrace:[]}]},
 {order:[3,4,1],probability:.08,branchContributions:[{branchId:"LEAD-B",probability:.05,nodeTrace:[]}]}
];
const exp=buildPredictionExplanation({scored,lines,branches,terminals});
assert.equal(exp.axis.branchType,"BANTE_SASHI");
assert.equal(exp.leaderHoldComparison.axisNumber,2,"bante axis must map to its line leader for LEADER_HOLD comparison");
assert.equal(exp.leaderHoldComparison.mappedFromBanteSashi,true);
assert.equal(exp.leaderHoldComparison.userFacingComparison.mode,"HEAD_TO_HEAD");
assert.match(exp.leaderHoldComparison.userFacingComparison.headline,/2番 vs 3番/);
const app=fs.readFileSync(new URL("../public/app.mjs",import.meta.url),"utf8");
assert.match(app,/\["LEADER_HOLD","BANTE_SASHI"\]\.includes\(axis\?\.branchType\)/,"UI must render comparison for bante-sashi axis too");
console.log("PASS v226 bante-sashi axis maps to leader comparison and UI renders it");
