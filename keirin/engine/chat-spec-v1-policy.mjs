const PURCHASED="購入採用";
const REJECTED="購入不採用";
const clamp=(v,min=0,max=1)=>Math.min(max,Math.max(min,Number(v)||0));
const finite=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v));
const sum=xs=>xs.reduce((s,x)=>s+(Number(x)||0),0);

const FORECAST_WEIGHT={main:1,contender:.74,sub:.40,risk:.18};
const ROLE_LABEL={main:"中心予測",contender:"有力な次候補",sub:"可能性として保持",risk:"例外・リスク"};

export function applyChatSpecV1({scored=[],lines=[],branches=[],terminals=[],oddsByOrder={}}){
  const riderByNumber=new Map(scored.map(r=>[Number(r.number),r]));
  const branchById=new Map(branches.map(b=>[String(b.id),b]));

  // 1) Keep every generated terminal. We re-evaluate probability and purchase,
  //    but never remove a logically possible terminal in this layer.
  const evaluated=terminals.map((terminal,index)=>{
    const order=(terminal.order||[]).map(Number);
    const [f,s,t]=order.map(n=>riderByNumber.get(n));
    const roleQuality=geometric([
      normalize10(f?.roleScores?.first),
      normalize10(s?.roleScores?.second),
      normalize10(t?.roleScores?.third)
    ]);
    const support=deriveBranchSupport(terminal,branchById);
    const original=Math.max(Number(terminal.probability)||0,1e-12);
    // Explicit Chat Spec v1 combination:
    // original branch-conditioned likelihood + independent placing suitability
    // + forecast-role support. No terminal is cut here.
    const raw=Math.pow(original,.38)*Math.pow(Math.max(roleQuality,1e-6),.34)*Math.pow(Math.max(support.weight,1e-6),.28);
    const odds=lookupOdds(order,oddsByOrder);
    return{
      ...terminal,
      _chatRaw:raw,
      _chatRoleQuality:roleQuality,
      chatForecastRole:support.role,
      chatForecastRoleLabel:ROLE_LABEL[support.role]||"不明",
      chatSupportingBranchIds:support.ids,
      chatSupportingBranchLabels:support.labels,
      chatSupportWeight:support.weight,
      branchHeadMatched:support.headMatched!==false,
      foreignBranchContributionCount:Number(support.foreignBranchCount)||0,
      odds,
      lifecycle:{
        ...(terminal.lifecycle||{}),
        generated:true,
        probabilityEvaluated:true,
        terminalDeleted:false
      }
    };
  });

  normalizeProbabilities(evaluated);
  addRanks(evaluated);
  const families=buildFamilies(evaluated,branches);
  const primaryFamily=selectPrimaryFamily(families,branches);
  const centerHeads=new Set(branches.filter(b=>normalizePriority(b.priority)==="main").map(b=>Number(b.requiredFirstNumber)).filter(Number.isFinite));
  if(!centerHeads.size && primaryFamily)centerHeads.add(primaryFamily.first);

  // "Contender" branches are not automatically purchase-worthy covers.
  // Each alternate head must independently pass an absolute support/evidence gate.
  // No head is promoted merely because it is "next-best".
  const contenderHeadAudit=selectContenderHeads(branches,centerHeads,families,primaryFamily,scored);
  const approvedContenderHeads=contenderHeadAudit.approved;

  // 2) Structural / position support AND scenario-coherent natural convergence
  // are evaluated separately from mere terminal existence.
  for(const item of evaluated){
    const family=families.get(Number(item.order?.[0]))||null;
    const natural=deriveNaturalSupport(item);
    const convergence=deriveNaturalConvergence(item,lines,branches);
    const ev=item.odds>1?item.probability*item.odds:null;
    Object.assign(item,{
      firstFamilyNumber:Number(item.order?.[0]),
      firstFamilyTier:family?.tier||"risk",
      firstFamilyProbability:family?.probability||0,
      firstFamilyProbabilityShare:family?.probability||0,
      firstFamilyPriorityMass:family?.priorityMass||{main:0,contender:0,sub:0,risk:0},
      isPrimaryFirstFamily:Boolean(primaryFamily&&family?.first===primaryFamily.first),
      primaryFirstFamilyNumber:primaryFamily?.first||null,
      familyNaturalPositionEligible:natural.ok,
      secondFamilyNaturalEligible:natural.second,
      thirdFamilyNaturalEligible:natural.third,
      secondFamilyRelativeToBest:natural.secondRatio,
      thirdFamilyRelativeToBest:natural.thirdRatio,
      decisionRatios:natural.ratios,
      naturalConvergenceScore:convergence.score,
      naturalConvergenceLevel:convergence.level,
      naturalConvergenceReasons:convergence.reasons,
      extraConditionCount:convergence.extraConditionCount,
      scenarioCoherence:convergence.scenarioCoherence,
      expectedValueIndex:ev,
      terminalProbabilityShare:item.probability
    });
  }

  // 3) Purchase candidates are chosen by natural convergence inside each first-place family.
  // IMPORTANT: probability coverage is an AUDIT RESULT, not a quota that forces weak terminals into the bet list.
  const selected=new Set();
  const familyMeta=new Map();
  const orderedFamilies=[...families.values()].sort((a,b)=>{
    const ar=familyPriorityRank(a.tier),br=familyPriorityRank(b.tier);
    return ar-br||b.probability-a.probability||a.first-b.first;
  });

  for(const family of orderedFamilies){
    if(!["main","contender"].includes(family.tier))continue;
    if(family.tier==="contender" && !approvedContenderHeads.has(family.first))continue;

    const allNatural=evaluated
      .filter(x=>x.firstFamilyNumber===family.first && x.familyNaturalPositionEligible)
      .filter(x=>x.branchHeadMatched===true)
      .filter(x=>x.chatForecastRole==="main" || x.chatForecastRole==="contender")
      // Existence != purchase. Main/cover candidates need at least medium scenario coherence.
      .filter(x=>x.naturalConvergenceScore>=.46)
      .sort(comparePurchaseTerminal);

    if(!allNatural.length)continue;

    // Step A: independently compare every 2nd-place candidate under this 1st-place family.
    const bySecond=new Map();
    for(const item of allNatural){
      const second=Number(item.order?.[1]);
      if(!bySecond.has(second))bySecond.set(second,[]);
      bySecond.get(second).push(item);
    }
    const secondGroups=[...bySecond.entries()].map(([second,rows])=>({
      second,
      rows:rows.sort(compareTerminal),
      mass:sum(rows.map(x=>x.probability)),
      peak:Math.max(...rows.map(x=>x.probability))
    })).sort((a,b)=>b.mass-a.mass||b.peak-a.peak||a.second-b.second);

    const chosenSeconds=selectNaturalGroupCluster(secondGroups,x=>x.mass);

    let selectedMass=0,candidateMass=sum(allNatural.map(x=>x.probability));
    for(const group of chosenSeconds){
      // Step B: for each selected 1-2 branch, independently compare all 3rd-place candidates.
      const thirds=selectNaturalGroupCluster(group.rows,x=>x.probability);
      for(const item of thirds){
        if(!selected.has(key(item.order))){
          selected.add(key(item.order));
          selectedMass+=item.probability;
        }
      }
    }

    // Preserve a center-forecast anchor when the main family has one.
    if(family.tier==="main"){
      const anchor=allNatural.find(x=>x.chatForecastRole==="main");
      if(anchor && !selected.has(key(anchor.order))){
        selected.add(key(anchor.order));
        selectedMass+=anchor.probability;
      }
    }

    const target=dynamicCoverageTarget(family,primaryFamily);

    // Undercoverage guard: coverage is NOT a purchase quota.
    // It only detects the v83-type failure where a major first family is represented
    // by an implausibly tiny slice. Recovery adds strongest near-peer terminals only,
    // then stops as soon as the family is no longer severely underrepresented.
    const undercoverageFloor=
      family.first===primaryFamily?.first ? .24 :
      family.tier==="main" ? .18 :
      .12;

    if(family.probability>0 && selectedMass/family.probability<undercoverageFloor){
      const bestProb=allNatural[0]?.probability||0;
      const recoveryPool=allNatural
        .filter(x=>!selected.has(key(x.order)))
        .filter(x=>bestProb<=0 || x.probability>=bestProb*.62)
        .sort(compareTerminal);

      for(const item of recoveryPool){
        selected.add(key(item.order));
        selectedMass+=item.probability;
        if(selectedMass/family.probability>=undercoverageFloor)break;
      }
    }

    familyMeta.set(family.first,{
      target,
      undercoverageFloor,
      candidateMass,
      selectedMass,
      selectedSecondCount:new Set([...selected].filter(k=>k.startsWith(`${family.first}-`)).map(k=>k.split("-")[1])).size,
      totalSecondCount:secondGroups.length,
      selectionMode:"NATURAL_CONVERGENCE_WITH_UNDERCOVERAGE_GUARD"
    });
  }

  // 4) Possible-only scenarios stay in the tree. They can become BUYABLE_HIGH
  //    only with explicit scenario support AND actual odds value.
  const possibleValue=evaluated
    .filter(x=>x.chatForecastRole==="sub" && x.familyNaturalPositionEligible && x.branchHeadMatched===true && x.odds>1)
    .filter(x=>x.naturalConvergenceScore>=.40)
    .filter(x=>Number(x.expectedValueIndex)>1.05)
    .filter(x=>x.probability >= (evaluated[0]?.probability||0)*.10)
    .sort((a,b)=>(b.expectedValueIndex-a.expectedValueIndex)||(b.probability-a.probability));

  // Keep value additions deliberately sparse by natural EV separation; if there
  // is no clear separation, keep all as possibilities and do not force a bet.
  const valueSelected=selectNaturallySeparatedValue(possibleValue);
  for(const item of valueSelected)selected.add(key(item.order));

  // 5) Final classification and reason codes. Every non-purchase gets a reason.
  for(const item of evaluated){
    const k=key(item.order);
    let chosen=selected.has(k);
    const inCenter=centerHeads.has(item.firstFamilyNumber);
    let betClass="NONE",code=null,reason=null,mode=null;

    if(chosen && item.branchHeadMatched!==true){
      chosen=false;
      code="BRANCH_HEAD_MISMATCH";
      reason=`${orderText(item)}は終端として保持。ただし1着${item.firstFamilyNumber}番と展開枝の1着条件が一致しないため購入根拠には使用しない。`;
    }

    if(chosen){
      if(item.chatForecastRole==="main" && inCenter && item.naturalConvergenceScore>=.62){
        betClass="MAIN";
        mode="CHAT_SPEC_CENTER";
        reason=humanPurchaseReason(item,"MAIN");
      }else if(
        (item.chatForecastRole==="main" && item.naturalConvergenceScore>=.46) ||
        (item.chatForecastRole==="contender" && approvedContenderHeads.has(item.firstFamilyNumber) && item.naturalConvergenceScore>=.46)
      ){
        betClass="COVER";
        mode="CHAT_SPEC_SECONDARY";
        reason=humanPurchaseReason(item,"COVER");
      }else if(item.chatForecastRole==="sub" && item.naturalConvergenceScore>=.40){
        betClass="BUYABLE_HIGH";
        mode="CHAT_SPEC_VALUE";
        reason=humanPurchaseReason(item,"BUYABLE_HIGH");
      }else{
        chosen=false;
        code="PURCHASE_CLASS_NOT_SATISFIED";
        reason=`${orderText(item)}は候補選択までは通過したが、本線・押さえ・高配当の分類条件を満たさないため購入しない。`;
      }
    }
    if(!chosen){
      if(code){
        // explicit rejection already set above
      }else if(item.chatForecastRole==="contender" && !approvedContenderHeads.has(item.firstFamilyNumber)){
        code="CONTENDER_HEAD_NOT_SELECTED";
        reason=`${orderText(item)}は有力候補枝として生成・保持。ただし${item.firstFamilyNumber}番頭は「押さえの中心頭」に選ばれていないため購入しない。`;
      }else{
        ({code,reason}=rejectReason(item,familyMeta));
      }
    }

    Object.assign(item,{
      betClass,
      purchaseStatus:chosen?PURCHASED:REJECTED,
      purchaseRejectCode:chosen?null:code,
      purchaseReason:reason,
      adoptionMode:mode,
      representativeTerminal:chosen&&item.terminalGlobalRank<=3,
      dominantBranchId:item.chatSupportingBranchIds?.[0]||item.branchId||null,
      dominantBranchLabel:item.chatSupportingBranchLabels?.[0]||item.branchLabel||null,
      dominantBranchPriority:item.chatForecastRole,
      branchFit:item.chatSupportWeight,
      branchSupport:item.chatSupportingBranchIds?.length||0,
      weightedBranchSupport:item.chatSupportWeight,
      lifecycle:{
        ...(item.lifecycle||{}),
        purchaseDecision:chosen?"ADOPTED":"REJECTED",
        purchaseDecisionCode:chosen?mode:code,
        purchaseDecisionReason:reason
      }
    });
  }

  const naturalPrecedenceAudit=[];
  for(const adopted of evaluated.filter(x=>x.purchaseStatus===PURCHASED)){
    const sameFirst=evaluated
      .filter(x=>x.firstFamilyNumber===adopted.firstFamilyNumber)
      .filter(x=>x.branchHeadMatched===true)
      .filter(x=>x.familyNaturalPositionEligible)
      .filter(x=>x.purchaseStatus!==PURCHASED)
      .filter(x=>Number(x.naturalConvergenceScore)>=.46)
      .sort(comparePurchaseTerminal);

    for(const natural of sameFirst){
      const sameScenario=
        natural.chatForecastRole===adopted.chatForecastRole ||
        (natural.chatSupportingBranchIds||[]).some(id=>(adopted.chatSupportingBranchIds||[]).includes(id));
      if(!sameScenario)continue;
      const gap=Number(natural.naturalConvergenceScore)-Number(adopted.naturalConvergenceScore);
      if(!(gap>=.12 || (Number(natural.naturalConvergenceScore)>=.62 && Number(adopted.naturalConvergenceScore)<.62)))continue;

      const promoteClass=
        natural.chatForecastRole==="main" && centerHeads.has(natural.firstFamilyNumber) && Number(natural.naturalConvergenceScore)>=.62
          ?"MAIN":"COVER";
      Object.assign(natural,{
        betClass:promoteClass,
        purchaseStatus:PURCHASED,
        purchaseRejectCode:null,
        purchaseReason:`自然枝優先補正: 同じ${natural.firstFamilyNumber}番頭・同一シナリオ内で、採用済み${orderText(adopted)}より${orderText(natural)}の自然収束度が明確に高いため${promoteClass==="MAIN"?"本線":"押さえ"}へ昇格。`,
        adoptionMode:"NATURAL_PRECEDENCE_PROMOTION",
        lifecycle:{...(natural.lifecycle||{}),generated:true,probabilityEvaluated:true,terminalDeleted:false,purchaseDecision:"ADOPTED",purchaseDecisionCode:"NATURAL_PRECEDENCE_PROMOTION",purchaseDecisionReason:"より不自然な購入終端より先に自然終端を優先"}
      });
      naturalPrecedenceAudit.push({promoted:natural.order.join("-"),promotedClass:promoteClass,comparedWith:adopted.order.join("-"),promotedConvergence:Number(natural.naturalConvergenceScore)||0,adoptedConvergence:Number(adopted.naturalConvergenceScore)||0});
      break;
    }
  }

  const mainPurchased=evaluated.filter(x=>x.purchaseStatus===PURCHASED&&x.betClass==="MAIN");
  const mainCandidates=evaluated.filter(x=>
    centerHeads.has(Number(x.order?.[0])) &&
    x.branchHeadMatched===true &&
    x.chatForecastRole==="main" &&
    x.familyNaturalPositionEligible &&
    Number(x.naturalConvergenceScore)>=.62
  );
  const mainInvariant={
    centerScenarioCount:branches.filter(b=>normalizePriority(b.priority)==="main").length,
    mainCandidateCount:mainCandidates.length,
    mainPurchasedCount:mainPurchased.length,
    passed:mainCandidates.length>0 && mainPurchased.length>0,
    error:mainCandidates.length===0
      ?"MAIN_NATURAL_TERMINAL_NOT_FOUND"
      : mainPurchased.length===0
        ?"MAIN_PURCHASE_CLASSIFICATION_FAILED"
        : null
  };

  // Compatibility fields used by existing diagnostics/UI.
  for(const item of evaluated){
    const fm=familyMeta.get(item.firstFamilyNumber);
    item.firstFamilyCoverageTarget=fm?.target??null;
    item.firstFamilyCandidateCoverage=item.firstFamilyProbability>0&&fm?fm.candidateMass/item.firstFamilyProbability:null;
    item.firstFamilySelectedCoverage=item.firstFamilyProbability>0&&fm?fm.selectedMass/item.firstFamilyProbability:null;
    item.selectedByFamilyCoverage=selected.has(key(item.order)) && item.betClass!=="BUYABLE_HIGH";
    item.mainHeadSiblingEligible=item.familyNaturalPositionEligible&&item.firstFamilyTier==="main";
    item.mainHeadSiblingBranchId=item.dominantBranchId;
    item.mainHeadSiblingBranchLabel=item.dominantBranchLabel;
    item.mainHeadSiblingSecondEligible=item.secondFamilyNaturalEligible;
    item.mainHeadSiblingThirdEligible=item.thirdFamilyNaturalEligible;
    item.mainHeadSiblingFirstRelativeToBest=item.decisionRatios?.first??0;
    item.mainHeadSiblingSecondRelativeToBest=item.secondFamilyRelativeToBest??0;
    item.mainHeadSiblingThirdRelativeToBest=item.thirdFamilyRelativeToBest??0;
    item.highPayoutCandidate=item.chatForecastRole==="sub";
    item.highPayoutAttribute=item.betClass==="BUYABLE_HIGH";
    item.highPayoutAttributeLabel=item.betClass==="BUYABLE_HIGH"?"可能性枝＋オッズ妙味":"";
    item.oddsEvaluationStatus=item.odds>1?"EVALUATED":"ODDS_PENDING";
    item.subScenarioProbability=item.chatForecastRole==="sub"?item.probability:null;
    item.subValueIndex=item.chatForecastRole==="sub"?item.expectedValueIndex:null;
    item.subValueNaturalEligible=item.chatForecastRole==="sub"&&item.familyNaturalPositionEligible;
  }

  return{
    terminals:evaluated,
    families:[...families.values()].sort((a,b)=>b.probability-a.probability),
    centerHeads:[...centerHeads],
    scenarioSummary:buildScenarioSummary(branches),
    audit:{
      ...buildChatSpecAudit(evaluated,branches,families,primaryFamily),
      contenderHeadAudit:{
        candidates:contenderHeadAudit.candidates,
        approved:[...approvedContenderHeads]
      },
      mainInvariant,
      naturalPrecedenceAudit
    }
  };
}

