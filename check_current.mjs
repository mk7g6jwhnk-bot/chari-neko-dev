import {scoreKeirinParticipants} from './keirin/sports/keirin-scoring.mjs';
import {buildLines} from './keirin/sports/keirin-lines.mjs';
import {buildKeirinInitiativeAssessment} from './keirin/sports/keirin-initiative.mjs';
const mk=(n,score,first)=>({id:String(n),number:n,officialScore:score,role:'自力',lineId:'L'+n,lineOrder:1,recentForm:first,startPower:first,sprintPower:first,finishPower:first,trackingSkill:first,stamina:first,attackTiming:first,lineTrust:first,venueSuitability:first,startPowerEvidence:{usable:true,officialTotalStarts:100,bPercentileScore:5,hPercentileScore:5,rawBackCount:50,rawHomeCount:50,startsQuality:.8}});
const race={participants:[mk(1,120,5),mk(2,100,8),mk(3,100,8),mk(4,100,8),mk(5,100,8),mk(6,100,8),mk(7,100,8)]};
const s=scoreKeirinParticipants({race}); console.log('scores',s.map(x=>({n:x.number,off:x.officialScore,first:x.roleScores.first})));
const lines=buildLines(s); const a=buildKeirinInitiativeAssessment({scored:s,lines}); console.log('initiative',a.candidates.map(x=>({n:x.riderNumber,off:x.evidence.officialScore,s:x.score,rank:x.rank})));
