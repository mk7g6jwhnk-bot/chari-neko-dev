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
  return{
    version:"PREDICTION-EXPLANATION-1.0",
    generatedFrom:"PREDICTION_ENGINE_ONLY",
    purchaseFieldsUsed:false,
    purchaseClassificationUsed:false,
    oddsUsed:false,
    axis,
    alternatives,
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
  const timeline=buildTimeline({branch,line,order,riderByNumber,top,lines:[...lineById.values()]});
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

function buildTimeline({branch,line,order,riderByNumber,top,lines}){
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
    return `${leaderText}が先行して主導権。${banteText}が番手で追走し、直線で${banteText}が${leaderText}を差す。${tail}`;
  }
  if(branch.branchType==="LEADER_HOLD"&&leaderText){
    const follow=banteText?`${banteText}が番手で追走。`:"";
    const tail=finishTail({first,second,third,leader,bante,firstText,secondText,thirdText,secondMech,thirdMech});
    return `${leaderText}が主導権を取って先行。${follow}${leaderText}が直線まで粘って押し切る。${tail}`;
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
