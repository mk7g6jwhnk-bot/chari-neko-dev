import assert from"node:assert/strict";
import{runKeirinEngine}from"../keirin/engine/keirin-engine.mjs";
const participants=[
 {id:"1",number:1,role:"自力",lineId:"A",lineOrder:1,recentForm:8,startPower:9,sprintPower:7,trackingSkill:5,finishPower:6,stamina:8,attackTiming:7,lineTrust:6,venueSuitability:6},
 {id:"2",number:2,role:"番手",lineId:"A",lineOrder:2,recentForm:7,startPower:4,sprintPower:5,trackingSkill:9,finishPower:8,stamina:7,attackTiming:6,lineTrust:9,venueSuitability:6},
 {id:"3",number:3,role:"三番手",lineId:"A",lineOrder:3,recentForm:6,startPower:3,sprintPower:4,trackingSkill:8,finishPower:6,stamina:7,attackTiming:5,lineTrust:8,venueSuitability:6},
 {id:"4",number:4,role:"自力",lineId:"B",lineOrder:1,recentForm:7,startPower:8,sprintPower:9,trackingSkill:5,finishPower:7,stamina:7,attackTiming:8,lineTrust:5,venueSuitability:6},
 {id:"5",number:5,role:"番手",lineId:"B",lineOrder:2,recentForm:6,startPower:4,sprintPower:5,trackingSkill:8,finishPower:8,stamina:6,attackTiming:5,lineTrust:8,venueSuitability:6},
 {id:"6",number:6,role:"三番手",lineId:"B",lineOrder:3,recentForm:5,startPower:3,sprintPower:4,trackingSkill:7,finishPower:5,stamina:6,attackTiming:4,lineTrust:7,venueSuitability:5},
 {id:"7",number:7,role:"単騎",lineId:"unknown-7",recentForm:6,startPower:6,sprintPower:7,trackingSkill:6,finishPower:7,stamina:6,attackTiming:7,lineTrust:5,venueSuitability:6}
];
const out=runKeirinEngine({race:{id:"v144",raceCategory:"standard",lineConfidence:"高",participants},budget:3000});
assert.equal(out.engineVersion,"KEIRIN-0.17.4-conditional-probability-distribution-audit");
const a=out.audit.terminalGenerationAudit.positionTerminalConnectionAudit;
assert.ok(a);assert.equal(a.passed,true);assert.equal(a.scoreBasedPruningCount,0);assert.equal(a.secondCoverageMissCount,0);assert.equal(a.thirdCoverageMissCount,0);assert.equal(a.rawOrderMissingAfterMergeCount,0);assert.equal(a.terminalProbabilityAssignedAfterPathCompletion,true);
assert.ok(a.stageCounts.first>0&&a.stageCounts.second>0&&a.stageCounts.third>0);
assert.ok(a.rows.every(r=>r.inputSource==="RIDER_EVAL_V3_PLACEMENT_SCORES"));
assert.ok(a.rows.every(r=>Number.isFinite(r.finalPlacementScore)&&Number.isFinite(r.conditionedStageScore)));
console.log("PASS v144 position-specific evaluation connected through terminal completion");
