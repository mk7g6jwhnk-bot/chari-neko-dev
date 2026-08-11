import assert from"node:assert/strict";
import{auditRiderMarkConsistency}from"../public/rider-marks.mjs";

const snapshot={
  terminalLedger:[
    {order:[1,2,3],probability:.18},
    {order:[5,2,3],probability:.22},
    {order:[6,3,5],probability:.05}
  ],
  betSelections:[
    {order:[5,2,3],category:"MAIN",dominantBranchLabel:"2先行→5番手差し"},
    {order:[5,3,4],category:"MAIN",dominantBranchLabel:"2先行→5番手差し"},
    {order:[5,3,1],category:"MAIN",dominantBranchLabel:"2先行→5番手差し"},
    {order:[5,3,2],category:"MAIN",dominantBranchLabel:"2先行→5番手差し"},
    {order:[1,4,5],category:"COVER"},
    {order:[1,4,3],category:"COVER"},
    {order:[6,3,5],category:"BUYABLE_HIGH"},
    {order:[6,5,4],category:"BUYABLE_HIGH"},
    {order:[6,4,5],category:"BUYABLE_HIGH"},
    {order:[6,4,3],category:"BUYABLE_HIGH"},
    {order:[6,3,4],category:"BUYABLE_HIGH"}
  ],
  branches:[]
};
const marks=[
 {number:1,overallMark:"◎",firstMark:"◎",secondMark:"○",thirdMark:"△"},
 {number:5,overallMark:"○",firstMark:"○",secondMark:"◎",thirdMark:"○"},
 {number:6,overallMark:"△",firstMark:"△",secondMark:"△",thirdMark:"△"},
 {number:2,overallMark:"▲",firstMark:"▲",secondMark:"▲",thirdMark:"◎"},
 {number:3,overallMark:"△",firstMark:"△",secondMark:"△",thirdMark:"▲"},
 {number:4,overallMark:"△",firstMark:"△",secondMark:"△",thirdMark:"△"}
];
const out=auditRiderMarkConsistency(snapshot,marks);
assert.ok(out.warnings.some(w=>w.type==="FIRST_MARK_NO_MAIN_HEAD"&&w.number===1));
assert.ok(out.warnings.some(w=>w.type==="FIRST_MARK_MAIN_HEAD_INVERSION"));
assert.ok(out.warnings.some(w=>w.type==="NON_TOP_FIRST_MARK_MAIN_DOMINANCE"&&w.number===5));
assert.ok(out.warnings.some(w=>w.type==="LOW_FIRST_MARK_HIGH_HEAD_MONOPOLY"&&w.number===6));
assert.equal(out.status,"WARN");
console.log("PASS rider mark -> purchase linkage audit",out.warnings.map(x=>x.type));
