const PURCHASED="購入採用";

export function classify(terminals,odds={}){
  const sorted=[...terminals].sort(compareTerminal);
  if(!sorted.length)return[];

  const probabilities=sorted.map(item=>Number(item.probability)||0);
  const maxProbability=probabilities[0]||0;
  const probabilitySum=sum(probabilities);
  const branchStats=buildBranchStats(sorted);
  const maxBranchTotal=Math.max(...[...branchStats.values()].map(stats=>stats.total),0);

  const evaluated=sorted.map((terminal,index)=>{
    const key=terminal.order.join("-");
    const odd=Number(odds[key]);
    const hasOdds=Number.isFinite(odd)&&odd>1;

    const contributions=[...(terminal.branchContributions||[])]
      .filter(contribution=>contributionMatchesTerminal(contribution,terminal.order))
      .sort((a,b)=>(b.probability||0)-(a.probability||0)||String(a.branchId).localeCompare(String(b.branchId),"en"));

    const dominant=contributions[0]||null;
    const stats=dominant?branchStats.get(dominant.branchId):null;
    const branchFit=stats?.best>0?(dominant?.probability||0)/stats.best:0;
    const branchRank=stats?.rankByOrder.get(key)??null;

    const supportDetails=contributions.map(contribution=>{
      const contributionStats=branchStats.get(contribution.branchId);
      const withinBranchFit=contributionStats?.best>0
        ?(contribution.probability||0)/contributionStats.best
        :0;
      const branchStrengthRatio=maxBranchTotal>0
        ?(contributionStats?.total||0)/maxBranchTotal
        :0;
      return{contribution,withinBranchFit,branchStrengthRatio};
    });

    const uniqueSupportBranchCount=new Set(
      contributions.map(item=>item.branchId).filter(Boolean)
    ).size;

    const weightedBranchSupport=sum(
      supportDetails.map(item=>item.withinBranchFit*item.branchStrengthRatio)
    );

    const ratios=dominant?.decisionRatios||{};
    const ratioValues=[
      Number(ratios.first)||0,
      Number(ratios.second)||0,
      Number(ratios.third)||0
    ];
    const ratioMean=sum(ratioValues)/3;

    const evidenceCount=terminal.positionEvidence
      ?["first","second","third"].filter(key=>terminal.positionEvidence[key]).length
      :0;

    const positionScoreValues=dominant?.positionScores
      ?Object.values(dominant.positionScores).map(value=>Number(value)||0)
      :[];

    const positionScoreMean=positionScoreValues.length
      ?sum(positionScoreValues)/positionScoreValues.length
      :0;

    const evidenceScore=Math.max(
      0,
      Math.min(
        1,
        ratioMean*0.45+
        Math.min(1,evidenceCount/3)*0.25+
        Math.min(1,positionScoreMean/10)*0.20+
        Math.min(1,uniqueSupportBranchCount/3)*0.10
      )
    );

    const relativeProbability=maxProbability>0
      ?(Number(terminal.probability)||0)/maxProbability
      :0;

    /*
     * 重要:
     * 購入採用は branchPriority(main/contender/sub) では決めない。
     * オッズも採用順位を決めない。
     * 終端そのものの確率・着順評価・根拠・独立支持をまとめて評価する。
     */
    const terminalScore=
      relativeProbability*0.55+
      evidenceScore*0.30+
      Math.min(1,weightedBranchSupport)*0.10+
      Math.min(1,uniqueSupportBranchCount/3)*0.05;

    return{
      ...terminal,
      odds:hasOdds?odd:null,
      terminalScore,
      relativeProbability,
      evidenceScore,
      evidenceCount,
      uniqueSupportBranchCount,
      branchSupport:contributions.length,
      weightedBranchSupport,
      dominantBranchId:dominant?.branchId||null,
      dominantBranchLabel:dominant?.branchLabel||null,
      dominantBranchPriority:dominant?.branchPriority||null,
      dominantBranchContribution:dominant?.probability||0,
      dominantBranchStrengthRatio:dominant
        ?(maxBranchTotal>0?(stats?.total||0)/maxBranchTotal:0)
        :0,
      branchFit,
      branchRank,
      decisionRatios:dominant?.decisionRatios||null,
      positionScores:dominant?.positionScores||null,
      positionEvidence:dominant?.positionEvidence||terminal.positionEvidence||null,
      evidenceSummary:summarizeEvidence(dominant?.positionEvidence||terminal.positionEvidence),
      highPayoutAttribute:Boolean(hasOdds&&odd>=100),
      highPayoutAttributeLabel:hasOdds&&odd>=100?"高配当候補":null,
      oddsEvaluationStatus:hasOdds?"ODDS_AVAILABLE":"ODDS_NOT_USED_FOR_SELECTION",
      concentrationRatio:probabilitySum>0?maxProbability/probabilitySum:0,
      index
    };
  });

  /*
   * 参考候補を作ったのに購入0になる旧ゲートを廃止。
   * まず終端総合スコア順に候補を並べ、その後に購入件数を決める。
   *
   * ただし「何でも買う」ことはしない。
   * 有効な終端が無い場合だけ0件にする。
   */
  const positive=evaluated
    .filter(item=>(Number(item.probability)||0)>0)
    .sort((a,b)=>
      (b.terminalScore-a.terminalScore)||
      ((b.probability||0)-(a.probability||0))||
      a.order.join("-").localeCompare(b.order.join("-"),"en")
    );

  const topScore=positive[0]?.terminalScore||0;
  const topProbability=positive[0]?.probability||0;

  /*
   * 動的な購入上限:
   * - 強い候補がある: 最大6点
   * - 全体が拮抗: 最大3点
   * - ただし候補が存在する限り、最上位を理由なく0件にはしない
   */
  const scoreSpread=positive.length>1
    ?topScore/(positive[1]?.terminalScore||topScore)
    :2;

  const maxAdopt=
    topScore>=0.72||scoreSpread>=1.12 ? 6 :
    topScore>=0.55 ? 4 :
    topScore>=0.35 ? 3 : 2;

  /*
   * 点数固定化を防ぐ。
   * maxAdopt は「上限」であり、そこまで必ず埋めない。
   * 上位終端との相対スコア・相対確率・累積確率質量で自然に打ち切る。
   */
  const probabilityMass=sum(positive.map(item=>Number(item.probability)||0));
  let cumulativeMass=0;
  const selected=[];

  for(const item of positive){
    if(selected.length>=maxAdopt)break;

    const relativeScore=topScore>0
      ?item.terminalScore/topScore
      :0;
    const relativeToTopProbability=topProbability>0
      ?(Number(item.probability)||0)/topProbability
      :0;
    const nextMass=probabilityMass>0
      ?cumulativeMass+(Number(item.probability)||0)/probabilityMass
      :0;

    const rank=selected.length+1;

    // 1位は有効終端なら採用。2位以下は「上位と十分競っている」場合だけ残す。
    const competitive=
      rank===1 ||
      (
        relativeScore>=0.86 &&
        relativeToTopProbability>=0.58 &&
        cumulativeMass<0.78
      ) ||
      (
        rank<=3 &&
        relativeScore>=0.92 &&
        relativeToTopProbability>=0.72
      );

    if(!competitive)break;

    selected.push(item);
    cumulativeMass=nextMass;
  }

  const selectedKeys=new Set(selected.map(item=>item.order.join("-")));

  return evaluated.map(item=>{
    const key=item.order.join("-");
    const rank=positive.findIndex(candidate=>candidate.order.join("-")===key)+1;
    const adopted=selectedKeys.has(key);

    let betClass="NONE";
    if(adopted){
      betClass=rank===1?"MAIN":rank<=3?"COVER":"BUYABLE_HIGH";
    }

    let purchaseReason="終端総合評価が購入候補順位に届かない";
    if(adopted){
      purchaseReason=
        `終端総合評価順位${rank}位：確率・着順評価・根拠・独立支持を総合評価`+
        (item.highPayoutAttribute?"＋実オッズ高配当属性":"");
    }

    const purchaseRejectCode=adopted
      ?"ADOPTED"
      :positive.length===0
        ?"NO_VALID_TERMINAL"
        :rank===-1
          ?"OUTSIDE_PURCHASE_CUTOFF"
          :"PURCHASE_CUTOFF";

    return{
      ...item,
      betClass,
      purchaseStatus:adopted?PURCHASED:"購入不採用",
      purchaseReason,
      purchaseRejectCode,
      representativeTerminal:rank===1,
      purchaseRank:rank>0?rank:null,
      purchaseCandidateCount:positive.length,
      purchaseCutoff:maxAdopt,
      purchaseScoreTop:topScore,
      purchaseProbabilityTop:topProbability,
      rawBranchCountUsedForAdoption:false
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
      byBranch.get(contribution.branchId).push({
        order,
        probability:contribution.probability||0
      });
    }
  }

  const result=new Map();
  for(const [branchId,items] of byBranch){
    items.sort((a,b)=>
      b.probability-a.probability||
      a.order.localeCompare(b.order,"en")
    );
    result.set(branchId,{
      best:items[0]?.probability||0,
      total:sum(items.map(item=>item.probability)),
      rankByOrder:new Map(items.map((item,index)=>[item.order,index+1]))
    });
  }
  return result;
}

export function composite(items){
  const values=items.filter(
    item=>(item.purchaseStatus==null||item.purchaseStatus===PURCHASED)&&item.odds>1
  );
  return values.length
    ?1/values.reduce((sum,item)=>sum+1/item.odds,0)
    :null;
}

export function allocate(items,budget){
  const natural=items
    .filter(item=>item.purchaseStatus===PURCHASED)
    .sort(comparePurchase);

  if(!natural.length)return[];

  const minimum=natural.length*100;
  const numericBudget=Math.max(0,Number(budget||0));

  if(numericBudget<minimum){
    return natural.map(item=>({
      order:item.order,
      betClass:item.betClass,
      stake:null,
      odds:item.odds,
      expectedPayout:null,
      probability:item.probability,
      terminalScore:item.terminalScore,
      branchSupport:item.branchSupport,
      purchaseReason:item.purchaseReason,
      dominantBranchId:item.dominantBranchId,
      dominantBranchLabel:item.dominantBranchLabel,
      decisionRatios:item.decisionRatios,
      positionEvidence:item.positionEvidence||null,
      evidenceSummary:item.evidenceSummary||null,
      highPayoutAttribute:Boolean(item.highPayoutAttribute),
      highPayoutAttributeLabel:item.highPayoutAttributeLabel||null,
      fundingStatus:"予算不足",
      minimumRequired:minimum
    }));
  }

  const weights=natural.map(item=>Math.max(Number(item.terminalScore)||0.0001,0.0001));
  const weightSum=weights.reduce((a,b)=>a+b,0);
  const stakes=weights.map(
    weight=>Math.floor((numericBudget*weight/weightSum)/100)*100
  );

  let remaining=numericBudget-stakes.reduce((a,b)=>a+b,0);
  let index=0;
  while(remaining>=100){
    stakes[index%stakes.length]+=100;
    remaining-=100;
    index+=1;
  }

  return natural.map((item,i)=>({
    order:item.order,
    betClass:item.betClass,
    stake:stakes[i],
    odds:item.odds,
    expectedPayout:item.odds?Math.floor(stakes[i]*item.odds):null,
    probability:item.probability,
    terminalScore:item.terminalScore,
    branchSupport:item.branchSupport,
    purchaseReason:item.purchaseReason,
    dominantBranchId:item.dominantBranchId,
    dominantBranchLabel:item.dominantBranchLabel,
    decisionRatios:item.decisionRatios,
    positionEvidence:item.positionEvidence||null,
    evidenceSummary:item.evidenceSummary||null,
    highPayoutAttribute:Boolean(item.highPayoutAttribute),
    highPayoutAttributeLabel:item.highPayoutAttributeLabel||null,
    fundingStatus:"配分済み",
    minimumRequired:minimum
  }));
}

export function purchaseDiagnostics(classified,plan,budget){
  const probabilities=classified
    .map(item=>Number(item.probability)||0)
    .sort((a,b)=>b-a);

  const natural=classified.filter(item=>item.purchaseStatus===PURCHASED);
  const rejected=classified.filter(item=>item.purchaseStatus!==PURCHASED);
  const noBet=natural.length===0;

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
    top3Mass:sum(probabilities.slice(0,3)),
    top5Mass:sum(probabilities.slice(0,5)),
    top10Mass:sum(probabilities.slice(0,10)),
    purchaseCandidateCountBeforeCompression:classified.filter(
      item=>item.purchaseCandidateCount>0
    ).length,
    purchaseCandidateCountAfterCompression:natural.length,
    finalBetCount:natural.length,
    fixedBranchRankCapApplied:false,
    representativeTerminalCount:classified.filter(
      item=>item.representativeTerminal
    ).length,
    credibleVariantCount:classified.filter(
      item=>(item.evidenceScore||0)>=0.55
    ).length,
    adoptedTerminalCount:natural.length,
    rejectedTerminalCount:classified.length-natural.length,
    rejectCodeCounts,
    purchaseThresholds:{
      branchPriorityGate:false,
      oddsSelectionGate:false,
      thirdVariantSelectionGate:false,
      concentrationRatioGate:false,
      dynamicPurchaseCutoff:true,
      dynamicCountByTerminalCompetition:true,
      relativeScoreFloor:0.86,
      relativeProbabilityFloor:0.58,
      cumulativeMassStop:0.78,
      maxPurchasePoints:6
    },
    adoptedTerminalAudit:natural.map(item=>({
      order:item.order.join("-"),
      betClass:item.betClass,
      probability:item.probability,
      terminalScore:item.terminalScore,
      dominantBranchId:item.dominantBranchId,
      dominantBranchLabel:item.dominantBranchLabel,
      dominantBranchPriority:item.dominantBranchPriority,
      branchFit:item.branchFit,
      branchRank:item.branchRank,
      branchSupport:item.branchSupport,
      weightedBranchSupport:item.weightedBranchSupport,
      uniqueSupportBranchCount:item.uniqueSupportBranchCount,
      representativeTerminal:item.representativeTerminal,
      evidenceScore:item.evidenceScore,
      purchaseRank:item.purchaseRank,
      purchaseReason:item.purchaseReason
    })),
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
      buyableHigh:natural.filter(item=>item.betClass==="BUYABLE_HIGH").length
    },
    minimumRequired:natural.length*100,
    budget:Number(budget||0),
    budgetSufficient:Number(budget||0)>=natural.length*100,
    noBet,
    noBetReason:noBet
      ?classified.length===0
        ?"NO_TERMINALS"
        :"NO_VALID_TERMINAL"
      :null
  };
}

