import assert from 'node:assert/strict';
import {buildPredictionExplanation} from '../keirin/engine/prediction-explanation.mjs';

const scored=[
  {number:1,name:'一番',roleScores:{first:7},evidence:{start:6,recent:7,finish:7},riderEvaluationV2:{firstMechanisms:{escape:6}}},
  {number:3,name:'三番',roleScores:{first:7},evidence:{start:8,recent:6,finish:6},riderEvaluationV2:{firstMechanisms:{escape:6}}}
];
const lines=[
  {id:'A',type:'ライン',leader:scored[0]},
  {id:'B',type:'ライン',leader:scored[1]}
];
const branches=[
  {id:'LEAD-A',label:'A先行押し切り',branchType:'LEADER_HOLD',primaryLineId:'A',requiredFirstNumber:1,score:6.45,forecastRole:'CENTER',priority:'main',initiativeRank:1,initiativeScore:8.2,initiativePrimaryLine:true,scoreTrace:[]},
  {id:'BANTE-A',label:'A番手差し',branchType:'BANTE_SASHI',primaryLineId:'A',requiredFirstNumber:2,score:6.7,forecastRole:'CENTER_SIBLING',priority:'main',initiativeRank:1,initiativeScore:8.2,initiativePrimaryLine:true,scoreTrace:[]},
  {id:'LEAD-B',label:'B先行押し切り',branchType:'LEADER_HOLD',primaryLineId:'B',requiredFirstNumber:3,score:6.8,forecastRole:'CENTER',priority:'contender',initiativeRank:2,initiativeScore:7.5,initiativePrimaryLine:false,scoreTrace:[]}
];
const terminals=[
  {order:[3,4,5],probability:.50,branchContributions:[{branchId:'LEAD-B',probability:.50,nodeTrace:[]}]},
  {order:[1,2,3],probability:.02,branchContributions:[{branchId:'LEAD-A',probability:.02,nodeTrace:[]}]},
  {order:[2,1,3],probability:.01,branchContributions:[{branchId:'BANTE-A',probability:.01,nodeTrace:[]}]}
];
const ex=buildPredictionExplanation({scored,lines,branches,terminals});
assert.equal(ex.axis.branchId,'LEAD-A','top initiative line must remain first even when rival line has larger terminal mass/score');
assert.equal(ex.axisSelectionAudit.selectionMode,'INITIATIVE_LINE_FIRST');
assert.deepEqual(ex.axisSelectionAudit.topInitiativeLineIds,['A']);
assert.equal(ex.axisSelectionAudit.selectionDrivenByInitiativeLine,true);
assert.equal(ex.axisSelectionAudit.highestMassBranchId,'LEAD-B');
assert.equal(ex.axisSelectionAudit.highestScoreBranchId,'LEAD-B');
assert.match(ex.leaderHoldComparison.userFacingComparison.summary,/主導権評価/);
assert.doesNotMatch(ex.leaderHoldComparison.userFacingComparison.summary,/終端確率質量を先に比較します/);
console.log('v238 initiative-first axis selection PASS');