function deriveBranchSupport(terminal,branchById){
  const order=(terminal.order||[]).map(Number);
  const first=Number(order[0]);
  const all=[...(terminal.branchContributions||[])];
  const cs=all.filter(c=>contributionMatches(c,order));
  if(!cs.length){
    const direct=branchById.get(String(terminal.branchId||""))||null;
    const directHead=Number(direct?.requiredFirstNumber);
    const directMatches=direct?.requiredFirstNumber==null || (Number.isFinite(directHead)&&directHead===first);
    if(direct && directMatches){
      const p=normalizePriority(direct.priority??terminal.branchPriority);
      return{role:p,weight:FORECAST_WEIGHT[p]||.18,ids:[direct.id].filter(Boolean),labels:[direct.label].filter(Boolean),headMatched:true,foreignBranchCount:all.length};
    }
    return{role:"risk",weight:FORECAST_WEIGHT.risk,ids:[],labels:[],headMatched:false,foreignBranchCount:all.length};
  }
  cs.sort((a,b)=>{
    const ap=FORECAST_WEIGHT[normalizePriority(a.branchPriority)]||.18;
    const bp=FORECAST_WEIGHT[normalizePriority(b.branchPriority)]||.18;
    return bp-ap||(Number(b.probability)||0)-(Number(a.probability)||0);
  });
  const top=cs[0],role=normalizePriority(top.branchPriority);
  const weights=cs.map(c=>(FORECAST_WEIGHT[normalizePriority(c.branchPriority)]||.18)*Math.max(.1,ratioGeom(c.decisionRatios)));
  const weight=Math.min(1,Math.max(...weights,FORECAST_WEIGHT[role]||.18));
  return{role,weight,ids:cs.map(c=>c.branchId).filter(Boolean),labels:cs.map(c=>c.branchLabel).filter(Boolean),headMatched:true,foreignBranchCount:all.length-cs.length};
}

