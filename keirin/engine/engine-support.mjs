export function buildReferenceToStandardTransitionAudit({lineConfidence=null,purchaseBlocked=false,blockCode=null,lineFallbackDiscriminationAudit=null,normalPlan=[],fallbackPlan=[]}={}){
  const normal=Array.isArray(normalPlan)?normalPlan:[];
  const fallback=Array.isArray(fallbackPlan)?fallbackPlan:[];
  const referenceCarryoverCount=normal.filter(row=>row?.referenceOnly===true).length;
  const lineEvidenceResolved=lineConfidence==="高"||lineFallbackDiscriminationAudit?.sufficient===true;
  const lineReferenceBlocked=["LINE_DATA_UNAVAILABLE","LINE_FALLBACK_INSUFFICIENT_DISCRIMINATION","LINE_AND_START_EVIDENCE_UNAVAILABLE"].includes(blockCode);
  const decision=fallback.length
    ?"REFERENCE_ONLY_REQUIRES_FRESH_REEVALUATION"
    :normal.length
      ?"STANDARD_REEVALUATED_FROM_CURRENT_INPUTS"
      :purchaseBlocked
        ?"PURCHASE_BLOCKED_NO_REFERENCE"
        :"NO_STANDARD_PURCHASE_CANDIDATE";
  return{
    version:"REFERENCE-STANDARD-TRANSITION-1.0",
    policy:"REFERENCE_BETS_ARE_NEVER_PROMOTED_OR_CARRIED_INTO_STANDARD_PURCHASE; CURRENT_INPUTS_MUST_REBUILD_SCORE_BRANCH_TERMINAL_CLASSIFICATION_AND_PURCHASE",
    lineConfidence,
    discriminationSufficient:lineFallbackDiscriminationAudit?.sufficient??null,
    lineEvidenceResolved,
    lineReferenceBlocked,
    purchaseBlocked:Boolean(purchaseBlocked),
    normalPlanCount:normal.length,
    referencePlanCount:fallback.length,
    referenceCarryoverCount,
    referencePromotionForbidden:true,
    freshReevaluationRequired:true,
    decision,
    passed:referenceCarryoverCount===0&&!(normal.length>0&&fallback.length>0)
  };
}

export function buildRiderAbilityEvaluationAudit(scored=[]){
  const rows=(scored||[]).map(item=>({
    number:Number(item.number),
    role:item?.riderEvaluationV2?.role||item?.role||null,
    roleCertainty:item?.riderEvaluationV2?.roleCertainty?.level||null,
    rawAbilityPlacementScores:item?.riderEvaluationV2?.rawAbilityPlacementScores||null,
    contextPriorScores:item?.riderEvaluationV2?.contextPriorScores||null,
    finalPlacementScores:item?.riderEvaluationV2?.placementScores||null,
    contextAdjustment:item?.riderEvaluationV2?.contextAdjustment||null,
    maxAbsoluteContextAdjustment:Number(item?.abilityContextAudit?.maxAbsoluteContextAdjustment)||0
  }));
  return{
    version:"RIDER-ABILITY-AUDIT-3.0",
    policy:"RAW_ABILITY_FIRST_ROLE_CONTEXT_SECOND",
    riderCount:rows.length,
    lowRoleCertaintyCount:rows.filter(row=>row.roleCertainty==="low").length,
    maxContextAdjustment:rows.length?Math.max(...rows.map(row=>row.maxAbsoluteContextAdjustment)):0,
    rawAbilitySeparated:rows.every(row=>row.rawAbilityPlacementScores&&row.contextPriorScores),
    rows,
    passed:rows.every(row=>row.rawAbilityPlacementScores&&row.contextPriorScores)
  };
}

