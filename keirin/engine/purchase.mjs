const PURCHASED="購入採用";
const POSITION_FLOORS={first:.88,second:.85,third:.85};
const STRUCTURAL_PRIORITIES=new Set(["main","contender","sub"]);

export function classify(terminals,odds={}){
  const sorted=[...terminals].sort(compareTerminal);
  if(!sorted.length)return[];

  const max=sorted[0].probability||0;
  const concentrationRatio=max*sorted.length;
  const branchStats=buildBranchStats(sorted);
  const thirdVariantStats=buildThirdVariantStats(sorted);
  const maxBranchTotal=Math.max(...[...branchStats.values()].map(stats=>stats.total),0);

  const base=sorted.map((terminal,index)=>{
    const key=terminal.order.join("-");
    const odd=Number(odds[key]);
    const hasOdds=Number.isFinite(odd)&&odd>1;
    const contributions=[...(terminal.branchContributions||[])]
      .filter(contribution=>contributionMatchesTerminal(contribution,terminal.order))
      .map(contribution=>({...contribution,normalizedPriority:normalizePriority(contribution.branchPriority)}))
      .sort((a,b)=>(b.probability||0)-(a.probability||0)||String(a.branchId).localeCompare(String(b.branchId),"en"));
    const dominant=contributions[0]||null;
    const stats=dominant?branchStats.get(dominant.branchId):null;
    const branchFit=stats?.best>0?(dominant?.probability||0)/stats.best:0;
    const branchRank=stats?.rankByOrder.get(key)??null;
    const supportDetails=contributions.map(contribution=>{
      const contributionStats=branchStats.get(contribution.branchId);
      const withinBranchFit=contributionStats?.best>0?(contribution.probability||0)/contributionStats.best:0;
      const branchStrengthRatio=maxBranchTotal>0?(contributionStats?.total||0)/maxBranchTotal:0;
      return{contribution,withinBranchFit,branchStrengthRatio,weightedSupport:withinBranchFit*branchStrengthRatio};
    });
    const weightedBranchSupport=sum(supportDetails.map(item=>item.weightedSupport));
    const ratios=dominant?.decisionRatios||{};
    const positionConverged=(ratios.first??0)>=.93&&(ratios.second??0)>=.91&&(ratios.third??0)>=.91;
    const positionNear=(ratios.first??0)>=POSITION_FLOORS.first&&(ratios.second??0)>=POSITION_FLOORS.second&&(ratios.third??0)>=POSITION_FLOORS.third;
    const representative=branchFit>=.975&&positionConverged;
    const credibleVariant=branchFit>=.87&&positionNear;
    const thirdGroupKey=dominant?thirdVariantGroupKey(dominant.branchId,terminal.order):null;
    const thirdStats=thirdGroupKey?thirdVariantStats.get(thirdGroupKey):null;
    const thirdVariantEligible=thirdStats?thirdStats.supportedOrders.has(key):true;
    const highPayoutAttribute=Boolean(hasOdds&&odd>=100);
    const subScenarioProbability=sum(contributions.filter(c=>c.normalizedPriority==="sub").map(c=>Number(c.probability)||0));
    const subValueIndex=hasOdds?subScenarioProbability*odd:null;
    return{
      ...terminal,
      odds:hasOdds?odd:null,
      betClass:"NONE",
      purchaseStatus:"購入不採用",
      purchaseReason:"1着ファミリー→2着→3着の購入再評価前",
      purchaseRejectCode:"UNCLASSIFIED",
      branchSupport:contributions.length,
      weightedBranchSupport,
      rawBranchCountUsedForAdoption:false,
      dominantBranchId:dominant?.branchId||null,
      dominantBranchLabel:dominant?.branchLabel||null,
      dominantBranchPriority:dominant?.normalizedPriority||null,
      dominantBranchContribution:dominant?.probability||0,
      dominantBranchStrengthRatio:dominant?((maxBranchTotal>0?(stats?.total||0)/maxBranchTotal:0)):0,
      branchFit,branchRank,
      representativeTerminal:representative,
      thirdVariantEligible,
      thirdVariantGroupKey:thirdGroupKey,
      thirdVariantRelativeToBest:thirdStats?.relativeToBestByOrder.get(key)??null,
      thirdVariantConditionalShare:thirdStats?.conditionalShareByOrder.get(key)??null,
      thirdVariantNaturalCutDetected:thirdStats?.naturalCutDetected||false,
      thirdVariantCutGap:thirdStats?.cutGap??null,
      thirdVariantGroupSize:thirdStats?.groupSize??null,
      highPayoutCandidate:false,
      highPayoutAttribute,
      highPayoutAttributeLabel:null,
      oddsEvaluationStatus:hasOdds?"ODDS_AVAILABLE":"NOT_VALUE_CANDIDATE",
      subScenarioProbability,
      subValueIndex,
      decisionRatios:dominant?.decisionRatios||null,
      positionScores:dominant?.positionScores||null,
      positionEvidence:dominant?.positionEvidence||null,
      evidenceSummary:summarizeEvidence(dominant?.positionEvidence),
      concentrationRatio,index,
      branchContributions:contributions
    };
  });

  const state=buildFirstFamilyState(base);
  const staged=base.map(item=>annotateFamilyPosition(item,state));
  const valueGate=buildSubValueGate(staged);
  return staged.map(item=>applyFamilyPurchaseDecision(item,valueGate));
}

