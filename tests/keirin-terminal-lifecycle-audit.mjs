import assert from "node:assert/strict";
import {runKeirinEngine} from "../keirin/engine/keirin-engine.mjs";
import {createSnapshot,evaluateResult} from "../public/prediction-store.mjs";

const participants=[
  {id:"1",number:1,name:"1",lineId:"A",lineOrder:1,recentForm:8,startPower:9,sprintPower:8,finishPower:5,trackingSkill:5},
  {id:"2",number:2,name:"2",lineId:"A",lineOrder:2,recentForm:7,startPower:4,sprintPower:4,finishPower:8,trackingSkill:8},
  {id:"3",number:3,name:"3",lineId:"B",lineOrder:1,recentForm:7,startPower:8,sprintPower:8,finishPower:5,trackingSkill:5},
  {id:"4",number:4,name:"4",lineId:"B",lineOrder:2,recentForm:6,startPower:4,sprintPower:4,finishPower:7,trackingSkill:7},
  {id:"5",number:5,name:"5",lineId:"C",lineOrder:1,recentForm:5,startPower:6,sprintPower:6,finishPower:5,trackingSkill:5},
  {id:"6",number:6,name:"6",lineId:"C",lineOrder:2,recentForm:5,startPower:4,sprintPower:4,finishPower:6,trackingSkill:6},
  {id:"7",number:7,name:"7",lineId:"C",lineOrder:3,recentForm:5,startPower:3,sprintPower:3,finishPower:5,trackingSkill:6}
];
const race={id:"lifecycle",date:"20260810",venueCode:"12",venue:"青森",raceNo:1,lineConfidence:"高",participants};
const prediction=runKeirinEngine({race,budget:3000});
assert.equal(prediction.audit.terminalLifecycleAudit.passed,true);
assert.equal(prediction.audit.terminalLifecycleAudit.generatedTerminalCount,prediction.terminals.length);
assert.equal(prediction.audit.terminalLifecycleAudit.probabilityEvaluatedTerminalCount,prediction.terminals.length);
assert.equal(prediction.audit.terminalLifecycleAudit.unreasonedPurchaseRejectCount,0);
assert.equal(prediction.audit.terminalLifecycleAudit.unexplainedGenerationExclusionCount,0);
assert.equal(prediction.audit.terminalLifecycleAudit.fixedRankDeletionApplied,false);
assert.equal(prediction.audit.terminalLifecycleAudit.fixedProbabilityDeletionApplied,false);
for(const terminal of prediction.terminals){
  assert.equal(terminal.lifecycle?.generated,true);
  assert.equal(terminal.lifecycle?.probabilityEvaluated,true);
  assert.equal(terminal.lifecycle?.terminalDeleted,false);
  if(terminal.purchaseStatus!=="購入採用"){
    assert.ok(terminal.purchaseRejectCode);
    assert.notEqual(terminal.purchaseRejectCode,"UNCLASSIFIED");
    assert.ok(terminal.purchaseReason);
  }
}
const payload={race,odds:{},prediction};
const snapshot=createSnapshot(payload,new Date("2026-08-10T00:00:00Z"));
assert.equal(snapshot.terminalLedger.length,prediction.terminals.length);
const rejected=snapshot.terminalLedger.find(t=>t.purchaseStatus!=="購入採用");
if(rejected){
  const result=evaluateResult(snapshot,{finishOrder:rejected.order,payout:9999},new Date("2026-08-10T01:00:00Z"));
  assert.equal(result.terminalWasGenerated,true);
  assert.equal(result.terminalPurchaseStatus,"購入不採用");
  assert.equal(result.terminalRejectCode,rejected.purchaseRejectCode);
  assert.equal(result.resultStatus,"miss");
}
console.log("Keirin terminal lifecycle audit passed:",prediction.terminals.length);