export function buildLineFallbackDiscriminationAudit({scored=[],terminals=[],lineIndependentMainAvailable=false}={}){
  const finiteValues=values=>values.map(Number).filter(Number.isFinite);
  const spread=values=>{
    const v=finiteValues(values);
    return v.length?Math.max(...v)-Math.min(...v):0;
  };
  const firstScores=finiteValues(scored.map(item=>item?.roleScores?.first));
  const secondScores=finiteValues(scored.map(item=>item?.roleScores?.second));
  const thirdScores=finiteValues(scored.map(item=>item?.roleScores?.third));
  const mechanismScores=finiteValues(scored.flatMap(item=>[
    item?.riderEvaluationV2?.firstMechanisms?.escape,
    item?.riderEvaluationV2?.firstMechanisms?.makuri
  ]));

  const headMass=new Map();
  for(const terminal of terminals||[]){
    const head=Number(terminal?.order?.[0]);
    if(!Number.isFinite(head))continue;
    headMass.set(head,(headMass.get(head)||0)+(Number(terminal?.probability)||0));
  }
  const headShares=[...headMass.entries()]
    .map(([head,mass])=>({head,mass}))
    .sort((a,b)=>b.mass-a.mass||a.head-b.head);
  const totalHeadMass=headShares.reduce((sum,row)=>sum+row.mass,0)||1;
  for(const row of headShares)row.share=row.mass/totalHeadMass;

  const topShare=headShares[0]?.share||0;
  const secondShare=headShares[1]?.share||0;
  const headGap=Math.max(0,topShare-secondShare);
  const firstSpread=spread(firstScores);
  const secondSpread=spread(secondScores);
  const thirdSpread=spread(thirdScores);
  const mechanismSpread=spread(mechanismScores);

  // Missing-line mode must have some real rider separation before normal purchase.
  // Do NOT treat missing start-power/line metadata as an automatic race-wide skip.
  // The decision is based on independent rider separation that is actually present.
  const sufficient=Boolean(
    firstSpread>=.20 ||
    secondSpread>=.24 ||
    thirdSpread>=.24 ||
    mechanismSpread>=.28 ||
    headGap>=.035
  );

  return{
    version:"LINE-FALLBACK-DISCRIMINATION-1.0",
    sufficient,
    firstSpread,secondSpread,thirdSpread,mechanismSpread,
    topHeadShare:topShare,
    secondHeadShare:secondShare,
    topHeadGap:headGap,
    headCount:headShares.length,
    headShares,
    policy:"UNKNOWN_LINE_CAN_CONTINUE_FORECAST_BUT_NORMAL_PURCHASE_REQUIRES_RIDER_DISCRIMINATION"
  };
}

export function buildNonZeroReferencePlan({rawClassified=[],classified=[],budget=3000,blockedReason="",blockCode="",lineFallbackDiscriminationAudit=null,allocator=null}={}){
  const source=Array.isArray(rawClassified)&&rawClassified.length?rawClassified:classified;
  if(!source?.length)return[];
  const purchased=source.filter(item=>item.purchaseStatus==="購入採用");
  const eligible=(purchased.length?purchased:source.filter(item=>item.branchHeadMatched!==false));
  const pool=(eligible.length?eligible:source).sort((a,b)=>
    (Number(b.naturalConvergenceScore)||0)-(Number(a.naturalConvergenceScore)||0)||
    (Number(b.probability)||0)-(Number(a.probability)||0)||
    String(a.order||[]).localeCompare(String(b.order||[]),"en")
  );
  const top=pool[0];
  if(!top)return[];
  const topProbability=Math.max(Number(top.probability)||0,1e-9);
  const flatMissingLine=blockCode==="LINE_AND_START_EVIDENCE_UNAVAILABLE" || (
    blockCode==="LINE_FALLBACK_INSUFFICIENT_DISCRIMINATION" &&
    lineFallbackDiscriminationAudit?.sufficient===false &&
    Math.max(
      Number(lineFallbackDiscriminationAudit?.firstSpread)||0,
      Number(lineFallbackDiscriminationAudit?.secondSpread)||0,
      Number(lineFallbackDiscriminationAudit?.thirdSpread)||0,
      Number(lineFallbackDiscriminationAudit?.mechanismSpread)||0,
      Number(lineFallbackDiscriminationAudit?.topHeadGap)||0
    )<.01
  );
  let selected=[];
  if(flatMissingLine){
    // Completely flat evidence must not invent a ranking. Reference display is
    // not a purchase decision, so do not inherit the normal branchHeadMatched
    // prefilter here. Use every generated terminal and build a cyclic set that
    // balances first/second/third exposure.
    const flatPool=[...source].sort((a,b)=>
      (Number(b.naturalConvergenceScore)||0)-(Number(a.naturalConvergenceScore)||0)||
      (Number(b.probability)||0)-(Number(a.probability)||0)||
      String(a.order||[]).localeCompare(String(b.order||[]),"en")
    );
    selected=selectPositionBalancedFlatReferences(flatPool);
  }else{
    selected=pool.filter((item,index)=>{
      if(index===0)return true;
      const p=Number(item.probability)||0;
      const natural=Number(item.naturalConvergenceScore)||0;
      return p>=topProbability*.82&&natural>=Math.max(.50,(Number(top.naturalConvergenceScore)||0)-.10);
    });
  }
  if(!selected.length)selected=[top];
  const maxByBudget=Math.max(1,Math.floor((Number(budget)||0)/100));
  selected=selected.slice(0,maxByBudget);
  const referenceItems=selected.map(item=>({
    ...item,
    // allocate() expects temporary purchase-adopted rows for stake calculation,
    // but reference rows are converted to an explicit non-standard class below.
    purchaseStatus:"購入採用",
    betClass:"REFERENCE",
    purchaseReason:`参考買い目: ${blockedReason||"通常購入条件で採用0件"}。通常購入ではなく参考表示`,
    referenceOnly:true,
    purchaseRejectCode:null
  }));
  if(typeof allocator!=="function")throw new Error("reference allocator is required by purchase engine");
  return allocator(referenceItems,budget).map(row=>({
    ...row,
    betClass:"REFERENCE",
    purchaseStatus:"参考表示",
    purchaseReason:`参考買い目: ${blockedReason||"通常購入条件で採用0件"}。通常購入クラスには含めません`,
    referenceOnly:true,
    referenceReason:blockedReason||"NO_STANDARD_PURCHASE_CANDIDATE"
  }));
}

