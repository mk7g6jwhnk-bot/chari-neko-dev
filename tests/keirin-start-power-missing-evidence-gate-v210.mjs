import assert from "node:assert/strict";
import { applyStartPowerEvidence } from "../keirin/start-power/start-power.mjs";
import { runKeirinEngine } from "../keirin/engine/keirin-engine.mjs";

const participants=Array.from({length:7},(_,i)=>applyStartPowerEvidence([{
  id:String(i+1),number:i+1,name:`未取得${i+1}`,raceCategory:"girls",role:"単騎",lineId:`girls-${i+1}`,lineOrder:1,
  officialProfileEvidence:null,
  recentForm:5+i*.2,sprintPower:6+i*.1,finishPower:5.5,trackingSkill:5.3,stamina:5.6,attackTiming:5.2,lineTrust:5,venueSuitability:5
}])[0]);

for(const rider of participants){
  assert.equal(rider.startPower,null,"missing official B/H evidence must not create a neutral/numeric startPower");
  assert.equal(rider.startPowerEvidence.usable,false);
  assert.equal(rider.startPowerEvidence.evidenceStatus,"MISSING_INPUTS");
  assert.ok(rider.startPowerEvidence.missingInputs.length>0);
}

const out=runKeirinEngine({
  race:{id:"girls-all-start-power-missing",raceCategory:"girls",lineConfidence:"高",participants},
  oddsByOrder:{},budget:3000
});

assert.equal(out.noBet,true);
assert.equal(out.noBetReason,"GIRLS_LEAD_EVIDENCE_UNAVAILABLE");
assert.equal(out.audit.startPowerInputAudit.usableCount,0);
assert.equal(out.audit.startPowerInputAudit.withheldCount,7);
assert.equal(out.audit.startPowerInputAudit.invalidLeadBranchCount,0);
assert.equal(out.audit.startPowerInputAudit.passed,true,"withholding unusable evidence is the correct audited state");
assert.equal(out.scored.every(r=>r.evidence.start===null),true,"unusable startPower must be removed before placement scoring");
assert.equal(out.branches.some(b=>b.branchType==="LEADER_HOLD"),false,"leader-hold branches must be withheld when all start evidence is unavailable");
assert.equal(out.branches.some(b=>b.branchType==="MAKURI_SUCCESS"),true,"non-start-dependent branches should remain available");
console.log("PASS v210 missing start-power evidence gate");