function summarizeEvidence(evidence){
  if(!evidence)return null;
  return[
    evidence.first,
    evidence.second,
    evidence.third
  ]
    .filter(Boolean)
    .map(item=>{
      const drivers=Array.isArray(item.drivers)?item.drivers:[];
      const top=drivers
        .filter(driver=>driver.key!=="roleScore")
        .slice(0,2)
        .map(driver=>`${driver.key} ${Number(driver.value).toFixed(2)}`)
        .join("・");
      return`${item.target==="first"?"1着":item.target==="second"?"2着":"3着"}${item.number}${top?`(${top})`:""}`;
    })
    .join(" / ");
}

function compareTerminal(a,b){
  return(
    (b.probability-a.probability)||
    (b.branchContributions?.length||0)-(a.branchContributions?.length||0)||
    a.order.join("-").localeCompare(b.order.join("-"),"en")
  );
}

function comparePurchase(a,b){
  const classRank={MAIN:0,COVER:1,BUYABLE_HIGH:2,NONE:3};
  return(
    (classRank[a.betClass]??9)-(classRank[b.betClass]??9)||
    (b.terminalScore-a.terminalScore)||
    (b.probability-a.probability)||
    a.order.join("-").localeCompare(b.order.join("-"),"en")
  );
}

function sum(values){
  return values.reduce((total,value)=>total+value,0);
}
