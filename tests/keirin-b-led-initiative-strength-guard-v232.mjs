import assert from 'node:assert/strict';
import {buildKeirinInitiativeAssessment} from '../keirin/sports/keirin-initiative.mjs';

const make=(number,officialScore,b,h,starts,bScore,hScore,lineId)=>({
  id:String(number),number,name:`選手${number}`,officialScore,lineId,role:'自力',
  startPowerEvidence:{usable:true,confidence:'high',officialTotalStarts:starts,rawBackCount:b,rawHomeCount:h,
    bFrequency:b/starts,hFrequency:h/starts,shrunkBFrequency:b/starts,shrunkHFrequency:h/starts,
    bPercentileScore:bScore,hPercentileScore:hScore,startsQuality:starts/(starts+15)}
});
const r6=make(6,77.68,7,9,17,8.27,9.01,'L6');
const r7=make(7,86.08,10,8,24,8.52,8.06,'L7');
const b6={id:'2',number:2,name:'番手2'};
const b7={id:'3',number:3,name:'番手3'};
const t7={id:'5',number:5,name:'三番手5'};
const lines=[
  {id:'L6',type:'ライン',leader:r6,bante:b6,members:[r6,b6]},
  {id:'L7',type:'ライン',leader:r7,bante:b7,members:[r7,b7,t7]}
];
const out=buildKeirinInitiativeAssessment({scored:[r6,r7,b6,b7,t7],lines,raceCategory:'standard'});
assert.equal(out.top.riderNumber,7,'H率だけで6を7より上にしてはいけない');
const c6=out.candidates.find(x=>x.riderNumber===6);
const c7=out.candidates.find(x=>x.riderNumber===7);
assert.ok(c7.score>c6.score,`7 should lead: ${c7.score} > ${c6.score}`);
assert.equal(c6.scoreTrace.find(x=>x.key==='backFrequency').weight,.55);
assert.equal(c6.scoreTrace.find(x=>x.key==='homeFrequency').weight,.10);
assert.ok(c7.evidence.strengthScore>5 && c6.evidence.strengthScore<5,'8.4点差は上限付き実力差補正として効く');
assert.ok(out.excludedInputs.includes('recentForm'));
assert.ok(out.excludedInputs.includes('escapeMechanism'));
console.log('keirin-b-led-initiative-strength-guard-v232 PASS', {six:c6.score.toFixed(3),seven:c7.score.toFixed(3)});