function buildFirstFamilyState(items){
  const heads=new Map();
  for(const item of items){
    const first=Number(item.order?.[0])||0;
    if(!first)continue;
    if(!heads.has(first))heads.set(first,{first,totalProbability:0,generatedCount:0,priorityMass:{main:0,contender:0,sub:0,risk:0}});
    const row=heads.get(first);
    row.totalProbability+=Number(item.probability)||0;
    row.generatedCount+=1;
    for(const contribution of item.branchContributions||[]){
      const priority=normalizePriority(contribution.normalizedPriority||contribution.branchPriority);
      row.priorityMass[priority]=(row.priorityMass[priority]||0)+(Number(contribution.probability)||0);
    }
  }
  for(const row of heads.values()){
    row.familyTier=row.priorityMass.main>0?"main":row.priorityMass.contender>0?"contender":row.priorityMass.sub>0?"sub":"risk";
  }

  const secondGroups=new Map(),thirdGroups=new Map();
  for(const item of items){
    const [first,second,third]=(item.order||[]).map(Number);
    const head=heads.get(first);
    if(!head)continue;
    const allowed=allowedPrioritiesForFamily(head.familyTier);
    const relevant=(item.branchContributions||[]).filter(c=>allowed.has(normalizePriority(c.normalizedPriority||c.branchPriority)));
    const secondScore=Math.max(0,...relevant.map(c=>Number(c.decisionRatios?.second)||0));
    const thirdScore=Math.max(0,...relevant.map(c=>Number(c.decisionRatios?.third)||0));
    if(secondScore>0){
      if(!secondGroups.has(first))secondGroups.set(first,new Map());
      const group=secondGroups.get(first);group.set(second,Math.max(group.get(second)||0,secondScore));
    }
    const thirdKey=`${first}-${second}`;
    if(thirdScore>0){
      if(!thirdGroups.has(thirdKey))thirdGroups.set(thirdKey,new Map());
      const group=thirdGroups.get(thirdKey);group.set(third,Math.max(group.get(third)||0,thirdScore));
    }
  }
  const secondStats=new Map([...secondGroups].map(([key,map])=>[key,deriveNaturalPositionSupport([...map].map(([candidate,score])=>({candidate,score})))]));
  const thirdStats=new Map([...thirdGroups].map(([key,map])=>[key,deriveNaturalPositionSupport([...map].map(([candidate,score])=>({candidate,score})))]));
  return{heads,secondStats,thirdStats};
}

