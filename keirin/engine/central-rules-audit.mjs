export function buildCentralRulesAudit({terminals=[],terminalGenerationAudit=null}={}){
  const rows=Array.isArray(terminals)?terminals:[];
  const purchased=rows.filter(x=>x.purchaseStatus==="購入採用");
  const checks=[];
  checks.push({key:"KEEP_ALL_TERMINALS",label:"成立可能な全終端を保持",passed:rows.every(x=>x?.lifecycle?.terminalDeleted!==true)});
  checks.push({key:"NO_LINE_BULK_DELETE",label:"別線選手をライン単位で一括削除しない",passed:rows.every(x=>x?.purchaseRejectCode!=="LINE_HEAD_FAILED_BULK_DELETE")});
  const coverage=terminalGenerationAudit?.reevaluationCoverageAudit||null;
  checks.push({
    key:"INDEPENDENT_2ND_3RD",
    label:"1着後に2着全員・1-2着後に3着全員を再評価",
    passed:Boolean(coverage?.passed),
    secondCoverageMissCount:Number(coverage?.secondCoverageMissCount)||0,
    thirdCoverageMissCount:Number(coverage?.thirdCoverageMissCount)||0
  });
  checks.push({
    key:"MIXED_LINE_THIRD_KEPT",
    label:"同ライン自然収束を優先しても別線後位の3着候補を削らない",
    passed:Boolean(coverage)&&Number(coverage?.mixedLineThirdCoverageMissCount||0)===0,
    mixedLineThirdCoverageMissCount:Number(coverage?.mixedLineThirdCoverageMissCount)||0
  });
  let naturalBeforeValue=true;
  for(const v of purchased.filter(x=>x.betClass==="BUYABLE_HIGH")){
    if(rows.some(x=>x.firstFamilyNumber===v.firstFamilyNumber&&x.purchaseStatus!=="購入採用"&&x.branchHeadMatched===true&&Number(x.naturalConvergenceScore)>=.62&&Number(x.naturalConvergenceScore)>=Number(v.naturalConvergenceScore)+.12)){naturalBeforeValue=false;break}
  }
  checks.push({key:"NATURAL_BEFORE_VALUE",label:"高配当より自然終端を先に購入評価",passed:naturalBeforeValue});
  return{version:"KEIRIN-CENTRAL-RULES-v2-FULL-REEVALUATION",passed:checks.every(x=>x.passed),checks}
}
