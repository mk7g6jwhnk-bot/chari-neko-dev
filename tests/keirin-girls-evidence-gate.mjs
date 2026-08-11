import assert from 'node:assert/strict';
import { applyKimariteAbilities } from '../keirin/kimarite/kimarite-abilities.mjs';
import { runKeirinEngine } from '../keirin/engine/keirin-engine.mjs';

const fallback=applyKimariteAbilities({
  number:1,
  raceCategory:'girls',
  officialKimariteEvidence:null,
  officialProfileEvidence:{
    identityPassed:true,
    winningStyleRates:{escape:10,makuri:55,difference:20,mark:15}
  }
});
assert.notEqual(fallback.sprintPower,5,'profile rates should move sprintPower when JSJ068 is unavailable');
assert.equal(fallback.kimariteAbilityEvidence.sourceType,'official-profile-winning-style-rates');

const participants=Array.from({length:7},(_,i)=>({
  id:String(i+1),number:i+1,name:`選手${i+1}`,role:'単騎',lineId:`girls-${i+1}`,lineOrder:1,
  recentForm:5+i*.2,startPower:5,startPowerEvidence:{value:5,missingInputs:['officialTotalStarts'],profileIdentityPassed:true},
  sprintPower:5,finishPower:5,trackingSkill:5,stamina:5,attackTiming:5,lineTrust:5,venueSuitability:5
}));
const prediction=runKeirinEngine({
  race:{id:'girls-evidence-missing',raceCategory:'girls',lineConfidence:'高',participants},
  oddsByOrder:{'1-2-3':20},budget:3000
});
assert.equal(prediction.noBet,true);
assert.equal(prediction.noBetReason,'GIRLS_LEAD_EVIDENCE_UNAVAILABLE');
assert.ok(prediction.purchasePlan.length>=1);assert.equal(prediction.audit.referencePlan,true);assert.equal(prediction.purchasePlan.every(x=>x.referenceOnly===true),true);
console.log('PASS girls profile-rate fallback and missing lead-evidence purchase gate');
