import assert from"node:assert/strict";import{buildCentralRulesAudit}from"../keirin/engine/central-rules-audit.mjs";
const terminals=[{order:[1,2,5],lifecycle:{terminalDeleted:false},purchaseStatus:"購入不採用",decisionRatios:{second:.8,third:.8}}];
let audit=buildCentralRulesAudit({terminals,terminalGenerationAudit:{reevaluationCoverageAudit:{passed:true,secondCoverageMissCount:0,thirdCoverageMissCount:0,mixedLineThirdCoverageMissCount:0}}});
assert.equal(audit.passed,true);
audit=buildCentralRulesAudit({terminals,terminalGenerationAudit:{reevaluationCoverageAudit:{passed:false,secondCoverageMissCount:0,thirdCoverageMissCount:1,mixedLineThirdCoverageMissCount:1}}});
assert.equal(audit.passed,false);
assert.equal(audit.checks.find(x=>x.key==="INDEPENDENT_2ND_3RD").passed,false);
assert.equal(audit.checks.find(x=>x.key==="MIXED_LINE_THIRD_KEPT").passed,false);
console.log("PASS central rules use actual reevaluation coverage audit");