import assert from 'node:assert/strict';
import { hydrateParticipantEvidence, adaptParticipantsForPrediction } from '../netlify/functions/keirin-predict.mjs';

const context={raceDate:'20260808',raceStartTime:'21:00',venueCode:'24',raceNo:2,raceCategory:'standard'};
const participants=[
  {number:1,registration:'015001',name:'A',identityPassed:true,targetIdentityPassed:true},
  {number:2,registration:'015002',name:'B',identityPassed:true,targetIdentityPassed:true},
  {number:3,registration:'015003',name:'C',identityPassed:true,targetIdentityPassed:true},
  {number:4,registration:'015004',name:'D',identityPassed:true,targetIdentityPassed:true},
  {number:5,registration:'015005',name:'E',identityPassed:true,targetIdentityPassed:true},
  {number:6,registration:'015006',name:'F',identityPassed:true,targetIdentityPassed:true},
  {number:7,registration:'015007',name:'G',identityPassed:true,targetIdentityPassed:true}
];
const profiles=Object.fromEntries(participants.map((p,i)=>[p.registration,{
  data:{registration:p.registration,fetchedAt:'2026-08-08T10:30:00Z',sourceType:'official-profile',recent4MonthScore:90+i*2,currentScore:91+i*2,officialTotalStarts:20+i,backCount:i,homeCount:i+1,winningStyleRates:{escape:10,makuri:20,difference:30,mark:40}},
  identityPassed:true
}]));
const kimariteCounts=participants.map((p,i)=>({
  registration:p.registration,identityPassed:true,targetIdentityPassed:true,fetchedAt:'2026-08-08T10:30:00Z',sourceType:'JSJ068',target:{date:'20260808',venueCode:'24',raceNo:2},totalQuinellaCount:10,
  counts:{
    nige:{F_Cnt:0,S_Cnt:0,Sum_Cnt:0},
    makuri:{F_Cnt:i%4,S_Cnt:0,Sum_Cnt:i%4},
    sasi:{F_Cnt:(6-i)%4,S_Cnt:0,Sum_Cnt:(6-i)%4},
    mark:{F_Cnt:0,S_Cnt:Math.max(0,10-(i%4)-((6-i)%4)),Sum_Cnt:Math.max(0,10-(i%4)-((6-i)%4))}
  }
}));

const hydrated=hydrateParticipantEvidence(participants,{profiles,kimariteCounts},{});
assert.equal(hydrated.length,7);
assert.equal(hydrated[0].officialProfile.identityPassed,true);
assert.equal(hydrated[0].officialKimariteCounts.targetIdentityPassed,true);
const adapted=adaptParticipantsForPrediction(hydrated,context);
assert.ok(adapted.some(x=>Math.abs(x.recentForm-5)>.05),'profile container must affect recentForm');
assert.ok(adapted.some(x=>Math.abs(x.startPower-5)>.05),'profile container must affect startPower');
assert.ok(adapted.some(x=>Math.abs(x.sprintPower-5)>.05),'kimarite container must affect sprintPower');
assert.ok(adapted.some(x=>Math.abs(x.finishPower-5)>.05),'kimarite container must affect finishPower');
assert.ok(adapted.some(x=>Math.abs(x.trackingSkill-5)>.05),'kimarite container must affect trackingSkill');

const mismatch=hydrateParticipantEvidence([{number:1,registration:'015001',identityPassed:true}],{profiles:[{registration:'999999',identityPassed:true,recent4MonthScore:99}]},{});
assert.equal(mismatch[0].officialProfile,null,'mismatched evidence must not bind');
console.log('keirin browser evidence adapter PASS');

const inlineParticipants=participants.map((p,i)=>({
  ...p,
  officialTotalStarts:20+i,
  backCount:i+1,
  homeCount:i+2,
  currentScore:91+i,
  recent4MonthScore:90+i,
  ridingStyle:i%2?'逃':'追'
}));
const inlineHydrated=hydrateParticipantEvidence(inlineParticipants,{},{ });
assert.equal(inlineHydrated[0].officialProfile.identityPassed,true,'inline official participant evidence must bind');
assert.equal(inlineHydrated[0].officialProfile.backCount,1);
const inlineAdapted=adaptParticipantsForPrediction(inlineHydrated,context);
assert.ok(inlineAdapted.some(x=>Math.abs(x.startPower-5)>.05),'inline official profile fields must affect startPower');
console.log('inline official participant evidence PASS');
