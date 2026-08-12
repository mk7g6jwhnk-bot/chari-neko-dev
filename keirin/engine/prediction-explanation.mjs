export function buildPredictionExplanation({scored=[],lines=[],branches=[],terminals=[]}={}){
  const riderByNumber=new Map((scored||[]).map(r=>[Number(r.number),r]));
  const lineById=new Map((lines||[]).map(line=>[String(line.id),line]));
  const branchById=new Map((branches||[]).map(branch=>[String(branch.id),branch]));
  const massByBranch=aggregateBranchMass(terminals);
  const center=(branches||[]).filter(branch=>["CENTER","CENTER_SIBLING"].includes(branch?.forecastRole)||branch?.priority==="main");
  const pool=center.length?center:(branches||[]);
  const ranked=[...pool].sort((a,b)=>(massByBranch.get(String(b.id))||0)-(massByBranch.get(String(a.id))||0)||(Number(b.score)||0)-(Number(a.score)||0)||String(a.id).localeCompare(String(b.id),"ja"));
  const scenarios=ranked.slice(0,4).map((branch,index)=>buildScenario({branch,index,riderByNumber,lineById,terminals,massByBranch})).filter(Boolean);
  const axis=scenarios[0]||null;
  const alternatives=scenarios.slice(1);
  const axisSelectionAudit=buildAxisSelectionAudit({pool,ranked,massByBranch,axis});
  const axisBranch=axis?.branchId?branchById.get(String(axis.branchId)):null;
  const comparisonAxisBranch=axisBranch?.branchType==="BANTE_SASHI"
    ?(branches||[]).find(branch=>branch?.branchType==="LEADER_HOLD"&&String(branch?.primaryLineId)===String(axisBranch?.primaryLineId))||null
    :axisBranch;
  const leaderHoldComparison=buildLeaderHoldComparison({
    scored,lines,branches,axisBranchId:comparisonAxisBranch?.id||null,
    sourceAxisBranchId:axis?.branchId||null,sourceAxisBranchType:axis?.branchType||null
  });
  return{
    version:"PREDICTION-EXPLANATION-1.0",
    generatedFrom:"PREDICTION_ENGINE_ONLY",
    purchaseFieldsUsed:false,
    purchaseClassificationUsed:false,
    oddsUsed:false,
    axis,
    alternatives,
    leaderHoldComparison,
    axisSelectionAudit,
    scenarioCount:scenarios.length,
    audit:{
      sourceBranchIds:scenarios.map(x=>x.branchId),
      sourceTerminalOrders:scenarios.flatMap(x=>x.naturalOrders||[]).map(x=>x.order),
      hasConcreteTimeline:Boolean(axis?.timeline),
      hasIndependentReasons:Boolean(axis?.reasons?.length),
      passed:Boolean(axis?.timeline&&axis?.reasons?.length)
    }
  };
}

function buildAxisSelectionAudit({pool=[],ranked=[],massByBranch=new Map(),axis=null}={}){
  const rows=(ranked||[]).map((branch,index)=>({
    rank:index+1,
    branchId:branch?.id||null,
    branchLabel:branch?.label||null,
    branchType:branch?.branchType||null,
    primaryLineId:branch?.primaryLineId??null,
    requiredFirstNumber:branch?.requiredFirstNumber??null,
    branchProbabilityMass:Number(massByBranch.get(String(branch?.id)))||0,
    branchScore:Number(branch?.score)||0,
    forecastRole:branch?.forecastRole||null,
    priority:branch?.priority||null
  }));
  const selected=rows[0]||null;
  const axisId=axis?.branchId||null;
  const consistent=Boolean(!axisId||String(selected?.branchId)===String(axisId));
  const scoreLeader=[...rows].sort((a,b)=>b.branchScore-a.branchScore||String(a.branchId).localeCompare(String(b.branchId),'en'))[0]||null;
  return{
    version:'AXIS-SELECTION-AUDIT-1.0',
    policy:'CENTER_POOL_FIRST; THEN BRANCH_TERMINAL_PROBABILITY_MASS DESC; THEN BRANCH_SCORE DESC; THEN BRANCH_ID',
    poolMode:(pool||[]).some(b=>['CENTER','CENTER_SIBLING'].includes(b?.forecastRole)||b?.priority==='main')?'CENTER_OR_MAIN_ONLY':'ALL_BRANCHES',
    selectedBranchId:selected?.branchId||null,
    selectedBranchMass:selected?.branchProbabilityMass||0,
    selectedBranchScore:selected?.branchScore||0,
    highestScoreBranchId:scoreLeader?.branchId||null,
    highestScore:Number(scoreLeader?.branchScore)||0,
    selectionDrivenByMass:Boolean(selected&&scoreLeader&&String(selected.branchId)!==String(scoreLeader.branchId)&&selected.branchProbabilityMass>scoreLeader.branchProbabilityMass),
    rows:rows.slice(0,8),
    audit:{axisMatchesSelection:consistent,passed:consistent}
  };
}

