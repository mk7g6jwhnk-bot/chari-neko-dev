import assert from"node:assert/strict";
import{deriveRiderMarks,auditRiderMarkConsistency}from"../public/rider-marks.mjs";

const snapshot={
  abilitiesUsed:[
    {number:1,roleScores:{first:9.2,second:7.0,third:6.2},abilityMissingAudit:{missingCount:0}},
    {number:2,roleScores:{first:7.5,second:9.0,third:8.0},abilityMissingAudit:{missingCount:0}},
    {number:3,roleScores:{first:5.0,second:6.0,third:9.1},abilityMissingAudit:{missingCount:1}},
  ],
  terminalLedger:[
    {order:[2,1,3],probability:.4},{order:[1,2,3],probability:.2},{order:[3,2,1],probability:.1}
  ],
  betSelections:[{order:[2,1,3],category:"MAIN"}]
};
const marks=deriveRiderMarks(snapshot);
assert.equal(marks.find(x=>x.number===1).firstMark,"◎");
assert.equal(marks.find(x=>x.number===3).thirdMark,"◎");
assert.equal(marks.find(x=>x.number===3).confidence,"中");
const audit=auditRiderMarkConsistency(snapshot,marks);
assert.ok(audit.warnings.some(w=>w.type==="FIRST_MARK_NO_HEAD_BET"&&w.number===1));
assert.ok(audit.warnings.some(w=>w.type==="THIRD_MARK_NO_THIRD_BET")===false); // rider 3 is present in 3rd
console.log("Keirin rider marks audit passed");