function deriveNaturalSupport(item){
  const cs=[...(item.branchContributions||[])].filter(c=>contributionMatches(c,item.order));
  const best=cs.sort((a,b)=>ratioGeom(b.decisionRatios)-ratioGeom(a.decisionRatios))[0]||{};
  const r=best.decisionRatios||{};
  const first=finite(r.first)?Number(r.first):1;
  const second=finite(r.second)?Number(r.second):1;
  const third=finite(r.third)?Number(r.third):1;
  // These are provisional structural support floors, not terminal deletion floors.
  // Failure only affects purchase eligibility; the terminal remains stored.
  const secondOk=second>=.70;
  const thirdOk=third>=.70;
  return{ok:first>=.78&&secondOk&&thirdOk,second:secondOk,third:thirdOk,secondRatio:second,thirdRatio:third,ratios:{first,second,third}};
}

function selectContenderHeads(branches,centerHeads,families,primaryFamily,scored){
  const byHead=new Map();
  const riderByNumber=new Map((scored||[]).map(r=>[Number(r.number),r]));
  const primaryProbability=Number(primaryFamily?.probability)||0;
  const primaryFirstScore=Number(riderByNumber.get(Number(primaryFamily?.first))?.roleScores?.first)||0;

  for(const b of branches){
    if(normalizePriority(b.priority)!=="contender")continue;
    const head=Number(b.requiredFirstNumber);
    if(!Number.isFinite(head) || centerHeads.has(head))continue;

    const score=Number(b.score)||0;
    const trace=Array.isArray(b.scoreTrace)?b.scoreTrace:[];
    const positives=trace.filter(x=>(Number(x.contribution)||0)>0);
    const negatives=trace.filter(x=>(Number(x.contribution)||0)<0);

    const cur=byHead.get(head)||{
      head,branchCount:0,totalScore:0,maxScore:0,
      positiveContribution:0,negativeContribution:0,
      evidenceKeys:new Set(),labels:[],traceCount:0
    };

    cur.branchCount++;
    cur.totalScore+=Math.max(0,score);
    cur.maxScore=Math.max(cur.maxScore,score);
    cur.traceCount+=trace.length;
    cur.positiveContribution+=sum(positives.map(x=>Math.max(0,Number(x.contribution)||0)));
    cur.negativeContribution+=sum(negatives.map(x=>Math.abs(Number(x.contribution)||0)));
    for(const x of positives)if(x?.key)cur.evidenceKeys.add(String(x.key));
    if(b.label)cur.labels.push(String(b.label));
    byHead.set(head,cur);
  }

  const candidates=[...byHead.values()].map(x=>{
    const avgScore=x.totalScore/Math.max(1,x.branchCount);
    const evidenceCount=x.evidenceKeys.size;
    const netEvidence=x.positiveContribution-x.negativeContribution;
    const familyProbability=Number(families?.get(x.head)?.probability)||0;
    const familyRelative=primaryProbability>0?familyProbability/primaryProbability:0;
    const firstScore=Number(riderByNumber.get(x.head)?.roleScores?.first)||0;
    const firstRelative=primaryFirstScore>0?firstScore/primaryFirstScore:0;

    // Branch evidence alone was too permissive in v86.
    // A cover HEAD must independently have:
    // 1) a credible alternate-win scenario,
    // 2) actual 1st-place family mass, and
    // 3) enough 1st-place suitability to make that scenario purchase-worthy.
    const scenarioPass=x.maxScore>=6.2 || avgScore>=5.4;

    const explicitEvidence=evidenceCount>=2 || x.positiveContribution>=1.5;
    const legacyStrongEvidence=x.traceCount===0 && x.maxScore>=6.8;
    const evidencePass=explicitEvidence || legacyStrongEvidence;

    const contradictionPass=x.negativeContribution<=Math.max(1.2,x.positiveContribution*.75);

    // Absolute + relative family support. This is an eligibility gate, not a "top N" rank rule.
    const familyPass=
      familyProbability>=.055 ||
      familyRelative>=.42;

    // Independent head ability: allow a slightly weaker head if family/scenario evidence is strong,
    // but do not promote a low head score just because a contender branch exists.
    const firstAbilityPass=
      firstScore>=6.0 ||
      firstRelative>=.72 ||
      (familyRelative>=.60 && x.maxScore>=7.0);

    const repeatSupport=x.branchCount>=2 && avgScore>=5.0;
    const eligible=
      scenarioPass &&
      evidencePass &&
      contradictionPass &&
      familyPass &&
      firstAbilityPass &&
      (repeatSupport || x.maxScore>=6.5 || x.positiveContribution>=1.8);

    return{
      head:x.head,branchCount:x.branchCount,avgScore,maxScore:x.maxScore,
      evidenceCount,positiveContribution:x.positiveContribution,
      negativeContribution:x.negativeContribution,netEvidence,
      traceCount:x.traceCount,labels:x.labels,
      familyProbability,familyRelative,firstScore,firstRelative,
      eligible,
      reasons:{
        scenarioPass,evidencePass,explicitEvidence,legacyStrongEvidence,
        contradictionPass,familyPass,firstAbilityPass,repeatSupport
      }
    };
  }).sort((a,b)=>
    Number(b.eligible)-Number(a.eligible) ||
    b.familyProbability-a.familyProbability ||
    b.maxScore-a.maxScore ||
    b.firstScore-a.firstScore ||
    a.head-b.head
  );

  const approved=new Set(candidates.filter(x=>x.eligible).map(x=>x.head));
  return{candidates,approved};
}

