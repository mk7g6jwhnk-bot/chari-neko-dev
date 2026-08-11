const PURCHASED="購入採用";
const POSITION_FLOORS={first:.88,second:.85,third:.85};
const PRIMARY_COVERAGE_SUPPORT_FLOORS={first:.82,second:.70,third:.70};
const PRIMARY_COVERAGE_TARGETS={base:.70,medium:.75,strong:.80};
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
  const ranked=annotateTerminalRanks(staged);
  const valueGate=buildSubValueGate(ranked);
  const familyCoverageGate=buildFamilyCoverageGate(ranked);
  const decided=ranked.map(item=>applyFamilyPurchaseDecision(item,valueGate,familyCoverageGate));
  return applyUnderCoverageNaturalRecovery(decided,familyCoverageGate);
}

function annotateTerminalRanks(items){
  const totalProbability=sum(items.map(item=>Number(item.probability)||0))||1;
  const globalSorted=[...items].sort(compareTerminal);
  const globalRank=new Map(globalSorted.map((item,index)=>[item.order.join("-"),index+1]));
  const familyGroups=new Map(),pairGroups=new Map();
  for(const item of items){
    const [first,second]=(item.order||[]).map(Number);
    if(!familyGroups.has(first))familyGroups.set(first,[]);
    familyGroups.get(first).push(item);
    const pairKey=`${first}-${second}`;
    if(!pairGroups.has(pairKey))pairGroups.set(pairKey,[]);
    pairGroups.get(pairKey).push(item);
  }
  const familyRank=new Map(),pairRank=new Map();
  for(const group of familyGroups.values())
    [...group].sort(compareTerminal).forEach((item,index)=>familyRank.set(item.order.join("-"),index+1));
  for(const group of pairGroups.values())
    [...group].sort(compareTerminal).forEach((item,index)=>pairRank.set(item.order.join("-"),index+1));
  return items.map(item=>{
    const key=item.order.join("-");
    const probability=Number(item.probability)||0;
    const familyProbability=Number(item.firstFamilyProbability)||0;
    const odd=Number(item.odds);
    return{
      ...item,
      terminalGlobalRank:globalRank.get(key)||null,
      terminalFamilyRank:familyRank.get(key)||null,
      terminalPairRank:pairRank.get(key)||null,
      terminalProbabilityShare:probability/totalProbability,
      firstFamilyProbabilityShare:familyProbability/totalProbability,
      expectedValueIndex:Number.isFinite(odd)&&odd>1?probability*odd:null
    };
  });
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

function buildFamilyCoverageGate(items){
  const totalProbability=sum(items.map(item=>Math.max(0,Number(item.probability)||0)))||1;
  const groups=new Map();
  for(const item of items){
    const first=Number(item.firstFamilyNumber)||Number(item.order?.[0])||0;
    if(!first)continue;
    if(!groups.has(first))groups.set(first,{first,totalProbability:0,items:[],tier:item.firstFamilyTier||"risk"});
    const row=groups.get(first);row.totalProbability+=Math.max(0,Number(item.probability)||0);row.items.push(item);
  }
  const families=[...groups.values()].sort((a,b)=>b.totalProbability-a.totalProbability||familyTierRank(a.tier)-familyTierRank(b.tier)||a.first-b.first);
  const primary=families[0]||null;
  const primaryShare=primary?primary.totalProbability/totalProbability:0;
  const primaryTarget=primaryShare>=.45?PRIMARY_COVERAGE_TARGETS.strong:primaryShare>=.32?PRIMARY_COVERAGE_TARGETS.medium:PRIMARY_COVERAGE_TARGETS.base;
  const selectedPrimaryKeys=new Set(),selectedOtherKeys=new Set();
  const familyTargets=new Map(),familyCandidateMass=new Map(),familySelectedMass=new Map();

  for(const family of families){
    const isPrimary=Boolean(primary&&family.first===primary.first);
    const relativeToPrimary=primary?.totalProbability>0?family.totalProbability/primary.totalProbability:0;
    const target=isPrimary?primaryTarget:Math.max(.30,Math.min(.50,.25+.25*relativeToPrimary));
    familyTargets.set(family.first,target);
    if(family.tier!=="main"&&family.tier!=="contender"&&!isPrimary)continue;
    const candidates=family.items.filter(item=>isFamilyCoverageCandidate(item,isPrimary)).sort(compareCoverageCandidate);
    const candidateMass=sum(candidates.map(item=>Math.max(0,Number(item.probability)||0)));
    familyCandidateMass.set(family.first,candidateMass);
    let selectedMass=0;
    const selectedKeys=isPrimary?selectedPrimaryKeys:selectedOtherKeys;

    // 購入カバーの優先順位と「本線/押さえ」の分類は別物。
    // main展開から自然に成立した終端は、点数・順位・確率カバー目標を理由にCOVERへ降格/不採用化しない。
    // まず全mainEligible終端をMAIN候補として保持し、その後にcontender等のCOVER補完だけを
    // ファミリー確率カバー目標で追加する。
    if(family.tier==="main"){
      for(const mainItem of candidates.filter(item=>Boolean(item.familyPriorityEligibility?.main)).sort(compareCoverageCandidate)){
        const mainKey=mainItem.order.join("-");
        if(selectedKeys.has(mainKey))continue;
        selectedKeys.add(mainKey);
        selectedMass+=Math.max(0,Number(mainItem.probability)||0);
      }
    }

    for(const item of candidates){
      if(family.totalProbability>0&&selectedMass/family.totalProbability>=target)break;
      const key=item.order.join("-");
      if(selectedKeys.has(key))continue;
      selectedKeys.add(key);
      selectedMass+=Math.max(0,Number(item.probability)||0);
    }
    familySelectedMass.set(family.first,selectedMass);
  }

  return{
    mode:"PRIMARY_FIRST_FAMILY_PROBABILITY_MASS_FIRST",
    primaryFirst:primary?.first||null,
    primaryProbability:primary?.totalProbability||0,
    primaryProbabilityShare:primaryShare,
    primaryCoverageTarget:primaryTarget,
    selectedPrimaryKeys,selectedOtherKeys,familyTargets,familyCandidateMass,familySelectedMass,
    primaryCandidateCoverage:primary?.totalProbability>0?(familyCandidateMass.get(primary.first)||0)/primary.totalProbability:0,
    primarySelectedCoverage:primary?.totalProbability>0?(familySelectedMass.get(primary.first)||0)/primary.totalProbability:0
  };
}

function isFamilyCoverageCandidate(item,isPrimary){
  const mainEligible=Boolean(item.familyPriorityEligibility?.main);
  const contenderEligible=Boolean(item.familyPriorityEligibility?.contender);
  if(mainEligible||contenderEligible)return true;
  if(!isPrimary)return false;
  // The primary-family supplement may relax position floors, but only when the
  // terminal is already supported by a CENTER/SECONDARY forecast branch. A
  // POSSIBLE-only (sub) branch is never promoted merely because its family has a
  // large probability mass.
  const hasForecastBranch=(item.branchContributions||[]).some(c=>{
    const p=normalizePriority(c.normalizedPriority||c.branchPriority);
    return p==="main"||p==="contender";
  });
  if(!hasForecastBranch)return false;
  if(item.secondFamilyNaturalCutDetected&&!item.secondFamilyNaturalEligible)return false;
  if(item.thirdFamilyNaturalCutDetected&&!item.thirdFamilyNaturalEligible)return false;
  if(item.thirdVariantNaturalCutDetected&&!item.thirdVariantEligible)return false;
  const firstSupport=Math.max(Number(item.mainHeadSiblingFirstRelativeToBest)||0,Number(item.decisionRatios?.first)||0);
  return Boolean(
    item.familyStructuralCandidate&&
    firstSupport>=PRIMARY_COVERAGE_SUPPORT_FLOORS.first&&
    (Number(item.secondFamilyRelativeToBest)||0)>=PRIMARY_COVERAGE_SUPPORT_FLOORS.second&&
    (Number(item.thirdFamilyRelativeToBest)||0)>=PRIMARY_COVERAGE_SUPPORT_FLOORS.third
  );
}
function compareCoverageCandidate(a,b){
  const ap=Number(a.probability)||0,bp=Number(b.probability)||0;
  if(bp!==ap)return bp-ap;
  const as=(Number(a.secondFamilyRelativeToBest)||0)*(Number(a.thirdFamilyRelativeToBest)||0);
  const bs=(Number(b.secondFamilyRelativeToBest)||0)*(Number(b.thirdFamilyRelativeToBest)||0);
  return bs-as||compareTerminal(a,b);
}


function isMassCoverageEligible(item){
  // v156: the chat-spec bridge can explicitly mark the narrower set that is
  // safe for automatic mass recovery.  Respect explicit false as well as true.
  // Rows from older/general diagnostics may not carry this flag; for those,
  // preserve the v155 audit population (structural + natural, excluding sub/risk).
  if(typeof item?.massCoverageEligible==="boolean")return item.massCoverageEligible;
  return Boolean(
    item&&
    item.familyStructuralCandidate&&
    item.familyNaturalPositionEligible&&
    item.firstFamilyTier!=="sub"&&
    item.firstFamilyTier!=="risk"
  );
}

function applyUnderCoverageNaturalRecovery(items,familyCoverageGate){
  const rows=[...(items||[])];
  const eligible=rows.filter(isMassCoverageEligible);
  if(!eligible.length)return rows;
  const eligibleMass=sum(eligible.map(item=>Math.max(0,Number(item.probability)||0)));
  if(!(eligibleMass>0))return rows;
  const adoptedEligible=eligible.filter(item=>item.purchaseStatus===PURCHASED);
  let adoptedMass=sum(adoptedEligible.map(item=>Math.max(0,Number(item.probability)||0)));

  const familyMass=new Map();
  for(const item of eligible){
    const first=Number(item.firstFamilyNumber)||Number(item.order?.[0])||0;
    familyMass.set(first,(familyMass.get(first)||0)+Math.max(0,Number(item.probability)||0));
  }
  const targetWeight=sum([...familyMass.values()]);
  const weightedTarget=targetWeight>0?sum([...familyMass].map(([first,mass])=>{
    const target=familyCoverageGate?.familyTargets?.get(Number(first));
    return (mass/targetWeight)*Math.max(0,Math.min(1,Number.isFinite(Number(target))?Number(target):.70));
  })):.70;
  const initialCoverage=adoptedMass/eligibleMass;
  if(initialCoverage+1e-12>=weightedTarget-.10)return rows;

  const candidates=eligible
    .filter(item=>item.purchaseStatus!==PURCHASED&&item.concentrationRatio>=1.04)
    .sort(compareCoverageCandidate);
  const recoveredKeys=new Set();
  for(const item of candidates){
    if(adoptedMass/eligibleMass+1e-12>=weightedTarget)break;
    const key=item.order.join("-");
    recoveredKeys.add(key);
    adoptedMass+=Math.max(0,Number(item.probability)||0);
  }
  if(!recoveredKeys.size)return rows;

  return rows.map(item=>{
    const key=item.order.join("-");
    if(!recoveredKeys.has(key))return item;
    const mainEligible=Boolean(item.familyPriorityEligibility?.main);
    const betClass=mainEligible?"MAIN":"COVER";
    const reason=`確率質量カバー不足を検出し、${item.firstFamilyNumber}頭の自然終端${key}を追加（購入可能自然終端の質量カバー回復）`;
    return{
      ...item,
      betClass,
      purchaseStatus:PURCHASED,
      purchaseReason:reason,
      purchaseRejectCode:"ADOPTED",
      adoptionMode:"MASS_UNDERCOVERAGE_RECOVERY",
      massCoverageRecovery:true,
      massCoverageRecoveryInitialCoverage:initialCoverage,
      massCoverageRecoveryTarget:weightedTarget,
      lifecycle:{generated:true,probabilityEvaluated:true,terminalDeleted:false,purchaseDecision:"ADOPTED",purchaseDecisionCode:"ADOPTED",purchaseDecisionReason:reason}
    };
  });
}

function applyFamilyPurchaseDecision(item,valueGate,familyCoverageGate){
  const key=item.order.join("-");
  const mainEligible=Boolean(item.familyPriorityEligibility?.main);
  const contenderEligible=Boolean(item.familyPriorityEligibility?.contender);
  const subEligible=Boolean(item.familyPriorityEligibility?.sub);
  const dominantPriority=normalizePriority(item.dominantBranchPriority);
  const highPayoutCandidate=Boolean(subEligible&&dominantPriority==="sub");
  const highPayoutAttribute=Boolean(item.odds&&item.odds>=100);
  const valueNaturalEligible=valueGate.supportedKeys.has(key);
  const isPrimaryFamily=Number(item.firstFamilyNumber)===Number(familyCoverageGate.primaryFirst);
  const selectedByFamilyCoverage=isPrimaryFamily?familyCoverageGate.selectedPrimaryKeys.has(key):familyCoverageGate.selectedOtherKeys.has(key);
  const familyCoverageCandidate=isFamilyCoverageCandidate(item,isPrimaryFamily);
  const familyCoverageTarget=familyCoverageGate.familyTargets.get(Number(item.firstFamilyNumber))??null;
  const familyCandidateMass=familyCoverageGate.familyCandidateMass.get(Number(item.firstFamilyNumber))||0;
  const familySelectedMass=familyCoverageGate.familySelectedMass.get(Number(item.firstFamilyNumber))||0;
  const familySelectedCoverage=Number(item.firstFamilyProbability)>0?familySelectedMass/Number(item.firstFamilyProbability):0;
  const familyCandidateCoverage=Number(item.firstFamilyProbability)>0?familyCandidateMass/Number(item.firstFamilyProbability):0;
  let betClass="NONE",adopted=false,purchaseReason="着順ファミリーの自然支持が不足",purchaseRejectCode="POSITION_SUPPORT";

  if(item.concentrationRatio<1.04){
    purchaseReason=`terminal分布が平坦（集中比${item.concentrationRatio.toFixed(3)}）`;
    purchaseRejectCode="FLAT_DISTRIBUTION";
  }else if(selectedByFamilyCoverage){
    // 1着ファミリーの「選ぶ順番」は確率カバーで決めるが、買い目区分は元の展開由来を維持する。
    // main展開の自然終端は、最上位頭か別頭かにかかわらずMAIN。
    betClass=mainEligible?"MAIN":"COVER";adopted=true;purchaseRejectCode="ADOPTED";
    if(mainEligible){
      purchaseReason=isPrimaryFamily
        ?`${item.firstFamilyNumber}頭の最上位1着ファミリーを先に確率カバーし、2着${item.order[1]}・3着${item.order[2]}が本命展開で自然支持`
        :`最上位頭のカバー選定後も、${item.firstFamilyNumber}頭は本命展開由来の自然終端として本線を維持`;
    }else{
      purchaseReason=isPrimaryFamily
        ?`${item.firstFamilyNumber}頭の最上位1着ファミリーの確率カバー補完。2着${item.order[1]}・3着${item.order[2]}の独立支持を確認`
        :`最上位頭のカバー選定後、${item.firstFamilyNumber}頭の有力ファミリーを確率質量順に補完`;
    }
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
      purchaseReason=`最上位頭のカバー選定後、別展開${item.firstFamilyNumber}頭の自然終端＋成立確率×実オッズ ${Number(item.subValueIndex).toFixed(2)}`;
    }
  }else if(isPrimaryFamily&&familyCoverageCandidate&&familyCandidateCoverage>0&&familySelectedCoverage>=Number(familyCoverageTarget||0)){
    purchaseReason=`最上位${item.firstFamilyNumber}頭は目標カバー${Math.round(Number(familyCoverageTarget||0)*100)}%に到達後の下位終端`;
    purchaseRejectCode="PRIMARY_COVERAGE_TARGET_REACHED";
  }else if(!isPrimaryFamily&&familyCoverageCandidate&&familyCandidateCoverage>0&&familySelectedCoverage>=Number(familyCoverageTarget||0)){
    purchaseReason=`${item.firstFamilyNumber}頭は最上位頭選定後の補完カバー目標に到達`;
    purchaseRejectCode="OTHER_FAMILY_COVERAGE_TARGET_REACHED";
  }else if(!item.familyStructuralCandidate){
    purchaseReason="本命・有力・別展開の購入ファミリーに属さない";
    purchaseRejectCode="NO_FAMILY_TIER";
  }else if((item.secondFamilyNaturalCutDetected&&!item.secondFamilyNaturalEligible)){
    purchaseReason=`${item.firstFamilyNumber}頭内で2着${item.order[1]}が明確な自然境界の下位`;
    purchaseRejectCode="SECOND_POSITION_SUPPORT";
  }else if((item.thirdVariantNaturalCutDetected&&!item.thirdVariantEligible)||(item.thirdFamilyNaturalCutDetected&&!item.thirdFamilyNaturalEligible)){
    purchaseReason=`${item.order[0]}-${item.order[1]}内で3着${item.order[2]}が明確な自然境界の下位`;
    purchaseRejectCode="THIRD_VARIANT_SUPPORT";
  }else if((Number(item.secondFamilyRelativeToBest)||0)<(isPrimaryFamily?PRIMARY_COVERAGE_SUPPORT_FLOORS.second:POSITION_FLOORS.second)){
    purchaseReason=`${item.firstFamilyNumber}頭内で2着${item.order[1]}の独立支持が購入カバー水準に届かない`;
    purchaseRejectCode="SECOND_POSITION_SUPPORT";
  }else if((Number(item.thirdFamilyRelativeToBest)||0)<(isPrimaryFamily?PRIMARY_COVERAGE_SUPPORT_FLOORS.third:POSITION_FLOORS.third)){
    purchaseReason=`${item.order[0]}-${item.order[1]}内で3着${item.order[2]}の独立支持が購入カバー水準に届かない`;
    purchaseRejectCode="THIRD_VARIANT_SUPPORT";
  }else{
    purchaseReason="該当展開枝の1・2・3着支持が購入水準に届かない";
    purchaseRejectCode="BRANCH_OR_POSITION_SUPPORT";
  }

  return{
    ...item,betClass,purchaseStatus:adopted?PURCHASED:"購入不採用",purchaseReason,purchaseRejectCode,
    lifecycle:{generated:true,probabilityEvaluated:true,terminalDeleted:false,purchaseDecision:adopted?"ADOPTED":"REJECTED",purchaseDecisionCode:purchaseRejectCode,purchaseDecisionReason:purchaseReason},
    adoptionMode:adopted?(betClass==="MAIN"?(isPrimaryFamily?"PRIMARY_FAMILY_MAIN_COVERAGE":"SECONDARY_MAIN_FAMILY_COVERAGE"):betClass==="COVER"?(isPrimaryFamily?"PRIMARY_FAMILY_COVERAGE_SUPPLEMENT":"SECONDARY_FAMILY_COVERAGE"):"SUB_VALUE_FAMILY"):null,
    purchaseHierarchyMode:familyCoverageGate.mode,
    isPrimaryFirstFamily:isPrimaryFamily,
    primaryFirstFamilyNumber:familyCoverageGate.primaryFirst,
    primaryFirstFamilyProbability:familyCoverageGate.primaryProbability,
    primaryFirstFamilyProbabilityShare:familyCoverageGate.primaryProbabilityShare,
    firstFamilyCoverageTarget:familyCoverageTarget,
    firstFamilyCandidateCoverage:familyCandidateCoverage,
    firstFamilySelectedCoverage:familySelectedCoverage,
    familyCoverageCandidate,
    selectedByFamilyCoverage,
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
  const natural=dedupePurchasedOrders(items.filter(item=>item.purchaseStatus===PURCHASED)).sort(comparePurchase);
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
  probability:item.probability,probabilityShare:item.terminalProbabilityShare??null,expectedValueIndex:item.expectedValueIndex??null,
  globalRank:item.terminalGlobalRank??null,familyRank:item.terminalFamilyRank??null,pairRank:item.terminalPairRank??null,
  branchSupport:item.branchSupport,purchaseReason:item.purchaseReason,
  dominantBranchId:item.dominantBranchId,dominantBranchLabel:item.dominantBranchLabel,dominantBranchPriority:item.dominantBranchPriority||null,
  decisionRatios:item.decisionRatios,positionEvidence:item.positionEvidence||null,evidenceSummary:item.evidenceSummary||null,
  highPayoutAttribute:Boolean(item.highPayoutAttribute),highPayoutAttributeLabel:item.highPayoutAttributeLabel||null,
  firstFamilyNumber:item.firstFamilyNumber,firstFamilyTier:item.firstFamilyTier,firstFamilyProbability:item.firstFamilyProbability??null,firstFamilyProbabilityShare:item.firstFamilyProbabilityShare??null,
  secondFamilyRelativeToBest:item.secondFamilyRelativeToBest??null,thirdFamilyRelativeToBest:item.thirdFamilyRelativeToBest??null,subValueIndex:item.subValueIndex??null,
  chatForecastRole:item.chatForecastRole||null,directMainBranchSupport:Boolean(item.directMainBranchSupport),branchHeadMatched:item.branchHeadMatched!==false,
  naturalConvergenceScore:item.naturalConvergenceScore??null,naturalConvergenceLevel:item.naturalConvergenceLevel||null,naturalConvergenceReasons:item.naturalConvergenceReasons||[],
  extraConditionCount:item.extraConditionCount??0,extraConditionDetails:item.extraConditionDetails||[],
  nodeExtraConditionCount:item.nodeExtraConditionCount??0,structuralExtraConditionCount:item.structuralExtraConditionCount??0,
  extraConditionProbabilityMin:item.extraConditionProbabilityMin??null,extraConditionProbabilityMean:item.extraConditionProbabilityMean??null,
  extraConditionPenalty:item.extraConditionPenalty??null,
  relativeConditionCount:item.relativeConditionCount??0,relativeConditionPenalty:item.relativeConditionPenalty??1,
  relativeConditionTrace:item.relativeConditionTrace||[],probabilitySeparationPolicy:item.probabilitySeparationPolicy||null,
  scenarioCoherence:item.scenarioCoherence??null,
  nodeConditionalProbability:item.nodeConditionalProbability??null,nodeTrace:item.nodeTrace||null,
  fundingWeight:item.odds>1?(Number(item.probability)||0)*Math.sqrt(Math.max((Number(item.probability)||0)*Number(item.odds),.000001)):(Number(item.probability)||0),
  fundingStatus,minimumRequired
}}