export function selectPositionBalancedFlatReferences(pool=[]){
  const heads=[...new Set((pool||[]).map(item=>Number(item?.order?.[0])).filter(Number.isFinite))].sort((a,b)=>a-b);
  if(!heads.length)return[];
  const selected=[];
  const used=new Set();
  for(let i=0;i<heads.length;i+=1){
    const first=heads[i];
    const second=heads[(i+1)%heads.length];
    const third=heads[(i+2)%heads.length];
    const exact=(pool||[]).find(item=>{
      const order=(item?.order||[]).map(Number);
      return order[0]===first&&order[1]===second&&order[2]===third;
    });
    if(exact){selected.push(exact);used.add((exact.order||[]).join("-"));continue;}
    const fallback=(pool||[]).find(item=>Number(item?.order?.[0])===first&&!used.has((item.order||[]).join("-")));
    if(fallback){selected.push(fallback);used.add((fallback.order||[]).join("-"));}
  }
  return selected;
}

export function buildReferencePositionBalanceAudit(plan=[]){
  const counts={first:{},second:{},third:{}};
  for(const row of plan||[]){
    const order=(row?.order||[]).map(Number);
    ["first","second","third"].forEach((key,index)=>{
      const rider=order[index];
      if(Number.isFinite(rider))counts[key][rider]=(counts[key][rider]||0)+1;
    });
  }
  const imbalance=key=>{
    const values=Object.values(counts[key]);
    return values.length?Math.max(...values)-Math.min(...values):0;
  };
  const firstImbalance=imbalance("first");
  const secondImbalance=imbalance("second");
  const thirdImbalance=imbalance("third");
  return{
    version:"REFERENCE-POSITION-BALANCE-1.0",
    policy:"FLAT_EVIDENCE_DOES_NOT_RANK_RIDERS_AND_BALANCES_REFERENCE_POSITION_EXPOSURE",
    counts,firstImbalance,secondImbalance,thirdImbalance,
    passed:firstImbalance===0&&secondImbalance===0&&thirdImbalance===0
  };
}

