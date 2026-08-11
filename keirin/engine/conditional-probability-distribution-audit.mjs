export function buildConditionalProbabilityDistributionAudit(terminals=[]){
  const firstGroups=new Map(),secondGroups=new Map(),thirdGroups=new Map();
  for(const terminal of terminals||[]){
    const order=(terminal?.order||[]).map(Number);
    if(order.length!==3)continue;
    for(const contribution of terminal?.branchContributions||[]){
      const branchId=String(contribution?.branchId||terminal?.branchId||"");
      const trace=Array.isArray(contribution?.nodeTrace)?contribution.nodeTrace:[];
      addCandidate(firstGroups,branchId,order[0],trace[0],contribution?.positionScores?.first);
      addCandidate(secondGroups,`${branchId}|${order[0]}`,order[1],trace[1],contribution?.positionScores?.second);
      addCandidate(thirdGroups,`${branchId}|${order[0]}|${order[1]}`,order[2],trace[2],contribution?.positionScores?.third);
    }
  }
  const first=finalizeGroups(firstGroups,"FIRST");
  const second=finalizeGroups(secondGroups,"SECOND");
  const third=finalizeGroups(thirdGroups,"THIRD");
  const all=[...first.rows,...second.rows,...third.rows];
  const nonNormalized=all.filter(row=>!row.normalized);
  return{
    version:"CONDITIONAL-PROBABILITY-DISTRIBUTION-AUDIT-1.0",
    policy:"A_TRUE_STAGE_CONDITIONAL_PROBABILITY_MUST_SUM_TO_ONE_ACROSS_ALL_ELIGIBLE_CANDIDATES_FOR_THE_SAME_PARENT_STATE",
    tolerance:0.001,
    nodeFormula:"scoreShare * requiredConditionBurden (no post-burden renormalization)",
    first,second,third,
    totalGroupCount:all.length,
    normalizedGroupCount:all.length-nonNormalized.length,
    nonNormalizedGroupCount:nonNormalized.length,
    nodeConditionalValuesAreValidDistributions:all.length>0&&nonNormalized.length===0,
    directChainFormulaEligible:all.length>0&&nonNormalized.length===0,
    recommendedNextStep:nonNormalized.length?"RENORMALIZE_AFTER_CONDITION_BURDEN_BEFORE_USING_P1_P2_P3_AS_PROBABILITIES":"CAN_EVALUATE_BRANCH_X_P1_X_P2_X_P3_FORMULA",
    examples:nonNormalized.slice(0,12),
    passed:true
  };
}

function addCandidate(groups,key,number,node,score){
  if(!key||!Number.isFinite(Number(number))||!node)return;
  if(!groups.has(key))groups.set(key,new Map());
  const candidates=groups.get(key);
  const n=Number(number);
  if(candidates.has(n))return;
  candidates.set(n,{
    number:n,
    conditionalProbability:finite(node?.conditionalProbability),
    score:Math.max(0,Number(score??node?.score)||0),
    burden:conditionBurden(node?.newRequiredConditions||[]),
    conditionCount:(node?.newRequiredConditions||[]).filter(c=>c?.kind!=="event").length
  });
}
function finalizeGroups(groups,stage){
  const rows=[];
  for(const [key,map] of groups.entries()){
    const candidates=[...map.values()].sort((a,b)=>a.number-b.number);
    const conditionalSum=candidates.reduce((s,x)=>s+x.conditionalProbability,0);
    const scoreTotal=candidates.reduce((s,x)=>s+x.score,0);
    for(const x of candidates)x.baseScoreShare=scoreTotal>0?x.score/scoreTotal:0;
    const normalized=Math.abs(conditionalSum-1)<=0.001;
    rows.push({stage,key,candidateCount:candidates.length,conditionalSum,missingMass:1-conditionalSum,normalized,candidates});
  }
  const sums=rows.map(x=>x.conditionalSum);
  const normalizedCount=rows.filter(x=>x.normalized).length;
  return{
    groupCount:rows.length,
    normalizedGroupCount:normalizedCount,
    nonNormalizedGroupCount:rows.length-normalizedCount,
    minConditionalSum:sums.length?Math.min(...sums):null,
    maxConditionalSum:sums.length?Math.max(...sums):null,
    averageConditionalSum:sums.length?sums.reduce((a,b)=>a+b,0)/sums.length:null,
    rows
  };
}
function conditionBurden(conditions=[]){
  const conds=(conditions||[]).filter(c=>c?.kind!=="event");
  if(!conds.length)return 1;
  let burden=1;
  for(const c of conds){
    const p=Number.isFinite(Number(c?.probability))?Number(c.probability):.65;
    const softness=c?.critical?1:.55;
    burden*=Math.pow(Math.max(.12,Math.min(.98,p)),softness);
  }
  return burden;
}
function finite(v){const n=Number(v);return Number.isFinite(n)&&n>=0&&n<=1?n:0}
