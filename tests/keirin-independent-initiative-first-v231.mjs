import assert from 'node:assert/strict';
import {buildKeirinInitiativeAssessment} from '../keirin/sports/keirin-initiative.mjs';
import {generateKeirinBranches} from '../keirin/sports/keirin-branches.mjs';

const rider=(number,lineId,start,recent,first,escape)=>({
  id:`R${number}`,number,name:`選手${number}`,lineId,role:'自力',
  evidence:{start,recent,finish:number===2?9:4,sprint:5,tracking:5,stamina:5,timing:5},
  startPower:start,
  startPowerEvidence:{usable:true,officialTotalStarts:20,rawBackCount:number===3?10:2,rawHomeCount:number===3?8:2,bFrequency:number===3?.5:.1,hFrequency:number===3?.4:.1,bPercentileScore:start,hPercentileScore:start,escapeRate:number===3?.3:0,confidence:'high'},
  roleScores:{first,second:5,third:5},
  riderEvaluationV2:{firstMechanisms:{escape,makuri:5,banteSashi:5}}
});
const r2=rider(2,'L2',5.8,9.5,9.2,9.0);
const r3=rider(3,'L3',9.1,3.0,4.5,4.2);
const b2={id:'B2',number:1,name:'番手1',lineId:'L2',role:'番手',evidence:{finish:8,tracking:8,recent:8},roleScores:{first:8,second:8,third:7},riderEvaluationV2:{firstMechanisms:{banteSashi:8}}};
const b3={id:'B3',number:4,name:'番手4',lineId:'L3',role:'番手',evidence:{finish:5,tracking:5,recent:5},roleScores:{first:5,second:5,third:5},riderEvaluationV2:{firstMechanisms:{banteSashi:5}}};
const scored=[r2,r3,b2,b3];
const lines=[{id:'L2',type:'ライン',leader:r2,bante:b2},{id:'L3',type:'ライン',leader:r3,bante:b3}];
const a=buildKeirinInitiativeAssessment({scored,lines,raceCategory:'standard'});
assert.equal(a.top.riderNumber,3,'主導権はB/H系直接証拠が上の3を選ぶ');
assert.ok(Math.abs(a.probabilitySum-1)<1e-9);
assert.ok(a.excludedInputs.includes('roleScores.first'));
assert.ok(a.excludedInputs.includes('recentForm'));
const branches=generateKeirinBranches({scored,lines,lineConfidence:'高',raceCategory:'standard',initiativeAssessment:a});
const main=branches.filter(b=>b.priority==='main');
assert.equal(main.length,1);
assert.equal(main[0].primaryLineId,'L3','1着評価/直近が2優勢でも主展開ラインは主導権1位の3ライン');
assert.equal(main[0].initiativePrimaryLine,true);
const sibling=branches.find(b=>b.primaryLineId==='L3'&&b.sameScenarioMainSibling);
assert.ok(sibling,'主導権1位ラインの先行残り/番手差しは同一主展開として接続');
console.log('keirin-independent-initiative-first-v231 PASS');