export function buildBranchSelectionAudit(branches){
  const sorted=[...(branches||[])].sort((a,b)=>(b.score||0)-(a.score||0)||String(a.id).localeCompare(String(b.id),"en"));
  const totalScore=sorted.reduce((sum,branch)=>sum+(Number(branch.score)||0),0);
  const structured=sorted.filter(branch=>["LEADER_HOLD","BANTE_SASHI","MAKURI_SUCCESS"].includes(branch.branchType));
  const topStructured=structured[0]||null;
  const topStructuredScore=Number(topStructured?.score)||0;
  const mainBranches=structured.filter(branch=>branch.priority==="main");
  const scenarioMainBranches=structured.filter(branch=>branch.priority==="main"||branch.sameScenarioMainSibling===true);
  const contenderBranches=structured.filter(branch=>branch.priority==="contender"&&branch.sameScenarioMainSibling!==true);
  const subBranches=structured.filter(branch=>branch.priority==="sub");
  const topScore=Number(sorted[0]?.score)||0;
  const tailStructured=[...contenderBranches,...subBranches].sort((a,b)=>(b.score||0)-(a.score||0));
  const tailGaps=[];
  for(let i=0;i<tailStructured.length-1;i+=1)tailGaps.push(Math.max(0,(Number(tailStructured[i].score)||0)-(Number(tailStructured[i+1].score)||0)));
  const medianGap=median(tailGaps);
  const madGap=median(tailGaps.map(gap=>Math.abs(gap-medianGap)));
  const contenderMin=contenderBranches.length?Math.min(...contenderBranches.map(branch=>Number(branch.score)||0)):null;
  const subMax=subBranches.length?Math.max(...subBranches.map(branch=>Number(branch.score)||0)):null;
  return{
    totalBranchScore:totalScore,
    topBranchId:sorted[0]?.id||null,
    topBranchLabel:sorted[0]?.label||null,
    topBranchScore:topScore,
    topStructuredBranchId:topStructured?.id||null,
    topStructuredBranchLabel:topStructured?.label||null,
    topStructuredScore,
    mainSelectionMode:structured.some(branch=>branch.initiativeSelectionPolicy)?"INITIATIVE_LINE_FIRST_THEN_OUTCOME_BRANCH":"HIERARCHICAL_NATURAL_TIERS",
    mainLineId:mainBranches.find(branch=>branch.primaryLineId)?.primaryLineId||null,
    mainLineIds:[...new Set(mainBranches.map(branch=>branch.primaryLineId).filter(Boolean))],
    mainBranchIds:mainBranches.map(branch=>branch.id),
    mainBranchLabels:mainBranches.map(branch=>branch.label),
    mainScenarioBranchIds:scenarioMainBranches.map(branch=>branch.id),
    mainScenarioBranchLabels:scenarioMainBranches.map(branch=>branch.label),
    sameScenarioReversalAudit:buildSameScenarioReversalAudit(structured),
    contenderBranchIds:contenderBranches.map(branch=>branch.id),
    contenderBranchLabels:contenderBranches.map(branch=>branch.label),
    subBranchIds:subBranches.map(branch=>branch.id),
    subBranchLabels:subBranches.map(branch=>branch.label),
    mainPriorityRatio:null,
    tiering:{
      mainCount:mainBranches.length,
      contenderCount:contenderBranches.length,
      subCount:subBranches.length,
      topTieCount:mainBranches.length,
      tailMedianGap:tailGaps.length?medianGap:null,
      tailMadGap:tailGaps.length?madGap:null,
      contenderCutGap:contenderMin!=null&&subMax!=null?contenderMin-subMax:null,
      contenderCutDetected:contenderMin!=null&&subMax!=null
    },
    rows:sorted.map(branch=>({
      id:branch.id,
      label:branch.label,
      branchType:branch.branchType,
      primaryLineId:branch.primaryLineId||null,
      priority:branch.priority,
      requiredFirstNumber:branch.requiredFirstNumber??null,
      score:Number(branch.score)||0,
      share:totalScore>0?(Number(branch.score)||0)/totalScore:0,
      relativeToTop:topScore>0?(Number(branch.score)||0)/topScore:0,
      initiativeScore:Number(branch.initiativeScore)||null,
      initiativeProbability:Number(branch.initiativeProbability)||null,
      initiativeRank:Number(branch.initiativeRank)||null,
      initiativePrimaryLine:Boolean(branch.initiativePrimaryLine),
      scoreTrace:(branch.scoreTrace||[]).map(item=>({key:item.key,value:Number(item.value)||0,weight:Number(item.weight)||0,contribution:Number(item.contribution)||0}))
    }))
  };
}
export function buildSameScenarioReversalAudit(structured){
  const rows=[];
  const byLine=new Map();
  for(const branch of structured||[]){
    if(!branch?.primaryLineId)continue;
    if(!byLine.has(branch.primaryLineId))byLine.set(branch.primaryLineId,[]);
    byLine.get(branch.primaryLineId).push(branch);
  }
  for(const [lineId,branches] of byLine){
    const lead=branches.find(b=>b.branchType==="LEADER_HOLD")||null;
    const bante=branches.find(b=>b.branchType==="BANTE_SASHI")||null;
    if(!lead||!bante)continue;
    const leadCore=lead.priority==="main";
    const banteCore=bante.priority==="main";
    if(!leadCore&&!banteCore)continue;
    const leadConnected=leadCore||lead.sameScenarioMainSibling===true;
    const banteConnected=banteCore||bante.sameScenarioMainSibling===true;
    rows.push({
      lineId,
      leaderBranchId:lead.id,banteBranchId:bante.id,
      leaderRequiredFirstNumber:lead.requiredFirstNumber??null,
      banteRequiredFirstNumber:bante.requiredFirstNumber??null,
      leaderConnectedToMainScenario:leadConnected,
      banteConnectedToMainScenario:banteConnected,
      passed:leadConnected&&banteConnected
    });
  }
  return{
    version:"SAME-SCENARIO-REVERSAL-1.0",
    policy:"LEADER_HOLD_AND_BANTE_SASHI_SAME_LINE_ARE_REVERSIBLE_MAIN_SCENARIO",
    checkedLineCount:rows.length,
    missCount:rows.filter(row=>!row.passed).length,
    rows,
    passed:rows.every(row=>row.passed)
  };
}
export function median(values){const valid=values.filter(Number.isFinite).sort((a,b)=>a-b);if(!valid.length)return 0;const mid=Math.floor(valid.length/2);return valid.length%2?valid[mid]:(valid[mid-1]+valid[mid])/2}

