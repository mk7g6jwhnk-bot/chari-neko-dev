import assert from"node:assert/strict";
import{auditRiderMarkConsistency}from"../public/rider-marks.mjs";

const marks=[
 {number:1,overallMark:"◎",firstMark:"◎",secondMark:"△",thirdMark:"△"},
 {number:2,overallMark:"○",firstMark:"○",secondMark:"◎",thirdMark:"○"},
 {number:3,overallMark:"△",firstMark:"△",secondMark:"○",thirdMark:"◎"},
 {number:4,overallMark:"△",firstMark:"△",secondMark:"△",thirdMark:"△"}
];
const good={
 terminalLedger:[{order:[1,2,3],probability:.2,dominantBranchId:"B1",dominantBranchLabel:"1先行→2追走→3残り"}],
 branches:[{id:"B1",label:"1先行→2追走→3残り"}],
 betSelections:[{order:[1,2,3],category:"MAIN",dominantBranchId:"B1",dominantBranchLabel:"1先行→2追走→3残り",classificationReason:"主展開から自然収束"}]
};
const g=auditRiderMarkConsistency(good,marks);
assert.equal(g.version,"RIDER-MARK-SCENARIO-BET-CONSISTENCY-v3");
assert.equal(g.provenanceAudit.tracedBetCount,1);
assert.equal(g.provenanceAudit.terminalMatchedCount,1);
assert.equal(g.provenanceAudit.branchTracedCount,1);
assert.ok(!g.warnings.some(w=>w.type==="BET_WITHOUT_GENERATED_TERMINAL"));

const broken={...good,betSelections:[
 {order:[4,2,3],category:"MAIN"},
 {order:[1,2,3],category:"MAIN"}
],terminalLedger:[{order:[1,2,3],probability:.2}]};
const b=auditRiderMarkConsistency(broken,marks);
assert.ok(b.warnings.some(w=>w.type==="BET_WITHOUT_GENERATED_TERMINAL"&&w.order==="4-2-3"));
assert.ok(b.warnings.some(w=>w.type==="BET_WITHOUT_BRANCH_PROVENANCE"&&w.order==="1-2-3"));
assert.equal(b.status,"WARN");
console.log("PASS v145 mark -> scenario -> terminal -> bet consistency audit");
