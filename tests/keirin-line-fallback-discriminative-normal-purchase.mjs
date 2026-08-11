import assert from"node:assert/strict";import{runKeirinEngine}from"../keirin/engine/keirin-engine.mjs";
const participants=Array.from({length:7},(_,i)=>({
 id:String(i+1),number:i+1,name:`選手${i+1}`,lineId:`unknown-${i+1}`,lineOrder:1,role:"判定保留",
 recentForm:4.8+i*.25,startPower:4.2+i*.55,sprintPower:4.4+i*.50,finishPower:4.6+i*.42,
 trackingSkill:4.7+i*.20,stamina:4.8+i*.18,attackTiming:4.5+i*.25,lineTrust:null,venueSuitability:5
}));
const p=runKeirinEngine({race:{id:"discriminative-line-missing",raceCategory:"standard",lineConfidence:"低",participants},budget:3000});
assert.equal(p.audit.lineFallbackAudit.discriminationAudit.sufficient,true);
assert.equal(p.audit.lineFallbackAudit.flatEvidencePurchaseBlockApplied,false);
assert.equal(p.noBet,false);
assert.ok(p.purchasePlan.length>0);
assert.notEqual(p.audit.referencePlan,true);
console.log("PASS discriminative missing-line race still uses normal purchase path");