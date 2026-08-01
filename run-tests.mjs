
import assert from"node:assert/strict";import{inferLines}from"../parser/line-parser.mjs";import{runKeirinEngine}from"../engine/keirin-engine.mjs";
const participants=[1,2,3,4,5,6,7].map(n=>({id:`K${n}`,number:n,name:`選手${n}`,recentForm:6,startPower:5,sprintPower:n===1?8:5,stamina:n===1?8:5,attackTiming:n===1?8:5,trackingSkill:n===2?8:5,finishPower:n===2?8:5,lineTrust:5,venueSuitability:5}));
const line=inferLines({participants,lineText:"1-2-3 4-5 6 7"});
assert.equal(line.confidence,"高");
const race={id:"demo",venue:"青森",raceNo:1,lineConfidence:line.confidence,participants:line.participants};
const result=runKeirinEngine({race,oddsByOrder:{}});
assert.equal(result.audit.passed,true);
assert.ok(result.terminals.length>0);
console.log("Keirin integrated tests passed.");