function deriveNaturalConvergence(item,lines,branches){
  const order=(item.order||[]).map(Number);
  const [first,second,third]=order;
  const contributions=[...(item.branchContributions||[])].filter(c=>contributionMatches(c,order));
  const best=contributions.sort((a,b)=>(Number(b.probability)||0)-(Number(a.probability)||0))[0]||{};
  const ratios=best.decisionRatios||{};
  const firstR=finite(ratios.first)?Number(ratios.first):1;
  const secondR=finite(ratios.second)?Number(ratios.second):1;
  const thirdR=finite(ratios.third)?Number(ratios.third):1;

  const lineInfo=findLineContext(lines,first);
  let scenarioCoherence=.50;
  let extra=0;
  const reasons=[];

  if(lineInfo){
    const {members,index}=lineInfo;
    const follower=members[index+1]??null;
    const next=members[index+2]??null;

    if(Number(follower)===second){
      scenarioCoherence+=.28;
      reasons.push(`${first}の直後を${second}が追走`);
    }else if(Number(next)===second){
      scenarioCoherence+=.16;
      extra+=1;
      reasons.push(`${second}がライン3番手から2着`);
    }else if(follower!=null){
      scenarioCoherence-=.16;
      extra+=1;
      reasons.push(`${follower}の追走失敗が必要`);
    }

    if(Number(follower)===third || Number(next)===third){
      scenarioCoherence+=.10;
      reasons.push(`${third}が同ライン残り`);
    }else if(third!==second){
      scenarioCoherence-=.05;
      extra+=1;
      reasons.push(`${third}の別線残り条件`);
    }
  }else{
    reasons.push("ライン追走関係の直接確認なし");
  }

  // Decision ratios preserve branch-specific 2nd/3rd suitability.
  const ratioScore=Math.pow(
    Math.max(.01,firstR)*
    Math.max(.01,secondR)*
    Math.max(.01,thirdR),1/3
  );

  // Additional conditions are explicit penalties, not deletion rules.
  const penalty=Math.max(.58,1-extra*.12);
  const score=clamp((scenarioCoherence*.55 + ratioScore*.45)*penalty,0,1);
  const level=score>=.70?"高":score>=.52?"中":"低";
  return{score,level,reasons,extraConditionCount:extra,scenarioCoherence:clamp(scenarioCoherence,0,1)};
}

