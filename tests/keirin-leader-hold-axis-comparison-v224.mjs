import assert from 'node:assert/strict';
import {buildPredictionExplanation} from '../keirin/engine/prediction-explanation.mjs';

const scored=[
  rider(2,'二番',6.33,6.03,7.30,7.64,5.54),
  rider(3,'三番',6.37,6.18,8.57,5.89,4.13)
];
const lines=[{id:'A',type:'ライン',leader:scored[0],bante:scored[1],members:[scored[0],scored[1]]}];
const branch={id:'LEAD-A',label:'A先行押し切り',scenario:'先行押し切り',branchType:'LEADER_HOLD',primaryLineId:'A',requiredFirstNumber:2,score:6.48,priority:'main',forecastRole:'CENTER',scoreTrace:[
  part('escapeMechanism',6.03,.43,2.5929),part('firstPlacement',6.33,.22,1.3926),part('startPower',7.30,.20,1.46),part('recentForm',7.64,.10,.764),part('finishPower',5.54,.05,.277)
]};
const terminals=[{order:[2,3,1],probability:.02,branchContributions:[{branchId:'LEAD-A',probability:.02,nodeTrace:[]}]}];
const ex=buildPredictionExplanation({scored,lines,branches:[branch],terminals});
assert.equal(ex.axis.branchId,'LEAD-A');
const audit=ex.leaderHoldComparison;
assert.equal(audit.axisNumber,2);
const r2=audit.rows.find(x=>x.number===2),r3=audit.rows.find(x=>x.number===3);
assert.equal(r2.branchGenerated,true);
assert.equal(r3.branchGenerated,false);
assert.equal(r3.exclusionReason,'NOT_OFFICIAL_LINE_LEADER');
assert.equal(audit.audit.lineLeaderRestrictionVisible,true);

// If both are official line leaders, compare exact branch-score contributions.
const lines2=[{id:'A',type:'ライン',leader:scored[0],members:[scored[0]]},{id:'B',type:'ライン',leader:scored[1],members:[scored[1]]}];
const branch3={id:'LEAD-B',label:'B先行押し切り',scenario:'先行押し切り',branchType:'LEADER_HOLD',primaryLineId:'B',requiredFirstNumber:3,score:6.20,priority:'contender',forecastRole:'SECONDARY',scoreTrace:[
  part('escapeMechanism',6.18,.43,2.40),part('firstPlacement',6.37,.22,1.30),part('startPower',8.57,.20,1.50),part('recentForm',5.89,.10,.60),part('finishPower',4.13,.05,.40)
]};
const ex2=buildPredictionExplanation({scored,lines:lines2,branches:[branch,branch3],terminals:[...terminals,{order:[3,2,1],probability:.01,branchContributions:[{branchId:'LEAD-B',probability:.01,nodeTrace:[]}]}]});
assert.equal(ex2.leaderHoldComparison.rows.filter(x=>x.branchGenerated).length,2);
assert.ok(ex2.leaderHoldComparison.decisiveFactors.length>=5);
console.log('v224 leader-hold axis comparison audit PASS');

function rider(number,name,first,escape,start,recent,finish){return{number,name,role:'自力',roleScores:{first},riderEvaluationV2:{firstMechanisms:{escape}},evidence:{start,recent,finish}}}
function part(key,value,effectiveWeight,contribution){return{key,value,weight:effectiveWeight,effectiveWeight,contribution,available:true}}
