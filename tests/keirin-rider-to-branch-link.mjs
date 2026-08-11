import assert from"node:assert/strict";
import{generateKeirinBranches}from"../keirin/sports/keirin-branches.mjs";
import{buildRiderBranchLinkAudit}from"../keirin/engine/rider-branch-link-audit.mjs";
const scored=[
 {id:"1",number:1,role:"自力",roleScores:{first:7.8},riderEvaluationV2:{role:"自力",firstMechanisms:{escape:8.8,makuri:7.2,banteSashi:4.5}},evidence:{start:9,sprint:7,finish:5.5,tracking:5,recent:7.5}},
 {id:"2",number:2,role:"番手",roleScores:{first:7.7},riderEvaluationV2:{role:"番手",firstMechanisms:{escape:4.5,makuri:5.5,banteSashi:8.7}},evidence:{start:4,sprint:5,finish:8.8,tracking:9,recent:7.2}},
 {id:"3",number:3,role:"自力",roleScores:{first:7.75},riderEvaluationV2:{role:"自力",firstMechanisms:{escape:7.1,makuri:8.65,banteSashi:4.5}},evidence:{start:7,sprint:8.8,finish:7.5,tracking:5.5,recent:7.4}},
 {id:"4",number:4,role:"番手",roleScores:{first:7.5},riderEvaluationV2:{role:"番手",firstMechanisms:{escape:4.2,makuri:5.2,banteSashi:8.55}},evidence:{start:4,sprint:5,finish:8.5,tracking:8.7,recent:7.1}}
];
const lines=[{id:"A",type:"ライン",leader:scored[0],bante:scored[1]},{id:"B",type:"ライン",leader:scored[2],bante:scored[3]}];
const branches=generateKeirinBranches({scored,lines,lineConfidence:"高"});
assert.ok(branches.find(b=>b.id==="LEAD-A").scoreTrace.some(x=>x.key==="escapeMechanism"));
assert.ok(branches.find(b=>b.id==="MAKURI-B").scoreTrace.some(x=>x.key==="makuriMechanism"));
assert.ok(branches.find(b=>b.id==="BANTE-A").scoreTrace.some(x=>x.key==="banteSashiMechanism"));
const audit=buildRiderBranchLinkAudit({scored,branches});
assert.ok(audit.rows.some(r=>r.mechanismName==="逃げ"));
assert.ok(audit.rows.some(r=>r.mechanismName==="捲り"));
assert.ok(audit.rows.some(r=>r.mechanismName==="番手差し"));
console.log("PASS rider evaluation v2 -> branch linkage");