function findLineContext(lines,number){
  const normalized=Array.isArray(lines)?lines:[];
  for(const line of normalized){
    const raw=Array.isArray(line)?line:(Array.isArray(line?.members)?line.members:[]);
    const members=raw.map(m=>Number(m?.number??m)).filter(Number.isFinite);
    const index=members.indexOf(Number(number));
    if(index>=0)return{members,index};
  }
  return null;
}

function comparePurchaseTerminal(a,b){
  return (Number(b.naturalConvergenceScore)-Number(a.naturalConvergenceScore)) ||
    (b.probability-a.probability) ||
    key(a.order).localeCompare(key(b.order),"en");
}

function buildFamilies(items,branches){
  const map=new Map();
  for(const x of items){
    const first=Number(x.order?.[0]);
    if(!map.has(first))map.set(first,{first,probability:0,priorityMass:{main:0,contender:0,sub:0,risk:0},tier:"risk"});
    const f=map.get(first); f.probability+=x.probability;
    f.priorityMass[x.chatForecastRole]=(f.priorityMass[x.chatForecastRole]||0)+x.probability;
  }
  for(const f of map.values()){
    if(f.priorityMass.main>0)f.tier="main";
    else if(f.priorityMass.contender>0)f.tier="contender";
    else if(f.priorityMass.sub>0)f.tier="sub";
  }
  return map;
}