function buildScenario({branch,index,riderByNumber,lineById,terminals,massByBranch}){
  if(!branch)return null;
  const supported=[];
  for(const terminal of terminals||[]){
    const contribution=(terminal.branchContributions||[]).find(x=>String(x.branchId)===String(branch.id));
    if(contribution)supported.push({terminal,contribution});
  }
  supported.sort((a,b)=>(Number(b.contribution.probability)||0)-(Number(a.contribution.probability)||0)||(Number(b.terminal.probability)||0)-(Number(a.terminal.probability)||0));
  const top=supported[0]||null;
  const order=top?.terminal?.order||[];
  const line=branch.primaryLineId!=null?lineById.get(String(branch.primaryLineId)):null;
  const leaderReason=buildLeaderReason({branch,line,riderByNumber});
  const timeline=buildTimeline({branch,line,order,riderByNumber,top,lines:[...lineById.values()],leaderReason});
  const reasons=buildReasons({branch,line,order,riderByNumber,top,mass:Number(massByBranch.get(String(branch.id)))||0});
  const naturalOrders=supported.slice(0,4).map(({terminal,contribution})=>({
    order:(terminal.order||[]).map(Number),
    terminalProbability:Number(terminal.probability)||0,
    branchContributionProbability:Number(contribution.probability)||0,
    secondMechanism:mechanismFromNode(contribution.nodeTrace,1),
    thirdMechanism:mechanismFromNode(contribution.nodeTrace,2)
  }));
  return{
    rank:index+1,
    branchId:branch.id,
    branchLabel:branch.label,
    branchType:branch.branchType,
    forecastRole:branch.forecastRole||null,
    branchPriority:branch.priority||null,
    branchScore:Number(branch.score)||0,
    branchProbabilityMass:Number(massByBranch.get(String(branch.id)))||0,
    timeline,
    reasons,
    naturalOrders,
    primaryOrder:order.map(Number),
    source:{branchId:branch.id,terminalOrder:order.map(Number),contributionProbability:Number(top?.contribution?.probability)||0}
  };
}

function buildLeaderReason({branch,line,riderByNumber}){
  if(!branch?.requiredFirstNumber)return null;
  const leaderNumber=Number(branch.requiredFirstNumber);
  const leader=line?.leader&&Number(line.leader.number)===leaderNumber?line.leader:null;
  const evidence=leader?.startPowerEvidence||{};
  const initiative=branch?.initiative||null;
  const ev=initiative?.evidence||{};
  const parts=[];
  if(Number.isFinite(Number(ev.backCount))&&Number.isFinite(Number(ev.officialTotalStarts))){
    parts.push(`B実績${Number(ev.backCount)}回/${Number(ev.officialTotalStarts)}走`);
  }else if(Number.isFinite(Number(evidence.rawBackCount))&&Number.isFinite(Number(evidence.officialTotalStarts))){
    parts.push(`B実績${Number(evidence.rawBackCount)}回/${Number(evidence.officialTotalStarts)}走`);
  }
  if(Number.isFinite(Number(ev.bFrequency)))parts.push(`B率${(Number(ev.bFrequency)*100).toFixed(1)}%`);
  if(Number.isFinite(Number(ev.hFrequency)))parts.push(`H率${(Number(ev.hFrequency)*100).toFixed(1)}%`);
  if(Number.isFinite(Number(ev.officialScore)))parts.push(`競走得点${Number(ev.officialScore).toFixed(2)}`);
  if(Number.isFinite(Number(ev.lineLength)))parts.push(`${Number(ev.lineLength)}車ライン`);
  const scoreTrace=(branch.scoreTrace||[]).filter(x=>Number.isFinite(Number(x.value))).slice(0,3);
  const traceText=scoreTrace.map(x=>`${factorLabel(x.key)}${Number(x.value).toFixed(2)}`).join("、");
  const name=riderLabel(leaderNumber,riderByNumber);
  if(branch.branchType==="LEADER_HOLD"){
    const evidenceText=parts.length?parts.join("、"):traceText;
    return evidenceText
      ? `${name}は${evidenceText}などの先行根拠を踏まえ、主導権を取る枝を想定。`
      : `${name}を主導権候補とする保存済みの先行枝に基づき、主導権を取る想定。`;
  }
  if(branch.branchType==="BANTE_SASHI"&&line?.leader){
    const leadName=riderLabel(Number(line.leader.number),riderByNumber);
    const evidenceText=parts.length?parts.join("、"):traceText;
    return evidenceText
      ? `${leadName}が主導権を取る条件を前提に、${name}が番手を確保する枝を想定。`
      : `${leadName}主導権の保存済み枝を前提に、${name}が番手を確保する想定。`;
  }
  return null;
}

