import assert from 'node:assert/strict';
import {scoreKeirinParticipants} from '../keirin/sports/keirin-scoring.mjs';
import {applyKimariteAbilities} from '../keirin/kimarite/kimarite-abilities.mjs';

const missing=applyKimariteAbilities({number:1,raceCategory:'standard',officialKimariteEvidence:null,officialProfileEvidence:null});
assert.equal(missing.sprintPower,null);
assert.equal(missing.finishPower,null);
assert.equal(missing.trackingSkill,null);

const base={id:'1',number:1,role:'三番手',recentForm:7,startPower:5,stamina:5,attackTiming:5,lineTrust:5,venueSuitability:5,sprintPower:null,finishPower:null,trackingSkill:null};
const scored=scoreKeirinParticipants({race:{participants:[base]}})[0];
assert.ok(scored.roleScores.third>5,'missing kimarite inputs must not drag a strong recent/third-role rider to neutral');
assert.equal(scored.abilityMissingAudit.missingCount,3);
assert.equal(scored.scoreTrace.third.filter(x=>x.missing).length,3);
assert.ok(scored.scoreTrace.third.find(x=>x.key==='recentForm').effectiveWeight>0.2,'remaining verified weights must be renormalized upward');
console.log('PASS missing ability renormalization',scored.roleScores.third.toFixed(3));