export function purchaseDiagnostics(classified,plan,budget){
  const probabilities=classified.map(item=>item.probability).sort((a,b)=>b-a);
  const rawNatural=classified.filter(item=>item.purchaseStatus===PURCHASED);
  const natural=dedupePurchasedOrders(rawNatural);
  const noBet=natural.length===0;
  const noBetReason=!noBet?null:classified.length===0?"NO_TERMINALS":(classified[0]?.concentrationRatio||0)<1.04?"FLAT_DISTRIBUTION_NO_SUPPORTED_CANDIDATE":"NO_FAMILY_SUPPORTED_CANDIDATE";
  const minimumRequired=natural.length*100;
  const rejected=classified.filter(item=>item.purchaseStatus!==PURCHASED);
  const rejectCodeCounts={};
  for(const item of rejected){const code=item.purchaseRejectCode||"UNKNOWN";rejectCodeCounts[code]=(rejectCodeCounts[code]||0)+1;}
  const diagnosticBranchStats=buildBranchStats(classified);
  const diagnosticMaxBranchTotal=Math.max(...[...diagnosticBranchStats.values()].map(stats=>stats.total),0);
  const terminalProbabilitySum=sum(probabilities)||1;
  const familyRows=buildFamilyAuditRows(classified,terminalProbabilitySum);
  return{
    generatedTerminalCount:classified.length,probabilityEvaluatedTerminalCount:classified.length,terminalCount:classified.length,
    terminalProbabilitySum:sum(probabilities),maxTerminalProbability:probabilities[0]||0,
    top3Mass:sum(probabilities.slice(0,3)),top5Mass:sum(probabilities.slice(0,5)),top10Mass:sum(probabilities.slice(0,10)),
    purchaseCandidateCountBeforeCompression:natural.length,purchaseCandidateCountAfterCompression:natural.length,finalBetCount:natural.length,
    fixedBranchRankCapApplied:false,representativeTerminalCount:classified.filter(item=>item.representativeTerminal).length,
    credibleVariantCount:classified.filter(item=>{const r=item.decisionRatios||{};return item.branchFit>=.87&&(r.first??0)>=.88&&(r.second??0)>=.85&&(r.third??0)>=.85;}).length,
    adoptedTerminalCount:natural.length,rejectedTerminalCount:classified.length-natural.length,rejectCodeCounts,
    purchaseFunnelAudit:buildPurchaseFunnelAudit({classified,natural,plan,rejectCodeCounts}),
    purchaseOverlapAudit:buildPurchaseOverlapAudit(rawNatural,natural),
    purchaseMassAudit:buildPurchaseMassAudit({classified,natural,familyRows}),
    purchaseThresholds:{
      concentrationRatioMin:1.04,representativeBranchFitMin:.975,credibleVariantBranchFitMin:.87,probabilitySupportVsMaxMin:null,
      rawBranchCountUsedForAdoption:false,weightedMultiBranchSupportEquivalentMin:2,
      purchaseSelectionMode:"PRIMARY_FIRST_FAMILY_COVERAGE_THEN_OTHER_FAMILIES",
      firstFamilySelectionMode:"TOP_FIRST_PROBABILITY_FAMILY_CUMULATIVE_COVERAGE_FIRST",
      primaryFamilyCoverageTargets:{...PRIMARY_COVERAGE_TARGETS},
      primaryCoverageSupportFloors:{...PRIMARY_COVERAGE_SUPPORT_FLOORS},
      secondThirdSelectionMode:"INDEPENDENT_POSITION_SUPPORT_WITH_CUMULATIVE_FAMILY_COVERAGE",
      fixedTerminalRankCapApplied:false,fixedProbabilityCutoffApplied:false,
      positionRatios:{...POSITION_FLOORS},
      buyableHighMode:"SUB_SCENARIO_PROBABILITY_X_OFFICIAL_ODDS_THEN_ADAPTIVE_VALUE_GROUP",
      buyableHighBreakEvenIndex:1,
      fundingMode:"100YEN_BASE_PLUS_PROBABILITY_X_SQRT_PROBABILITY_ODDS"
    },
    purchaseFamilyAudit:{mode:"PRIMARY_FIRST_FAMILY_COVERAGE_THEN_OTHER_FAMILIES",headCount:familyRows.length,primaryFirst:classified.find(item=>item.isPrimaryFirstFamily)?.firstFamilyNumber??null,primaryCoverageTarget:classified.find(item=>item.isPrimaryFirstFamily)?.firstFamilyCoverageTarget??null,rows:familyRows},
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

function buildPurchaseFunnelAudit({classified,natural,plan,rejectCodeCounts}){
  const generated=classified.length;
  const adopted=natural.length;
  const finalPlan=Array.isArray(plan)?plan.length:0;
  const rejected=Math.max(0,generated-adopted);
  const reasons=Object.entries(rejectCodeCounts||{}).sort((a,b)=>Number(b[1])-Number(a[1])||String(a[0]).localeCompare(String(b[0]),"en"));
  const dominant=reasons[0]||null;
  return{
    policy:"GENERATED_TO_PROBABILITY_TO_PURCHASE_DECISION_TO_FINAL_PLAN",
    generatedTerminalCount:generated,
    probabilityEvaluatedTerminalCount:generated,
    standardPurchaseCandidateCount:adopted,
    rejectedTerminalCount:rejected,
    finalPlanCount:finalPlan,
    adoptionRate:generated?adopted/generated:0,
    rejectionRate:generated?rejected/generated:0,
    dominantRejectCode:dominant?.[0]||null,
    dominantRejectCount:dominant?Number(dominant[1])||0:0,
    rejectCodeCounts:{...(rejectCodeCounts||{})},
    extremeCompression:generated>=30&&adopted/generated<.08,
    zeroStandardPurchase:generated>0&&adopted===0
  };
}

function buildFamilyAuditRows(classified,totalProbability=1){
  const map=new Map();
  for(const item of classified){
    const first=Number(item.firstFamilyNumber)||Number(item.order?.[0])||0;
    if(!map.has(first))map.set(first,{first,tier:item.firstFamilyTier||"risk",probability:0,generated:0,priorityMass:item.firstFamilyPriorityMass||{},isPrimaryFirstFamily:Boolean(item.isPrimaryFirstFamily),coverageTarget:item.firstFamilyCoverageTarget!=null&&Number.isFinite(Number(item.firstFamilyCoverageTarget))?Number(item.firstFamilyCoverageTarget):null,candidateCoverage:Number.isFinite(Number(item.firstFamilyCandidateCoverage))?Number(item.firstFamilyCandidateCoverage):null,selectedCoverageGate:Number.isFinite(Number(item.firstFamilySelectedCoverage))?Number(item.firstFamilySelectedCoverage):null,naturalCandidateCount:0,naturalCandidateProbability:0,adopted:0,adoptedProbability:0,main:0,mainProbability:0,cover:0,coverProbability:0,buyableHigh:0,buyableHighProbability:0,rejected:0,rejectedProbability:0});
    const row=map.get(first),probability=Math.max(0,Number(item.probability)||0);
    row.isPrimaryFirstFamily=row.isPrimaryFirstFamily||Boolean(item.isPrimaryFirstFamily);
    if(item.firstFamilyCoverageTarget!=null&&Number.isFinite(Number(item.firstFamilyCoverageTarget)))row.coverageTarget=Number(item.firstFamilyCoverageTarget);
    if(Number.isFinite(Number(item.firstFamilyCandidateCoverage)))row.candidateCoverage=Number(item.firstFamilyCandidateCoverage);
    if(Number.isFinite(Number(item.firstFamilySelectedCoverage)))row.selectedCoverageGate=Number(item.firstFamilySelectedCoverage);
    row.probability+=probability;
    row.generated+=1;
    if(item.familyNaturalPositionEligible){row.naturalCandidateCount+=1;row.naturalCandidateProbability+=probability;}
    if(item.purchaseStatus===PURCHASED){
      row.adopted+=1;row.adoptedProbability+=probability;
      if(item.betClass==="MAIN"){row.main+=1;row.mainProbability+=probability;}
      else if(item.betClass==="COVER"){row.cover+=1;row.coverProbability+=probability;}
      else if(item.betClass==="BUYABLE_HIGH"){row.buyableHigh+=1;row.buyableHighProbability+=probability;}
    }else{row.rejected+=1;row.rejectedProbability+=probability;}
  }
  const denominator=Number(totalProbability)>0?Number(totalProbability):1;
  return[...map.values()].map(row=>{
    const familyProbability=row.probability>0?row.probability:1;
    const adoptedCoverage=row.probability>0?row.adoptedProbability/row.probability:0;
    const naturalCandidateCoverage=row.probability>0?row.naturalCandidateProbability/row.probability:0;
    const coverageTarget=row.coverageTarget!=null&&Number.isFinite(Number(row.coverageTarget))?Number(row.coverageTarget):.70;
    const cautionFloor=Math.max(.50,coverageTarget-.20);
    const coverageStatus=adoptedCoverage+1e-12>=coverageTarget?"OK":adoptedCoverage>=cautionFloor?"CAUTION":"ALERT";
    return{
      ...row,
      probabilityShare:row.probability/denominator,
      adoptedProbabilityShare:row.adoptedProbability/denominator,
      rejectedProbabilityShare:row.rejectedProbability/denominator,
      naturalCandidateProbabilityShare:row.naturalCandidateProbability/denominator,
      adoptedCoverage,
      rejectedCoverage:row.rejectedProbability/familyProbability,
      naturalCandidateCoverage,
      coverageTarget,
      coverageTargetMet:adoptedCoverage+1e-12>=(Number.isFinite(Number(row.coverageTarget))?Number(row.coverageTarget):.70),
      candidateCoverage:Number.isFinite(Number(row.candidateCoverage))?Number(row.candidateCoverage):null,
      selectedCoverageGate:Number.isFinite(Number(row.selectedCoverageGate))?Number(row.selectedCoverageGate):null,
      coverageStatus,
      coverageLabel:coverageStatus==="OK"?"カバー良好":coverageStatus==="CAUTION"?"カバー注意":"カバー要監査"
    };
  }).sort((a,b)=>familyTierRank(a.tier)-familyTierRank(b.tier)||b.probability-a.probability||a.first-b.first);
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
    order:item.order.join("-"),betClass:item.betClass,probability:item.probability,probabilityShare:item.terminalProbabilityShare??null,
    globalRank:item.terminalGlobalRank??null,familyRank:item.terminalFamilyRank??null,pairRank:item.terminalPairRank??null,odds:item.odds??null,expectedValueIndex:item.expectedValueIndex??null,
    dominantBranchId:item.dominantBranchId,dominantBranchLabel:item.dominantBranchLabel,dominantBranchPriority:item.dominantBranchPriority,dominantBranchTierLabel:branchPriorityLabel(item.dominantBranchPriority),
    branchFit:item.branchFit,branchRank:item.branchRank,branchSupport:item.branchSupport,weightedBranchSupport:item.weightedBranchSupport??sum(supportBranches.map(branch=>branch.weightedSupport||0)),
    thirdVariantEligible:item.thirdVariantEligible??true,thirdVariantGroupKey:item.thirdVariantGroupKey||null,thirdVariantRelativeToBest:item.thirdVariantRelativeToBest??null,thirdVariantConditionalShare:item.thirdVariantConditionalShare??null,thirdVariantNaturalCutDetected:item.thirdVariantNaturalCutDetected||false,thirdVariantCutGap:item.thirdVariantCutGap??null,thirdVariantGroupSize:item.thirdVariantGroupSize??null,
    firstFamilyNumber:item.firstFamilyNumber,firstFamilyTier:item.firstFamilyTier,firstFamilyProbability:item.firstFamilyProbability,firstFamilyProbabilityShare:item.firstFamilyProbabilityShare??null,
    isPrimaryFirstFamily:Boolean(item.isPrimaryFirstFamily),primaryFirstFamilyNumber:item.primaryFirstFamilyNumber??null,firstFamilyCoverageTarget:item.firstFamilyCoverageTarget??null,firstFamilyCandidateCoverage:item.firstFamilyCandidateCoverage??null,firstFamilySelectedCoverage:item.firstFamilySelectedCoverage??null,selectedByFamilyCoverage:Boolean(item.selectedByFamilyCoverage),
    secondFamilyRelativeToBest:item.secondFamilyRelativeToBest,secondFamilyNaturalEligible:item.secondFamilyNaturalEligible,thirdFamilyRelativeToBest:item.thirdFamilyRelativeToBest,thirdFamilyNaturalEligible:item.thirdFamilyNaturalEligible,
    subScenarioProbability:item.subScenarioProbability??null,subValueIndex:item.subValueIndex??null,subValueNaturalEligible:item.subValueNaturalEligible??null,
    highPayoutCandidate:Boolean(item.highPayoutCandidate),highPayoutAttribute:Boolean(item.highPayoutAttribute),highPayoutAttributeLabel:item.highPayoutAttributeLabel||null,oddsEvaluationStatus:item.oddsEvaluationStatus||null,
    rawBranchCountUsedForAdoption:false,dominantBranchStrengthRatio:item.dominantBranchStrengthRatio??null,uniqueSupportBranchCount:uniqueSupportBranchIds.length,supportBranches,duplicateSupportLabels,representativeTerminal:item.representativeTerminal,decisionRatios:item.decisionRatios||null,purchaseReason:item.purchaseReason,adoptionMode:item.adoptionMode||null
  };
}
function dedupePurchasedOrders(items){
  const byOrder=new Map();
  for(const item of items){
    const key=(item.order||[]).join("-");
    if(!key)continue;
    const current=byOrder.get(key);
    if(!current||comparePurchase(item,current)<0)byOrder.set(key,item);
  }
  return [...byOrder.values()];
}

function buildPurchaseMassAudit({classified,natural,familyRows}){
  const totalMass=sum((classified||[]).map(item=>Math.max(0,Number(item.probability)||0)));
  const purchasedMass=sum((natural||[]).map(item=>Math.max(0,Number(item.probability)||0)));
  const eligible=(classified||[]).filter(isMassCoverageEligible);
  const eligibleKeys=new Set(eligible.map(item=>(item.order||[]).join("-")));
  const eligibleMass=sum(eligible.map(item=>Math.max(0,Number(item.probability)||0)));
  const purchasedEligible=(natural||[]).filter(item=>eligibleKeys.has((item.order||[]).join("-")));
  const purchasedEligibleMass=sum(purchasedEligible.map(item=>Math.max(0,Number(item.probability)||0)));
  const eligibleCoverage=eligibleMass>0?purchasedEligibleMass/eligibleMass:0;
  const structuralFamilyRows=(familyRows||[]).filter(row=>row.tier!=="risk"&&Number(row.naturalCandidateProbability)>0);
  const targetWeight=sum(structuralFamilyRows.map(row=>Math.max(0,Number(row.naturalCandidateProbability)||0)));
  const weightedTarget=targetWeight>0?sum(structuralFamilyRows.map(row=>(Math.max(0,Number(row.naturalCandidateProbability)||0)/targetWeight)*Math.max(0,Math.min(1,Number(row.coverageTarget)||0)))):.70;
  const purchasedCount=(natural||[]).length;
  const topEligibleMass=sum([...eligible].sort(compareTerminal).slice(0,purchasedCount).map(item=>Math.max(0,Number(item.probability)||0)));
  const massEfficiency=topEligibleMass>0?purchasedEligibleMass/topEligibleMass:1;
  const coverageGap=eligibleCoverage-weightedTarget;
  const underCoverage=eligibleMass>0&&coverageGap<-.10;
  const inefficientCoverage=purchasedCount>=4&&massEfficiency<.70;
  const overSpread=purchasedCount>=8&&massEfficiency<.82&&eligibleCoverage>=weightedTarget;
  const status=underCoverage?"UNDER_COVERED":overSpread?"OVER_SPREAD":inefficientCoverage?"INEFFICIENT":"BALANCED";
  return{
    policy:"PURCHASEABLE_NATURAL_MASS_COVERAGE_AND_TOP_N_EFFICIENCY",
    totalProbabilityMass:totalMass,
    purchasedProbabilityMass:purchasedMass,
    purchasedMassShare:totalMass>0?purchasedMass/totalMass:0,
    eligibleNaturalTerminalCount:eligible.length,
    eligibleNaturalProbabilityMass:eligibleMass,
    purchasedEligibleTerminalCount:purchasedEligible.length,
    purchasedEligibleProbabilityMass:purchasedEligibleMass,
    eligibleCoverage,
    weightedCoverageTarget:weightedTarget,
    coverageGap,
    topNEligibleProbabilityMass:topEligibleMass,
    massEfficiency,
    underCoverage,
    inefficientCoverage,
    overSpread,
    status,
    recoveryCount:(natural||[]).filter(item=>item.massCoverageRecovery).length,
    recoveryApplied:(natural||[]).some(item=>item.massCoverageRecovery)
  };
}

function buildPurchaseOverlapAudit(rawNatural,natural){
  const orderCounts=new Map();
  const pairRows=new Map();
  for(const item of rawNatural||[]){
    const order=(item.order||[]).map(Number);
    const orderKey=order.join("-");
    orderCounts.set(orderKey,(orderCounts.get(orderKey)||0)+1);
    const pairKey=`${order[0]||0}-${order[1]||0}`;
    if(!pairRows.has(pairKey))pairRows.set(pairKey,{pair:pairKey,rawOrders:0,uniqueOrders:new Set(),probabilityMass:0,classes:new Set()});
    const row=pairRows.get(pairKey);
    row.rawOrders+=1;row.uniqueOrders.add(orderKey);row.probabilityMass+=Math.max(0,Number(item.probability)||0);row.classes.add(item.betClass||"NONE");
  }
  const duplicateOrders=[...orderCounts].filter(([,count])=>count>1).map(([order,count])=>({order,count})).sort((a,b)=>b.count-a.count||a.order.localeCompare(b.order,"en"));
  const pairs=[...pairRows.values()].map(row=>({pair:row.pair,variantCount:row.uniqueOrders.size,probabilityMass:row.probabilityMass,betClasses:[...row.classes].sort(),overlapLevel:row.uniqueOrders.size>=5?"HIGH":row.uniqueOrders.size>=3?"MEDIUM":"NORMAL"})).sort((a,b)=>b.variantCount-a.variantCount||b.probabilityMass-a.probabilityMass||a.pair.localeCompare(b.pair,"en"));
  return{
    policy:"EXACT_ORDER_DEDUPE_ONLY_KEEP_NATURAL_THIRD_VARIANTS",
    rawPurchasedCount:(rawNatural||[]).length,
    uniquePurchasedCount:(natural||[]).length,
    exactDuplicateOrderCount:duplicateOrders.reduce((sum,row)=>sum+(row.count-1),0),
    duplicateOrders,
    pairVariantRows:pairs,
    maxThirdVariantsPerPair:pairs[0]?.variantCount||0,
    highOverlapPairs:pairs.filter(row=>row.overlapLevel==="HIGH").map(row=>row.pair)
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