function buildTimeline({branch,line,order,riderByNumber,top,lines,leaderReason}){
  const [first,second,third]=order.map(Number);
  const firstText=riderLabel(first,riderByNumber),secondText=riderLabel(second,riderByNumber),thirdText=riderLabel(third,riderByNumber);
  const leader=line?.leader?numberLabel(line.leader):null;
  const bante=line?.bante?numberLabel(line.bante):null;
  const leaderText=line?.leader?riderLabel(line.leader.number,riderByNumber):null;
  const banteText=line?.bante?riderLabel(line.bante.number,riderByNumber):null;
  const secondMech=mechanismFromNode(top?.contribution?.nodeTrace,1);
  const thirdMech=mechanismFromNode(top?.contribution?.nodeTrace,2);

  if(branch.branchType==="BANTE_SASHI"&&leaderText&&banteText){
    const tail=finishTail({first,second,third,leader,bante,firstText,secondText,thirdText,secondMech,thirdMech});
    return `${leaderReason||`${leaderText}が先行して主導権を取る想定。`}${banteText}が番手で追走し、直線で${banteText}が${leaderText}を差す。${tail}`;
  }
  if(branch.branchType==="LEADER_HOLD"&&leaderText){
    const follow=banteText?`${banteText}が番手で追走。`:"";
    const tail=finishTail({first,second,third,leader,bante,firstText,secondText,thirdText,secondMech,thirdMech});
    return `${leaderReason||`${leaderText}が主導権を取って先行する想定。`}${follow}${leaderText}が直線まで粘って押し切る。${tail}`;
  }
  if(branch.branchType==="MAKURI_SUCCESS"){
    const attacker=firstText||riderLabel(branch.requiredFirstNumber,riderByNumber);
    const tail=finishTail({first,second,third,leader,bante,firstText,secondText,thirdText,secondMech,thirdMech});
    return `${attacker}が前団を射程に置いて捲りを仕掛け、前を越えて1着まで届く。${tail}`;
  }
  if(branch.branchType==="LEAD_BATTLE"){
    const battlers=selectBattleRiders(lines).map(r=>riderLabel(r.number,riderByNumber));
    const battleText=battlers.length>=2?`${battlers[0]}と${battlers[1]}が主導権争いで踏み合う。`:"複数の先行候補が主導権争いで踏み合う。";
    return `${battleText}前団が脚を使う展開から${firstText}が1着へ浮上し、${secondText}、${thirdText}が続く想定。`;
  }
  if(branch.branchType==="SOLO_RISE"){
    return `単騎の${firstText}がライン同士の動きを見ながら好位置を確保し、最終局面で1着へ浮上。${secondText}が2着、${thirdText}が3着へ続く想定。`;
  }
  if(branch.branchType==="LINE_SEPARATION"){
    return `前位の追走崩れや離れが起きて隊列が乱れ、その空いた位置を${firstText}が使って1着へ浮上。${secondText}、${thirdText}が残る想定。`;
  }
  return `${firstText}が1着へ到達する「${branch.label||branch.scenario||"展開"}」を軸に、${secondText}が2着、${thirdText}が3着へ続く想定。`;
}

