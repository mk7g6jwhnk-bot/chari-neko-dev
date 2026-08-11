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
  const mainBranches=branches.filter(b=>normalizePriority(b.priority)==="main"||b.sameScenarioMainSibling===true);
  const mainBranchIds=new Set(mainBranches.map(b=>String(b.id)));

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
      directMainBranchSupport:(support.ids||[]).some(id=>mainBranchIds.has(String(id))),
      lineIndependentMainSupport:(support.ids||[]).some(id=>mainBranchIds.has(String(id))&&branchById.get(String(id))?.lineIndependentFallback===true),
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
  const centerHeads=new Set(mainBranches.map(b=>Number(b.requiredFirstNumber)).filter(Number.isFinite));
  if(!centerHeads.size && primaryFamily)centerHeads.add(primaryFamily.first);

  // MAIN is a natural terminal cluster from every main branch.
  // Multiple main scenarios and natural head reversals are allowed simultaneously.

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
    const pairConvergence=derivePairNaturalConvergence(item,lines,branches);
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
      firstFamilyNaturalEligible:natural.first,
      pairNaturalPositionEligible:natural.pair,
      secondFamilyNaturalEligible:natural.second,
      thirdFamilyNaturalEligible:natural.third,
      secondFamilyRelativeToBest:natural.secondRatio,
      thirdFamilyRelativeToBest:natural.thirdRatio,
      decisionRatios:natural.ratios,
      naturalConvergenceScore:convergence.score,
      naturalConvergenceLevel:convergence.level,
      naturalConvergenceReasons:convergence.reasons,
      pairNaturalConvergenceScore:pairConvergence.score,
      pairNaturalConvergenceLevel:pairConvergence.level,
      pairNaturalConvergenceReasons:pairConvergence.reasons,
      pairScenarioCoherence:pairConvergence.scenarioCoherence,
      pairNodeProbabilityScore:pairConvergence.nodeProbabilityScore,
      extraConditionCount:convergence.extraConditionCount,
      extraConditionDetails:convergence.extraConditionDetails||[],
      nodeExtraConditionCount:convergence.nodeExtraConditionCount??0,
      structuralExtraConditionCount:convergence.structuralExtraConditionCount??0,
      extraConditionProbabilityMin:convergence.extraConditionProbabilityMin??null,
      extraConditionProbabilityMean:convergence.extraConditionProbabilityMean??null,
      extraConditionPenalty:convergence.extraConditionPenalty??null,
      relativeConditionCount:item.relativeConditionCount??0,
      relativeConditionPenalty:item.relativeConditionPenalty??1,
      relativeConditionTrace:item.relativeConditionTrace||[],
      probabilitySeparationPolicy:item.probabilitySeparationPolicy||null,
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
      .filter(x=>x.firstFamilyNumber===family.first && x.pairNaturalPositionEligible)
      .filter(x=>x.branchHeadMatched===true)
      .filter(x=>x.chatForecastRole==="main" || x.chatForecastRole==="contender")
      // IMPORTANT: THIRD専用工程より前の入口では3着を含むterminal convergenceを使わない。
      // 1-2枝だけの自然収束で購入評価へ進めるかを決める。
      .filter(x=>x.pairNaturalConvergenceScore>=.46)
      .sort(comparePairPurchaseTerminal);

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
      rows:rows.sort(comparePairPurchaseTerminal),
      mass:sum(rows.map(x=>x.probability)),
      peak:Math.max(...rows.map(x=>x.probability)),
      classifiableCount:rows.filter(x=>canSatisfyCenterPurchaseClass(x,approvedContenderHeads)).length
    })).sort((a,b)=>b.mass-a.mass||b.peak-a.peak||a.second-b.second);

    const secondBridge=evaluateSecondPurchaseBridge(secondGroups);
    const chosenSeconds=secondBridge.selected;
    const selectedSecondSet=secondBridge.selectedSeconds;
    const topSecondMass=Math.max(0,Number(secondBridge.rows?.[0]?.mass)||0);
    for(const group of secondBridge.rows||[]){
      const selectedByBridge=selectedSecondSet.has(Number(group.second));
      const massRatio=topSecondMass>0?(Number(group.mass)||0)/topSecondMass:0;
      for(const item of group.rows||[]){
        item.secondPurchaseBridgeSelected=selectedByBridge;
        item.secondPurchaseBridgeSelectionMode=secondBridge.selectionMode;
        item.secondPurchaseBridgeGroupMass=Number(group.mass)||0;
        item.secondPurchaseBridgeTopMass=topSecondMass;
        item.secondPurchaseBridgeMassRatio=massRatio;
      }
    }

    let selectedMass=0,candidateMass=sum(allNatural.map(x=>x.probability));
    const secondPurchaseBridgeRow={
      first:family.first,
      candidateCount:secondBridge.rows.length,
      selectedCount:secondBridge.selected.length,
      selectionMode:secondBridge.selectionMode,
      rows:secondBridge.rows.map(group=>({
        second:group.second,mass:group.mass,peak:group.peak,
        selected:secondBridge.selectedSeconds.has(group.second),
        decisionCode:secondBridge.selectedSeconds.has(group.second)?"SECOND_PURCHASE_BRIDGE_SELECTED":"SECOND_PURCHASE_BRIDGE_NOT_SELECTED"
      }))
    };
    const thirdPurchaseBridgeRows=[];
    for(const group of chosenSeconds){
      const isAdditionalSecondNearPeer=secondBridge.selectionMode==="SECOND_NEAR_TIE_BREADTH" && Number(group.second)!==Number(chosenSeconds[0]?.second);
      const bridge=evaluateThirdPurchaseBridge(group.rows,{allowNearTieBreadth:!isAdditionalSecondNearPeer,selectionEligible:isAdditionalSecondNearPeer?(item=>canSatisfyCenterPurchaseClass(item,approvedContenderHeads)):null});

      // v153: combination-completeness recovery. A SECOND can legitimately survive
      // the independent 1-2 bridge while every THIRD chosen by the local cluster
      // later fails the normal MAIN/COVER classification gate. That leaves the
      // 1st and 2nd candidates alive individually but deletes the usable 1-2-3
      // combination. If this happens, keep exactly one strongest terminal that
      // already satisfies the normal classification rules. No weak terminal is
      // promoted and no cross-product of independent candidates is invented.
      const bridgeSelectedKeys=new Set(bridge.selectedKeys);
      let combinationRecoveryKey=null;
      const selectedClassifiable=bridge.rows.some(item=>
        bridgeSelectedKeys.has(key(item.order)) && canSatisfyCenterPurchaseClass(item,approvedContenderHeads)
      );
      if(!selectedClassifiable){
        const recovery=bridge.rows
          .filter(item=>canSatisfyCenterPurchaseClass(item,approvedContenderHeads))
          .sort(comparePurchaseTerminal)[0]||null;
        if(recovery){
          combinationRecoveryKey=key(recovery.order);
          bridgeSelectedKeys.add(combinationRecoveryKey);
        }
      }
      const effectiveSelected=bridge.rows.filter(item=>bridgeSelectedKeys.has(key(item.order)));
      const effectiveSelectionMode=combinationRecoveryKey?`${bridge.selectionMode}+COMBINATION_CLASSIFIABLE_RECOVERY`:bridge.selectionMode;
      thirdPurchaseBridgeRows.push({
        first:family.first,second:group.second,
        candidateCount:bridge.rows.length,selectedCount:effectiveSelected.length,selectionMode:effectiveSelectionMode,
        combinationRecoveryKey,
        rows:bridge.rows.map(item=>({
          order:item.order,third:Number(item.order?.[2]),probability:Number(item.probability)||0,
          thirdRatio:Number(item.thirdFamilyRelativeToBest)||0,
          naturalConvergenceScore:Number(item.naturalConvergenceScore)||0,
          selected:bridgeSelectedKeys.has(key(item.order)),
          decisionCode:bridgeSelectedKeys.has(key(item.order))?(key(item.order)===combinationRecoveryKey?"COMBINATION_CLASSIFIABLE_RECOVERY":"THIRD_PURCHASE_BRIDGE_SELECTED"):"THIRD_PURCHASE_BRIDGE_NOT_SELECTED"
        }))
      });
      for(const item of bridge.rows){
        const picked=bridgeSelectedKeys.has(key(item.order));
        item.thirdPurchaseBridgeStatus=picked?"SELECTED_FOR_CLASSIFICATION":"EVALUATED_NOT_SELECTED";
        item.thirdPurchaseBridgeCode=picked?(key(item.order)===combinationRecoveryKey?"COMBINATION_CLASSIFIABLE_RECOVERY":"THIRD_PURCHASE_BRIDGE_SELECTED"):"THIRD_PURCHASE_BRIDGE_NOT_SELECTED";
      }
      for(const item of effectiveSelected){
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

    // v149: an independently approved contender head must not disappear merely
    // because pair/third clustering found no selected row for that family.
    // Keep exactly one strongest classifiable natural terminal as a COVER anchor.
    // This is a safety recovery, not a quota: unapproved heads, sub/risk scenarios,
    // or terminals that cannot satisfy the normal COVER class are never promoted.
    let contenderCoverAnchorKey=null;
    if(family.tier==="contender" && approvedContenderHeads.has(family.first)){
      const alreadyClassifiable=allNatural.some(x=>
        selected.has(key(x.order)) && canSatisfyCenterPurchaseClass(x,approvedContenderHeads)
      );
      if(!alreadyClassifiable){
        const anchor=allNatural
          .filter(x=>canSatisfyCenterPurchaseClass(x,approvedContenderHeads))
          .sort(comparePurchaseTerminal)[0]||null;
        if(anchor){
          contenderCoverAnchorKey=key(anchor.order);
          selected.add(contenderCoverAnchorKey);
          selectedMass+=anchor.probability;
        }
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

    // Coverage must count only terminals that can actually survive the later
    // MAIN/COVER classification gate. Previously, pair-selected rows with weak
    // full 1-2-3 convergence were counted as coverage here, then rejected below.
    // That made the recovery guard stop early while real purchased coverage
    // remained extremely small.
    let classifiableSelectedMass=sum(allNatural
      .filter(x=>selected.has(key(x.order)))
      .filter(x=>canSatisfyCenterPurchaseClass(x,approvedContenderHeads))
      .map(x=>x.probability));

    if(family.probability>0 && classifiableSelectedMass/family.probability<undercoverageFloor){
      const classifiablePool=allNatural
        .filter(x=>!selected.has(key(x.order)))
        .filter(x=>canSatisfyCenterPurchaseClass(x,approvedContenderHeads))
        .sort(comparePurchaseTerminal);

      // Do not impose a fixed top-N/probability-ratio cap here. Add the strongest
      // genuinely classifiable natural terminals until severe undercoverage is
      // resolved, then stop.
      for(const item of classifiablePool){
        selected.add(key(item.order));
        selectedMass+=item.probability;
        classifiableSelectedMass+=item.probability;
        if(classifiableSelectedMass/family.probability>=undercoverageFloor)break;
      }
    }

    // Audit coverage uses the mass that is capable of reaching a purchase class,
    // not merely the mass that entered the provisional selected set.
    selectedMass=classifiableSelectedMass;

    familyMeta.set(family.first,{
      target,
      undercoverageFloor,
      candidateMass,
      selectedMass,
      selectedSecondCount:new Set([...selected].filter(k=>k.startsWith(`${family.first}-`)).map(k=>k.split("-")[1])).size,
      totalSecondCount:secondGroups.length,
      secondPurchaseBridgeRow,
      thirdPurchaseBridgeRows,
      contenderCoverAnchorKey,
      selectionMode:"PAIR_SELECTION_THEN_DEDICATED_THIRD_PURCHASE_BRIDGE"
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
      if(
        item.directMainBranchSupport===true &&
        item.branchHeadMatched===true &&
        item.naturalConvergenceScore>=mainNaturalThreshold(item)
      ){
        betClass="MAIN";
        mode="CHAT_SPEC_MAIN_CLUSTER";
        reason=humanPurchaseReason(item,"MAIN");
      }else if(
        item.chatForecastRole==="main" && item.naturalConvergenceScore>=.46
      ){
        // v230: purchase class follows scenario origin. A natural terminal from the
        // main forecast cannot become COVER merely because directMainBranchSupport
        // or the old MAIN convergence threshold is missed. If it is purchase-worthy
        // and belongs to the main scenario, it is MAIN by definition.
        betClass="MAIN";
        mode="MAIN_SCENARIO_NATURAL_TERMINAL";
        reason=humanPurchaseReason(item,"MAIN");
      }else if(
        item.chatForecastRole==="contender" && approvedContenderHeads.has(item.firstFamilyNumber) && item.naturalConvergenceScore>=.46
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
      .filter(x=>x.pairNaturalPositionEligible)
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
        natural.directMainBranchSupport===true && Number(natural.naturalConvergenceScore)>=.58
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

  // v156: strong SECOND-pair breadth recovery.
  // A near-tied SECOND candidate must not disappear merely because another
  // 1-2 pair reached the family coverage target first.  For every supported
  // first-family, keep one representative terminal for each strongly supported
  // 1-2 pair.  This is pair coverage, not a fixed ticket quota: at most one
  // terminal is recovered for a missing pair and the THIRD is chosen from the
  // same pair only.
  const secondPairBreadthRecoveries=[];
  const strongSecondPairRows=evaluated.filter(item=>{
    if(item.firstFamilyTier!=="main"&&item.firstFamilyTier!=="contender")return false;
    if(item.branchHeadMatched!==true||item.pairNaturalPositionEligible!==true)return false;
    // v209: SECOND-pair breadth expansion is local to the primary first-family.
    // Other independently supported heads are preserved by the first-family /
    // cover breadth guards, but we do not cross-multiply every near-tied SECOND
    // under every head. This preserves natural head reversals without the 20+
    // ticket explosion seen when several heads each inherited all near SECONDs.
    if(Number(item.firstFamilyNumber)!==Number(primaryFamily?.first))return false;
    if((Number(item.secondFamilyRelativeToBest)||0)<.94)return false;
    if(item.chatForecastRole!=="main"&&item.chatForecastRole!=="contender")return false;
    if(item.chatForecastRole==="contender"&&!approvedContenderHeads.has(item.firstFamilyNumber))return false;
    return true;
  });
  const pairGroups=new Map();
  for(const item of strongSecondPairRows){
    const pairKey=`${Number(item.order?.[0])||0}-${Number(item.order?.[1])||0}`;
    if(!pairGroups.has(pairKey))pairGroups.set(pairKey,[]);
    pairGroups.get(pairKey).push(item);
  }
  for(const [pairKey,rows] of pairGroups){
    if(rows.some(item=>item.purchaseStatus===PURCHASED))continue;
    const representative=rows
      .filter(item=>(Number(item.naturalConvergenceScore)||0)>=.30)
      .sort(comparePurchaseTerminal)[0];
    if(!representative)continue;
    const representativeScore=Number(representative.naturalConvergenceScore)||0;
    const recoveryClass=(representative.directMainBranchSupport===true&&representativeScore>=mainNaturalThreshold(representative))?"MAIN":"COVER";
    const recoveryClassReason=recoveryClass==="MAIN"
      ?"主展開の直接支持＋MAIN自然基準を満たすため本線を維持"
      :"主展開内の枝違い／承認済み有力枝として押さえに分類";
    const reason=`2着近接枝補正: ${pairKey}枝は2着独立評価が最上位比${Math.round((Number(representative.secondFamilyRelativeToBest)||0)*100)}%で、枝全体が消えないよう同一1-2枝の最自然終端${orderText(representative)}を${recoveryClass==="MAIN"?"本線":"押さえ"}へ追加（${recoveryClassReason}）`;
    Object.assign(representative,{
      betClass:recoveryClass,
      purchaseStatus:PURCHASED,
      purchaseRejectCode:null,
      purchaseReason:reason,
      classificationReason:recoveryClassReason,
      adoptionMode:"SECOND_PAIR_BREADTH_RECOVERY",
      secondPairBreadthRecovery:true,
      lifecycle:{...(representative.lifecycle||{}),generated:true,probabilityEvaluated:true,terminalDeleted:false,purchaseDecision:"ADOPTED",purchaseDecisionCode:"SECOND_PAIR_BREADTH_RECOVERY",purchaseDecisionReason:reason}
    });
    selected.add(key(representative.order));
    secondPairBreadthRecoveries.push({pair:pairKey,order:representative.order.join("-"),secondRelative:Number(representative.secondFamilyRelativeToBest)||0,convergence:Number(representative.naturalConvergenceScore)||0,betClass:recoveryClass,classificationReason:recoveryClassReason});
  }
  const secondPairBreadthAudit={
    policy:"PRIMARY_FIRST_FAMILY_SECOND_PAIR_BREADTH_ONLY",
    primaryFirstFamilyNumber:primaryFamily?.first||null,
    nonPrimaryHeadsUseFirstFamilyBreadthGuards:true,
    secondRelativeFloor:.94,
    convergenceFloor:.30,
    strongPairCount:pairGroups.size,
    recoveryCount:secondPairBreadthRecoveries.length,
    recoveries:secondPairBreadthRecoveries,
    fixedTicketQuotaApplied:false
  };

  // v156: probability-mass undercoverage recovery.
  // Only terminals that already satisfy normal MAIN/COVER classification can be
  // recovered. SUB/value branches remain governed by the explicit odds gate.
  const massCoverageCandidates=evaluated.filter(item=>{
    if(item.branchHeadMatched!==true)return false;
    if(item.familyNaturalPositionEligible!==true)return false;
    if(item.naturalConvergenceLevel==="低")return false;
    // Mass recovery may widen THIRD variants only inside a 1-2 pair that already
    // survived the independent SECOND bridge. It must not resurrect an unselected
    // 2nd-place branch merely to hit a global quota. Purchased anchors are counted
    // in coverage even when they were added outside the third bridge.
    const thirdBridgeEvaluated=["SELECTED_FOR_CLASSIFICATION","EVALUATED_NOT_SELECTED"].includes(item.thirdPurchaseBridgeStatus);
    if(!thirdBridgeEvaluated&&item.purchaseStatus!==PURCHASED)return false;
    const score=Number(item.naturalConvergenceScore)||0;
    const mainEligible=item.directMainBranchSupport===true&&score>=mainNaturalThreshold(item);
    const coverEligible=(item.chatForecastRole==="main"&&score>=.52)||(item.chatForecastRole==="contender"&&approvedContenderHeads.has(item.firstFamilyNumber)&&score>=.52);
    return mainEligible||coverEligible;
  });
  const massCoverageCandidateKeys=new Set(massCoverageCandidates.map(item=>key(item.order)));
  for(const item of evaluated)item.massCoverageEligible=massCoverageCandidateKeys.has(key(item.order));
  const massEligibleTotal=sum(massCoverageCandidates.map(item=>Number(item.probability)||0));
  const candidateMassByFirst=new Map();
  for(const item of massCoverageCandidates){
    const first=Number(item.firstFamilyNumber)||Number(item.order?.[0])||0;
    candidateMassByFirst.set(first,(candidateMassByFirst.get(first)||0)+(Number(item.probability)||0));
  }
  const targetWeight=sum([...candidateMassByFirst.values()]);
  const massWeightedTarget=targetWeight>0?sum([...candidateMassByFirst].map(([first,mass])=>{
    const target=Number(familyMeta.get(Number(first))?.target);
    return (mass/targetWeight)*(Number.isFinite(target)?clamp(target):.70);
  })):.70;
  const initiallyPurchasedMass=sum(massCoverageCandidates.filter(item=>item.purchaseStatus===PURCHASED).map(item=>Number(item.probability)||0));
  const initialMassCoverage=massEligibleTotal>0?initiallyPurchasedMass/massEligibleTotal:0;
  // v156 final policy: global probability-mass shortage is diagnostic only.
  // Automatic recovery is performed by the strong 1-2 pair breadth guard above,
  // so we do not fill a global mass quota across unrelated pairs/scenarios.
  let recoveredMass=0;
  const recoveredOrders=[];
  const finalPurchasedMass=sum(massCoverageCandidates.filter(item=>item.purchaseStatus===PURCHASED).map(item=>Number(item.probability)||0));
  const massCoverageRecoveryAudit={
    policy:"GLOBAL_MASS_WARN_ONLY_PAIR_LOCAL_RECOVERY",
    eligibleTerminalCount:massCoverageCandidates.length,
    eligibleProbabilityMass:massEligibleTotal,
    weightedCoverageTarget:massWeightedTarget,
    initialCoverage:initialMassCoverage,
    underCoverageDetected:massEligibleTotal>0&&initialMassCoverage+1e-12<massWeightedTarget-.10,
    recoveryDelegatedTo:"SECOND_PAIR_BREADTH_RECOVERY",
    recoveryApplied:recoveredOrders.length>0,
    recoveredCount:recoveredOrders.length,
    recoveredOrders,
    recoveredProbabilityMass:recoveredMass,
    finalCoverage:massEligibleTotal>0?finalPurchasedMass/massEligibleTotal:0,
    overSpreadAction:"WARN_ONLY_NO_AUTO_DELETE"
  };

  // v230 semantic invariant: standard purchase classes cannot exist without MAIN.
  // MAIN/COVER/BUYABLE_HIGH describes scenario origin, not a descending score bucket.
  // Any adopted natural terminal from the main forecast is normalized to MAIN.
  for(const item of evaluated){
    if(
      item.purchaseStatus===PURCHASED &&
      item.chatForecastRole==="main" &&
      item.branchHeadMatched===true &&
      item.pairNaturalPositionEligible===true &&
      Number(item.naturalConvergenceScore)>=.46 &&
      item.betClass!=="MAIN"
    ){
      item.betClass="MAIN";
      item.adoptionMode="MAIN_SCENARIO_CLASS_NORMALIZATION";
      item.purchaseRejectCode=null;
      item.purchaseReason=humanPurchaseReason(item,"MAIN");
      item.lifecycle={...(item.lifecycle||{}),purchaseDecision:"ADOPTED",purchaseDecisionCode:"MAIN_SCENARIO_CLASS_NORMALIZATION",purchaseDecisionReason:"主展開由来の自然終端は本線として分類"};
    }
  }

  let adoptedStandard=evaluated.filter(x=>x.purchaseStatus===PURCHASED&&["MAIN","COVER","BUYABLE_HIGH"].includes(x.betClass));
  let normalizedMain=adoptedStandard.filter(x=>x.betClass==="MAIN");
  let mainSemanticRecovery=null;
  if(adoptedStandard.length>0 && normalizedMain.length===0){
    const anchor=evaluated
      .filter(x=>x.chatForecastRole==="main"&&x.branchHeadMatched===true&&x.pairNaturalPositionEligible===true)
      .filter(x=>Number(x.pairNaturalConvergenceScore)>=.46&&Number(x.naturalConvergenceScore)>=.46)
      .sort(comparePurchaseTerminal)[0]||null;
    if(anchor){
      anchor.betClass="MAIN";
      anchor.purchaseStatus=PURCHASED;
      anchor.purchaseRejectCode=null;
      anchor.purchaseReason=humanPurchaseReason(anchor,"MAIN");
      anchor.adoptionMode="MAIN_SCENARIO_ANCHOR_RECOVERY";
      anchor.lifecycle={...(anchor.lifecycle||{}),generated:true,probabilityEvaluated:true,terminalDeleted:false,purchaseDecision:"ADOPTED",purchaseDecisionCode:"MAIN_SCENARIO_ANCHOR_RECOVERY",purchaseDecisionReason:"標準購入候補があるため主展開の自然終端を本線アンカーとして採用"};
      mainSemanticRecovery=anchor.order.join("-");
    }else{
      // A COVER/BUYABLE_HIGH-only standard plan is semantically invalid.
      for(const item of adoptedStandard){
        item.betClass="NONE";
        item.purchaseStatus=REJECTED;
        item.purchaseRejectCode="MAIN_REQUIRED_FOR_STANDARD_PURCHASE";
        item.purchaseReason=`${orderText(item)}は終端として保持。ただし主展開から本線を成立させられない状態で押さえ・高配当だけを購入することは禁止。`;
        item.adoptionMode=null;
        item.lifecycle={...(item.lifecycle||{}),purchaseDecision:"REJECTED",purchaseDecisionCode:"MAIN_REQUIRED_FOR_STANDARD_PURCHASE",purchaseDecisionReason:item.purchaseReason};
      }
    }
  }

  adoptedStandard=evaluated.filter(x=>x.purchaseStatus===PURCHASED&&["MAIN","COVER","BUYABLE_HIGH"].includes(x.betClass));
  normalizedMain=adoptedStandard.filter(x=>x.betClass==="MAIN");
  const mainPurchased=normalizedMain;
  const mainCandidates=evaluated.filter(x=>
    x.branchHeadMatched===true &&
    x.directMainBranchSupport===true &&
    x.pairNaturalPositionEligible &&
    Number(x.naturalConvergenceScore)>=mainNaturalThreshold(x)
  );
  const mainInvariant={
    centerScenarioCount:mainBranches.length,
    mainClusterCount:new Set(mainCandidates.flatMap(x=>x.chatSupportingBranchIds||[]).filter(id=>mainBranchIds.has(String(id)))).size,
    mainCandidateCount:mainCandidates.length,
    mainPurchasedCount:mainPurchased.length,
    standardPurchasedCount:adoptedStandard.length,
    mainSemanticRecovery,
    semanticPolicy:"STANDARD_PURCHASE_REQUIRES_MAIN_AND_MAIN_SCENARIO_PURCHASE_IS_MAIN",
    passed:adoptedStandard.length===0 || mainPurchased.length>0,
    error:adoptedStandard.length>0&&mainPurchased.length===0
      ?"STANDARD_PURCHASE_WITHOUT_MAIN_FORBIDDEN"
      : null
  };

  // Compatibility fields used by existing diagnostics/UI.
  for(const item of evaluated){
    const fm=familyMeta.get(item.firstFamilyNumber);
    item.firstFamilyCoverageTarget=fm?.target??null;
    item.firstFamilyCandidateCoverage=item.firstFamilyProbability>0&&fm?fm.candidateMass/item.firstFamilyProbability:null;
    item.firstFamilySelectedCoverage=item.firstFamilyProbability>0&&fm?fm.selectedMass/item.firstFamilyProbability:null;
    item.selectedByFamilyCoverage=selected.has(key(item.order)) && item.betClass!=="BUYABLE_HIGH";
    item.mainHeadSiblingEligible=item.pairNaturalPositionEligible&&item.firstFamilyTier==="main";
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
      coverBreadthAudit:buildCoverBreadthAudit(evaluated,approvedContenderHeads,familyMeta),
      firstPurchaseBreadthAudit:buildFirstPurchaseBreadthAudit(evaluated,centerHeads,approvedContenderHeads),
      mainInvariant,
      secondPurchaseBridgeAudit:buildSecondPurchaseBridgeAudit(familyMeta),
      thirdPurchaseBridgeAudit:buildThirdPurchaseBridgeAudit(evaluated,familyMeta),
      combinationCompletenessAudit:buildCombinationCompletenessAudit(evaluated,familyMeta),
      secondPairBreadthAudit,
      scenarioClassificationAudit:buildScenarioClassificationAudit(evaluated,approvedContenderHeads),
      extraConditionAudit:buildExtraConditionAudit(evaluated),
      relativeConditionAudit:buildRelativeConditionAudit(evaluated),
      massCoverageRecoveryAudit,
      naturalPrecedenceAudit
    }
  };
}

function buildRelativeConditionAudit(items){
  const rows=(items||[]).map(item=>({
    order:item.order,probability:Number(item.probability)||0,
    relativeConditionCount:Number(item.relativeConditionCount)||0,
    relativeConditionPenalty:Number(item.relativeConditionPenalty)||1,
    trace:item.relativeConditionTrace||[]
  }));
  const lowerWithZero=rows.filter(row=>row.trace.some(t=>Number(t?.ratio)<1-1e-10&&Number(t?.count)===0));
  const nonMonotone=rows.filter(row=>row.trace.some(t=>Number(t?.count)>0&&!(Number(t?.factor)<1)));
  return{
    version:"RELATIVE-CONDITION-AUDIT-1.0",
    policy:"BASE_PROBABILITY_PRIMARY_MICRO_DIFFERENCE_PRESERVED_ALTERNATIVE_GETS_LIGHT_INCREMENTAL_BURDEN",
    checkedCount:rows.length,
    lowerAlternativeWithoutConditionCount:lowerWithZero.length,
    invalidPenaltyCount:nonMonotone.length,
    passed:lowerWithZero.length===0&&nonMonotone.length===0,
    rows
  };
}

function buildExtraConditionAudit(items){
  const purchased=(items||[]).filter(x=>x.purchaseStatus===PURCHASED);
  const withExtra=purchased.filter(x=>Number(x.extraConditionCount)>0);
  const countValues=[...new Set(withExtra.map(x=>Number(x.extraConditionCount)||0))].sort((a,b)=>a-b);
  const probabilities=withExtra.flatMap(x=>(x.extraConditionDetails||[]).map(d=>d?.probability).filter(finite).map(Number));
  const probabilityMin=probabilities.length?Math.min(...probabilities):null;
  const probabilityMax=probabilities.length?Math.max(...probabilities):null;
  const probabilityRange=probabilities.length?probabilityMax-probabilityMin:null;
  const conditionTypeCounts={};
  const stageCounts={};
  for(const item of withExtra){
    for(const d of item.extraConditionDetails||[]){
      const type=d?.mechanism?.key||d?.id||d?.source||"UNKNOWN";conditionTypeCounts[type]=(conditionTypeCounts[type]||0)+1;
      const stage=d?.stage||"STRUCTURAL";stageCounts[stage]=(stageCounts[stage]||0)+1;
    }
  }
  const countFlatteningVisible=withExtra.length>=3&&countValues.length===1&&countValues[0]===1;
  const hiddenBurdenVariation=countFlatteningVisible&&Number.isFinite(probabilityRange)&&probabilityRange>=.02;
  const uncalibratedStructuralRows=withExtra.filter(x=>(x.extraConditionDetails||[]).some(d=>d?.source==="LINE_COHERENCE_HEURISTIC"&&!finite(d?.probability)));
  const uncalibratedStructuralCount=uncalibratedStructuralRows.length;
  const fixedPenaltyRows=withExtra.filter(x=>Number(x.extraConditionCount)===1&&Number(x.extraConditionPenalty)===.88);
  const fixedPenaltyShare=withExtra.length?fixedPenaltyRows.length/withExtra.length:0;
  const status=uncalibratedStructuralCount?"UNCALIBRATED_STRUCTURAL_FLAT_PENALTY":hiddenBurdenVariation?"DISPLAY_FLATTENING_DETECTED":"OK";
  return{
    version:"EXTRA-CONDITION-AUDIT-v1",policy:"COUNT_IS_DISPLAY_ONLY; CONDITION_PROBABILITY_AND_MECHANISM_ARE_PRIMARY_EVIDENCE",
    purchasedCount:purchased.length,purchasedWithExtraCount:withExtra.length,countValues,
    allPurchasedExtrasDisplayedAsOne:countFlatteningVisible,hiddenBurdenVariation,
    uncalibratedStructuralCount,fixedPenaltyCount:fixedPenaltyRows.length,fixedPenaltyShare,
    probabilityMin,probabilityMax,probabilityRange,conditionTypeCounts,stageCounts,
    status,
    passed:true,
    rows:withExtra.map(x=>({order:x.order,betClass:x.betClass,extraConditionCount:x.extraConditionCount,
      extraConditionPenalty:x.extraConditionPenalty??null,extraConditionProbabilityMin:x.extraConditionProbabilityMin??null,
      extraConditionProbabilityMean:x.extraConditionProbabilityMean??null,details:x.extraConditionDetails||[]}))
  };
}

function buildScenarioClassificationAudit(items,approvedContenderHeads){
  const rows=[];
  const mismatches=[];
  for(const item of (items||[]).filter(x=>x.purchaseStatus===PURCHASED)){
    const score=Number(item.naturalConvergenceScore)||0;
    let expectedClass=null,basis=null;
    if(item.chatForecastRole==="sub"){
      expectedClass="BUYABLE_HIGH";
      basis="SEPARATE_SUB_SCENARIO_VALUE_GATE";
    }else if(item.chatForecastRole==="main"&&item.branchHeadMatched===true&&score>=.46){
      expectedClass="MAIN";
      basis=item.directMainBranchSupport===true?"DIRECT_MAIN_SCENARIO_NATURAL_TERMINAL":"MAIN_SCENARIO_NATURAL_TERMINAL";
    }else if(item.adoptionMode==="SECOND_PAIR_BREADTH_RECOVERY"){
      expectedClass="COVER";
      basis="APPROVED_CONTENDER_PAIR_VARIATION_RECOVERY";
    }else if(item.chatForecastRole==="contender"&&approvedContenderHeads.has(Number(item.firstFamilyNumber))&&score>=.46){
      expectedClass="COVER";
      basis="APPROVED_CONTENDER_SCENARIO";
    }
    const row={order:key(item.order),actualClass:item.betClass,expectedClass,basis,adoptionMode:item.adoptionMode||null,forecastRole:item.chatForecastRole||null,naturalConvergenceScore:score};
    rows.push(row);
    if(expectedClass&&item.betClass!==expectedClass)mismatches.push(row);
  }
  return{
    policy:"SCENARIO_ORIGIN_AND_NATURALITY_DETERMINE_CLASS_NOT_TICKET_COUNT",
    purchasedCount:rows.length,
    mismatchCount:mismatches.length,
    mismatches,
    pointCountBasedClassificationCount:0,
    passed:mismatches.length===0
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
  const effectivePriority=contribution=>{
    const branch=branchById.get(String(contribution?.branchId||""));
    return branch?.sameScenarioMainSibling===true?"main":normalizePriority(contribution?.branchPriority);
  };
  cs.sort((a,b)=>{
    const ap=FORECAST_WEIGHT[effectivePriority(a)]||.18;
    const bp=FORECAST_WEIGHT[effectivePriority(b)]||.18;
    return bp-ap||(Number(b.probability)||0)-(Number(a.probability)||0);
  });
  const top=cs[0],role=effectivePriority(top);
  const weights=cs.map(c=>(FORECAST_WEIGHT[effectivePriority(c)]||.18)*Math.max(.1,ratioGeom(c.decisionRatios)));
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
  const firstOk=first>=.78;
  return{ok:firstOk&&secondOk&&thirdOk,first:firstOk,pair:firstOk&&secondOk,second:secondOk,third:thirdOk,firstRatio:first,secondRatio:second,thirdRatio:third,ratios:{first,second,third}};
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

function derivePairNaturalConvergence(item,lines,branches){
  const order=(item.order||[]).map(Number);
  const [first,second]=order;
  const contributions=[...(item.branchContributions||[])].filter(c=>contributionMatches(c,order));
  const best=contributions.sort((a,b)=>(Number(b.probability)||0)-(Number(a.probability)||0))[0]||{};
  const ratios=best.decisionRatios||{};
  const firstR=finite(ratios.first)?Number(ratios.first):1;
  const secondR=finite(ratios.second)?Number(ratios.second):1;

  const branchById=new Map((Array.isArray(branches)?branches:[]).map(branch=>[String(branch.id),branch]));
  const supportingBranch=branchById.get(String(best.branchId||item.branchId||""))||null;
  const lineIndependentFallback=supportingBranch?.lineIndependentFallback===true;

  const lineInfo=findLineContext(lines,first);
  let scenarioCoherence=.50;
  let extra=0;
  const reasons=[];

  if(lineInfo){
    const {members,index}=lineInfo;
    const follower=members[index+1]??null;
    const next=members[index+2]??null;
    const predecessor=members[index-1]??null;
    const prior2=members[index-2]??null;
    const sameLineMember=members.includes(Number(second));

    if(Number(follower)===second){
      scenarioCoherence+=.28;
      reasons.push(`${first}の直後を${second}が追走`);
    }else if(Number(predecessor)===second){
      scenarioCoherence+=.26;
      reasons.push(`${first}の差し後も${second}が同ラインで2着残り`);
    }else if(Number(next)===second){
      scenarioCoherence+=.16;
      reasons.push(`${second}がライン3番手から2着`);
    }else if(Number(prior2)===second){
      scenarioCoherence+=.12;
      reasons.push(`${second}が同ライン前方から2着残り`);
    }else if(sameLineMember){
      scenarioCoherence+=.08;
      reasons.push(`${second}が同ライン深位置から2着へ残る`);
    }else if(follower!=null || predecessor!=null){
      scenarioCoherence-=.16;
      extra+=1;
      reasons.push("同ラインの追走失敗または並び崩れが必要");
    }
  }else if(lineIndependentFallback){
    scenarioCoherence=.62;
    reasons.push("並び未取得のため1-2着ライン整合は中立評価");
  }else{
    reasons.push("1-2着ライン追走関係の直接確認なし");
  }

  const ratioScore=Math.sqrt(Math.max(.01,firstR)*Math.max(.01,secondR));
  const trace=Array.isArray(best.nodeTrace)?best.nodeTrace:(Array.isArray(item.nodeTrace)?item.nodeTrace:[]);
  const pairTrace=trace.filter(node=>node?.stage==="FIRST"||node?.stage==="SECOND");
  const completePair=["FIRST","SECOND"].every(stage=>pairTrace.some(node=>node?.stage===stage));

  if(!completePair){
    const penalty=Math.max(.64,1-extra*.12);
    const score=clamp((scenarioCoherence*.55+ratioScore*.45)*penalty,0,1);
    const level=score>=.70?"高":score>=.52?"中":"低";
    return{score,level,reasons,scenarioCoherence:clamp(scenarioCoherence,0,1),nodeProbabilityScore:null};
  }

  const nodeByStage=new Map(pairTrace.map(node=>[node.stage,node]));
  const pairConditions=pairTrace.flatMap(node=>(node?.newRequiredConditions||[]).map(condition=>({...condition,stage:node.stage})));
  const rawNodeProbs=["FIRST","SECOND"].map(stage=>Number(nodeByStage.get(stage)?.conditionalProbability));
  const conditionOnlyNodeProbs=["FIRST","SECOND"].map(stage=>{
    const conditions=nodeByStage.get(stage)?.newRequiredConditions||[];
    if(!conditions.length)return 1;
    return conditions.reduce((product,condition)=>product*Math.max(.0001,Number(condition.probability)||.0001),1);
  });
  const nodeProbs=lineIndependentFallback?conditionOnlyNodeProbs:rawNodeProbs;
  const nodeProbabilityScore=Math.sqrt(Math.max(.0001,nodeProbs[0])*Math.max(.0001,nodeProbs[1]));

  const extraConditions=pairConditions.filter(condition=>condition.kind==="extra");
  const weakCritical=pairConditions.filter(condition=>condition.critical===true&&finite(condition.probability)&&Number(condition.probability)<.58);
  let effectiveExtra=extra;
  if(extraConditions.some(condition=>condition.stage==="SECOND")&&effectiveExtra>0)effectiveExtra-=1;
  effectiveExtra+=extraConditions.length;

  const conditionPenalty=Math.max(.48,1-effectiveExtra*.12-weakCritical.length*.07);
  const score=clamp((scenarioCoherence*.42+ratioScore*.25+nodeProbabilityScore*.33)*conditionPenalty,0,1);
  const level=score>=.70?"高":score>=.52?"中":"低";

  reasons.push(`1-2着ノード成立 ${(nodeProbabilityScore*100).toFixed(1)}%`);
  if(extraConditions.length)reasons.push(`1-2着追加条件 ${extraConditions.length}件`);

  return{
    score,level,reasons,
    scenarioCoherence:clamp(scenarioCoherence,0,1),
    nodeProbabilityScore,
    extraConditionCount:effectiveExtra,
    weakCriticalConditionCount:weakCritical.length,
    policy:"FIRST_SECOND_ONLY_NO_THIRD_INPUT"
  };
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
  const branchById=new Map((Array.isArray(branches)?branches:[]).map(branch=>[String(branch.id),branch]));
  const supportingBranch=branchById.get(String(best.branchId||item.branchId||""))||null;
  const lineIndependentFallback=supportingBranch?.lineIndependentFallback===true;

  const lineInfo=findLineContext(lines,first);
  let scenarioCoherence=.50;
  let extra=0;
  const reasons=[];

  if(lineInfo){
    const {members,index}=lineInfo;
    const follower=members[index+1]??null;
    const next=members[index+2]??null;
    const predecessor=members[index-1]??null;
    const prior2=members[index-2]??null;
    const secondSameLineMember=members.includes(Number(second));
    const thirdSameLineMember=members.includes(Number(third));

    if(Number(follower)===second){
      scenarioCoherence+=.28;
      reasons.push(`${first}の直後を${second}が追走`);
    }else if(Number(predecessor)===second){
      scenarioCoherence+=.26;
      reasons.push(`${first}の差し後も${second}が同ラインで2着残り`);
    }else if(Number(next)===second){
      scenarioCoherence+=.16;
      reasons.push(`${second}がライン3番手から2着`);
    }else if(Number(prior2)===second){
      scenarioCoherence+=.12;
      reasons.push(`${second}が同ライン前方から2着残り`);
    }else if(secondSameLineMember){
      scenarioCoherence+=.08;
      reasons.push(`${second}が同ライン深位置から2着へ残る`);
    }else if(follower!=null || predecessor!=null){
      scenarioCoherence-=.16;
      extra+=1;
      reasons.push(`同ラインの追走失敗または並び崩れが必要`);
    }

    if(Number(follower)===third || Number(next)===third || Number(predecessor)===third || Number(prior2)===third){
      scenarioCoherence+=.10;
      reasons.push(`${third}が同ライン残り`);
    }else if(thirdSameLineMember){
      scenarioCoherence+=.05;
      reasons.push(`${third}が同ライン深位置から3着へ残る`);
    }else if(third!==second){
      scenarioCoherence-=.05;
      extra+=1;
      reasons.push(`${third}の別線残り条件`);
    }
  }else{
    if(lineIndependentFallback){
      scenarioCoherence=.62;
      reasons.push("並び未取得のためライン整合は中立評価");
    }else{
      reasons.push("ライン追走関係の直接確認なし");
    }
  }

  const ratioScore=Math.pow(Math.max(.01,firstR)*Math.max(.01,secondR)*Math.max(.01,thirdR),1/3);

  const trace=Array.isArray(best.nodeTrace)?best.nodeTrace:(Array.isArray(item.nodeTrace)?item.nodeTrace:[]);
  const completeTrace=trace.length===3&&["FIRST","SECOND","THIRD"].every(stage=>trace.some(n=>n?.stage===stage));

  // Backward-compatible path for old fixtures / legacy saved data.
  if(!completeTrace){
    const penalty=Math.max(.58,1-extra*.12);
    const score=clamp((scenarioCoherence*.55 + ratioScore*.45)*penalty,0,1);
    const level=score>=.70?"高":score>=.52?"中":"低";
    return{score,level,reasons,extraConditionCount:extra,scenarioCoherence:clamp(scenarioCoherence,0,1),nodeProbabilityScore:null,nodeConditionCount:0};
  }

  const nodeByStage=new Map(trace.map(n=>[n.stage,n]));
  const newConditions=trace.flatMap(n=>(n?.newRequiredConditions||[]).map(c=>({...c,stage:n.stage})));
  const rawNodeProbs=["FIRST","SECOND","THIRD"].map(stage=>Number(nodeByStage.get(stage)?.conditionalProbability));
  const conditionOnlyNodeProbs=["FIRST","SECOND","THIRD"].map(stage=>{
    const conditions=nodeByStage.get(stage)?.newRequiredConditions||[];
    if(!conditions.length)return 1;
    return conditions.reduce((product,condition)=>product*Math.max(.0001,Number(condition.probability)||.0001),1);
  });
  const nodeProbs=lineIndependentFallback?conditionOnlyNodeProbs:rawNodeProbs;
  const nodeProbabilityScore=Math.pow(Math.max(.0001,nodeProbs[0])*Math.max(.0001,nodeProbs[1])*Math.max(.0001,nodeProbs[2]),1/3);
  const extraConditions=newConditions.filter(c=>c.kind==="extra");
  const weakCritical=newConditions.filter(c=>c.critical===true&&finite(c.probability)&&Number(c.probability)<.58);

  // Avoid double counting line-based extras already represented by node conditions.
  const stageExtra=new Set(extraConditions.map(c=>c.stage));
  let effectiveExtra=extra;
  if(stageExtra.has("SECOND")&&effectiveExtra>0)effectiveExtra-=1;
  if(stageExtra.has("THIRD")&&effectiveExtra>0)effectiveExtra-=1;
  effectiveExtra+=extraConditions.length;

  const conditionPenalty=Math.max(.42,1-effectiveExtra*.12-weakCritical.length*.07);
  const score=clamp((scenarioCoherence*.40 + ratioScore*.22 + nodeProbabilityScore*.38)*conditionPenalty,0,1);
  const level=score>=.70?"高":score>=.52?"中":"低";

  reasons.push(`着順ノード条件付き成立 ${(nodeProbabilityScore*100).toFixed(1)}%`);
  if(extraConditions.length)reasons.push(`追加条件 ${extraConditions.length}件`);

  const extraConditionDetails=extraConditions.map(condition=>({
    source:"NODE_CONDITION",stage:condition.stage||null,id:condition.id||null,label:condition.label||null,
    kind:condition.kind||null,probability:finite(condition.probability)?Number(condition.probability):null,
    critical:condition.critical===true,mechanism:condition.mechanism?{...condition.mechanism}:null
  }));
  const structuralExtraConditionCount=Math.max(0,effectiveExtra-extraConditions.length);
  for(let i=0;i<structuralExtraConditionCount;i++)extraConditionDetails.push({
    source:"LINE_COHERENCE_HEURISTIC",stage:null,id:`LINE_EXTRA_${i+1}`,
    label:"ライン整合上の追加成立条件（ノード条件と重複しない分）",kind:"extra",probability:null,critical:true,mechanism:null
  });
  const extraProbabilities=extraConditions.map(c=>Number(c.probability)).filter(Number.isFinite);
  const extraConditionProbabilityMin=extraProbabilities.length?Math.min(...extraProbabilities):null;
  const extraConditionProbabilityMean=extraProbabilities.length?sum(extraProbabilities)/extraProbabilities.length:null;

  return{
    score,level,reasons,
    extraConditionCount:effectiveExtra,
    extraConditionDetails,
    nodeExtraConditionCount:extraConditions.length,
    structuralExtraConditionCount,
    extraConditionProbabilityMin,
    extraConditionProbabilityMean,
    extraConditionPenalty:conditionPenalty,
    uncertainConditionCount:newConditions.filter(c=>c.kind==="uncertain").length,
    lineIndependentFallback,
    nodeProbabilityMode:lineIndependentFallback?"CONDITION_ONLY_NO_DOUBLE_PENALTY":"FULL_CONDITIONAL",
    scenarioCoherence:clamp(scenarioCoherence,0,1),
    nodeProbabilityScore,
    nodeConditionCount:newConditions.length,
    weakCriticalConditionCount:weakCritical.length
  };
}
function findLineContext(lines,number){
  const normalized=Array.isArray(lines)?lines:[];
  for(const line of normalized){
    const lineId=String(line?.id||line?.lineId||"");
    if(lineId.startsWith("unknown-"))continue;
    const raw=Array.isArray(line)?line:(Array.isArray(line?.members)?line.members:[]);
    const members=raw.map(m=>Number(m?.number??m)).filter(Number.isFinite);
    const index=members.indexOf(Number(number));
    if(index>=0)return{members,index};
  }
  return null;
}

function mainNaturalThreshold(item){
  // 通常のMAIN基準は0.58を維持。
  // 公式ライン未取得の degraded mode だけは、ライン整合情報を観測できない分を
  // 罰点として扱わず 0.54 とする。未知情報を「悪材料」に変換しないための補正。
  return item?.lineIndependentMainSupport===true?.54:.58;
}
function comparePairPurchaseTerminal(a,b){
  return (Number(b.pairNaturalConvergenceScore)-Number(a.pairNaturalConvergenceScore)) ||
    ((Number(b.firstFamilyProbability)||0)-(Number(a.firstFamilyProbability)||0)) ||
    key(a.order).localeCompare(key(b.order),"en");
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

function evaluateSecondPurchaseBridge(groups){
  const all=[...(Array.isArray(groups)?groups:[])].sort((a,b)=>b.mass-a.mass||b.peak-a.peak||a.second-b.second);
  if(!all.length)return{rows:[],selected:[],selectedSeconds:new Set(),selectionMode:"EMPTY"};
  let selected=selectNaturalGroupCluster(all,x=>x.mass);
  let selectionMode="NATURAL_GAP";

  // v151: SECOND-only breadth rule. The generic cluster helper intentionally
  // collapses to one row when it cannot find a natural boundary. That is useful
  // as a generic default, but for 2nd-place candidates it can erase independently
  // supported near-peers. When there is no boundary, retain only genuinely near
  // groups that independently clear the pair structural/convergence gates.
  if(all.length>1 && selected.length===1){
    const topMass=Math.max(0,Number(all[0]?.mass)||0);
    const naturalPeers=all.filter(group=>
      topMass>0 && Number(group.mass)>=topMass*.72 &&
      Math.max(...group.rows.map(item=>Number(item.secondFamilyRelativeToBest)||0))>=.85 &&
      group.classifiableCount>0 &&
      group.rows.some(item=>item.secondFamilyNaturalEligible===true && Number(item.pairNaturalConvergenceScore)>=.46)
    );
    if(naturalPeers.length>1){
      selected=naturalPeers;
      selectionMode="SECOND_NEAR_TIE_BREADTH";
    }else{
      selectionMode="SINGLE_STRONGEST";
    }
  }

  const selectedSeconds=new Set(selected.map(group=>Number(group.second)));
  return{rows:all,selected,selectedSeconds,selectionMode};
}

function evaluateThirdPurchaseBridge(rows,{allowNearTieBreadth=true,selectionEligible=null}={}){
  const all=[...(Array.isArray(rows)?rows:[])].sort(comparePurchaseTerminal);
  if(!all.length)return{rows:[],selected:[],selectedKeys:new Set(),selectionMode:"EMPTY"};
  const selectionPool=typeof selectionEligible==="function"?all.filter(selectionEligible):all;
  if(!selectionPool.length)return{rows:all,selected:[],selectedKeys:new Set(),selectionMode:"NO_CLASSIFIABLE_SELECTION"};
  let selected=selectNaturalGroupCluster(selectionPool,item=>Number(item.probability)||0);
  let selectionMode="NATURAL_GAP";

  // v150: THIRD-only breadth rule. When there is no meaningful separation among
  // 3rd-place candidates, the generic cluster helper returns one row. That was
  // over-compressing the same 1-2 branch to a single 3rd-place rider. In a near
  // tie, keep every terminal that independently clears the THIRD structural and
  // terminal-convergence gates. Weak THIRD candidates still remain evaluated but
  // unpurchased, so this does not bypass the safety floors.
  if(allowNearTieBreadth && selectionPool.length>1 && selected.length===1){
    const naturalPeers=selectionPool.filter(item=>
      item.thirdFamilyNaturalEligible===true &&
      Number(item.naturalConvergenceScore)>=.46
    );
    if(naturalPeers.length>1){
      selected=naturalPeers;
      selectionMode="THIRD_NEAR_TIE_BREADTH";
    }else{
      selectionMode="SINGLE_STRONGEST";
    }
  }

  const selectedKeys=new Set(selected.map(item=>key(item.order)));
  return{rows:all,selected,selectedKeys,selectionMode};
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

function canSatisfyCenterPurchaseClass(item,approvedContenderHeads){
  if(item.branchHeadMatched!==true)return false;
  const convergence=Number(item.naturalConvergenceScore)||0;
  if(item.directMainBranchSupport===true && convergence>=mainNaturalThreshold(item))return true;
  if(item.chatForecastRole==="main" && convergence>=.46)return true;
  if(item.chatForecastRole==="contender" && approvedContenderHeads.has(item.firstFamilyNumber) && convergence>=.46)return true;
  return false;
}

function rejectReason(item,familyMeta){
  if(!item.pairNaturalPositionEligible)return{code:"SECOND_POSITION_SUPPORT_WEAK",reason:`${orderText(item)}は終端として保持。ただし1-2着枝の位置支持が購入評価へ進む水準に届かないため不採用。`};
  if(item.thirdPurchaseBridgeStatus==="EVALUATED_NOT_SELECTED")return{code:"THIRD_PURCHASE_BRIDGE_NOT_SELECTED",reason:`${orderText(item)}は3着専用工程で生成・確率評価まで完了し、同じ1-2着枝の3着購入評価にも投入済み。ただし自然な3着クラスターから外れたため購入不採用。`};
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
  if(cls==="MAIN")return `主展開クラスタ「${scenario}」から直接収束し、${a}→${b}→${c}が自然に繋がる終端（${conv}${why?`・${why}`:""}）。同一主展開内の押し切り・番手差し・自然な折り返しを含む本線群として採用。${oddsPart}`.trim();
  if(cls==="COVER")return `有力な別シナリオ「${scenario}」内で${a}→${b}→${c}が自然に繋がる終端（${conv}${why?`・${why}`:""}）。押さえとして採用。${oddsPart}`.trim();
  return `可能性枝「${scenario}」を終端まで保持し、${conv}と実オッズ妙味の両方を確認できたため買える高配当として採用。${oddsPart}`.trim();
}

function buildFirstPurchaseBreadthAudit(items,centerHeads,approvedContenderHeads){
  const specs=[
    ...[...centerHeads].map(first=>({first:Number(first),role:"main",betClass:"MAIN",source:"CENTER_MAIN"})),
    ...[...approvedContenderHeads].filter(first=>![...centerHeads].map(Number).includes(Number(first))).map(first=>({first:Number(first),role:"contender",betClass:"COVER",source:"APPROVED_CONTENDER"}))
  ];
  const rows=specs.map(spec=>{
    const candidates=(items||[])
      .filter(item=>Number(item.firstFamilyNumber)===spec.first)
      .filter(item=>item.branchHeadMatched===true)
      .filter(item=>item.chatForecastRole===spec.role)
      .filter(item=>item.pairNaturalPositionEligible===true)
      .filter(item=>Number(item.pairNaturalConvergenceScore)>=.46);
    const adopted=candidates.filter(item=>item.purchaseStatus===PURCHASED&&item.betClass===spec.betClass);
    return{
      first:spec.first,source:spec.source,expectedBetClass:spec.betClass,
      naturalPairCandidateCount:candidates.length,adoptedCount:adopted.length,
      candidateProbability:sum(candidates.map(item=>item.probability)),
      adoptedProbability:sum(adopted.map(item=>item.probability)),
      passed:candidates.length===0||adopted.length>0
    };
  });
  return{
    version:"FIRST-PURCHASE-BREADTH-1.0",
    policy:"EVERY_CENTER_MAIN_HEAD_AND_APPROVED_CONTENDER_HEAD_WITH_A_NATURAL_PAIR_RETAINS_AT_LEAST_ONE_PURCHASE_TERMINAL",
    expectedHeadCount:rows.length,
    candidateHeadCount:rows.filter(row=>row.naturalPairCandidateCount>0).length,
    retainedHeadCount:rows.filter(row=>row.adoptedCount>0).length,
    rows,
    passed:rows.every(row=>row.passed)
  };
}

function buildCoverBreadthAudit(items,approvedContenderHeads,familyMeta){
  const rows=[...approvedContenderHeads].map(first=>{
    const candidates=(items||[])
      .filter(item=>Number(item.firstFamilyNumber)===Number(first))
      .filter(item=>item.branchHeadMatched===true)
      .filter(item=>item.chatForecastRole==="contender")
      .filter(item=>Number(item.naturalConvergenceScore)>=.46);
    const adopted=candidates.filter(item=>item.purchaseStatus===PURCHASED&&item.betClass==="COVER");
    const meta=familyMeta.get(Number(first));
    return{
      first:Number(first),
      classifiableNaturalCount:candidates.length,
      coverCount:adopted.length,
      recoveryAnchor:meta?.contenderCoverAnchorKey||null,
      passed:candidates.length===0||adopted.length>0
    };
  });
  return{
    policy:"APPROVED_CONTENDER_HEAD_RETAINS_ONE_NATURAL_COVER",
    rows,
    passed:rows.every(row=>row.passed)
  };
}

function buildSecondPurchaseBridgeAudit(familyMeta){
  const rows=[];
  for(const meta of familyMeta.values())if(meta.secondPurchaseBridgeRow)rows.push(meta.secondPurchaseBridgeRow);
  return{
    version:"SECOND-PURCHASE-BRIDGE-1.0",
    policy:"ALL_PAIR_ELIGIBLE_SECONDS_ARE_COMPARED_AND_NEAR_TIES_KEEP_MULTIPLE_INDEPENDENTLY_SUPPORTED_SECONDS",
    familyCount:rows.length,
    candidateCount:rows.reduce((sum,row)=>sum+row.candidateCount,0),
    selectedCount:rows.reduce((sum,row)=>sum+row.selectedCount,0),
    nearTieFamilyCount:rows.filter(row=>row.selectionMode==="SECOND_NEAR_TIE_BREADTH").length,
    rows,
    passed:rows.every(row=>row.candidateCount>0&&row.selectedCount>0)
  };
}

function buildThirdPurchaseBridgeAudit(items,familyMeta){
  const rows=[];
  for(const meta of familyMeta.values())for(const row of (meta.thirdPurchaseBridgeRows||[]))rows.push(row);
  const selectedPairs=new Set(rows.map(row=>`${row.first}-${row.second}`));
  const expected=(items||[]).filter(item=>item.pairNaturalPositionEligible&&item.branchHeadMatched===true&&selectedPairs.has(`${item.order?.[0]}-${item.order?.[1]}`));
  const evaluated=expected.filter(item=>["SELECTED_FOR_CLASSIFICATION","EVALUATED_NOT_SELECTED"].includes(item.thirdPurchaseBridgeStatus));
  const selected=evaluated.filter(item=>item.thirdPurchaseBridgeStatus==="SELECTED_FOR_CLASSIFICATION");
  return{
    version:"THIRD-PURCHASE-BRIDGE-1.0",
    policy:"PAIR_ONLY_GATE_THEN_ALL_THIRD_TERMINALS_ARE_EVALUATED_BEFORE_CLASSIFICATION",
    pairCount:rows.length,
    candidateCount:rows.reduce((sum,row)=>sum+row.candidateCount,0),
    selectedCount:rows.reduce((sum,row)=>sum+row.selectedCount,0),
    expectedEvaluatedCount:expected.length,evaluatedCount:evaluated.length,
    lowThirdRatioEvaluatedCount:evaluated.filter(item=>Number(item.thirdFamilyRelativeToBest)<.70).length,
    lowThirdRatioSelectedCount:selected.filter(item=>Number(item.thirdFamilyRelativeToBest)<.70).length,
    lowTerminalConvergenceEvaluatedCount:evaluated.filter(item=>Number(item.naturalConvergenceScore)<.46).length,
    pairGateUsesThirdInput:false,
    rows,
    passed:rows.every(row=>row.candidateCount>0&&row.selectedCount>0)&&expected.length===evaluated.length
  };
}

function buildCombinationCompletenessAudit(items,familyMeta){
  const itemByKey=new Map((items||[]).map(item=>[key(item.order),item]));
  const rows=[];
  for(const meta of familyMeta.values()){
    const secondRow=meta.secondPurchaseBridgeRow;
    if(!secondRow)continue;
    const selectedSeconds=new Set((secondRow.rows||[]).filter(row=>row.selected).map(row=>Number(row.second)));
    for(const second of selectedSeconds){
      const thirdRow=(meta.thirdPurchaseBridgeRows||[]).find(row=>Number(row.second)===second);
      const candidates=thirdRow?.rows||[];
      const selectedOrders=candidates.filter(row=>row.selected).map(row=>Array.isArray(row.order)?row.order.join("-"):String(row.order));
      const missingSelectedOrders=selectedOrders.filter(order=>!itemByKey.has(order));
      const evaluatedSelected=selectedOrders.map(order=>itemByKey.get(order)).filter(Boolean);
      const classifiableCandidates=candidates
        .map(row=>itemByKey.get(Array.isArray(row.order)?row.order.join("-"):String(row.order)))
        .filter(Boolean)
        .filter(item=>Number(item.naturalConvergenceScore)>=.46 && item.branchHeadMatched===true);
      const purchased=evaluatedSelected.filter(item=>item.purchaseStatus===PURCHASED);
      const hasUsableCandidate=classifiableCandidates.length>0;
      const passed=Boolean(thirdRow)&&missingSelectedOrders.length===0&&selectedOrders.length>0&&(!hasUsableCandidate||purchased.length>0);
      rows.push({
        first:Number(secondRow.first),second,
        thirdBridgePresent:Boolean(thirdRow),
        candidateThirdCount:candidates.length,selectedThirdCount:selectedOrders.length,
        selectedOrders,missingSelectedOrders,
        classifiableCandidateCount:classifiableCandidates.length,
        purchasedSelectedCount:purchased.length,
        combinationRecoveryKey:thirdRow?.combinationRecoveryKey||null,
        passed
      });
    }
  }
  return{
    version:"COMBINATION-COMPLETENESS-1.0",
    policy:"EVERY_SELECTED_1_2_PAIR_MUST_HAVE_AN_EXISTING_EVALUATED_1_2_3_TERMINAL_AND_RETAIN_ONE_PURCHASE_TERMINAL_WHEN_A_NORMAL_CLASSIFIABLE_COMBINATION_EXISTS",
    pairCount:rows.length,
    recoveredPairCount:rows.filter(row=>row.combinationRecoveryKey).length,
    missingTerminalCount:sum(rows.map(row=>row.missingSelectedOrders.length)),
    uncoveredClassifiablePairCount:rows.filter(row=>row.classifiableCandidateCount>0&&row.purchasedSelectedCount===0).length,
    rows,
    passed:rows.every(row=>row.passed)
  };
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
    policy:"MULTI_MAIN_BRANCH_CLUSTER_THEN_PAIR_SELECTION_THEN_DEDICATED_THIRD_PURCHASE_BRIDGE",
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
      purchasedLow:items.filter(x=>x.purchaseStatus===PURCHASED && x.naturalConvergenceLevel==="低").length,
      purchasedLowAuthorized:items.filter(x=>x.purchaseStatus===PURCHASED && x.naturalConvergenceLevel==="低" && ((Number(x.naturalConvergenceScore)||0)>=.40 || x.secondPairBreadthRecovery===true)).length,
      purchasedBelowOrdinaryFloor:items.filter(x=>x.purchaseStatus===PURCHASED && (Number(x.naturalConvergenceScore)||0)<.40).length
    },
    passed:deleted.length===0&&unexplainedRejects.length===0&&items.filter(x=>x.purchaseStatus===PURCHASED && (Number(x.naturalConvergenceScore)||0)<.40 && x.secondPairBreadthRecovery!==true).length===0,
    invariants:[
      {key:"NO_TERMINAL_DELETION",passed:deleted.length===0},
      {key:"NO_UNEXPLAINED_PURCHASE_REJECT",passed:unexplainedRejects.length===0},
      {key:"PURCHASE_SEPARATE_FROM_GENERATION",passed:true},
      {key:"POSSIBILITY_SEPARATE_FROM_CENTER_FORECAST",passed:true},
      {key:"NO_UNAUTHORIZED_LOW_NATURAL_CONVERGENCE_PURCHASE",passed:items.filter(x=>x.purchaseStatus===PURCHASED && (Number(x.naturalConvergenceScore)||0)<.40 && x.secondPairBreadthRecovery!==true).length===0},
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