function selectPrimaryFamily(families,branches){
  const centerHeads=new Set(branches.filter(b=>normalizePriority(b.priority)==="main").map(b=>Number(b.requiredFirstNumber)).filter(Number.isFinite));
  const center=[...families.values()].filter(f=>centerHeads.has(f.first)).sort((a,b)=>b.probability-a.probability);
  if(center.length)return center[0];
  return [...families.values()].sort((a,b)=>b.probability-a.probability)[0]||null;
}

function dynamicCoverageTarget(family,primary){
  const rel=primary?.probability>0?family.probability/primary.probability:0;
  if(primary&&family.first===primary.first)return clamp(.62+.18*family.probability,.62,.80);
  return clamp(.30+.18*rel,.30,.48);
}

function selectNaturalGroupCluster(rows,valueFn){
  const sorted=[...rows].sort((a,b)=>(Number(valueFn(b))||0)-(Number(valueFn(a))||0));
  if(!sorted.length)return[];
  if(sorted.length===1)return sorted;

  const vals=sorted.map(x=>Math.max(0,Number(valueFn(x))||0));
  const top=vals[0]||1;
  const gaps=[];
  for(let i=0;i<vals.length-1;i++){
    const abs=vals[i]-vals[i+1];
    const rel=vals[i]>0?abs/vals[i]:0;
    const topRel=abs/top;
    gaps.push({i,abs,rel,topRel});
  }

  // A boundary is "natural" only when the drop is materially larger than the
  // surrounding drops. This avoids a fixed top-N cap.
  const avg=gaps.length?sum(gaps.map(g=>g.topRel))/gaps.length:0;
  const candidates=gaps
    .filter(g=>g.rel>=.28 && g.topRel>=Math.max(.07,avg*1.35))
    .sort((a,b)=>b.topRel-a.topRel||b.rel-a.rel||a.i-b.i);

  if(candidates.length){
    return sorted.slice(0,candidates[0].i+1);
  }

  // No clear separation: do not manufacture breadth. Keep the strongest natural
  // candidate only and leave the rest as generated-but-unpurchased possibilities.
  return sorted.slice(0,1);
}