function annotateFamilyPosition(item,state){
  const [first,second,third]=(item.order||[]).map(Number);
  const head=state.heads.get(first)||{familyTier:"risk",totalProbability:0,generatedCount:0,priorityMass:{main:0,contender:0,sub:0,risk:0}};
  const secondGroup=state.secondStats.get(first)||null;
  const thirdGroup=state.thirdStats.get(`${first}-${second}`)||null;
  const secondRelative=secondGroup?.relativeByCandidate.get(second)??0;
  const thirdRelative=thirdGroup?.relativeByCandidate.get(third)??0;
  const secondNatural=secondGroup?secondGroup.supportedCandidates.has(second):false;
  const thirdNatural=thirdGroup?thirdGroup.supportedCandidates.has(third):false;
  const supportByPriority={};
  for(const priority of ["main","contender","sub","risk"]){
    const candidates=(item.branchContributions||[]).filter(c=>normalizePriority(c.normalizedPriority||c.branchPriority)===priority);
    supportByPriority[priority]=candidates.sort(compareContributionSupport)[0]||null;
  }
  const eligibility={};
  for(const priority of ["main","contender","sub"]){
    const contribution=supportByPriority[priority];
    const ratios=contribution?.decisionRatios||{};
    eligibility[priority]=Boolean(
      contribution&&
      (Number(ratios.first)||0)>=POSITION_FLOORS.first&&
      (Number(ratios.second)||0)>=POSITION_FLOORS.second&&
      (Number(ratios.third)||0)>=POSITION_FLOORS.third&&
      secondNatural&&thirdNatural&&
      secondRelative>=POSITION_FLOORS.second&&thirdRelative>=POSITION_FLOORS.third
    );
  }
  const structuralCandidate=head.familyTier!=="risk";
  const naturalPositionEligible=Boolean(secondNatural&&thirdNatural&&secondRelative>=POSITION_FLOORS.second&&thirdRelative>=POSITION_FLOORS.third);
  return{
    ...item,
    firstFamilyNumber:first,
    firstFamilyTier:head.familyTier,
    firstFamilyProbability:head.totalProbability,
    firstFamilyGeneratedCount:head.generatedCount,
    firstFamilyPriorityMass:{...head.priorityMass},
    secondFamilyGroupSize:secondGroup?.groupSize??0,
    secondFamilyNaturalCutDetected:secondGroup?.naturalCutDetected||false,
    secondFamilyCutGap:secondGroup?.cutGap??null,
    secondFamilyNaturalEligible:secondNatural,
    secondFamilyRelativeToBest:secondRelative,
    thirdFamilyGroupSize:thirdGroup?.groupSize??0,
    thirdFamilyNaturalCutDetected:thirdGroup?.naturalCutDetected||false,
    thirdFamilyCutGap:thirdGroup?.cutGap??null,
    thirdFamilyNaturalEligible:thirdNatural,
    thirdFamilyRelativeToBest:thirdRelative,
    familyStructuralCandidate:structuralCandidate,
    familyNaturalPositionEligible:naturalPositionEligible,
    familyPriorityEligibility:eligibility,
    familyPrioritySupportIds:Object.fromEntries(Object.entries(supportByPriority).map(([priority,c])=>[priority,c?.branchId||null])),
    mainHeadSiblingCandidate:head.familyTier==="main"&&structuralCandidate,
    mainHeadSiblingEligible:head.familyTier==="main"&&Boolean(eligibility.main||eligibility.contender),
    mainHeadSiblingAnchorFirst:head.familyTier==="main"?first:null,
    mainHeadSiblingBranchId:(supportByPriority.main||supportByPriority.contender)?.branchId||null,
    mainHeadSiblingBranchLabel:(supportByPriority.main||supportByPriority.contender)?.branchLabel||null,
    mainHeadSiblingSecondEligible:secondNatural&&secondRelative>=POSITION_FLOORS.second,
    mainHeadSiblingThirdEligible:thirdNatural&&thirdRelative>=POSITION_FLOORS.third,
    mainHeadSiblingFirstRelativeToBest:Math.max(Number(supportByPriority.main?.decisionRatios?.first)||0,Number(supportByPriority.contender?.decisionRatios?.first)||0),
    mainHeadSiblingSecondRelativeToBest:secondRelative,
    mainHeadSiblingThirdRelativeToBest:thirdRelative
  };
}

function buildSubValueGate(items){
  const candidates=items.filter(item=>{
    const subEligible=Boolean(item.familyPriorityEligibility?.sub);
    const dominantSub=normalizePriority(item.dominantBranchPriority)==="sub";
    return subEligible&&dominantSub&&item.odds>1&&item.odds>=100&&Number(item.subValueIndex)>1;
  });
  const rows=candidates.map(item=>({candidate:item.order.join("-"),score:Number(item.subValueIndex)||0}));
  const support=deriveNaturalKeySupport(rows);
  return{candidateKeys:new Set(candidates.map(item=>item.order.join("-"))),supportedKeys:support.supportedCandidates,naturalCutDetected:support.naturalCutDetected,cutGap:support.cutGap,groupSize:support.groupSize};
}

