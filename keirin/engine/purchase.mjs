const PURCHASED="購入採用";

export function classify(terminals,odds={}){
  const sorted=[...terminals].sort(compareTerminal);
  if(!sorted.length)return[];

  const max=sorted[0].probability||0;
  const concentrationRatio=max*sorted.length;
  const branchStats=buildBranchStats(sorted);

  return sorted.map((terminal,index)=>{
    const key=terminal.order.join("-");
    const odd=Number(odds[key]);
    const hasOdds=Number.isFinite(odd)&&odd>1;
    const contributions=[...(terminal.branchContributions||[])]
      .filter(contribution=>contributionMatchesTerminal(contribution,terminal.order))
      .sort((a,b)=>b.probability-a.probability||String(a.branchId).localeCompare(String(b.branchId),"en"));
    const dominant=contributions[0]||null;
    const stats=dominant?branchStats.get(dominant.branchId):null;
    const branchFit=stats?.best>0?(dominant?.probability||0)/stats.best:0;
    const branchRank=stats?.rankByOrder.get(key)??null;
    const support=contributions.length;
    const ratios=dominant?.decisionRatios||{};
    const positionConverged=(ratios.first??0)>=.93&&(ratios.second??0)>=.91&&(ratios.third??0)>=.91;
    const positionNear=(ratios.first??0)>=.88&&(ratios.second??0)>=.85&&(ratios.third??0)>=.85;
    const representative=branchFit>=.975&&positionConverged;
    const credibleVariant=branchFit>=.87&&positionNear;
    const probabilitySupported=terminal.probability>=max*.42;

    let betClass="NONE";
    let adopted=false;
    let purchaseReason="展開代表性または着順別評価が不足";

    if(concentrationRatio<1.04){
      purchaseReason=`terminal分布が平坦（集中比${concentrationRatio.toFixed(3)}）`;
    }else if(dominant){
      const isMainBranch=dominant.branchPriority==="main";
      const isAlternativeBranch=dominant.branchPriority!=="main";
      const highValue=hasOdds&&odd>=100&&credibleVariant&&probabilitySupported;

      // Purchase selection must not use a fixed branch-rank cap.
      // Every logically completed terminal stays in classified; adoption is decided by
      // continuous branch-fit / position support / probability support, not "top N".
      if(isMainBranch&&representative&&probabilitySupported){
        betClass="MAIN";
        adopted=true;
        purchaseReason=`${dominant.branchLabel}の代表終端（順位上限なし）`;
      }else if(highValue&&isAlternativeBranch){
        betClass="BUYABLE_HIGH";
        adopted=true;
        purchaseReason=`${dominant.branchLabel}の独立展開から残る高配当候補（順位上限なし）`;
      }else if(
        (isMainBranch&&credibleVariant&&probabilitySupported)||
        (isAlternativeBranch&&representative&&probabilitySupported)||
        (support>=2&&branchFit>=.90&&credibleVariant&&probabilitySupported)
      ){
        betClass="COVER";
        adopted=true;
        purchaseReason=isMainBranch
          ?`${dominant.branchLabel}の成立可能な着順変化（枝内${branchRank??"-"}位・順位上限なし）`
          :`${dominant.branchLabel}由来の別展開カバー（順位上限なし）`;
      }
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
      branchRank,
      representativeTerminal:representative,
      decisionRatios:dominant?.decisionRatios||null,
      positionScores:dominant?.positionScores||null,
      positionEvidence:dominant?.positionEvidence||null,
      evidenceSummary:summarizeEvidence(dominant?.positionEvidence),
      concentrationRatio,
      index
    };
  });
}

function contributionMatchesTerminal(contribution,order){
  if(!contribution)return false;
  const first=Number(order?.[0]);
  const required=Number(contribution.requiredFirstNumber);
  if(Number.isFinite(required)&&required>0&&first!==required)return false;
  return true;
}

