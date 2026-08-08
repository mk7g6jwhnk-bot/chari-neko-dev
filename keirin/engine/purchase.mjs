const PURCHASED="購入採用";

export function classify(terminals,odds={}){
  const sorted=[...terminals].sort(compareTerminal);
  if(!sorted.length)return[];

  const max=sorted[0].probability||0;
  const concentrationRatio=max*sorted.length;
  const branchBest=new Map();
  for(const terminal of sorted){
    for(const contribution of terminal.branchContributions||[]){
      const current=branchBest.get(contribution.branchId)||0;
      if(contribution.probability>current)branchBest.set(contribution.branchId,contribution.probability);
    }
  }

  return sorted.map((terminal,index)=>{
    const key=terminal.order.join("-");
    const odd=Number(odds[key]);
    const hasOdds=Number.isFinite(odd)&&odd>1;
    const contributions=[...(terminal.branchContributions||[])].sort((a,b)=>b.probability-a.probability);
    const dominant=contributions[0]||null;
    const best=dominant?branchBest.get(dominant.branchId)||dominant.probability:0;
    const branchFit=best>0?(dominant?.probability||0)/best:0;
    const support=contributions.length;

    let betClass="NONE";
    let adopted=false;
    let purchaseReason="branch代表終端基準外";

    if(concentrationRatio>=1.08&&dominant){
      const ratios=dominant.decisionRatios||{};
      const converged=(ratios.first??0)>=.95&&(ratios.second??0)>=.95&&(ratios.third??0)>=.95;
      const nearConverged=(ratios.first??0)>=.90&&(ratios.second??0)>=.92&&(ratios.third??0)>=.92;
      const credibleMain=dominant.branchPriority==="main"&&converged&&branchFit>=.82;
      const credibleCover=dominant.branchPriority!=="main"&&converged&&branchFit>=.86;
      const mainVariant=dominant.branchPriority==="main"&&nearConverged&&branchFit>=.78;
      const highValue=hasOdds&&odd>=100&&nearConverged&&branchFit>=.72&&terminal.probability>=max*.35;

      if(highValue){betClass="BUYABLE_HIGH";adopted=true;purchaseReason=`${dominant.branchLabel}由来の高配当候補`;}
      else if(credibleMain){betClass="MAIN";adopted=true;purchaseReason=`${dominant.branchLabel}で1・2・3着評価が自然収束`;}
      else if(credibleCover||mainVariant){betClass="COVER";adopted=true;purchaseReason=`${dominant.branchLabel}の着順別評価から残る変化終端`;}
    }else if(concentrationRatio<1.08){
      purchaseReason=`terminal分布が平坦（集中比${concentrationRatio.toFixed(3)}）`;
    }

    return{
      ...terminal,
      odds:hasOdds?odd:null,
      betClass,
      purchaseStatus:adopted?PURCHASED:"購入不採用",
      purchaseReason,
      branchSupport:support,
      dominantBranchId:dominant?.branchId||null,
      dominantBranchLabel:dominant?.branchLabel||null,
      dominantBranchPriority:dominant?.branchPriority||null,
      dominantBranchContribution:dominant?.probability||0,
      branchFit,
      decisionRatios:dominant?.decisionRatios||null,
      concentrationRatio,
      index
    };
  });
}

export function composite(items){
  const values=items.filter(item=>(item.purchaseStatus==null||item.purchaseStatus===PURCHASED)&&item.odds>1);
  return values.length?1/values.reduce((sum,item)=>sum+1/item.odds,0):null;
}

export function allocate(items,budget){
  const natural=items.filter(item=>item.purchaseStatus===PURCHASED).sort(comparePurchase);
  if(!natural.length)return[];
  const minimum=natural.length*100;
  const numericBudget=Math.max(0,Number(budget||0));
  if(numericBudget<minimum){
    return natural.map(item=>({
      order:item.order,betClass:item.betClass,stake:null,odds:item.odds,expectedPayout:null,
      probability:item.probability,branchSupport:item.branchSupport,purchaseReason:item.purchaseReason,
      dominantBranchId:item.dominantBranchId,dominantBranchLabel:item.dominantBranchLabel,decisionRatios:item.decisionRatios,
      fundingStatus:"予算不足",minimumRequired:minimum
    }));
  }

  const weights=natural.map(item=>Math.max(item.probability,.0001));
  const sum=weights.reduce((a,b)=>a+b,0);
  const stakes=weights.map(weight=>Math.floor((numericBudget*weight/sum)/100)*100);
  let remaining=numericBudget-stakes.reduce((a,b)=>a+b,0),index=0;
  while(remaining>=100){stakes[index%stakes.length]+=100;remaining-=100;index+=1;}
  return natural.map((item,i)=>({
    order:item.order,betClass:item.betClass,stake:stakes[i],odds:item.odds,
    expectedPayout:item.odds?Math.floor(stakes[i]*item.odds):null,
    probability:item.probability,branchSupport:item.branchSupport,purchaseReason:item.purchaseReason,
    dominantBranchId:item.dominantBranchId,dominantBranchLabel:item.dominantBranchLabel,decisionRatios:item.decisionRatios,
    fundingStatus:"配分済み",minimumRequired:minimum
  }));
}

export function purchaseDiagnostics(classified,plan,budget){
  const probabilities=classified.map(item=>item.probability).sort((a,b)=>b-a);
  const natural=classified.filter(item=>item.purchaseStatus===PURCHASED);
  const noBet=natural.length===0;
  const noBetReason=!noBet?null:classified.length===0?"NO_TERMINALS":(classified[0]?.concentrationRatio||0)<1.08?"FLAT_DISTRIBUTION_NO_SUPPORTED_CANDIDATE":"QUALITY_GATE";
  const minimumRequired=natural.length*100;
  return{
    terminalCount:classified.length,
    terminalProbabilitySum:sum(probabilities),
    maxTerminalProbability:probabilities[0]||0,
    top3Mass:sum(probabilities.slice(0,3)),top5Mass:sum(probabilities.slice(0,5)),top10Mass:sum(probabilities.slice(0,10)),
    purchaseCandidateCountBeforeCompression:natural.length,
    purchaseCandidateCountAfterCompression:natural.length,
    finalBetCount:natural.length,
    minimumRequired,
    budget:Number(budget||0),
    budgetSufficient:Number(budget||0)>=minimumRequired,
    noBet,noBetReason
  };
}

function compareTerminal(a,b){return(b.probability-a.probability)||(b.branchContributions?.length||0)-(a.branchContributions?.length||0)||a.order.join("-").localeCompare(b.order.join("-"),"en")}
function comparePurchase(a,b){
  const classRank={MAIN:0,COVER:1,BUYABLE_HIGH:2,NONE:3};
  return(classRank[a.betClass]??9)-(classRank[b.betClass]??9)||(b.probability-a.probability)||a.order.join("-").localeCompare(b.order.join("-"),"en");
}
function sum(values){return values.reduce((total,value)=>total+value,0)}
