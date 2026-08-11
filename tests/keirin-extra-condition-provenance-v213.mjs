import assert from "node:assert/strict";
import {runKeirinEngine} from "../keirin/engine/keirin-engine.mjs";

const mk=(number,lineId,lineOrder,role)=>({
  id:String(number),number,lineId,lineOrder,role,
  recentForm:7,startPower:7,sprintPower:7,trackingSkill:7,finishPower:7,stamina:7,attackTiming:7,lineTrust:7,venueSuitability:5,
  startPowerEvidence:{officialTotalStarts:24,missingInputs:[],confidence:"high",usable:true}
});
const race={id:"V213-EXTRA",lineConfidence:"高",raceCategory:"standard",participants:[
  mk(1,"A",1,"自力"),mk(2,"A",2,"番手"),mk(3,"A",3,"三番手"),mk(4,"A",4,"三番手"),
  mk(5,"B",1,"自力"),mk(6,"B",2,"番手"),mk(7,"B",3,"三番手")
]};
const out=runKeirinEngine({race,budget:3000});
const sameDeep=out.terminals.find(t=>t.order?.join("-")==="1-2-4");
assert.ok(sameDeep,"same-line deep terminal missing");
assert.equal(sameDeep.extraConditionCount,0,"same-line deep rider must not be mislabeled as another-line extra condition");
assert.ok((sameDeep.naturalConvergenceReasons||[]).some(x=>String(x).includes("同ライン深位置")));
const otherLine=out.terminals.find(t=>t.order?.join("-")==="1-2-6");
assert.ok(otherLine,"other-line terminal missing");
assert.ok(otherLine.extraConditionCount>=1,"true other-line remain must keep an extra condition");
assert.ok((otherLine.extraConditionDetails||[]).some(d=>d?.source==="NODE_CONDITION"&&d?.mechanism?.key==="otherLineRemain"&&Number.isFinite(Number(d?.probability))),"other-line extra must carry calibrated node provenance");
const audit=out.audit?.chatSpecV1?.extraConditionAudit;
assert.ok(audit,"extra condition audit missing");
assert.equal(audit.uncalibratedStructuralCount,0,"normal two-line case must not rely on uncalibrated structural extra penalties");
console.log("PASS v213 extra-condition provenance",{sameDeep:sameDeep.extraConditionCount,otherLine:otherLine.extraConditionDetails[0]?.probability,status:audit.status});