function selectNaturallySeparatedValue(rows){
  if(!rows.length)return[];
  if(rows.length===1)return rows;
  const scores=rows.map(r=>Number(r.expectedValueIndex)||0);
  const gaps=scores.slice(0,-1).map((v,i)=>v-scores[i+1]);
  const max=Math.max(...gaps,0),idx=gaps.indexOf(max);
  const avg=gaps.length?sum(gaps)/gaps.length:0;
  if(max>avg*1.6 && max>.20)return rows.slice(0,idx+1);
  return[]; // no natural boundary => do not force a value bet
}

function rejectReason(item,familyMeta){
  if(!item.familyNaturalPositionEligible)return{code:"POSITION_SUPPORT_WEAK",reason:`${orderText(item)}は終端として保持。ただし2着・3着の位置支持が購入水準まで届かないため不採用。`};
  if(Number(item.naturalConvergenceScore)<.40)return{code:"NATURAL_CONVERGENCE_TOO_LOW",reason:`${orderText(item)}は成立可能な終端として保持。ただし1着成立シナリオを固定した時、2着・3着へ自然に繋がる度合いが低いため購入しない。`};
  if(item.chatForecastRole==="risk")return{code:"RISK_SCENARIO_ONLY",reason:`${orderText(item)}は例外・リスク枝として保持するが、中心予測の購入対象にはしない。`};
  if(item.chatForecastRole==="sub"){
    if(!(item.odds>1))return{code:"ODDS_PENDING_FOR_VALUE",reason:`${orderText(item)}は可能性枝として保持。高配当候補に上げるには実オッズ確認が必要。`};
    if(!(Number(item.expectedValueIndex)>1.05))return{code:"VALUE_NOT_ENOUGH",reason:`${orderText(item)}は可能性枝として保持。確率×実オッズの妙味が購入水準に届かない。`};
    return{code:"NO_NATURAL_VALUE_SEPARATION",reason:`${orderText(item)}は妙味候補だが、他の穴候補との差が明確でないため無理に購入しない。`};
  }
  const meta=familyMeta.get(item.firstFamilyNumber);
  if(meta)return{code:"FAMILY_COVERAGE_ALREADY_MET",reason:`${orderText(item)}は成立可能な終端として保持。同じ1着候補の購入確率カバーが既に十分なため追加購入しない。`};
  return{code:"NOT_SELECTED_WITH_REASON",reason:`${orderText(item)}は終端として保持するが、中心予測・有力候補の購入優先度には入らなかった。`};
}

function humanPurchaseReason(item,cls){
  const [a,b,c]=item.order;
  const scenario=item.chatSupportingBranchLabels?.[0]||item.branchLabel||"展開枝";
  const oddsPart=item.odds>1?` 実オッズ${Number(item.odds).toFixed(1)}倍。`:"";
  const conv=`自然収束度${Math.round((Number(item.naturalConvergenceScore)||0)*100)}%`;
  const why=(item.naturalConvergenceReasons||[]).slice(0,2).join(" / ");
  if(cls==="MAIN")return `主展開「${scenario}」を固定した時に${a}→${b}→${c}が自然に繋がる終端（${conv}${why?`・${why}`:""}）。本線として採用。${oddsPart}`.trim();
  if(cls==="COVER")return `有力な別シナリオ「${scenario}」内で${a}→${b}→${c}が自然に繋がる終端（${conv}${why?`・${why}`:""}）。押さえとして採用。${oddsPart}`.trim();
  return `可能性枝「${scenario}」を終端まで保持し、${conv}と実オッズ妙味の両方を確認できたため買える高配当として採用。${oddsPart}`.trim();
}

function buildScenarioSummary(branches){
  const sorted=[...branches].sort((a,b)=>familyPriorityRank(normalizePriority(a.priority))-familyPriorityRank(normalizePriority(b.priority))||(Number(b.score)||0)-(Number(a.score)||0));
  return sorted.map(b=>({
    id:b.id,label:b.label,role:normalizePriority(b.priority),roleLabel:ROLE_LABEL[normalizePriority(b.priority)]||"不明",
    requiredFirstNumber:b.requiredFirstNumber??null,score:Number(b.score)||0,
    reasons:(b.scoreTrace||[]).slice(0,4).map(x=>({key:x.key,value:Number(x.value)||0,weight:Number(x.weight)||0,contribution:Number(x.contribution)||0}))
  }));
}