function finishTail({first,second,third,leader,bante,firstText,secondText,thirdText,secondMech,thirdMech}){
  const parts=[];
  if(Number(second)===Number(leader))parts.push(`${secondText}は先行残りで2着`);
  else if(secondText)parts.push(`${secondText}が${mechanismPhrase(secondMech,"2着")}`);
  if(thirdText)parts.push(`${thirdText}が${mechanismPhrase(thirdMech,"3着")}`);
  return parts.length?`${parts.join("、")}と見る。`:`${firstText}を頭に自然終端へつながる想定。`;
}

function buildReasons({branch,line,order,riderByNumber,top,mass}){
  const reasons=[];
  const [first,second,third]=order.map(Number);
  const firstText=riderLabel(first,riderByNumber),secondText=riderLabel(second,riderByNumber),thirdText=riderLabel(third,riderByNumber);
  const trace=(branch.scoreTrace||[]).slice(0,4);
  if(trace.length){
    const translated=trace.map(x=>`${factorLabel(x.key)} ${fmt10(x.value)}`).join(" / ");
    reasons.push({type:"BRANCH_EVIDENCE",text:`この展開枝の主要根拠は ${translated}。`,sourceKeys:trace.map(x=>x.key)});
  }
  if(mass>0)reasons.push({type:"BRANCH_MASS",text:`全終端確率のうち、この展開枝からの寄与は約${(mass*100).toFixed(1)}%。`,value:mass});
  const nodes=top?.contribution?.nodeTrace||[];
  const firstNode=nodes[0],secondNode=nodes[1],thirdNode=nodes[2];
  if(firstNode)reasons.push({type:"FIRST_PATH",text:`${firstText}の1着成立条件は「${conditionLabels(firstNode).join(" / ")||"1着条件"}」。条件付き確率は${pct(firstNode.conditionalProbability)}。`,number:first});
  if(secondNode)reasons.push({type:"SECOND_PATH",text:`${secondText}は「${conditionLabels(secondNode).join(" / ")||"2着残り"}」で2着評価。条件付き確率は${pct(secondNode.conditionalProbability)}。`,number:second});
  if(thirdNode)reasons.push({type:"THIRD_PATH",text:`${thirdText}は「${conditionLabels(thirdNode).join(" / ")||"3着残り"}」で3着評価。条件付き確率は${pct(thirdNode.conditionalProbability)}。`,number:third});
  if(line?.members?.length)reasons.push({type:"LINE_ROLE",text:`想定ラインは ${line.members.map(r=>`${numberLabel(r)}${r.role?`(${r.role})`:""}`).join("－")}。`,lineId:line.id});
  return reasons.slice(0,6);
}

function aggregateBranchMass(terminals=[]){
  const map=new Map();
  for(const terminal of terminals||[])for(const c of terminal.branchContributions||[])map.set(String(c.branchId),(map.get(String(c.branchId))||0)+(Number(c.probability)||0));
  return map;
}
function conditionLabels(node){return (node?.newRequiredConditions||[]).map(c=>c?.label).filter(Boolean).slice(0,2);}
function mechanismFromNode(nodes,index){
  const node=Array.isArray(nodes)?nodes[index]:null;
  const c=(node?.newRequiredConditions||[]).find(x=>x?.mechanism?.label);
  return c?.mechanism?.label||null;
}
function mechanismPhrase(label,position){
  if(!label)return `${position}へ残る`;
  if(label.includes("先行残り"))return `先行残りで${position}`;
  if(label.includes("追走"))return `追走して${position}`;
  if(label.includes("ライン3番手"))return `ライン3番手から${position}に残る`;
  if(label.includes("位置残り"))return `位置を確保して${position}に残る`;
  if(label.includes("別線残り"))return `別線から${position}へ浮上する`;
  return `${label}で${position}へ残る`;
}
function selectBattleRiders(lines=[]){
  return (lines||[]).filter(l=>l?.type==="ライン"&&l?.leader).map(l=>l.leader).sort((a,b)=>(Number(b?.evidence?.start)||Number(b?.startPower)||0)-(Number(a?.evidence?.start)||Number(a?.startPower)||0)).slice(0,2);
}
function riderLabel(number,map){
  const n=Number(number); if(!Number.isFinite(n))return"該当選手";
  const r=map.get(n); const name=String(r?.name||"").trim();
  return `${n}番${name?` ${name}`:""}`;
}
function numberLabel(r){return `${Number(r?.number)}番`;}
function factorLabel(key){return ({firstPlacement:"1着適性",escapeMechanism:"先行押し切り力",startPower:"主導権獲得力",recentForm:"直近状態",finishPower:"末脚",makuriMechanism:"捲り力",sprintPower:"瞬発力",banteSashiMechanism:"番手差し力",trackingSkill:"追走力",candidateMean:"候補全体の成立力"})[String(key)]||String(key||"評価");}
function fmt10(v){return Number.isFinite(Number(v))?Number(v).toFixed(2):"不明";}
function pct(v){return Number.isFinite(Number(v))?`${(Number(v)*100).toFixed(1)}%`:"未算出";}