export function buildStartPowerInputAudit(scored,branches=[]){
  const rows=(Array.isArray(scored)?scored:[]).map(item=>{
    const e=item?.startPowerEvidence||null;
    const missing=Array.isArray(e?.missingInputs)?e.missingInputs.filter(Boolean):[];
    const hasEvidence=Boolean(e);
    const hasComputed=Number.isFinite(Number(item?.startPower));
    const usable=isUsableStartPower(item);
    let status="VERIFIED";
    if(!hasEvidence)status="EVIDENCE_UNAVAILABLE";
    else if(missing.length)status="MISSING_INPUTS";
    else if(Number(e?.officialTotalStarts)===0)status="ZERO_STARTS";
    else if(!hasComputed||!usable)status="VALUE_UNAVAILABLE";
    return{
      number:Number(item?.number),
      status,
      auditable:hasEvidence,
      verified:status==="VERIFIED"&&usable,
      usable,
      startPower:usable&&hasComputed?Number(item.startPower):null,
      confidence:e?.confidence||null,
      missingInputs:missing,
      profileIdentityPassed:e?.profileIdentityPassed===true,
      officialTotalStarts:numberOrNull(e?.officialTotalStarts),
      rawBackCount:numberOrNull(e?.rawBackCount),
      rawHomeCount:numberOrNull(e?.rawHomeCount),
      bFrequency:numberOrNull(e?.bFrequency),
      hFrequency:numberOrNull(e?.hFrequency),
      shrunkBFrequency:numberOrNull(e?.shrunkBFrequency),
      shrunkHFrequency:numberOrNull(e?.shrunkHFrequency),
      bPercentileScore:numberOrNull(e?.bPercentileScore),
      hPercentileScore:numberOrNull(e?.hPercentileScore),
      latentScore:numberOrNull(e?.latentScore),
      raceCategory:e?.raceCategory||null,
      priorStrength:numberOrNull(e?.priorStrength),
      startsQuality:numberOrNull(e?.startsQuality)
    };
  });
  const verifiedCount=rows.filter(row=>row.verified).length;
  const usableCount=rows.filter(row=>row.usable).length;
  const missingCount=rows.filter(row=>row.status==="MISSING_INPUTS").length;
  const zeroStartsCount=rows.filter(row=>row.status==="ZERO_STARTS").length;
  const unavailableCount=rows.filter(row=>["EVIDENCE_UNAVAILABLE","VALUE_UNAVAILABLE"].includes(row.status)).length;
  const withheldRiderNumbers=rows.filter(row=>!row.usable).map(row=>row.number);
  const generatedLeadRiderNumbers=(branches||[]).filter(branch=>branch.branchType==="LEADER_HOLD").map(branch=>Number(branch.requiredFirstNumber)).filter(Number.isFinite);
  const invalidLeadBranches=generatedLeadRiderNumbers.filter(number=>withheldRiderNumbers.includes(number));
  return{
    version:"START-POWER-MISSING-EVIDENCE-GATE-1.0",
    policy:"MISSING_OR_ZERO_START_EVIDENCE_MUST_NOT_FEED_SCORE_OR_LEADER_HOLD_BRANCH",
    totalRiders:rows.length,
    verifiedCount,
    usableCount,
    withheldCount:rows.length-usableCount,
    missingCount,
    zeroStartsCount,
    unavailableCount,
    withheldRiderNumbers,
    invalidLeadBranchCount:invalidLeadBranches.length,
    invalidLeadBranches,
    passed:rows.length>0&&invalidLeadBranches.length===0,
    rows
  };
}
export function isUsableStartPower(item){
  const e=item?.startPowerEvidence;
  if(!e)return Number.isFinite(Number(item?.startPower));
  if(e?.usable===false)return false;
  if(Array.isArray(e?.missingInputs)&&e.missingInputs.length)return false;
  if(Number(e?.officialTotalStarts)===0)return false;
  return Number.isFinite(Number(item?.startPower));
}
export function numberOrNull(value){
  if(value===null||value===undefined||value==="")return null;
  const n=Number(value);
  return Number.isFinite(n)?n:null;
}