function countNaturalSkippedAhead(items){
  let count=0;
  for(const adopted of items.filter(x=>x.purchaseStatus===PURCHASED)){
    if(items.some(x=>x.firstFamilyNumber===adopted.firstFamilyNumber&&x.purchaseStatus!==PURCHASED&&x.branchHeadMatched===true&&x.familyNaturalPositionEligible&&Number(x.naturalConvergenceScore)>=.62&&Number(x.naturalConvergenceScore)>=Number(adopted.naturalConvergenceScore)+.12))count++;
  }
  return count;
}

function buildChatSpecAudit(items,branches,families,primary){
  const unexplainedRejects=items.filter(x=>x.purchaseStatus===REJECTED&&(!x.purchaseRejectCode||!x.purchaseReason));
  const deleted=items.filter(x=>x?.lifecycle?.terminalDeleted===true);
  const center=branches.filter(b=>normalizePriority(b.priority)==="main");
  return{
    version:"KEIRIN-CHAT-SPEC-v1-CODED",
    policy:"FIX_1ST_SCENARIO_THEN_2ND_THEN_3RD_THEN_NATURAL_CONVERGENCE_THEN_PURCHASE",
    generatedTerminalCount:items.length,
    terminalDeletionCount:deleted.length,
    unexplainedPurchaseRejectCount:unexplainedRejects.length,
    centerScenarioCount:center.length,
    primaryFirstFamily:primary?.first||null,
    primaryFirstFamilyProbability:primary?.probability||0,
    familyCount:families.size,
    branchHeadMismatchCount:items.filter(x=>x.branchHeadMatched===false).length,
    naturalTerminalSkippedAheadCount:countNaturalSkippedAhead(items),
    naturalConvergence:{
      high:items.filter(x=>x.naturalConvergenceLevel==="高").length,
      medium:items.filter(x=>x.naturalConvergenceLevel==="中").length,
      low:items.filter(x=>x.naturalConvergenceLevel==="低").length,
      purchasedLow:items.filter(x=>x.purchaseStatus===PURCHASED && x.naturalConvergenceLevel==="低").length
    },
    passed:deleted.length===0&&unexplainedRejects.length===0&&items.filter(x=>x.purchaseStatus===PURCHASED && x.naturalConvergenceLevel==="低").length===0,
    invariants:[
      {key:"NO_TERMINAL_DELETION",passed:deleted.length===0},
      {key:"NO_UNEXPLAINED_PURCHASE_REJECT",passed:unexplainedRejects.length===0},
      {key:"PURCHASE_SEPARATE_FROM_GENERATION",passed:true},
      {key:"POSSIBILITY_SEPARATE_FROM_CENTER_FORECAST",passed:true},
      {key:"NO_LOW_NATURAL_CONVERGENCE_PURCHASE",passed:items.filter(x=>x.purchaseStatus===PURCHASED && x.naturalConvergenceLevel==="低").length===0},
      {key:"NO_BRANCH_HEAD_MISMATCH_PURCHASE",passed:items.filter(x=>x.purchaseStatus===PURCHASED && x.branchHeadMatched===false).length===0},
      {key:"NATURAL_TERMINAL_PRECEDENCE",passed:countNaturalSkippedAhead(items)===0}
    ]
  };
}

function normalizeProbabilities(items){
  const total=sum(items.map(x=>x._chatRaw))||1;
  for(const x of items)x.probability=x._chatRaw/total;
  items.sort(compareTerminal);
}
function addRanks(items){
  const familyCount=new Map(),pairCount=new Map();
  items.forEach((x,i)=>{
    x.terminalGlobalRank=i+1;
    const f=Number(x.order?.[0]),p=`${x.order?.[0]}-${x.order?.[1]}`;
    familyCount.set(f,(familyCount.get(f)||0)+1); x.terminalFamilyRank=familyCount.get(f);
    pairCount.set(p,(pairCount.get(p)||0)+1); x.terminalPairRank=pairCount.get(p);
  });
}
function contributionMatches(c,order){return c?.requiredFirstNumber==null||Number(c.requiredFirstNumber)===Number(order?.[0])}
function normalizePriority(p){p=String(p||"").toLowerCase();if(p==="main")return"main";if(p==="contender"||p==="alternative"||p==="cover")return"contender";if(p==="sub"||p==="possible")return"sub";return"risk"}
function familyPriorityRank(p){return({main:0,contender:1,sub:2,risk:3})[p]??9}
function ratioGeom(r={}){return geometric([finite(r.first)?Number(r.first):1,finite(r.second)?Number(r.second):1,finite(r.third)?Number(r.third):1])}
function normalize10(v){return finite(v)?clamp(Number(v)/10,.01,1):.5}
function geometric(vals){const v=vals.filter(x=>finite(x)&&Number(x)>0).map(Number);return v.length?Math.exp(sum(v.map(x=>Math.log(x)))/v.length):.5}
function lookupOdds(order,odds){const k=key(order);const v=odds?.[k]??odds?.[order.join("-")]??null;return finite(v)?Number(v):null}
function key(order){return(order||[]).join("-")}
function orderText(item){return `${key(item.order)}`}
function compareTerminal(a,b){return (b.probability-a.probability)||key(a.order).localeCompare(key(b.order),"en")}
