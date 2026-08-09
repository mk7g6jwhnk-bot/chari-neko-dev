const PURCHASED="購入採用";

export function classify(terminals,odds={}){
  const sorted=[...terminals].sort(compareTerminal);
  if(!sorted.length)return[];

  const max=sorted[0].probability||0;
  const concentrationRatio=max*sorted.length;
  const branchStats=buildBranchStats(sorted);
  const thirdVariantStats=buildThirdVariantStats(sorted);
  const maxBranchTotal=Math.max(...[...branchStats.values()].map(stats=>stats.total),0);

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
    const supportDetails=contributions.map(contribution=>{
      const contributionStats=branchStats.get(contribution.branchId);
      const withinBranchFit=contributionStats?.best>0?(contribution.probability||0)/contributionStats.best:0;
      const branchStrengthRatio=maxBranchTotal>0?(contributionStats?.total||0)/maxBranchTotal:0;
      return{contribution,withinBranchFit,branchStrengthRatio,weightedSupport:withinBranchFit*branchStrengthRatio};
    });
    const weightedBranchSupport=sum(supportDetails.map(item=>item.weightedSupport));
    const ratios=dominant?.decisionRatios||{};
    const positionConverged=(ratios.first??0)>=.93&&(ratios.second??0)>=.91&&(ratios.third??0)>=.91;
    const positionNear=(ratios.first??0)>=.88&&(ratios.second??0)>=.85&&(ratios.third??0)>=.85;
    const representative=branchFit>=.975&&positionConverged;
    const credibleVariant=branchFit>=.87&&positionNear;
    const thirdGroupKey=dominant?thirdVariantGroupKey(dominant.branchId,terminal.order):null;
    const thirdStats=thirdGroupKey?thirdVariantStats.get(thirdGroupKey):null;
    const thirdVariantEligible=thirdStats?thirdStats.supportedOrders.has(key):true;
    const thirdVariantRelativeToBest=thirdStats?.relativeToBestByOrder.get(key)??null;
    const thirdVariantConditionalShare=thirdStats?.conditionalShareByOrder.get(key)??null;
    const highPayoutCandidate=Boolean(dominant&&dominant.branchPriority==="sub"&&credibleVariant&&thirdVariantEligible);
    const highPayoutAttribute=Boolean(hasOdds&&odd>=100);

    let betClass="NONE";
    let adopted=false;
    let purchaseReason="展開代表性または着順別評価が不足";

    if(concentrationRatio<1.04){
      purchaseReason=`terminal分布が平坦（集中比${concentrationRatio.toFixed(3)}）`;
    }else if(dominant){
      const isMainBranch=dominant.branchPriority==="main";
      const isContenderBranch=dominant.branchPriority==="contender";
      const isSubBranch=dominant.branchPriority==="sub";
      const highValue=isSubBranch&&highPayoutAttribute&&highPayoutCandidate;

      // Purchase category follows the scenario tier. Payout never rewrites a main/contender
      // scenario into BUYABLE_HIGH; high odds are retained as an attribute instead.
      if(!thirdVariantEligible){
        purchaseReason=`${dominant.branchLabel}の同一1-2着内で3着支持が自然境界の下位群`;
      }else if(isMainBranch&&representative){
        betClass="MAIN";
        adopted=true;
        purchaseReason=`${dominant.branchLabel}の代表終端（3着独立支持を確認）${highPayoutAttribute?`＋実オッズ${odd.toFixed(1)}倍の本線高配当属性`:""}`;
      }else if(isMainBranch&&credibleVariant){
        betClass="COVER";
        adopted=true;
        purchaseReason=`${dominant.branchLabel}の成立可能な着順変化（3着独立支持を確認）${highPayoutAttribute?`＋実オッズ${odd.toFixed(1)}倍の高配当属性`:""}`;
      }else if(isContenderBranch&&(representative||credibleVariant||(weightedBranchSupport>=2&&branchFit>=.90))){
        betClass="COVER";
        adopted=true;
        purchaseReason=`${dominant.branchLabel}由来の有力展開カバー（3着独立支持を確認）${highPayoutAttribute?`＋実オッズ${odd.toFixed(1)}倍の高配当属性`:""}`;
      }else if(highValue){
        betClass="BUYABLE_HIGH";
        adopted=true;
        purchaseReason=`${dominant.branchLabel}の別展開＋実オッズ${odd.toFixed(1)}倍で買える高配当`;
      }else if(isSubBranch&&highPayoutCandidate&&!hasOdds){
        purchaseReason=`${dominant.branchLabel}の別展開高配当候補・実オッズ待ち`;
      }else if(isSubBranch){
        purchaseReason=`${dominant.branchLabel}は別展開のため、実オッズ妙味確認前は購入不採用`;
      }
    }

    const purchaseRejectCode=adopted
      ?"ADOPTED"
      :concentrationRatio<1.04
        ?"FLAT_DISTRIBUTION"
        :!dominant
          ?"NO_DOMINANT_BRANCH"
          :!thirdVariantEligible
            ?"THIRD_VARIANT_SUPPORT"
            :dominant?.branchPriority==="sub"&&highPayoutCandidate&&!hasOdds
              ?"SUB_ODDS_PENDING"
              :dominant?.branchPriority==="sub"
                ?"SUB_NO_VALUE"
                :!(representative||credibleVariant)
                  ?"BRANCH_OR_POSITION_SUPPORT"
                  :"CLASS_RULE";

    return{
      ...terminal,
      odds:hasOdds?odd:null,
      betClass,
      purchaseStatus:adopted?PURCHASED:"購入不採用",
      purchaseReason,
      purchaseRejectCode,
      branchSupport:support,
      weightedBranchSupport,
      rawBranchCountUsedForAdoption:false,
      dominantBranchId:dominant?.branchId||null,
      dominantBranchLabel:dominant?.branchLabel||null,
      dominantBranchPriority:dominant?.branchPriority||null,
      dominantBranchContribution:dominant?.probability||0,
      dominantBranchStrengthRatio:dominant?((maxBranchTotal>0?(stats?.total||0)/maxBranchTotal:0)):0,
      branchFit,
      branchRank,
      representativeTerminal:representative,
      thirdVariantEligible,
      thirdVariantGroupKey:thirdGroupKey,
      thirdVariantRelativeToBest,
      thirdVariantConditionalShare,
      thirdVariantNaturalCutDetected:thirdStats?.naturalCutDetected||false,
      thirdVariantCutGap:thirdStats?.cutGap??null,
      thirdVariantGroupSize:thirdStats?.groupSize??null,
      highPayoutCandidate,
      highPayoutAttribute,
      highPayoutAttributeLabel:highPayoutAttribute?(dominant?.branchPriority==="main"?"本線高配当":dominant?.branchPriority==="contender"?"有力展開高配当":dominant?.branchPriority==="sub"?"別展開高配当":"高配当"):null,
      oddsEvaluationStatus:hasOdds?"ODDS_AVAILABLE":(highPayoutCandidate?"ODDS_PENDING":"NOT_VALUE_CANDIDATE"),
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
      total:sum(items.map(item=>item.probability)),
      rankByOrder:new Map(items.map((item,index)=>[item.order,index+1]))
    });
  }
  return result;
}