function buildLeaderHoldComparison({scored=[],lines=[],branches=[],axisBranchId=null,sourceAxisBranchId=null,sourceAxisBranchType=null}={}){
  const leaderByNumber=new Map();
  for(const line of lines||[]){
    if(line?.type!=="ライン"||!line?.leader)continue;
    leaderByNumber.set(Number(line.leader.number),{lineId:line.id,line});
  }
  const branchByLeader=new Map();
  for(const branch of branches||[]){
    if(branch?.branchType!=="LEADER_HOLD")continue;
    const n=Number(branch.requiredFirstNumber);
    if(Number.isFinite(n))branchByLeader.set(n,branch);
  }
  const rows=(scored||[]).map(rider=>{
    const n=Number(rider.number);
    const leaderInfo=leaderByNumber.get(n)||null;
    const branch=branchByLeader.get(n)||null;
    const trace=branch?.scoreTrace||[];
    const traceByKey=Object.fromEntries(trace.map(x=>[String(x.key),x]));
    const raw={
      firstPlacement:valueOf(rider?.roleScores?.first),
      escapeMechanism:valueOf(rider?.riderEvaluationV2?.firstMechanisms?.escape),
      startPower:valueOf(rider?.evidence?.start),
      recentForm:valueOf(rider?.evidence?.recent),
      finishPower:valueOf(rider?.evidence?.finish)
    };
    const factors=Object.entries(raw).map(([key,value])=>({
      key,label:factorLabel(key),value,
      configuredWeight:leaderHoldWeight(key),
      effectiveWeight:valueOf(traceByKey[key]?.effectiveWeight),
      contribution:valueOf(traceByKey[key]?.contribution),
      available:value!==null
    }));
    let exclusionReason=null;
    if(!leaderInfo)exclusionReason="NOT_OFFICIAL_LINE_LEADER";
    else if(!branch)exclusionReason="LEADER_HOLD_BRANCH_NOT_ENABLED_OR_START_EVIDENCE_UNAVAILABLE";
    return{
      number:n,name:String(rider?.name||""),role:rider?.role||null,
      officialLineLeader:Boolean(leaderInfo),lineId:leaderInfo?.lineId??null,
      branchGenerated:Boolean(branch),branchId:branch?.id||null,
      branchLabel:branch?.label||null,branchScore:valueOf(branch?.score),
      forecastRole:branch?.forecastRole||null,priority:branch?.priority||null,
      isAxisBranch:Boolean(branch&&String(branch.id)===String(axisBranchId)),
      exclusionReason,raw,factors
    };
  }).sort((a,b)=>(b.branchGenerated-a.branchGenerated)||((b.branchScore??-1)-(a.branchScore??-1))||a.number-b.number);
  const generated=rows.filter(x=>x.branchGenerated);
  const axisRow=rows.find(x=>x.isAxisBranch)||null;
  const strongestRival=generated.find(x=>!x.isAxisBranch)||null;
  const decisiveFactors=axisRow&&strongestRival?compareLeaderHoldFactors(axisRow,strongestRival):[];
  const userFacingComparison=buildLeaderHoldUserFacingComparison(axisRow,strongestRival,decisiveFactors);
  return{
    version:"LEADER-HOLD-BRANCH-COMPARISON-1.1",
    policy:"COMPARE_BRANCH_GENERATION_ELIGIBILITY_BEFORE_SCORE; THEN_COMPARE_EXACT_LEADER_HOLD_SCORE_TRACE",
    axisNumber:axisRow?.number??null,
    axisBranchId:axisRow?.branchId??null,
    sourceAxisBranchId:sourceAxisBranchId??null,
    sourceAxisBranchType:sourceAxisBranchType??null,
    mappedFromBanteSashi:sourceAxisBranchType==="BANTE_SASHI"&&Boolean(axisRow),
    generatedLeaderHoldCount:generated.length,
    rows,
    strongestRivalNumber:strongestRival?.number??null,
    decisiveFactors,
    userFacingComparison,
    audit:{
      branchEligibilitySeparatedFromAbility:true,
      exactScoreTraceUsed:true,
      lineLeaderRestrictionVisible:true,
      passed:rows.length>0
    }
  };
}

