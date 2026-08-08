
import assert from"node:assert/strict";import{inferLines}from"../parser/line-parser.mjs";import{runKeirinEngine}from"../engine/keirin-engine.mjs";
const participants=[1,2,3,4,5,6,7].map(n=>({id:`K${n}`,number:n,name:`選手${n}`,recentForm:6,startPower:5,sprintPower:n===1?8:5,stamina:n===1?8:5,attackTiming:n===1?8:5,trackingSkill:n===2?8:5,finishPower:n===2?8:5,lineTrust:5,venueSuitability:5}));
const line=inferLines({participants,lineText:"1-2-3 4-5 6 7"});
assert.equal(line.confidence,"高");
const race={id:"demo",venue:"青森",raceNo:1,lineConfidence:line.confidence,participants:line.participants};
const result=runKeirinEngine({race,oddsByOrder:{}});
assert.equal(result.audit.passed,true);
assert.ok(result.terminals.length>0);
assert.ok(result.purchasePlan.length>0);
assert.notEqual(result.purchasePlan.length,12,"固定12点へ圧縮しない");
assert.equal(result.purchasePlan.length,result.audit.purchaseCandidateCountBeforeCompression);
assert.equal(result.noBet,false);
const uniform=participants.map(p=>({...p,sprintPower:5,stamina:5,attackTiming:5,trackingSkill:5,finishPower:5})),flatLine=inferLines({participants:uniform,lineText:null}),flat=runKeirinEngine({race:{id:"flat",venue:"青森",raceNo:2,lineConfidence:flatLine.confidence,participants:flatLine.participants},oddsByOrder:{},budget:3000});
assert.equal(flat.purchasePlan.length,0);
assert.equal(flat.noBet,true);
assert.equal(flat.noBetReason,"FLAT_DISTRIBUTION_NO_SUPPORTED_CANDIDATE");
console.log("Keirin integrated tests passed.");