function applyFamilyPurchaseDecision(item,valueGate){
  const key=item.order.join("-");
  const mainEligible=Boolean(item.familyPriorityEligibility?.main);
  const contenderEligible=Boolean(item.familyPriorityEligibility?.contender);
  const subEligible=Boolean(item.familyPriorityEligibility?.sub);
  const dominantPriority=normalizePriority(item.dominantBranchPriority);
  const highPayoutCandidate=Boolean(subEligible&&dominantPriority==="sub");
  const highPayoutAttribute=Boolean(item.odds&&item.odds>=100);
  const valueCandidate=valueGate.candidateKeys.has(key);
  const valueNaturalEligible=valueGate.supportedKeys.has(key);
  let betClass="NONE",adopted=false,purchaseReason="着順ファミリーの自然支持が不足",purchaseRejectCode="POSITION_SUPPORT";

  if(item.concentrationRatio<1.04){
    purchaseReason=`terminal分布が平坦（集中比${item.concentrationRatio.toFixed(3)}）`;
    purchaseRejectCode="FLAT_DISTRIBUTION";
  }else if(item.firstFamilyTier==="main"&&mainEligible){
    betClass="MAIN";adopted=true;purchaseRejectCode="ADOPTED";
    purchaseReason=`${item.firstFamilyNumber}頭の本命展開ファミリーで2着${item.order[1]}・3着${item.order[2]}を独立再評価した自然終端`;
  }else if((item.firstFamilyTier==="main"||item.firstFamilyTier==="contender")&&contenderEligible){
    betClass="COVER";adopted=true;purchaseRejectCode="ADOPTED";
    purchaseReason=`${item.firstFamilyNumber}頭の有力展開ファミリーで2着${item.order[1]}・3着${item.order[2]}を独立再評価したカバー終端`;
  }else if(highPayoutCandidate){
    if(!item.odds){
      purchaseReason=`別展開${item.firstFamilyNumber}頭の自然終端・実オッズ待ち`;
      purchaseRejectCode="SUB_ODDS_PENDING";
    }else if(!highPayoutAttribute){
      purchaseReason=`別展開${item.firstFamilyNumber}頭は自然終端だが高配当属性なし`;
      purchaseRejectCode="SUB_NOT_HIGH_PAYOUT";
    }else if(!(Number(item.subValueIndex)>1)){
      purchaseReason=`別展開成立確率×実オッズ=${Number(item.subValueIndex||0).toFixed(3)}で損益分岐未満`;
      purchaseRejectCode="SUB_VALUE_BELOW_BREAK_EVEN";
    }else if(!valueNaturalEligible){
      purchaseReason=`別展開の妙味指数は上位自然群の外`;
      purchaseRejectCode="SUB_VALUE_NATURAL_BOUNDARY";
    }else{
      betClass="BUYABLE_HIGH";adopted=true;purchaseRejectCode="ADOPTED";
      purchaseReason=`別展開${item.firstFamilyNumber}頭の自然終端＋成立確率×実オッズ ${Number(item.subValueIndex).toFixed(2)}`;
    }
  }else if(!item.familyStructuralCandidate){
    purchaseReason="本命・有力・別展開の購入ファミリーに属さない";
    purchaseRejectCode="NO_FAMILY_TIER";
  }else if(!item.secondFamilyNaturalEligible||item.secondFamilyRelativeToBest<POSITION_FLOORS.second){
    purchaseReason=`${item.firstFamilyNumber}頭内で2着${item.order[1]}の独立支持が自然上位群に届かない`;
    purchaseRejectCode="SECOND_POSITION_SUPPORT";
  }else if(!item.thirdFamilyNaturalEligible||item.thirdFamilyRelativeToBest<POSITION_FLOORS.third){
    purchaseReason=`${item.order[0]}-${item.order[1]}内で3着${item.order[2]}の独立支持が自然上位群に届かない`;
    purchaseRejectCode="THIRD_VARIANT_SUPPORT";
  }else{
    purchaseReason="該当展開枝の1・2・3着支持が購入水準に届かない";
    purchaseRejectCode="BRANCH_OR_POSITION_SUPPORT";
  }

  return{
    ...item,betClass,purchaseStatus:adopted?PURCHASED:"購入不採用",purchaseReason,purchaseRejectCode,
    adoptionMode:adopted?(betClass==="MAIN"?"FIRST_FAMILY_MAIN":betClass==="COVER"?"FIRST_FAMILY_COVER":"SUB_VALUE_FAMILY"):null,
    highPayoutCandidate,highPayoutAttribute,
    highPayoutAttributeLabel:highPayoutAttribute?(betClass==="MAIN"?"本線高配当":betClass==="COVER"?"有力展開高配当":dominantPriority==="sub"?"別展開高配当":"高配当"):null,
    oddsEvaluationStatus:item.odds?"ODDS_AVAILABLE":(highPayoutCandidate?"ODDS_PENDING":"NOT_VALUE_CANDIDATE"),
    subValueNaturalEligible:valueNaturalEligible,
    subValueNaturalCutDetected:valueGate.naturalCutDetected,
    subValueCutGap:valueGate.cutGap,
    subValueGroupSize:valueGate.groupSize
  };
}