function buildLeaderHoldUserFacingComparison(axis,rival,factors=[]){
  if(!axis)return null;
  if(!rival){
    return{
      mode:"NO_COMPARABLE_RIVAL",
      axisNumber:axis.number,
      rivalNumber:null,
      headline:`${axis.number}番を先行押し切りの軸に採用`,
      summary:"比較できる他の先行押し切り枝がありません。軸採用は、能力比較で他候補を上回ったという意味ではなく、生成されたLEADER_HOLD枝の中で最上位だったためです。",
      axisAdvantages:[],rivalAdvantages:[],decisiveReasons:[]
    };
  }
  const axisAdvantages=factors.filter(x=>Number(x.delta)>1e-9).sort((a,b)=>b.delta-a.delta);
  const rivalAdvantages=factors.filter(x=>Number(x.delta)<-1e-9).sort((a,b)=>a.delta-b.delta);
  const scoreDelta=(Number(axis.branchScore)||0)-(Number(rival.branchScore)||0);
  const topAxis=axisAdvantages.slice(0,3).map(x=>`${x.label} +${x.delta.toFixed(3)}`);
  const topRival=rivalAdvantages.slice(0,3).map(x=>`${x.label} ${x.delta.toFixed(3)}`);
  const decisiveReasons=axisAdvantages.slice(0,3).map(x=>({label:x.label,delta:x.delta,axisValue:x.axisValue,rivalValue:x.rivalValue}));
  const summary=[
    `${rival.number}番が優勢だった項目は${topRival.length?topRival.join("・"):"なし"}。`,
    `${axis.number}番が優勢だった項目は${topAxis.length?topAxis.join("・"):"なし"}。`,
    `重み付け後の先行押し切り枝scoreは${axis.number}番 ${fmt10(axis.branchScore)}、${rival.number}番 ${fmt10(rival.branchScore)}で、差は${scoreDelta>=0?"+":""}${scoreDelta.toFixed(3)}。`,
    scoreDelta>=0
      ?(axisAdvantages.length?`先行押し切り枝scoreで${axis.number}番を押し上げた主因は${axisAdvantages.slice(0,2).map(x=>x.label).join("と")}です。`:"先行押し切り枝score上は軸側に明確な加点優位はありません。")
      :`${rival.number}番の先行押し切り枝scoreの方が高いため、この比較だけでは${axis.number}番を軸にした理由を説明できません。実際の軸選択は終端確率質量を先に比較します。`
  ].join(" ");
  return{
    mode:"HEAD_TO_HEAD",axisNumber:axis.number,rivalNumber:rival.number,
    headline:`軸候補比較：${axis.number}番 vs ${rival.number}番`,
    summary,scoreDelta,axisAdvantages,rivalAdvantages,decisiveReasons
  };
}

function leaderHoldWeight(key){return({firstPlacement:.22,escapeMechanism:.43,startPower:.20,recentForm:.10,finishPower:.05})[String(key)]??null;}
function compareLeaderHoldFactors(axis,rival){
  const keys=["firstPlacement","escapeMechanism","startPower","recentForm","finishPower"];
  return keys.map(key=>{
    const a=axis.factors.find(x=>x.key===key)||{};
    const b=rival.factors.find(x=>x.key===key)||{};
    const ac=valueOf(a.contribution)??0,bc=valueOf(b.contribution)??0;
    return{key,label:factorLabel(key),axisContribution:ac,rivalContribution:bc,delta:ac-bc,axisValue:valueOf(a.value),rivalValue:valueOf(b.value)};
  }).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
}
function valueOf(v){return v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v))?Number(v):null;}
