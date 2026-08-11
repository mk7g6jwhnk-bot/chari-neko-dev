import assert from "node:assert/strict";
import { runKeirinEngine } from "../keirin/engine/keirin-engine.mjs";

const race={
  id:"SPEC-V1-AUDIT",raceCategory:"standard",lineConfidence:"高",
  participants:[
    {number:1,name:"A",role:"自力",lineId:"L1",lineOrder:1,recentForm:8,startPower:7,startPowerEvidence:{confidence:"high",missingInputs:[],profileIdentityPassed:true,officialTotalStarts:20,rawBackCount:10,rawHomeCount:8,bFrequency:.5,hFrequency:.4,shrunkBFrequency:.4,shrunkHFrequency:.35,bPercentileScore:8,hPercentileScore:7,latentScore:7.5,raceCategory:"standard",priorStrength:10,startsQuality:.67},sprintPower:8,finishPower:6,trackingSkill:5},
    {number:2,name:"B",role:"番手",lineId:"L1",lineOrder:2,recentForm:7,startPower:5,startPowerEvidence:{confidence:"low",missingInputs:["backCount"],profileIdentityPassed:true,officialTotalStarts:20,rawBackCount:null,rawHomeCount:4,raceCategory:"standard",priorStrength:10},sprintPower:4,finishPower:8,trackingSkill:8},
    {number:3,name:"C",role:"単騎",lineId:"L3",lineOrder:1,recentForm:6,startPower:5,startPowerEvidence:null,sprintPower:6,finishPower:6,trackingSkill:6}
  ]
};
const result=runKeirinEngine({race,budget:1000});
const a=result.audit.startPowerInputAudit;
assert.equal(a.totalRiders,3);
assert.equal(a.rows[0].status,"VERIFIED");
assert.equal(a.rows[1].status,"MISSING_INPUTS");
assert.deepEqual(a.rows[1].missingInputs,["backCount"]);
assert.equal(a.rows[2].status,"EVIDENCE_UNAVAILABLE");
assert.equal(a.withheldCount,1);
assert.equal(a.unavailableCount,1);
assert.equal(a.invalidLeadBranchCount,0);
assert.equal(a.passed,true);
console.log("Keirin chat spec start-power audit passed");