function allowedPrioritiesForFamily(tier){
  if(tier==="main")return new Set(["main","contender"]);
  if(tier==="contender")return new Set(["contender"]);
  if(tier==="sub")return new Set(["sub"]);
  return new Set();
}
function compareContributionSupport(a,b){
  const ar=a?.decisionRatios||{},br=b?.decisionRatios||{};
  const as=(Number(ar.first)||0)*(Number(ar.second)||0)*(Number(ar.third)||0);
  const bs=(Number(br.first)||0)*(Number(br.second)||0)*(Number(br.third)||0);
  return bs-as||(Number(b?.probability)||0)-(Number(a?.probability)||0)||String(a?.branchId||"").localeCompare(String(b?.branchId||""),"en");
}
function normalizePriority(priority){const value=String(priority||"").toLowerCase();if(value==="main")return"main";if(value==="contender")return"contender";if(value==="sub"||value==="alternative")return"sub";return"risk"}

function deriveNaturalPositionSupport(rows){
  const items=[...rows].sort((a,b)=>b.score-a.score||Number(a.candidate)-Number(b.candidate));
  const best=items[0]?.score||0;
  const ratios=items.map(item=>best>0?item.score/best:0);
  const gaps=[];
  for(let i=0;i<ratios.length-1;i+=1)gaps.push({index:i,gap:Math.max(0,ratios[i]-ratios[i+1])});
  const sortedGaps=[...gaps].sort((a,b)=>b.gap-a.gap||a.index-b.index);
  const largest=sortedGaps[0]||null;
  const totalRange=ratios.length>1?Math.max(0,ratios[0]-ratios[ratios.length-1]):0;
  const otherGapSum=largest?Math.max(0,totalRange-largest.gap):0;
  const tiedLargest=largest?sortedGaps.filter(item=>Math.abs(item.gap-largest.gap)<1e-12).length>1:false;
  const naturalCutDetected=items.length>=3&&Boolean(largest)&&!tiedLargest&&largest.gap>otherGapSum;
  const cutIndex=naturalCutDetected?largest.index:items.length-1;
  return{groupSize:items.length,naturalCutDetected,cutGap:naturalCutDetected?largest.gap:null,supportedCandidates:new Set(items.slice(0,cutIndex+1).map(item=>item.candidate)),relativeByCandidate:new Map(items.map((item,index)=>[item.candidate,ratios[index]]))};
}
function deriveNaturalKeySupport(rows){
  const items=[...rows].sort((a,b)=>b.score-a.score||String(a.candidate).localeCompare(String(b.candidate),"en"));
  const best=items[0]?.score||0;
  const ratios=items.map(item=>best>0?item.score/best:0),gaps=[];
  for(let i=0;i<ratios.length-1;i+=1)gaps.push({index:i,gap:Math.max(0,ratios[i]-ratios[i+1])});
  const sorted=[...gaps].sort((a,b)=>b.gap-a.gap||a.index-b.index),largest=sorted[0]||null;
  const totalRange=ratios.length>1?Math.max(0,ratios[0]-ratios[ratios.length-1]):0;
  const otherGapSum=largest?Math.max(0,totalRange-largest.gap):0;
  const tied=largest?sorted.filter(item=>Math.abs(item.gap-largest.gap)<1e-12).length>1:false;
  const naturalCutDetected=items.length>=3&&Boolean(largest)&&!tied&&largest.gap>otherGapSum;
  const cutIndex=naturalCutDetected?largest.index:items.length-1;
  return{groupSize:items.length,naturalCutDetected,cutGap:naturalCutDetected?largest.gap:null,supportedCandidates:new Set(items.slice(0,cutIndex+1).map(item=>item.candidate))};
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
    return natural.map(item=>planRow(item,null,"予算不足",minimum));
  }
  const stakes=natural.map(()=>100);
  let remaining=numericBudget-minimum;
  const weights=natural.map(item=>{
    const probability=Math.max(Number(item.probability)||0,.000001);
    const valueIndex=item.odds>1?Math.max(probability*Number(item.odds),.000001):1;
    return probability*Math.sqrt(valueIndex);
  });
  const totalWeight=sum(weights)||1;
  const extraUnits=Math.floor(remaining/100);
  if(extraUnits>0){
    const raw=weights.map(weight=>extraUnits*weight/totalWeight);
    const floors=raw.map(Math.floor);
    floors.forEach((units,index)=>{stakes[index]+=units*100;});
    let left=extraUnits-sum(floors);
    const remainderOrder=raw.map((value,index)=>({index,remainder:value-Math.floor(value)})).sort((a,b)=>b.remainder-a.remainder||comparePurchase(natural[a.index],natural[b.index]));
    for(let i=0;i<left;i+=1)stakes[remainderOrder[i%remainderOrder.length].index]+=100;
  }
  return natural.map((item,index)=>planRow(item,stakes[index],"配分済み",minimum));
}
function planRow(item,stake,fundingStatus,minimumRequired){return{
  order:item.order,betClass:item.betClass,stake,odds:item.odds,
  expectedPayout:item.odds&&stake?Math.floor(stake*item.odds):null,
  probability:item.probability,branchSupport:item.branchSupport,purchaseReason:item.purchaseReason,
  dominantBranchId:item.dominantBranchId,dominantBranchLabel:item.dominantBranchLabel,decisionRatios:item.decisionRatios,positionEvidence:item.positionEvidence||null,evidenceSummary:item.evidenceSummary||null,
  highPayoutAttribute:Boolean(item.highPayoutAttribute),highPayoutAttributeLabel:item.highPayoutAttributeLabel||null,
  firstFamilyNumber:item.firstFamilyNumber,firstFamilyTier:item.firstFamilyTier,subValueIndex:item.subValueIndex??null,
  fundingWeight:item.odds>1?(Number(item.probability)||0)*Math.sqrt(Math.max((Number(item.probability)||0)*Number(item.odds),.000001)):(Number(item.probability)||0),
  fundingStatus,minimumRequired
}}