function buildThirdVariantStats(terminals){
  const groups=new Map();
  for(const terminal of terminals){
    const contributions=[...(terminal.branchContributions||[])]
      .filter(contribution=>contributionMatchesTerminal(contribution,terminal.order))
      .sort((a,b)=>(b.probability||0)-(a.probability||0)||String(a.branchId).localeCompare(String(b.branchId),"en"));
    const dominant=contributions[0];
    if(!dominant)continue;
    const key=thirdVariantGroupKey(dominant.branchId,terminal.order);
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push({order:terminal.order.join("-"),probability:dominant.probability||0});
  }
  const result=new Map();
  for(const [key,items] of groups){
    items.sort((a,b)=>b.probability-a.probability||a.order.localeCompare(b.order,"en"));
    const best=items[0]?.probability||0;
    const total=sum(items.map(item=>item.probability));
    const ratios=items.map(item=>best>0?item.probability/best:0);
    const gaps=[];
    for(let i=0;i<ratios.length-1;i+=1)gaps.push({index:i,gap:Math.max(0,ratios[i]-ratios[i+1])});
    const sortedGaps=[...gaps].sort((a,b)=>b.gap-a.gap||a.index-b.index);
    const largest=sortedGaps[0]||null;
    const totalRange=ratios.length>1?Math.max(0,ratios[0]-ratios[ratios.length-1]):0;
    const otherGapSum=largest?Math.max(0,totalRange-largest.gap):0;
    const tiedLargest=largest?sortedGaps.filter(item=>Math.abs(item.gap-largest.gap)<1e-12).length>1:false;
    const naturalCutDetected=items.length>=3&&Boolean(largest)&&!tiedLargest&&largest.gap>otherGapSum;
    const cutIndex=naturalCutDetected?largest.index:items.length-1;
    const supportedOrders=new Set(items.slice(0,cutIndex+1).map(item=>item.order));
    result.set(key,{
      groupSize:items.length,
      best,total,
      naturalCutDetected,
      cutGap:naturalCutDetected?largest.gap:null,
      supportedOrders,
      relativeToBestByOrder:new Map(items.map((item,index)=>[item.order,ratios[index]])),
      conditionalShareByOrder:new Map(items.map(item=>[item.order,total>0?item.probability/total:0]))
    });
  }
  return result;
}

