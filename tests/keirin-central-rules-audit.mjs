import assert from"node:assert/strict";import{buildCentralRulesAudit}from"../keirin/engine/central-rules-audit.mjs";
const out=buildCentralRulesAudit({
  terminals:[{purchaseStatus:"購入採用",betClass:"MAIN",decisionRatios:{second:.9,third:.8},lifecycle:{terminalDeleted:false},naturalConvergenceScore:.7,firstFamilyNumber:1,branchHeadMatched:true}],
  terminalGenerationAudit:{reevaluationCoverageAudit:{passed:true,secondCoverageMissCount:0,thirdCoverageMissCount:0,mixedLineThirdCoverageMissCount:0}}
});
assert.equal(out.checks.length,5);assert.equal(out.passed,true);console.log("PASS central rules audit");
