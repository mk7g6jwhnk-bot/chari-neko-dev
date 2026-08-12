import assert from 'node:assert/strict';
import {buildPredictionExplanation} from '../keirin/engine/prediction-explanation.mjs';
const scored=[2,3].map(number=>({number,name:String(number),roleScores:{first:6},riderEvaluationV2:{firstMechanisms:{escape:6}},evidence:{start:6,recent:6,finish:6}}));
const lines=[{id:'A',type:'ライン',leader:{number:2}},{id:'B',type:'ライン',leader:{number:3}}];
const branches=[
 {id:'BANTE-A',label:'A番手差し',branchType:'BANTE_SASHI',primaryLineId:'A',requiredFirstNumber:1,score:6.4,forecastRole:'CENTER',priority:'main'},
 {id:'LEAD-A',label:'A先行押し切り',branchType:'LEADER_HOLD',primaryLineId:'A',requiredFirstNumber:2,score:6.554,forecastRole:'CENTER_SIBLING',priority:'main',scoreTrace:[]},
 {id:'LEAD-B',label:'B先行押し切り',branchType:'LEADER_HOLD',primaryLineId:'B',requiredFirstNumber:3,score:6.578,forecastRole:'CENTER',priority:'main',scoreTrace:[]}
];
const terminals=[
 {order:[1,2,7],probability:.05,branchContributions:[{branchId:'BANTE-A',probability:.12}]},
 {order:[2,1,7],probability:.03,branchContributions:[{branchId:'LEAD-A',probability:.08}]},
 {order:[3,4,5],probability:.04,branchContributions:[{branchId:'LEAD-B',probability:.09}]}
];
const ex=buildPredictionExplanation({scored,lines,branches,terminals});
assert.equal(ex.axis.branchId,'BANTE-A');
assert.equal(ex.axisSelectionAudit.selectedBranchId,'BANTE-A');
assert.equal(ex.axisSelectionAudit.audit.passed,true);
assert.equal(ex.axisSelectionAudit.selectionDrivenByMass,true);
assert.ok(ex.leaderHoldComparison.userFacingComparison.summary.includes('主導権順位が取得できないため'));
console.log('PASS v227 axis selection trace uses mass before score and forbids false leader-score explanation');
