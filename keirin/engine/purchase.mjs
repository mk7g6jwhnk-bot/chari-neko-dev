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
    const ratioFit=geometricMean(ratioValues.filter(value=>value>0));

    const evidenceCount=terminal.positionEvidence
      ?["first","second","third"].filter(key=>terminal.positionEvidence[key]).length
      :0;

    const positionScoreValues=dominant?.positionScores
      ?Object.values(dominant.positionScores).map(value=>Number(value)||0)
      :[];

    const positionFit=geometricMean(positionScoreValues.map(value=>Math.min(1,Math.max(0,value/10))));
    const positionBalance=positionScoreValues.length
      ?Math.min(...positionScoreValues)/Math.max(...positionScoreValues,1e-9)
      :0;

    const evidenceScore=Math.max(
      0,
      Math.min(
        1,
        positionFit*0.55+
        positionBalance*0.20+
        ratioFit*0.15+
        Math.min(1,evidenceCount/3)*0.10
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
      relativeProbability*0.65+
      evidenceScore*0.35;

    return{
      ...terminal,
      odds:hasOdds?odd:null,
      terminalScore,
      relativeProbability,
      evidenceScore,
      positionFit,
      positionBalance,
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
  const distributionSelection=selectNaturalTerminalCluster(positive);
  const pairAdjusted=limitUnseparatedThirdVariants(distributionSelection.selected,positive);
  const selected=pairAdjusted.selected;
  const purchaseFunnel=buildPurchaseFunnel({generated:positive,natural:distributionSelection.selected,pairPassed:selected,final:selected});
  const purchaseConcentrationAudit=buildPurchaseConcentrationAudit(positive,selected,distributionSelection.audit);
  const purchaseDistributionAudit={...distributionSelection.audit,...pairAdjusted.audit,purchaseFunnel,purchaseConcentrationAudit};

  const selectedKeys=new Set(selected.map(item=>item.order.join("-")));

  return evaluated.map(item=>{
    const key=item.order.join("-");
    const rank=positive.findIndex(candidate=>candidate.order.join("-")===key)+1;
    const adopted=selectedKeys.has(key);
    const thirdVariantDecision=pairAdjusted.decisionsByOrder.get(key)||null;

    let betClass="NONE";
    if(adopted){
      betClass=rank===1?"MAIN":"COVER";
    }

    let purchaseReason="終端総合評価が購入候補順位に届かない";
    if(adopted){
      purchaseReason=
        `終端総合評価順位${rank}位：確率・着順評価・根拠・独立支持を総合評価`+
        (item.highPayoutAttribute?"＋実オッズ高配当属性":"");
    }

    const purchaseRejectCode=adopted
      ?"ADOPTED"
      :thirdVariantDecision?.localRejected
        ?"THIRD_VARIANT_AMBIGUITY"
      :thirdVariantDecision?.boundaryRejected
        ?"THIRD_VARIANT_BOUNDARY"
      :distributionSelection.audit.selectionMode==="DIFFUSE_NO_NATURAL_BOUNDARY"
        ?"DIFFUSE_NO_NATURAL_BOUNDARY"
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
      thirdVariantAmbiguityPair:thirdVariantDecision?.ambiguityPair||null,
      thirdVariantLocalRejected:Boolean(thirdVariantDecision?.localRejected),
      thirdVariantBoundaryRejected:Boolean(thirdVariantDecision?.boundaryRejected),
      representativeTerminal:rank===1,
      purchaseRank:rank>0?rank:null,
      purchaseCandidateCount:selected.length,
      purchaseCutoff:selected.length,
      purchaseScoreTop:topScore,
      purchaseProbabilityTop:topProbability,
      // This is a race-level decision audit. Keeping a full copy (including
      // third-variant removal/ambiguity arrays) on every terminal made 504-row
      // Function responses exceed the platform response-size limit.
      ...(rank===1?{purchaseDistributionAudit}:{}),
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
      ...thickQualificationFields(item),
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
      coverParentOrder:item.coverParentOrder||null,
      coverParentType:item.coverParentType||null,
      orphanCover:Boolean(item.orphanCover),
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
    ...thickQualificationFields(item),
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
    coverParentOrder:item.coverParentOrder||null,
    coverParentType:item.coverParentType||null,
    orphanCover:Boolean(item.orphanCover),
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
  const purchaseDistributionAudit=classified.find(item=>item.purchaseDistributionAudit)?.purchaseDistributionAudit||null;

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
    purchaseCandidateCountBeforeCompression:natural.length,
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
    purchaseDistributionAudit,
    purchaseThresholds:{
      branchPriorityGate:false,
      oddsSelectionGate:false,
      thirdVariantSelectionGate:false,
      concentrationRatioGate:false,
      branchPriorityGate:false,
      oddsSelectionGate:false,
      naturalDistributionBoundary:true,
      fixedTopN:false,
      maximumPurchasePoints:null
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
    orphanCoverCount:natural.filter(item=>item.betClass==="COVER"&&item.orphanCover===true).length,
    minimumRequired:natural.length*100,
    budget:Number(budget||0),
    budgetSufficient:Number(budget||0)>=natural.length*100,
    noBet,
    noBetReason:noBet
      ?classified.length===0
        ?"NO_TERMINALS"
        :classified.every(item=>item.purchaseRejectCode==="DIFFUSE_NO_NATURAL_BOUNDARY")
          ?"DIFFUSE_NO_NATURAL_BOUNDARY"
          :purchaseDistributionAudit?.thirdVariantAmbiguity?.causesNoBet
            ?"THIRD_VARIANT_AMBIGUITY"
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

function selectNaturalTerminalCluster(items){
  const rows=[...(items||[])].sort((a,b)=>b.terminalScore-a.terminalScore||b.probability-a.probability);
  if(!rows.length)return{selected:[],audit:boundaryAudit({initialTerminalCount:0,selectionMode:"NO_VALID_TERMINAL"})};
  if(rows.length===1)return{selected:rows,audit:boundaryAudit({initialTerminalCount:1,selectionMode:"ONLY_VALID_TERMINAL",boundaryRank:1,boundaryDetected:true,selectedMass:Number(rows[0].probability)||0,singletonSelection:true,singletonJustification:"ONLY_VALID_TERMINAL"})};

  // The reference distribution is immutable for the whole purchase decision.
  // Do not re-estimate median/MAD after slicing the upper cluster.
  const boundary=detectNaturalBoundary(rows,{allowGlobalSmallSample:true});
  if(!boundary.detected){
    return{selected:[],audit:boundaryAudit({initialTerminalCount:rows.length,selectionMode:"DIFFUSE_NO_NATURAL_BOUNDARY",boundaryDetected:false,...boundary})};
  }
  const selected=rows.slice(0,boundary.index+1);
  const singletonSelection=selected.length===1;
  if(singletonSelection){
    // A singleton must also be visible in the actual terminal probability
    // distribution. positionScore and decisionRatios already contributed to
    // that probability, so a score-only split would count the same evidence a
    // second time at the purchase boundary.
    const probabilityBoundary=detectNaturalBoundary(
      rows.map(item=>({...item,terminalScore:Number(item.probability)||0})),
      {allowGlobalSmallSample:true}
    );
    if(probabilityBoundary.detected&&probabilityBoundary.index>0){
      const probabilitySelected=rows.slice(0,probabilityBoundary.index+1);
      return{selected:probabilitySelected,audit:boundaryAudit({
        initialTerminalCount:rows.length,
        selectionMode:"TERMINAL_PROBABILITY_BOUNDARY_OVERRIDES_UNCONFIRMED_SCORE_SINGLETON",
        boundaryDetected:true,
        boundaryRank:probabilitySelected.length,
        bestGap:probabilityBoundary.bestGap,
        medianGap:probabilityBoundary.medianGap,
        mad:probabilityBoundary.mad,
        bestStrength:probabilityBoundary.bestStrength,
        relativeDrop:probabilityBoundary.relativeDrop,
        selectedMass:sum(probabilitySelected.map(item=>Number(item.probability)||0)),
        singletonSelection:false,
        singletonJustification:null,
        scoreBoundaryRank:1,
        probabilityBoundaryRank:probabilitySelected.length
      })};
    }
    if(!probabilityBoundary.detected){
      return{selected:[],audit:boundaryAudit({
        initialTerminalCount:rows.length,
        selectionMode:"SINGLETON_NOT_CONFIRMED_BY_TERMINAL_PROBABILITY",
        boundaryDetected:false,
        ...boundary,
        singletonSelection:false,
        singletonJustification:null,
        scoreBoundaryRank:1,
        probabilityBoundaryRank:probabilityBoundary.detected?probabilityBoundary.index+1:null,
        probabilityBoundaryGap:probabilityBoundary.bestGap,
        probabilityBoundaryStrength:probabilityBoundary.bestStrength
      })};
    }
  }
  return{selected,audit:boundaryAudit({
    initialTerminalCount:rows.length,
    selectionMode:"GLOBAL_NATURAL_SCORE_DISCONTINUITY",
    boundaryRank:selected.length,boundaryDetected:true,...boundary,
    selectedMass:sum(selected.map(item=>Number(item.probability)||0)),
    singletonSelection,
    singletonJustification:singletonSelection
      ?"GLOBAL_TOP_TERMINAL_GAP_EXCEEDS_FULL_DISTRIBUTION_BASELINE"
      :null
  })};
}

function detectNaturalBoundary(rows,{allowGlobalSmallSample=false}={}){
  const top=Math.max(Number(rows[0]?.terminalScore)||0,1e-12);
  const values=rows.map(item=>(Number(item.terminalScore)||0)/top);
  const gaps=values.slice(0,-1).map((value,index)=>Math.max(0,value-values[index+1]));
  const medianGap=median(gaps);
  const mad=median(gaps.map(gap=>Math.abs(gap-medianGap)));
  const noiseScale=Math.max(medianGap,1.4826*mad,Number.EPSILON);
  const best=gaps.map((gap,index)=>({index,gap,strength:(gap-medianGap)/noiseScale,relativeDrop:values[index]>0?gap/values[index]:0}))
    .sort((a,b)=>b.strength-a.strength||b.gap-a.gap||a.index-b.index)[0];
  const orderedGaps=[...gaps].sort((a,b)=>b-a);
  const smallSampleSeparation=allowGlobalSmallSample&&rows.length<=4&&best?.gap>0&&best.gap>(orderedGaps[1]||0)*1.8;
  const detected=Boolean(best&&(smallSampleSeparation||best.gap>medianGap+2.5*1.4826*mad));
  return{detected,index:best?.index??-1,medianGap,mad,bestGap:best?.gap||0,bestStrength:best?.strength||0,relativeDrop:best?.relativeDrop||0,globalSmallSampleSeparation:smallSampleSeparation};
}

function limitUnseparatedThirdVariants(selected,allItems){
  const selectedKeys=new Set(selected.map(item=>item.order.join("-")));
  const decisionsByOrder=new Map();
  const byPair=new Map();
  for(const item of allItems){
    const pair=`${item.order?.[0]}-${item.order?.[1]}`;
    if(!byPair.has(pair))byPair.set(pair,[]);
    byPair.get(pair).push(item);
  }
  const removed=[];
  const ambiguities=[];
  for(const [pair,rows] of byPair){
    const chosen=rows.filter(item=>selectedKeys.has(item.order.join("-")));
    if(chosen.length<=1)continue;
    const ordered=[...rows].sort((a,b)=>b.terminalScore-a.terminalScore||b.probability-a.probability);
    const thirdBoundary=detectNaturalBoundary(ordered,{allowGlobalSmallSample:false});
    if(!thirdBoundary.detected){
      ambiguities.push({pair,candidateCount:rows.length,selectedCount:chosen.length,reason:"THIRD_VARIANTS_NOT_SEPARABLE",boundaryGap:thirdBoundary.bestGap,boundaryMedianGap:thirdBoundary.medianGap,boundaryMAD:thirdBoundary.mad,boundaryStrength:thirdBoundary.bestStrength});
      for(const item of rows){
        const order=item.order.join("-");
        decisionsByOrder.set(order,{ambiguityPair:pair,localRejected:selectedKeys.has(order),boundaryRejected:false});
        selectedKeys.delete(order);
      }
      continue;
    }
    const supported=new Set(ordered.slice(0,thirdBoundary.index+1).map(item=>item.order.join("-")));
    for(const item of chosen)if(!supported.has(item.order.join("-"))){
      const order=item.order.join("-");
      selectedKeys.delete(order);
      decisionsByOrder.set(order,{ambiguityPair:null,localRejected:false,boundaryRejected:true});
      removed.push({pair,order,reason:"THIRD_VARIANT_GLOBAL_PAIR_BOUNDARY"});
    }
  }
  const ambiguityDetected=ambiguities.length>0;
  const locallyRejectedCount=[...decisionsByOrder.values()].filter(item=>item.localRejected).length;
  const causesNoBet=selected.length>0&&locallyRejectedCount===selected.length;
  return{
    selected:selected.filter(item=>selectedKeys.has(item.order.join("-"))),
    decisionsByOrder,
    audit:{
      thirdVariantRemovedCount:removed.length,
      thirdVariantRemovals:removed,
      thirdVariantLocalRejectedCount:locallyRejectedCount,
      thirdVariantAmbiguity:{detected:ambiguityDetected,count:ambiguities.length,pairs:ambiguities,causesNoBet}
    }
  };
}

function boundaryAudit({initialTerminalCount=0,selectionMode,boundaryRank=null,boundaryDetected=false,bestGap=0,medianGap=0,mad=0,bestStrength=0,relativeDrop=0,selectedMass=0,singletonSelection=false,singletonJustification=null,...rest}){
  return{initialTerminalCount,selectionMode,boundaryDetected,boundaryRank,boundaryGap:bestGap,boundaryMedianGap:medianGap,boundaryMAD:mad,boundaryStrength:bestStrength,boundaryRelativeDrop:relativeDrop,selectedMass,singletonSelection,singletonJustification,thirdVariantAmbiguity:{detected:false,count:0,pairs:[]},...rest};
}

function thickQualificationFields(item){return{naturalConvergenceScore:item.naturalConvergenceScore??null,globalRank:item.globalRank??item.terminalGlobalRank??null,familyRank:item.familyRank??item.terminalFamilyRank??null,pairRank:item.pairRank??item.terminalPairRank??null,nodeConditionalProbability:item.nodeConditionalProbability??null,scenarioCoherence:item.scenarioCoherence??null,branchFit:item.branchFit??null,naturalSeparation:item.naturalSeparation??null}}

function buildPurchaseFunnel({generated,natural,pairPassed,final}){
  const stages=[
    ["GENERATED_TERMINALS",generated],
    ["NATURAL_CANDIDATES",natural],
    ["PURCHASE_BORDER_PASS",natural],
    ["INITIAL_ADOPTED",pairPassed],
    ["FAMILY_RECOVERY",pairPassed],
    ["MASS_RECOVERY",pairPassed],
    ["VALUE_ADDITION",pairPassed],
    ["FINAL_PURCHASE",final]
  ];
  let previous=null;
  return stages.map(([stage,rows])=>{
    const audit=summarizeFunnelRows(rows);
    const row={stage,...audit,addedCount:previous?Math.max(0,audit.count-previous.count):audit.count,removedCount:previous?Math.max(0,previous.count-audit.count):0};
    previous=audit;
    return row;
  });
}

function summarizeFunnelRows(rows){
  const values=[...(rows||[])];
  const families=new Set(values.map(item=>String(item.order?.[0]??"")));
  const pairs=new Map();
  for(const item of values){
    const pair=`${item.order?.[0]}-${item.order?.[1]}`;
    if(!pairs.has(pair))pairs.set(pair,new Set());
    pairs.get(pair).add(String(item.order?.[2]??""));
  }
  return{
    count:values.length,
    probabilityMass:sum(values.map(item=>Number(item.probability)||0)),
    familyCount:families.size,
    pairCount:pairs.size,
    thirdVariantCount:[...pairs.values()].reduce((total,set)=>total+set.size,0)
  };
}

function buildPurchaseConcentrationAudit(generated,selected,boundary){
  const rows=[...(generated||[])];
  const total=sum(rows.map(item=>Number(item.probability)||0));
  const shares=rows.map(item=>total>0?(Number(item.probability)||0)/total:0).filter(value=>value>0);
  const aggregate=(keyOf)=>{
    const grouped=new Map();
    for(const item of rows){const key=keyOf(item);grouped.set(key,(grouped.get(key)||0)+(Number(item.probability)||0));}
    return total>0?Math.max(0,...grouped.values())/total:0;
  };
  const branchTotals=new Map();
  for(const item of rows)for(const contribution of item.branchContributions||[]){const key=contribution.branchId||"UNKNOWN";branchTotals.set(key,(branchTotals.get(key)||0)+(Number(contribution.probability)||0));}
  const branchTotal=sum([...branchTotals.values()]);
  const entropy=-sum(shares.map(value=>value*Math.log(value)));
  return{
    classification:"UNCALIBRATED",
    adoptedCount:selected.length,
    candidateProbabilityMass:sum(selected.map(item=>Number(item.probability)||0)),
    topTerminalShare:shares[0]||0,
    topFamilyShare:aggregate(item=>String(item.order?.[0]??"")),
    topPairShare:aggregate(item=>`${item.order?.[0]}-${item.order?.[1]}`),
    branchConcentration:branchTotal>0?Math.max(0,...branchTotals.values())/branchTotal:0,
    entropy,
    normalizedEntropy:shares.length>1?entropy/Math.log(shares.length):0,
    familyCount:new Set(selected.map(item=>String(item.order?.[0]??""))).size,
    pairCount:new Set(selected.map(item=>`${item.order?.[0]}-${item.order?.[1]}`)).size,
    naturalBoundaryStrength:Number(boundary?.boundaryStrength)||0,
    policy:"AUDIT_ONLY_UNTIL_MULTI_RACE_CALIBRATION"
  };
}

function median(values){
  const rows=[...(values||[])].map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
  if(!rows.length)return 0;
  const middle=Math.floor(rows.length/2);
  return rows.length%2?rows[middle]:(rows[middle-1]+rows[middle])/2;
}

function geometricMean(values){
  const rows=(values||[]).map(Number).filter(value=>Number.isFinite(value)&&value>0);
  return rows.length?Math.exp(sum(rows.map(value=>Math.log(value)))/rows.length):0;
}

function sum(values){
  return values.reduce((total,value)=>total+value,0);
}
