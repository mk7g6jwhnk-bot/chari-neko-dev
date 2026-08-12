import assert from "node:assert/strict";
import {runKeirinEngine} from "../keirin/engine/keirin-engine.mjs";

const participants=Array.from({length:7},(_,i)=>({
  id:String(i+1),number:i+1,name:`選手${i+1}`,lineId:`unknown-${i+1}`,lineOrder:1,role:"判定保留",
  recentForm:4.4+i*.35,startPower:5,sprintPower:4.3+i*.55,finishPower:4.6+i*.42,
  startPowerEvidence:{officialTotalStarts:0,missingInputs:["officialTotalStarts"]},
  trackingSkill:4.7+i*.18,stamina:4.8+i*.16,attackTiming:4.5+i*.22,lineTrust:null,venueSuitability:5
}));
const p=runKeirinEngine({race:{id:"missing-start-evidence-no-blanket-skip",raceCategory:"standard",lineConfidence:"低",participants},budget:3000});
assert.ok(p.terminals.length>0);
assert.ok(p.audit.lineFallbackAudit.startEvidenceWarning===true);
assert.equal(p.audit.lineFallbackAudit.lineAndStartEvidenceBlockApplied,false);
assert.equal(p.noBet,false);
assert.ok(p.standardPurchasePlan.length>0);
assert.equal(p.referencePurchasePlan.length,0);
console.log("PASS missing start-power evidence no longer causes blanket skip");