export function purchaseDiagnostics(classified,plan,budget){
  const probabilities=classified.map(item=>item.probability).sort((a,b)=>b-a);
  const natural=classified.filter(item=>item.purchaseStatus===PURCHASED);
  const noBet=natural.length===0;
  const noBetReason=!noBet?null:classified.length===0?"NO_TERMINALS":(classified[0]?.concentrationRatio||0)<1.04?"FLAT_DISTRIBUTION_NO_SUPPORTED_CANDIDATE":"NO_FAMILY_SUPPORTED_CANDIDATE";
  const minimumRequired=natural.length*100;
  const rejected=classified.filter(item=>item.purchaseStatus!==PURCHASED);
  const rejectCodeCounts={};
  for(const item of rejected){const code=item.purchaseRejectCode||"UNKNOWN";rejectCodeCounts[code]=(rejectCodeCounts[code]||0)+1;}
  const diagnosticBranchStats=buildBranchStats(classified);
  const diagnosticMaxBranchTotal=Math.max(...[...diagnosticBranchStats.values()].map(stats=>stats.total),0);
  const familyRows=buildFamilyAuditRows(classified);
  return{
    generatedTerminalCount:classified.length,probabilityEvaluatedTerminalCount:classified.length,terminalCount:classified.length,
    terminalProbabilitySum:sum(probabilities),maxTerminalProbability:probabilities[0]||0,
    top3Mass:sum(probabilities.slice(0,3)),top5Mass:sum(probabilities.slice(0,5)),top10Mass:sum(probabilities.slice(0,10)),
    purchaseCandidateCountBeforeCompression:natural.length,purchaseCandidateCountAfterCompression:natural.length,finalBetCount:natural.length,
    fixedBranchRankCapApplied:false,representativeTerminalCount:classified.filter(item=>item.representativeTerminal).length,
    credibleVariantCount:classified.filter(item=>{const r=item.decisionRatios||{};return item.branchFit>=.87&&(r.first??0)>=.88&&(r.second??0)>=.85&&(r.third??0)>=.85;}).length,
    adoptedTerminalCount:natural.length,rejectedTerminalCount:classified.length-natural.length,rejectCodeCounts,
    purchaseThresholds:{
      concentrationRatioMin:1.04,representativeBranchFitMin:.975,credibleVariantBranchFitMin:.87,probabilitySupportVsMaxMin:null,
      rawBranchCountUsedForAdoption:false,weightedMultiBranchSupportEquivalentMin:2,
      purchaseSelectionMode:"FIRST_FAMILY_GLOBAL_THEN_INDEPENDENT_SECOND_THIRD",
      firstFamilySelectionMode:"BRANCH_TIER_PROVENANCE_BY_REQUIRED_FIRST",
      secondThirdSelectionMode:"ADAPTIVE_NATURAL_GAP_ON_INDEPENDENT_POSITION_RATIOS",
      fixedTerminalRankCapApplied:false,fixedProbabilityCutoffApplied:false,
      positionRatios:{...POSITION_FLOORS},
      buyableHighMode:"SUB_SCENARIO_PROBABILITY_X_OFFICIAL_ODDS_THEN_ADAPTIVE_VALUE_GROUP",
      buyableHighBreakEvenIndex:1,
      fundingMode:"100YEN_BASE_PLUS_PROBABILITY_X_SQRT_PROBABILITY_ODDS"
    },
    purchaseFamilyAudit:{mode:"FIRST_FAMILY_GLOBAL_THEN_SECOND_THIRD",headCount:familyRows.length,rows:familyRows},
    adoptedTerminalAudit:natural.map(item=>buildAdoptedAudit(item,diagnosticBranchStats,diagnosticMaxBranchTotal)),
    mainHeadSiblingAudit:{
      mode:"COMPAT_ALIAS_TO_FIRST_FAMILY_AUDIT",
      anchorMainOrders:natural.filter(item=>item.betClass==="MAIN").map(item=>item.order.join("-")),
      candidateCount:classified.filter(item=>item.firstFamilyTier==="main").length,
      eligibleCount:classified.filter(item=>item.firstFamilyTier==="main"&&item.mainHeadSiblingEligible).length,
      adoptedCount:natural.filter(item=>item.firstFamilyTier==="main").length,
      promotedCount:natural.filter(item=>item.firstFamilyTier==="main"&&!item.representativeTerminal).length,
      rejectedCount:classified.filter(item=>item.firstFamilyTier==="main"&&item.purchaseStatus!==PURCHASED).length,
      rows:classified.filter(item=>item.firstFamilyTier==="main").map(item=>({order:item.order.join("-"),eligible:Boolean(item.mainHeadSiblingEligible),adopted:item.purchaseStatus===PURCHASED,adoptionMode:item.adoptionMode||null,branchId:item.mainHeadSiblingBranchId||null,branchLabel:item.mainHeadSiblingBranchLabel||null,secondEligible:item.mainHeadSiblingSecondEligible,thirdEligible:item.mainHeadSiblingThirdEligible,firstRelativeToBest:item.mainHeadSiblingFirstRelativeToBest,secondRelativeToBest:item.mainHeadSiblingSecondRelativeToBest,thirdRelativeToBest:item.mainHeadSiblingThirdRelativeToBest,purchaseReason:item.purchaseReason}))
    },
    adoptedBranchCounts:natural.reduce((counts,item)=>{const label=item.dominantBranchLabel||"不明";counts[label]=(counts[label]||0)+1;return counts;},{}),
    adoptedBranchTierCounts:natural.reduce((counts,item)=>{const priority=item.dominantBranchPriority||"unknown";counts[priority]=(counts[priority]||0)+1;return counts;},{}),
    classCounts:{main:natural.filter(item=>item.betClass==="MAIN").length,cover:natural.filter(item=>item.betClass==="COVER").length,buyableHigh:natural.filter(item=>item.betClass==="BUYABLE_HIGH").length,highPayoutCandidateOddsPending:classified.filter(item=>item.highPayoutCandidate&&item.oddsEvaluationStatus==="ODDS_PENDING").length},
    minimumRequired,budget:Number(budget||0),budgetSufficient:Number(budget||0)>=minimumRequired,noBet,noBetReason
  };
}

