import assert from "node:assert/strict";
import {buildWholeLinkageAudit} from "../keirin/engine/whole-linkage-audit.mjs";

const scored=[
 {number:1,roleScores:{first:9,second:6,third:6},riderEvaluationV2:{role:"自力"}},
 {number:2,roleScores:{first:8.2,second:8.8,third:7},riderEvaluationV2:{role:"三番手"}},
 {number:3,roleScores:{first:8.1,second:7,third:8.9},riderEvaluationV2:{role:"三番手"}},
 {number:4,roleScores:{first:8.7,second:8.5,third:7},riderEvaluationV2:{role:"番手"}}
];
const lines=[[1,4,3]];
const branches=[{id:"M",requiredFirstNumber:1,priority:"main",label:"1まくり"},{id:"B",requiredFirstNumber:4,priority:"sub",label:"4番手差し"}];
const recovery={order:[1,2,3],probability:.015,purchaseStatus:"購入採用",betClass:"COVER",dominantBranchId:"M",chatForecastRole:"main",branchHeadMatched:true,naturalConvergenceScore:.40,naturalConvergenceReasons:["別線残り"],adoptionMode:"SECOND_PAIR_BREADTH_RECOVERY",secondFamilyRelativeToBest:.965,thirdFamilyRelativeToBest:1,lifecycle:{purchaseDecisionReason:"2着近接枝補正として独立2着評価が最上位比97%のため同一枝を復元"}};
let out=buildWholeLinkageAudit({scored,lines,branches,terminals:[recovery],lineConfidence:"高"});
assert.equal(out.severeWarningCount,0);
assert.ok(out.resolutions.some(r=>r.type==="SECOND_PAIR_BREADTH_RECOVERY_EVIDENCE_ACCEPTED"));
assert.ok(!out.warnings.some(w=>w.number===2||w.number===3),"三番手の能力近接を1着枝欠落警告にしない");

const broken={...recovery,lifecycle:{purchaseDecisionReason:""},purchaseReason:""};
out=buildWholeLinkageAudit({scored,lines,branches,terminals:[broken],lineConfidence:"高"});
assert.ok(out.warnings.some(w=>w.stage==="PROBABILITY_TO_PURCHASE"&&w.severity==="high"));

const flatBranches=[1,2,3,4].map(n=>({id:`F${n}`,requiredFirstNumber:n,priority:"main",lineIndependentFallback:true,label:`${n}参考`}));
const flatTerms=[1,2,3,4].map((n,i)=>({order:[n,((n)%4)+1,((n+1)%4)+1],probability:.25-i*.01,purchaseStatus:"購入不採用",betClass:"NONE"}));
out=buildWholeLinkageAudit({scored,lines:[],branches:flatBranches,terminals:flatTerms,lineConfidence:"低"});
assert.ok(!out.warnings.some(w=>w.type==="ABILITY_TO_HEAD_PROBABILITY_DRIFT"));
assert.ok(out.resolutions.some(r=>r.type==="HEAD_PROBABILITY_UNRESOLVED_LINE_FALLBACK"));
console.log("PASS whole-linkage evidence alignment v208");
