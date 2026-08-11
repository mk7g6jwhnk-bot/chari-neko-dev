import assert from "node:assert/strict";
import {runKeirinEngine} from "../keirin/engine/keirin-engine.mjs";
const participants=[
{id:'1',number:1,name:'1',lineId:'A',lineOrder:1,role:'自力',recentForm:7,startPower:8,sprintPower:7,finishPower:5,trackingSkill:5},
{id:'2',number:2,name:'2',lineId:'A',lineOrder:2,role:'番手',recentForm:6,startPower:5,sprintPower:5,finishPower:8,trackingSkill:8},
{id:'3',number:3,name:'3',lineId:'B',lineOrder:1,role:'自力',recentForm:6,startPower:7,sprintPower:8,finishPower:5,trackingSkill:5},
{id:'4',number:4,name:'4',lineId:'B',lineOrder:2,role:'番手',recentForm:5,startPower:5,sprintPower:5,finishPower:7,trackingSkill:7},
{id:'5',number:5,name:'5',lineId:'C',lineOrder:1,role:'自力',recentForm:5,startPower:6,sprintPower:6,finishPower:5,trackingSkill:5},
{id:'6',number:6,name:'6',lineId:'C',lineOrder:2,role:'番手',recentForm:5,startPower:5,sprintPower:5,finishPower:6,trackingSkill:6},
{id:'7',number:7,name:'7',lineId:'C',lineOrder:3,role:'三番手',recentForm:5,startPower:5,sprintPower:5,finishPower:5,trackingSkill:6}
];
const out=runKeirinEngine({race:{id:'funnel',participants,lineConfidence:'高'},budget:3000});
assert.equal(out.audit.passed,true);
assert.equal(out.audit.terminalLifecycleAudit.generatedTerminalCount,out.audit.generatedTerminalCount);
assert.equal(out.audit.purchaseFunnelAudit.generatedTerminalCount,out.audit.generatedTerminalCount);
assert.equal(out.audit.purchaseFunnelAudit.standardPurchaseCandidateCount,out.audit.adoptedTerminalCount);
assert.equal(out.audit.purchaseFunnelAudit.rejectCodeCounts.ENGINE_AUDIT_FAILED??0,0);
assert.ok(out.audit.inactiveBranchAudit?.count>=0);
console.log('PASS purchase funnel audit fix',out.audit.generatedTerminalCount,out.audit.adoptedTerminalCount,out.audit.purchaseFunnelAudit.dominantRejectCode);
