
import assert from"node:assert/strict";
import{runAutoEngine}from"../engine/auto-engine.mjs";

const race={id:"demo",venue:"川口",raceNo:1,surface:"dry",incidentRisk:3,participants:[
{id:"A1",number:1,name:"1",handicap:0,trialTime:3.45,startSkill:7,openingLapPower:7,passingSkill:5,lateRacePower:5,stability:7,drySuitability:7,wetSuitability:5,insideLineSkill:8,outsideLineSkill:4,recentForm:6,trackSuitability:7},
{id:"A2",number:2,name:"2",handicap:0,trialTime:3.43,startSkill:7,openingLapPower:7,passingSkill:6,lateRacePower:6,stability:7,drySuitability:7,wetSuitability:6,insideLineSkill:7,outsideLineSkill:5,recentForm:7,trackSuitability:7},
{id:"A3",number:3,name:"3",handicap:10,trialTime:3.41,startSkill:7,openingLapPower:7,passingSkill:7,lateRacePower:7,stability:7,drySuitability:8,wetSuitability:6,insideLineSkill:7,outsideLineSkill:6,recentForm:7,trackSuitability:8},
{id:"A4",number:4,name:"4",handicap:20,trialTime:3.39,startSkill:8,openingLapPower:8,passingSkill:8,lateRacePower:8,stability:7,drySuitability:8,wetSuitability:7,insideLineSkill:6,outsideLineSkill:8,recentForm:8,trackSuitability:8},
{id:"A5",number:5,name:"5",handicap:20,trialTime:3.40,startSkill:7,openingLapPower:7,passingSkill:8,lateRacePower:8,stability:8,drySuitability:8,wetSuitability:8,insideLineSkill:7,outsideLineSkill:8,recentForm:8,trackSuitability:8},
{id:"A6",number:6,name:"6",handicap:30,trialTime:3.37,startSkill:8,openingLapPower:8,passingSkill:9,lateRacePower:9,stability:8,drySuitability:9,wetSuitability:8,insideLineSkill:7,outsideLineSkill:9,recentForm:9,trackSuitability:9}
]};
const result=runAutoEngine({race,trackProfile:{lineBias:"outside",highSpeedPassingBias:true},oddsByOrder:{}});
assert.equal(result.audit.passed,true);
assert.ok(result.terminals.length>0);
assert.equal(result.audit.unterminatedBranches,0);
console.log("Auto integrated tests passed.");
