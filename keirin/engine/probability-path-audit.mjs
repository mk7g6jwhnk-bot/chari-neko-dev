export function buildProbabilityPathAudit(terminals=[]){
  const rows=(terminals||[]).map(t=>buildTerminalRow(t));
  const siblingGroups=new Map();
  for(const t of terminals||[]){
    for(const c of t.branchContributions||[]){
      const order=(t.order||[]).map(Number);
      if(order.length!==3)continue;
      const key=`${c.branchId||""}|${order[0]}|${order[1]}`;
      if(!siblingGroups.has(key))siblingGroups.set(key,[]);
      const trace=c.nodeTrace||[];
      siblingGroups.get(key).push({
        order,
        branchId:c.branchId||null,
        third:Number(order[2]),
        thirdConditional:Number(trace?.[2]?.conditionalProbability)||0,
        thirdScore:Number(c.positionScores?.third)||0,
        relativePenalty:Number(c.relativeConditionPenalty)||1,
        contributionProbability:Number(c.probability)||0,
        terminalProbability:Number(t.probability)||0
      });
    }
  }
  const groups=[...siblingGroups.entries()].map(([key,items])=>{
    const sorted=[...items].sort((a,b)=>b.terminalProbability-a.terminalProbability||a.third-b.third);
    const conds=sorted.map(x=>x.thirdConditional).filter(x=>x>0);
    const probs=sorted.map(x=>x.terminalProbability).filter(x=>x>0);
    const condSpread=conds.length?Math.max(...conds)/Math.min(...conds):1;
    const finalSpread=probs.length?Math.max(...probs)/Math.min(...probs):1;
    const flattening=condSpread>finalSpread*1.08;
    return{key,items:sorted,thirdConditionalSpread:condSpread,terminalProbabilitySpread:finalSpread,flatteningDetected:flattening,reason:flattening?"THIRD_CONDITION_BURDEN_NOT_FULLY_PROPAGATED_TO_PATH_SCORE":null};
  });
  const flagged=groups.filter(g=>g.flatteningDetected);
  return{
    version:"PROBABILITY-PATH-AUDIT-1.0",
    policy:"TRACE_NODE_CONDITIONAL_CHAIN_VS_ACTUAL_SCORE_PATH_WITHOUT_CHANGING_PROBABILITIES",
    finalFormulaUsesNodeConditionalProduct:false,
    terminalCount:rows.length,
    rows,
    siblingGroups:groups,
    flatteningGroupCount:flagged.length,
    flaggedGroups:flagged,
    passed:true
  };
}

function buildTerminalRow(t){
  const dominant=(t.branchContributions||[])[0]||null;
  const trace=dominant?.nodeTrace||t.nodeTrace||[];
  const conditionals=trace.slice(0,3).map(n=>Number(n?.conditionalProbability)||0);
  const conditionalChainProduct=conditionals.reduce((p,x)=>p*x,1);
  const finalProbability=Number(t.probability)||0;
  return{
    order:(t.order||[]).map(Number),
    finalProbability,
    conditionalProbabilities:{first:conditionals[0]||0,second:conditionals[1]||0,third:conditionals[2]||0},
    conditionalChainProduct,
    finalVsConditionalChainRatio:conditionalChainProduct>0?finalProbability/conditionalChainProduct:null,
    dominantBranchId:dominant?.branchId||t.branchId||null,
    branchScore:Number(dominant?.branchScore)||0,
    basePathScore:Number(dominant?.basePathScore)||0,
    relativeConditionPenalty:Number(dominant?.relativeConditionPenalty)||1,
    pathScore:Number(dominant?.pathScore)||0,
    dominantBranchContributionProbability:Number(dominant?.probability)||0,
    mergedBranchContributionCount:(t.branchContributions||[]).length,
    positionScores:dominant?.positionScores||null,
    actualFinalFormula:"SUM_BRANCH[branchScore * branchDifferentialFactor * (pathScore / branchPathTotal)] / GLOBAL_TOTAL",
    conditionalChainUsedDirectly:false
  };
}
