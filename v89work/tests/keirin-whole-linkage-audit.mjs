import assert from"node:assert/strict";
import{buildWholeLinkageAudit}from"../keirin/engine/whole-linkage-audit.mjs";

const scored=[
 {number:1,roleScores:{first:7,second:8.5,third:8}},
 {number:2,roleScores:{first:6,second:8,third:7.5}},
 {number:3,roleScores:{first:5.8,second:7.5,third:7.8}},
 {number:5,roleScores:{first:9.2,second:6.5,third:6}}
];
const lines=[[5,1],[2,3]];
const branches=[{id:"M",label:"5捲り",priority:"main",requiredFirstNumber:5}];
const terminals=[
 {order:[5,1,2],probability:.12,purchaseStatus:"購入採用",betClass:"MAIN",dominantBranchId:"M",dominantBranchLabel:"5捲り",chatForecastRole:"main",naturalConvergenceScore:.78,naturalConvergenceLevel:"高",naturalConvergenceReasons:["5の直後を1が追走","2の別線残り条件"],extraConditionCount:1},
 {order:[5,2,3],probability:.10,purchaseStatus:"購入採用",betClass:"MAIN",dominantBranchId:"M",dominantBranchLabel:"5捲り",chatForecastRole:"main",naturalConvergenceScore:.51,naturalConvergenceLevel:"中",naturalConvergenceReasons:[],extraConditionCount:0}
];
const out=buildWholeLinkageAudit({scored,lines,branches,terminals});
assert.equal(out.traceCount,2);
assert.ok(out.warnings.some(w=>w.stage==="SCENARIO_TO_SECOND"&&w.order.join("-")==="5-2-3"));
assert.equal(out.status,"WARN");
console.log("Keirin whole-linkage audit passed",out.warningCount);
