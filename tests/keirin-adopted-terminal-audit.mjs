import assert from 'node:assert/strict';
import { runKeirinEngine } from '../keirin/engine/keirin-engine.mjs';

const participants = [
  {id:'1',number:1,name:'1',lineId:'A',lineOrder:1,recentForm:7,startPower:8,sprintPower:7,finishPower:5,trackingSkill:5},
  {id:'2',number:2,name:'2',lineId:'A',lineOrder:2,recentForm:6,startPower:5,sprintPower:5,finishPower:8,trackingSkill:8},
  {id:'3',number:3,name:'3',lineId:'B',lineOrder:1,recentForm:6,startPower:7,sprintPower:8,finishPower:5,trackingSkill:5},
  {id:'4',number:4,name:'4',lineId:'B',lineOrder:2,recentForm:5,startPower:5,sprintPower:5,finishPower:7,trackingSkill:7},
  {id:'5',number:5,name:'5',lineId:'C',lineOrder:1,recentForm:5,startPower:6,sprintPower:6,finishPower:5,trackingSkill:5},
  {id:'6',number:6,name:'6',lineId:'C',lineOrder:2,recentForm:5,startPower:5,sprintPower:5,finishPower:6,trackingSkill:6},
  {id:'7',number:7,name:'7',lineId:'C',lineOrder:3,recentForm:5,startPower:5,sprintPower:5,finishPower:5,trackingSkill:6}
];
const race={id:'audit',participants,lineConfidence:'高'};
const out=runKeirinEngine({race,budget:3000});
assert.equal(out.audit.probabilityEvaluatedTerminalCount,out.audit.generatedTerminalCount);
assert.equal(out.audit.adoptedTerminalAudit.length,out.audit.adoptedTerminalCount);
for(const item of out.audit.adoptedTerminalAudit){
  assert.match(item.order,/^\d-\d-\d$/);
  assert.ok(item.dominantBranchLabel);
  assert.ok(Number.isFinite(item.branchFit));
  assert.ok(item.decisionRatios);
}
assert.equal(out.audit.purchaseThresholds.probabilitySupportVsMaxMin,null);
console.log('Keirin adopted terminal provenance audit passed:', out.audit.adoptedTerminalAudit.length);
