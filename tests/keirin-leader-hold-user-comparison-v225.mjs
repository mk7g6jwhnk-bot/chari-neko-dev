import assert from 'node:assert/strict';
import {buildPredictionExplanation} from '../keirin/engine/prediction-explanation.mjs';
import fs from 'node:fs';

const scored=[
  rider(2,'二番',6.33,6.03,7.30,7.64,5.54),
  rider(3,'三番',6.37,6.18,8.57,5.89,4.13)
];
const lines=[{id:'A',type:'ライン',leader:scored[0],members:[scored[0]]},{id:'B',type:'ライン',leader:scored[1],members:[scored[1]]}];
const b2=branch(2,'A',6.48,[part('escapeMechanism',6.03,.43,2.5929),part('firstPlacement',6.33,.22,1.3926),part('startPower',7.30,.20,1.46),part('recentForm',7.64,.10,.764),part('finishPower',5.54,.05,.277)],'CENTER','main');
const b3=branch(3,'B',6.20,[part('escapeMechanism',6.18,.43,2.40),part('firstPlacement',6.37,.22,1.30),part('startPower',8.57,.20,1.50),part('recentForm',5.89,.10,.60),part('finishPower',4.13,.05,.40)],'SECONDARY','contender');
const terminals=[term([2,1,3],'LEAD-A',.02),term([3,2,1],'LEAD-B',.01)];
const ex=buildPredictionExplanation({scored,lines,branches:[b2,b3],terminals});
const u=ex.leaderHoldComparison.userFacingComparison;
assert.equal(u.mode,'HEAD_TO_HEAD');
assert.equal(u.axisNumber,2);
assert.equal(u.rivalNumber,3);
assert.match(u.headline,/2番 vs 3番/);
assert.match(u.summary,/3番が優勢だった項目/);
assert.match(u.summary,/2番が優勢だった項目/);
assert.match(u.summary,/重み付け後の先行押し切り枝score/);
assert.ok(u.axisAdvantages.some(x=>x.label==='直近状態'));
assert.ok(u.rivalAdvantages.some(x=>x.label==='主導権獲得力'));
assert.ok(u.scoreDelta>0);
const app=fs.readFileSync(new URL('../public/app.mjs',import.meta.url),'utf8');
assert.match(app,/軸側が上回った項目/);
assert.match(app,/比較側が上回った項目/);
assert.match(app,/結果・オッズ・購入結果は使っていません/);
console.log('v225 leader-hold user-facing comparison PASS');

function rider(number,name,first,escape,start,recent,finish){return{number,name,role:'自力',roleScores:{first},riderEvaluationV2:{firstMechanisms:{escape}},evidence:{start,recent,finish}}}
function part(key,value,effectiveWeight,contribution){return{key,value,weight:effectiveWeight,effectiveWeight,contribution,available:true}}
function branch(n,lineId,score,scoreTrace,forecastRole,priority){return{id:`LEAD-${lineId}`,label:`${lineId}先行押し切り`,scenario:'先行押し切り',branchType:'LEADER_HOLD',primaryLineId:lineId,requiredFirstNumber:n,score,scoreTrace,forecastRole,priority}}
function term(order,branchId,probability){return{order,probability,branchContributions:[{branchId,probability,nodeTrace:[]}]}}