function thirdVariantGroupKey(branchId,order){
  return `${branchId||"-"}|${Number(order?.[0])||0}-${Number(order?.[1])||0}`;
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
      highPayoutAttribute:Boolean(item.highPayoutAttribute),highPayoutAttributeLabel:item.highPayoutAttributeLabel||null,
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
    highPayoutAttribute:Boolean(item.highPayoutAttribute),highPayoutAttributeLabel:item.highPayoutAttributeLabel||null,
    fundingStatus:"配分済み",minimumRequired:minimum
  }));
}

export function purchaseDiagnostics(classified,plan,budget){
  const probabilities=classified.map(item=>item.probability).sort((a,b)=>b-a);
  const natural=classified.filter(item=>item.purchaseStatus===PURCHASED);
  const noBet=natural.length===0;
  const noBetReason=!noBet?null:classified.length===0?"NO_TERMINALS":(classified[0]?.concentrationRatio||0)<1.04?"FLAT_DISTRIBUTION_NO_SUPPORTED_CANDIDATE":"NO_BRANCH_REPRESENTATIVE";
  const minimumRequired=natural.length*100;
  const rejected=classified.filter(item=>item.purchaseStatus!==PURCHASED);
  const rejectCodeCounts=rejected.reduce((counts,item)=>{
    const code=item.purchaseRejectCode||"UNKNOWN";
    counts[code]=(counts[code]||0)+1;
    return counts;
  },{});
  return{
    generatedTerminalCount:classified.length,
    probabilityEvaluatedTerminalCount:classified.length,
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
    adoptedTerminalCount:natural.length,
    rejectedTerminalCount:classified.length-natural.length,
    rejectCodeCounts,
    purchaseThresholds:{
      concentrationRatioMin:1.04,
      representativeBranchFitMin:.975,
      credibleVariantBranchFitMin:.87,
      probabilitySupportVsMaxMin:null,
      rawBranchCountUsedForAdoption:false,
      weightedMultiBranchSupportEquivalentMin:2,
      thirdVariantSelectionMode:"ADAPTIVE_NATURAL_GAP_WITHIN_BRANCH_FIRST_SECOND",
      representativePositionRatios:{first:.93,second:.91,third:.91},
      credibleVariantPositionRatios:{first:.88,second:.85,third:.85}
    },
    adoptedTerminalAudit:natural.map(item=>{
      const diagnosticBranchStats=buildBranchStats(classified);
      const diagnosticMaxBranchTotal=Math.max(...[...diagnosticBranchStats.values()].map(stats=>stats.total),0);
      const supportBranches=[...(item.branchContributions||[])]
        .filter(contribution=>contributionMatchesTerminal(contribution,item.order))
        .sort((a,b)=>(b.probability||0)-(a.probability||0)||String(a.branchId).localeCompare(String(b.branchId),"en"))
        .map(contribution=>{
          const supportStats=diagnosticBranchStats.get(contribution.branchId);
          const withinBranchFit=supportStats?.best>0?(contribution.probability||0)/supportStats.best:0;
          const branchStrengthRatio=diagnosticMaxBranchTotal>0?(supportStats?.total||0)/diagnosticMaxBranchTotal:0;
          return{
            branchId:contribution.branchId||null,
            branchLabel:contribution.branchLabel||null,
            branchPriority:contribution.branchPriority||null,
            probability:contribution.probability||0,
            requiredFirstNumber:contribution.requiredFirstNumber??null,
            withinBranchFit,
            branchStrengthRatio,
            weightedSupport:withinBranchFit*branchStrengthRatio
          };
        });
      const uniqueSupportBranchIds=[...new Set(supportBranches.map(branch=>branch.branchId).filter(Boolean))];
      const supportLabelCounts=supportBranches.reduce((counts,branch)=>{
        const label=branch.branchLabel||"不明";
        counts[label]=(counts[label]||0)+1;
        return counts;
      },{});
      const duplicateSupportLabels=Object.entries(supportLabelCounts)
        .filter(([,count])=>count>1)
        .map(([label,count])=>({label,count}));
      return{
        order:item.order.join("-"),
        betClass:item.betClass,
        probability:item.probability,
        dominantBranchId:item.dominantBranchId,
        dominantBranchLabel:item.dominantBranchLabel,
        dominantBranchPriority:item.dominantBranchPriority,
        dominantBranchTierLabel:branchPriorityLabel(item.dominantBranchPriority),
        branchFit:item.branchFit,
        branchRank:item.branchRank,
        branchSupport:item.branchSupport,
        weightedBranchSupport:item.weightedBranchSupport??sum(supportBranches.map(branch=>branch.weightedSupport||0)),
        thirdVariantEligible:item.thirdVariantEligible??true,
        thirdVariantGroupKey:item.thirdVariantGroupKey||null,
        thirdVariantRelativeToBest:item.thirdVariantRelativeToBest??null,
        thirdVariantConditionalShare:item.thirdVariantConditionalShare??null,
        thirdVariantNaturalCutDetected:item.thirdVariantNaturalCutDetected||false,
        thirdVariantCutGap:item.thirdVariantCutGap??null,
        thirdVariantGroupSize:item.thirdVariantGroupSize??null,
        highPayoutCandidate:Boolean(item.highPayoutCandidate),
        highPayoutAttribute:Boolean(item.highPayoutAttribute),
        highPayoutAttributeLabel:item.highPayoutAttributeLabel||null,
        oddsEvaluationStatus:item.oddsEvaluationStatus||null,
        rawBranchCountUsedForAdoption:false,
        dominantBranchStrengthRatio:item.dominantBranchStrengthRatio??null,
        uniqueSupportBranchCount:uniqueSupportBranchIds.length,
        supportBranches,
        duplicateSupportLabels,
        representativeTerminal:item.representativeTerminal,
        decisionRatios:item.decisionRatios||null,
        purchaseReason:item.purchaseReason
      };
    }),
    adoptedBranchCounts:natural.reduce((counts,item)=>{
      const label=item.dominantBranchLabel||"不明";
      counts[label]=(counts[label]||0)+1;
      return counts;
    },{}),
    adoptedBranchTierCounts:natural.reduce((counts,item)=>{
      const priority=item.dominantBranchPriority||"unknown";
      counts[priority]=(counts[priority]||0)+1;
      return counts;
    },{}),
    classCounts:{
      main:natural.filter(item=>item.betClass==="MAIN").length,
      cover:natural.filter(item=>item.betClass==="COVER").length,
      buyableHigh:natural.filter(item=>item.betClass==="BUYABLE_HIGH").length,
      highPayoutCandidateOddsPending:classified.filter(item=>item.highPayoutCandidate&&item.oddsEvaluationStatus==="ODDS_PENDING").length
    },
    minimumRequired,
    budget:Number(budget||0),
    budgetSufficient:Number(budget||0)>=minimumRequired,
    noBet,noBetReason
  };
}


function branchPriorityLabel(priority){
  return ({main:"本命展開",contender:"有力展開",sub:"別展開",risk:"リスク枝"})[priority]||"不明";
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