function buildBranchStats(terminals){
  const byBranch=new Map();
  for(const terminal of terminals){
    const order=terminal.order.join("-");
    for(const contribution of terminal.branchContributions||[]){
      if(!contributionMatchesTerminal(contribution,terminal.order))continue;
      if(!byBranch.has(contribution.branchId))byBranch.set(contribution.branchId,[]);
      byBranch.get(contribution.branchId).push({order,probability:contribution.probability||0});
    }
  }
  const result=new Map();
  for(const [branchId,items] of byBranch){
    items.sort((a,b)=>b.probability-a.probability||a.order.localeCompare(b.order,"en"));
    result.set(branchId,{
      best:items[0]?.probability||0,
      rankByOrder:new Map(items.map((item,index)=>[item.order,index+1]))
    });
  }
  return result;
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
      dominantBranchId:item.dominantBranchId,dominantBranchLabel:item.dominantBranchLabel,decisionRatios:item.decisionRatios,positionEvidence:item.positionEvidence||null,evidenceSummary:item.evidenceSummary||null,
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
    dominantBranchId:item.dominantBranchId,dominantBranchLabel:item.dominantBranchLabel,decisionRatios:item.decisionRatios,positionEvidence:item.positionEvidence||null,evidenceSummary:item.evidenceSummary||null,
    fundingStatus:"配分済み",minimumRequired:minimum
  }));
}

export function purchaseDiagnostics(classified,plan,budget){
  const probabilities=classified.map(item=>item.probability).sort((a,b)=>b-a);
  const natural=classified.filter(item=>item.purchaseStatus===PURCHASED);
  const noBet=natural.length===0;
  const noBetReason=!noBet?null:classified.length===0?"NO_TERMINALS":(classified[0]?.concentrationRatio||0)<1.04?"FLAT_DISTRIBUTION_NO_SUPPORTED_CANDIDATE":"NO_BRANCH_REPRESENTATIVE";
  const minimumRequired=natural.length*100;
  return{
    terminalCount:classified.length,
    terminalProbabilitySum:sum(probabilities),
    maxTerminalProbability:probabilities[0]||0,
    top3Mass:sum(probabilities.slice(0,3)),top5Mass:sum(probabilities.slice(0,5)),top10Mass:sum(probabilities.slice(0,10)),
    purchaseCandidateCountBeforeCompression:natural.length,
    purchaseCandidateCountAfterCompression:natural.length,
    finalBetCount:natural.length,
    fixedBranchRankCapApplied:false,
    representativeTerminalCount:classified.filter(item=>item.representativeTerminal).length,
    credibleVariantCount:classified.filter(item=>{
      const r=item.decisionRatios||{};
      return item.branchFit>=.87&&(r.first??0)>=.88&&(r.second??0)>=.85&&(r.third??0)>=.85;
    }).length,
    rejectedTerminalCount:classified.length-natural.length,
    classCounts:{
      main:natural.filter(item=>item.betClass==="MAIN").length,
      cover:natural.filter(item=>item.betClass==="COVER").length,
      buyableHigh:natural.filter(item=>item.betClass==="BUYABLE_HIGH").length
    },
    minimumRequired,
    budget:Number(budget||0),
    budgetSufficient:Number(budget||0)>=minimumRequired,
    noBet,noBetReason
  };
}

function summarizeEvidence(evidence){
  if(!evidence)return null;
  return [evidence.first,evidence.second,evidence.third].filter(Boolean).map(item=>{
    const top=(item.drivers||[]).filter(driver=>driver.key!=="roleScore").slice(0,2).map(driver=>`${driver.key} ${Number(driver.value).toFixed(2)}`).join("・");
    return `${item.target==="first"?"1着":item.target==="second"?"2着":"3着"}${item.number}${top?`(${top})`:""}`;
  }).join(" / ");
}

function compareTerminal(a,b){return(b.probability-a.probability)||(b.branchContributions?.length||0)-(a.branchContributions?.length||0)||a.order.join("-").localeCompare(b.order.join("-"),"en")}
function comparePurchase(a,b){
  const classRank={MAIN:0,COVER:1,BUYABLE_HIGH:2,NONE:3};
  return(classRank[a.betClass]??9)-(classRank[b.betClass]??9)||(b.probability-a.probability)||a.order.join("-").localeCompare(b.order.join("-"),"en");
}
function sum(values){return values.reduce((total,value)=>total+value,0)}