function buildFamilyAuditRows(classified){
  const map=new Map();
  for(const item of classified){
    const first=Number(item.firstFamilyNumber)||Number(item.order?.[0])||0;
    if(!map.has(first))map.set(first,{first,tier:item.firstFamilyTier||"risk",probability:item.firstFamilyProbability||0,generated:item.firstFamilyGeneratedCount||0,priorityMass:item.firstFamilyPriorityMass||{},naturalCandidateCount:0,adopted:0,main:0,cover:0,buyableHigh:0,rejected:0});
    const row=map.get(first);
    if(item.familyNaturalPositionEligible)row.naturalCandidateCount+=1;
    if(item.purchaseStatus===PURCHASED){row.adopted+=1;if(item.betClass==="MAIN")row.main+=1;else if(item.betClass==="COVER")row.cover+=1;else if(item.betClass==="BUYABLE_HIGH")row.buyableHigh+=1;}else row.rejected+=1;
  }
  return[...map.values()].sort((a,b)=>familyTierRank(a.tier)-familyTierRank(b.tier)||b.probability-a.probability||a.first-b.first);
}
function buildAdoptedAudit(item,diagnosticBranchStats,diagnosticMaxBranchTotal){
  const supportBranches=[...(item.branchContributions||[])].filter(contribution=>contributionMatchesTerminal(contribution,item.order)).sort((a,b)=>(b.probability||0)-(a.probability||0)||String(a.branchId).localeCompare(String(b.branchId),"en")).map(contribution=>{
    const supportStats=diagnosticBranchStats.get(contribution.branchId),withinBranchFit=supportStats?.best>0?(contribution.probability||0)/supportStats.best:0,branchStrengthRatio=diagnosticMaxBranchTotal>0?(supportStats?.total||0)/diagnosticMaxBranchTotal:0;
    return{branchId:contribution.branchId||null,branchLabel:contribution.branchLabel||null,branchPriority:normalizePriority(contribution.normalizedPriority||contribution.branchPriority),probability:contribution.probability||0,requiredFirstNumber:contribution.requiredFirstNumber??null,withinBranchFit,branchStrengthRatio,weightedSupport:withinBranchFit*branchStrengthRatio};
  });
  const uniqueSupportBranchIds=[...new Set(supportBranches.map(branch=>branch.branchId).filter(Boolean))];
  const supportLabelCounts=supportBranches.reduce((counts,branch)=>{const label=branch.branchLabel||"不明";counts[label]=(counts[label]||0)+1;return counts;},{});
  const duplicateSupportLabels=Object.entries(supportLabelCounts).filter(([,count])=>count>1).map(([label,count])=>({label,count}));
  return{
    order:item.order.join("-"),betClass:item.betClass,probability:item.probability,
    dominantBranchId:item.dominantBranchId,dominantBranchLabel:item.dominantBranchLabel,dominantBranchPriority:item.dominantBranchPriority,dominantBranchTierLabel:branchPriorityLabel(item.dominantBranchPriority),
    branchFit:item.branchFit,branchRank:item.branchRank,branchSupport:item.branchSupport,weightedBranchSupport:item.weightedBranchSupport??sum(supportBranches.map(branch=>branch.weightedSupport||0)),
    thirdVariantEligible:item.thirdVariantEligible??true,thirdVariantGroupKey:item.thirdVariantGroupKey||null,thirdVariantRelativeToBest:item.thirdVariantRelativeToBest??null,thirdVariantConditionalShare:item.thirdVariantConditionalShare??null,thirdVariantNaturalCutDetected:item.thirdVariantNaturalCutDetected||false,thirdVariantCutGap:item.thirdVariantCutGap??null,thirdVariantGroupSize:item.thirdVariantGroupSize??null,
    firstFamilyNumber:item.firstFamilyNumber,firstFamilyTier:item.firstFamilyTier,firstFamilyProbability:item.firstFamilyProbability,
    secondFamilyRelativeToBest:item.secondFamilyRelativeToBest,secondFamilyNaturalEligible:item.secondFamilyNaturalEligible,thirdFamilyRelativeToBest:item.thirdFamilyRelativeToBest,thirdFamilyNaturalEligible:item.thirdFamilyNaturalEligible,
    subScenarioProbability:item.subScenarioProbability??null,subValueIndex:item.subValueIndex??null,subValueNaturalEligible:item.subValueNaturalEligible??null,
    highPayoutCandidate:Boolean(item.highPayoutCandidate),highPayoutAttribute:Boolean(item.highPayoutAttribute),highPayoutAttributeLabel:item.highPayoutAttributeLabel||null,oddsEvaluationStatus:item.oddsEvaluationStatus||null,
    rawBranchCountUsedForAdoption:false,dominantBranchStrengthRatio:item.dominantBranchStrengthRatio??null,uniqueSupportBranchCount:uniqueSupportBranchIds.length,supportBranches,duplicateSupportLabels,representativeTerminal:item.representativeTerminal,decisionRatios:item.decisionRatios||null,purchaseReason:item.purchaseReason,adoptionMode:item.adoptionMode||null
  };
}
function familyTierRank(tier){return({main:0,contender:1,sub:2,risk:3})[tier]??9}

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