export function buildTerminalLifecycleAudit({sourceTerminals,classified,terminalGenerationAudit}){
  const sourceKeys=new Set((sourceTerminals||[]).map(item=>item.order.join("-")));
  const classifiedKeys=new Set((classified||[]).map(item=>item.order.join("-")));
  const violations=[];
  for(const key of sourceKeys)if(!classifiedKeys.has(key))violations.push(`確率・購入評価前後で終端消失:${key}`);
  for(const item of classified||[]){
    if(!Number.isFinite(Number(item.probability)))violations.push(`確率未評価:${item.order.join("-")}`);
    if(item.purchaseStatus!=="購入採用"&&(!item.purchaseRejectCode||item.purchaseRejectCode==="UNCLASSIFIED"||!item.purchaseReason))violations.push(`購入不採用理由なし:${item.order.join("-")}`);
    if(item.lifecycle?.terminalDeleted)violations.push(`終端削除フラグ検出:${item.order.join("-")}`);
  }
  if(Number(terminalGenerationAudit?.unexplainedExclusionCount||0)>0)violations.push(`生成段階の理由なし除外:${terminalGenerationAudit.unexplainedExclusionCount}件`);
  const preserved=sourceKeys.size===classifiedKeys.size&&[...sourceKeys].every(key=>classifiedKeys.has(key));
  return{
    policy:"GENERATE_ALL_SUPPORTED_TERMINALS_THEN_SCORE_THEN_PURCHASE",
    terminalDeletionPolicy:"終端は低確率・低人気・点数圧縮を理由に削除禁止。競技上不成立・入力矛盾のみ生成段階で理由付き除外、重複は統合。",
    allowedGenerationExclusionReasonGroups:["RULE_IMPOSSIBLE","DATA_CONTRADICTION","DUPLICATE"],
    generatedTerminalCount:sourceKeys.size,
    probabilityEvaluatedTerminalCount:classified.length,
    purchaseDecisionTerminalCount:classified.length,
    preservedAcrossStages:preserved,
    unreasonedPurchaseRejectCount:(classified||[]).filter(item=>item.purchaseStatus!=="購入採用"&&(!item.purchaseRejectCode||item.purchaseRejectCode==="UNCLASSIFIED"||!item.purchaseReason)).length,
    unexplainedGenerationExclusionCount:Number(terminalGenerationAudit?.unexplainedExclusionCount||0),
    fixedRankDeletionApplied:false,
    fixedProbabilityDeletionApplied:false,
    passed:preserved&&violations.length===0,
    violations,
    rows:(classified||[]).map(item=>({order:item.order.join("-"),probability:Number(item.probability)||0,purchaseStatus:item.purchaseStatus,purchaseRejectCode:item.purchaseRejectCode||null,purchaseReason:item.purchaseReason||null,betClass:item.betClass||"NONE",dominantBranchId:item.dominantBranchId||null,dominantBranchLabel:item.dominantBranchLabel||null,terminalDeleted:false}))
  };
}
