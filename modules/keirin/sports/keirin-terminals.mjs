export function generateKeirinTerminals({scored,branches}){
  const byId=new Map(scored.map(item=>[item.id,item]));
  const lineById=new Map(scored.map(item=>[item.id,item.lineId]));
  const raw=[];
  const generationEvents=[];

  for(const branch of branches){
    const paths=[];
    const firstEntries=[];
    for(const firstId of branch.firstCandidates||[]){
      const first=byId.get(firstId);
      if(!first){
        generationEvents.push({stage:"FIRST",branchId:branch.id,branchLabel:branch.label,participantId:firstId,action:"EXCLUDED",reasonGroup:"DATA_CONTRADICTION",reasonCode:"FIRST_CANDIDATE_NOT_FOUND",reason:"枝の1着候補IDが出走表に存在しない"});
        continue;
      }
      if(!branchFirstRoleCompatible(branch,first)){
        generationEvents.push({stage:"FIRST",branchId:branch.id,branchLabel:branch.label,number:first.number,action:"EXCLUDED",reasonGroup:"RULE_IMPOSSIBLE",reasonCode:"FIRST_ROLE_INCOMPATIBLE",reason:"展開枝が要求する1着役割と選手のライン役割が一致しない"});
        continue;
      }
      firstEntries.push({first,score:conditionedFirst(branch,first)});
    }
    const bestFirst=Math.max(...firstEntries.map(item=>item.score),0);

    const firstTotal=firstEntries.reduce((sum,item)=>sum+item.score,0);

    for(const {first,score:firstScore} of firstEntries){
      const firstNode=buildFirstNode(branch,first,firstScore,firstTotal);

      const secondEntries=scored
        .filter(second=>second.id!==first.id)
        .map(second=>({second,score:conditionedSecond(branch,first,second,lineById)}))
        .filter(item=>item.score>0);
      const bestSecond=Math.max(...secondEntries.map(item=>item.score),0);
      const secondTotal=secondEntries.reduce((sum,item)=>sum+item.score,0);

      for(const {second,score:secondScore} of secondEntries){
        const secondNode=buildSecondNode(branch,firstNode,first,second,secondScore,secondTotal,lineById);
        const secondConflict=stateConflict(secondNode);
        if(secondConflict){
          generationEvents.push({stage:"SECOND",branchId:branch.id,branchLabel:branch.label,order:[first.number,second.number],action:"EXCLUDED",reasonGroup:"RULE_IMPOSSIBLE",reasonCode:"PARENT_STATE_CONTRADICTION",reason:secondConflict});
          continue;
        }

        const thirdEntries=scored
          .filter(third=>third.id!==first.id&&third.id!==second.id)
          .map(third=>({third,score:conditionedThird(branch,first,second,third,lineById)}))
          .filter(item=>item.score>0);
        const bestThird=Math.max(...thirdEntries.map(item=>item.score),0);
        const thirdTotal=thirdEntries.reduce((sum,item)=>sum+item.score,0);

        for(const {third,score:thirdScore} of thirdEntries){
          const thirdNode=buildThirdNode(branch,secondNode,first,second,third,thirdScore,thirdTotal,lineById);
          const thirdConflict=stateConflict(thirdNode);
          if(thirdConflict){
            generationEvents.push({stage:"THIRD",branchId:branch.id,branchLabel:branch.label,order:[first.number,second.number,third.number],action:"EXCLUDED",reasonGroup:"RULE_IMPOSSIBLE",reasonCode:"PARENT_STATE_CONTRADICTION",reason:thirdConflict});
            continue;
          }

          const pathScore=firstScore*secondScore*thirdScore;
          if(!branchPathCompatible(branch,first,second,third)){
            generationEvents.push({stage:"PATH",branchId:branch.id,branchLabel:branch.label,order:[first.number,second.number,third.number],action:"EXCLUDED",reasonGroup:"RULE_IMPOSSIBLE",reasonCode:"BRANCH_PATH_INCOMPATIBLE",reason:"展開枝の役割条件と着順経路が両立しない"});
            continue;
          }
          paths.push({
            order:[first.number,second.number,third.number],
            branchId:branch.id,
            branchLabel:branch.label,
            branchPriority:branch.priority,
            branchType:branch.branchType,
            primaryLineId:branch.primaryLineId||null,
            requiredFirstNumber:branch.requiredFirstNumber??null,
            branchScore:branch.score,
            pathScore,
            nodeConditionalProbability:firstNode.conditionalProbability*secondNode.conditionalProbability*thirdNode.conditionalProbability,
            decisionRatios:{
              first:bestFirst>0?firstScore/bestFirst:0,
              second:bestSecond>0?secondScore/bestSecond:0,
              third:bestThird>0?thirdScore/bestThird:0
            },
            nodeTrace:[firstNode,secondNode,thirdNode],
            positionScores:{first:firstScore,second:secondScore,third:thirdScore},
            positionEvidence:{first:positionEvidence(branch,first,"first"),second:positionEvidence(branch,second,"second"),third:positionEvidence(branch,third,"third")},
            holdReason:"親状態を継承し、1ノード1事象で1着→2着→3着を条件付き再評価"
          });
        }
      }
    }

    const branchPathTotal=paths.reduce((sum,path)=>sum+path.pathScore,0);
    if(!(branchPathTotal>0))continue;
    for(const path of paths){
      raw.push({...path,weightedScore:branch.score*(path.pathScore/branchPathTotal)});
    }
  }

  const map=new Map();
  for(const terminal of raw){
    const key=terminal.order.join("-");
    const contribution={
      branchId:terminal.branchId,
      branchLabel:terminal.branchLabel,
      branchPriority:terminal.branchPriority,
      branchType:terminal.branchType,
      primaryLineId:terminal.primaryLineId||null,
      requiredFirstNumber:terminal.requiredFirstNumber??null,
      branchScore:terminal.branchScore,
      weightedScore:terminal.weightedScore,
      pathScore:terminal.pathScore,
      positionScores:terminal.positionScores,
      positionEvidence:terminal.positionEvidence,
      decisionRatios:terminal.decisionRatios,
      nodeConditionalProbability:terminal.nodeConditionalProbability,
      nodeTrace:terminal.nodeTrace
    };
    const existing=map.get(key);
    if(!existing){
      map.set(key,{
        order:terminal.order,
        score:terminal.weightedScore,
        branchId:terminal.branchId,
        branchLabel:terminal.branchLabel,
        branchPriority:terminal.branchPriority,
        branchType:terminal.branchType,
        holdReason:terminal.holdReason,
        contributingBranches:[terminal.branchId],
        branchContributions:[contribution]
      });
    }else{
      generationEvents.push({stage:"MERGE",branchId:terminal.branchId,branchLabel:terminal.branchLabel,order:terminal.order,action:"MERGED",reasonGroup:"DUPLICATE",reasonCode:"DUPLICATE_TERMINAL_MERGED",reason:"同一3連単終端を削除せず、別展開枝の寄与として統合"});
      existing.score+=terminal.weightedScore;
      existing.contributingBranches=[...new Set([...existing.contributingBranches,terminal.branchId])];
      existing.branchContributions.push(contribution);
    }
  }

  const terminals=[...map.values()];
  const total=terminals.reduce((sum,item)=>sum+item.score,0)||1;
  for(const terminal of terminals){
    terminal.probability=terminal.score/total;
    terminal.branchContributions=terminal.branchContributions
      .map(item=>({...item,probability:item.weightedScore/total}))
      .sort((a,b)=>b.probability-a.probability||a.branchId.localeCompare(b.branchId,"en"));
    const dominant=terminal.branchContributions[0];
    terminal.branchId=dominant?.branchId||terminal.branchId;
    terminal.branchLabel=dominant?.branchLabel||terminal.branchLabel;
    terminal.branchPriority=dominant?.branchPriority||terminal.branchPriority;
    terminal.branchType=dominant?.branchType||terminal.branchType;
    terminal.nodeTrace=dominant?.nodeTrace||[];
    terminal.nodeConditionalProbability=dominant?.nodeConditionalProbability??null;
  }
  terminals.sort((a,b)=>(b.probability-a.probability)||a.order.join("-").localeCompare(b.order.join("-"),"en"));
  const excluded=generationEvents.filter(event=>event.action==="EXCLUDED");
  const merged=generationEvents.filter(event=>event.action==="MERGED");
  const allowedReasonGroups=new Set(["RULE_IMPOSSIBLE","DATA_CONTRADICTION","DUPLICATE"]);
  const unexplained=excluded.filter(event=>!allowedReasonGroups.has(event.reasonGroup)||!event.reasonCode||!event.reason);
  const nodeStateAudit=buildNodeStateAudit(raw);
  Object.defineProperty(terminals,"generationAudit",{value:{
    policy:"ONE_NODE_ONE_EVENT_PARENT_STATE_INHERITANCE",
    allowedExclusionReasonGroups:[...allowedReasonGroups],
    generatedUniqueTerminalCount:terminals.length,
    rawSupportedPathCount:raw.length,
    excludedCount:excluded.length,
    mergedDuplicateCount:merged.length,
    unexplainedExclusionCount:unexplained.length,
    nodeStateAudit,
    passed:unexplained.length===0&&nodeStateAudit.passed,
    events:generationEvents
  },enumerable:false});
  return terminals;
}

function buildFirstNode(branch,first,score,total){
  const event={type:"FINISH_POSITION",participantNumber:first.number,position:1,label:`${first.number}番が1着`};
  const required=firstConditions(branch,first);
  return{
    stage:"FIRST",
    event,
    inheritedState:{events:[],conditions:[],facts:{}},
    newRequiredConditions:required,
    resultingState:{events:[event],conditions:[...required],facts:{winner:first.number,branchType:branch.branchType,primaryLineId:branch.primaryLineId||null}},
    score,
    conditionalProbability:total>0?score/total:0
  };
}
function buildSecondNode(branch,parent,first,second,score,total,lineById){
  const event={type:"FINISH_POSITION",participantNumber:second.number,position:2,label:`${second.number}番が2着`};
  const required=secondConditions(first,second,lineById);
  return{
    stage:"SECOND",
    event,
    inheritedState:cloneState(parent.resultingState),
    newRequiredConditions:required,
    resultingState:{events:[...parent.resultingState.events,event],conditions:[...parent.resultingState.conditions,...required],facts:{...parent.resultingState.facts,second:second.number}},
    score,
    conditionalProbability:total>0?score/total:0
  };
}
function buildThirdNode(branch,parent,first,second,third,score,total,lineById){
  const event={type:"FINISH_POSITION",participantNumber:third.number,position:3,label:`${third.number}番が3着`};
  const required=thirdConditions(first,second,third,lineById);
  return{
    stage:"THIRD",
    event,
    inheritedState:cloneState(parent.resultingState),
    newRequiredConditions:required,
    resultingState:{events:[...parent.resultingState.events,event],conditions:[...parent.resultingState.conditions,...required],facts:{...parent.resultingState.facts,third:third.number}},
    score,
    conditionalProbability:total>0?score/total:0
  };
}
function firstConditions(branch,first){
  if(branch.branchType==="LEADER_HOLD")return[
    condition(`FIRST_EVENT_${first.number}`,`${first.number}番が1着に入る`,"event"),
    condition(`LEADER_HOLD_${first.number}`,`${first.number}番が主導権を取り押し切る`,"natural")
  ];
  if(branch.branchType==="MAKURI_SUCCESS")return[
    condition(`FIRST_EVENT_${first.number}`,`${first.number}番が1着に入る`,"event"),
    condition(`MAKURI_${first.number}`,`${first.number}番の捲りが1着まで届く`,"natural")
  ];
  if(branch.branchType==="BANTE_SASHI")return[
    condition(`FIRST_EVENT_${first.number}`,`${first.number}番が1着に入る`,"event"),
    condition(`BANTE_SASHI_${first.number}`,`${first.number}番が前を追走して番手差しを決める`,"natural")
  ];
  return[
    condition(`FIRST_EVENT_${first.number}`,`${first.number}番が1着に入る`,"event"),
    condition(`BRANCH_${branch.id}`,`${branch.label||branch.id}が${first.number}番1着まで成立する`,"scenario")
  ];
}
function secondConditions(first,second,lineById){
  const same=sameLine(first,second,lineById);
  return[
    condition(`SECOND_EVENT_${first.number}_${second.number}`,`${first.number}番1着の成立状態を壊さず${second.number}番が2着に入る`,"event"),
    condition(`SECOND_REL_${second.number}`,same?`${second.number}番が同ライン関係を利用して2着位置を保つ`:`${second.number}番が別線から2着位置へ残る・浮上する`,same?"natural":"extra")
  ];
}
function thirdConditions(first,second,third,lineById){
  const same=sameLine(first,third,lineById)||sameLine(second,third,lineById);
  return[
    condition(`THIRD_EVENT_${first.number}_${second.number}_${third.number}`,`${first.number}番1着・${second.number}番2着の成立状態を壊さず${third.number}番が3着に入る`,"event"),
    condition(`THIRD_REL_${third.number}`,same?`${third.number}番が既成立のライン関係を利用して3着位置を保つ`:`${third.number}番が別線から3着位置へ残る・浮上する`,same?"natural":"extra")
  ];
}
function condition(id,label,kind){return{id,label,kind}}
function cloneState(state){return{events:(state?.events||[]).map(x=>({...x})),conditions:(state?.conditions||[]).map(x=>({...x})),facts:{...(state?.facts||{})}}}
function stateConflict(node){
  const events=node?.resultingState?.events||[],positions=new Map(),participants=new Map();
  for(const event of events){
    if(event?.type!=="FINISH_POSITION")continue;
    const n=Number(event.participantNumber),p=Number(event.position);
    if(positions.has(p)&&positions.get(p)!==n)return `${p}着が複数選手に同時確定するため親状態と矛盾`;
    if(participants.has(n)&&participants.get(n)!==p)return `${n}番が複数着順に同時確定するため親状態と矛盾`;
    positions.set(p,n);participants.set(n,p);
  }
  return null;
}
function buildNodeStateAudit(raw){
  let violations=0,inheritanceViolationCount=0,oneNodeOneEventViolationCount=0;
  const examples=[];
  for(const path of raw){
    const nodes=path.nodeTrace||[];
    if(nodes.length!==3){violations++;oneNodeOneEventViolationCount++;examples.push({order:path.order,reason:"着順ノードが3段階揃っていない"});continue}
    for(let i=0;i<nodes.length;i++){
      const node=nodes[i];
      if(!node.event||Array.isArray(node.event)){violations++;oneNodeOneEventViolationCount++;examples.push({order:path.order,stage:node.stage,reason:"1ノード1事象違反"})}
      if(i>0){
        const parent=nodes[i-1].resultingState||{},inherited=node.inheritedState||{};
        if(JSON.stringify(parent)!==JSON.stringify(inherited)){
          violations++;inheritanceViolationCount++;examples.push({order:path.order,stage:node.stage,reason:"親状態の完全継承違反"})
        }
      }
      const conflict=stateConflict(node);
      if(conflict){violations++;examples.push({order:path.order,stage:node.stage,reason:conflict})}
    }
  }
  return{
    version:"NODE-STATE-1.0",
    policy:"PARENT_STATE_INHERIT_PLUS_ONE_NEW_EVENT",
    checkedPathCount:raw.length,
    violationCount:violations,
    inheritanceViolationCount,
    oneNodeOneEventViolationCount,
    passed:violations===0,
    examples:examples.slice(0,20)
  };
}

function branchFirstRoleCompatible(branch,participant){
  if(!branch?.primaryLineId)return true;
  const samePrimaryLine=participant.lineId===branch.primaryLineId;
  switch(branch.branchType){
    case"LEADER_HOLD":
    case"MAKURI_SUCCESS":
      return samePrimaryLine&&participant.role==="自力";
    case"BANTE_SASHI":
      return samePrimaryLine&&participant.role==="番手";
    default:
      return true;
  }
}

function branchPathCompatible(branch,first,second,third){
  if(!branchFirstRoleCompatible(branch,first))return false;
  if(branch.branchType==="BANTE_SASHI"&&branch.primaryLineId){
    // 番手差しの1着は必ず当該ラインの番手。2着は先行車を最優先するが、
    // 先行車失速時の三番手/別線残りは確率評価で保持する。
    if(first.role!=="番手"||first.lineId!==branch.primaryLineId)return false;
  }
  if((branch.branchType==="LEADER_HOLD"||branch.branchType==="MAKURI_SUCCESS")&&branch.primaryLineId){
    if(first.role!=="自力"||first.lineId!==branch.primaryLineId)return false;
  }
  return Boolean(second&&third);
}

function conditionedFirst(branch,participant){
  const candidate=branch.firstCandidateScores?.[participant.id]??participant.roleScores.first;
  const e=participant.evidence||{};
  let branchAbility=participant.roleScores.first||5;
  switch(branch.branchType){
    case"LEADER_HOLD": branchAbility=weightedAvailable([[participant.roleScores.first,.30],[e.start,.28],[e.stamina,.22],[e.recent,.12],[e.finish,.08]]); break;
    case"BANTE_SASHI": branchAbility=weightedAvailable([[participant.roleScores.first,.28],[e.finish,.30],[e.tracking,.22],[e.recent,.12],[e.lineTrust,.08]]); break;
    case"MAKURI_SUCCESS": branchAbility=weightedAvailable([[participant.roleScores.first,.28],[e.sprint,.34],[e.finish,.18],[e.recent,.12],[e.start,.08]]); break;
    case"LEAD_BATTLE": branchAbility=weightedAvailable([[participant.roleScores.first,.24],[e.finish,.28],[e.tracking,.20],[e.recent,.16],[e.stamina,.12]]); break;
    case"LINE_SEPARATION": branchAbility=weightedAvailable([[participant.roleScores.first,.24],[e.finish,.30],[e.tracking,.26],[e.recent,.12],[e.lineTrust,.08]]); break;
    case"SOLO_RISE": branchAbility=weightedAvailable([[participant.roleScores.first,.30],[e.finish,.28],[e.sprint,.22],[e.recent,.12],[e.tracking,.08]]); break;
  }
  return positive(.45*candidate+.55*branchAbility)*branchRoleFactor(branch,participant,"first");
}

function conditionedSecond(branch,first,second,lineById){
  const same=sameLine(first,second,lineById),role=second.role,e=second.evidence||{};
  let score=second.roleScores.second||5;
  let factor=1;
  switch(branch.branchType){
    case"LEADER_HOLD":
      score=weightedAvailable([[score,.28],[e.tracking,.30],[e.finish,.18],[e.lineTrust,.14],[e.recent,.10]]);
      if(same&&role==="番手")factor=1.55; else if(same&&role==="三番手")factor=1.18; else if(role==="番手")factor=1.04; else if(role==="自力")factor=.78;
      break;
    case"BANTE_SASHI":
      score=weightedAvailable([[score,.30],[e.stamina,.24],[e.recent,.18],[e.tracking,.16],[e.finish,.12]]);
      if(same&&role==="自力")factor=1.48; else if(same&&role==="三番手")factor=1.16; else if(role==="自力")factor=.98;
      break;
    case"MAKURI_SUCCESS":
      score=weightedAvailable([[score,.26],[e.tracking,.28],[e.sprint,.18],[e.finish,.16],[e.recent,.12]]);
      if(same&&role==="番手")factor=1.42; else if(same&&role==="三番手")factor=1.16; else if(!same&&role==="番手")factor=1.08; else if(role==="自力")factor=.82;
      break;
    case"LEAD_BATTLE":
      score=weightedAvailable([[score,.24],[e.finish,.28],[e.tracking,.24],[e.recent,.14],[e.stamina,.10]]);
      if(role==="番手")factor=1.30; else if(role==="三番手")factor=1.14; else if(role==="自力")factor=.72;
      break;
    case"LINE_SEPARATION":
      score=weightedAvailable([[score,.22],[e.tracking,.32],[e.finish,.24],[e.recent,.14],[e.lineTrust,.08]]);
      if(!same&&role==="番手")factor=1.30; else if(role==="単騎")factor=1.14; else if(same)factor=.72;
      break;
    case"SOLO_RISE":
      score=weightedAvailable([[score,.28],[e.finish,.26],[e.tracking,.22],[e.recent,.14],[e.sprint,.10]]);
      if(role==="番手")factor=1.12; else if(role==="自力")factor=.88;
      break;
  }
  return positive(score)*factor;
}

function conditionedThird(branch,first,second,third,lineById){
  const sameFirst=sameLine(first,third,lineById),sameSecond=sameLine(second,third,lineById),role=third.role,e=third.evidence||{};
  let score=third.roleScores.third||5;
  let factor=1;
  switch(branch.branchType){
    case"LEADER_HOLD":
      score=weightedAvailable([[score,.26],[e.tracking,.34],[e.stamina,.16],[e.recent,.14],[e.finish,.10]]);
      if(sameFirst&&role==="三番手")factor=1.42; else if(sameFirst&&role==="番手")factor=1.18; else if(!sameFirst&&(role==="番手"||role==="三番手"))factor=1.08; else if(role==="自力")factor=.84;
      break;
    case"BANTE_SASHI":
      score=weightedAvailable([[score,.26],[e.tracking,.32],[e.stamina,.18],[e.recent,.14],[e.finish,.10]]);
      if(sameFirst&&role==="三番手")factor=1.38; else if(sameFirst&&role==="自力")factor=1.22; else if(role==="番手"||role==="三番手")factor=1.06;
      break;
    case"MAKURI_SUCCESS":
      score=weightedAvailable([[score,.24],[e.tracking,.30],[e.finish,.20],[e.recent,.14],[e.stamina,.12]]);
      if(sameFirst&&role==="三番手")factor=1.32; else if(sameFirst&&role==="番手")factor=1.26; else if(!sameFirst&&role==="番手")factor=1.12; else if(role==="自力")factor=.86;
      break;
    case"LEAD_BATTLE":
      score=weightedAvailable([[score,.22],[e.tracking,.34],[e.finish,.22],[e.recent,.12],[e.stamina,.10]]);
      if(role==="三番手")factor=1.28; else if(role==="番手")factor=1.20; else if(role==="自力")factor=.72;
      break;
    case"LINE_SEPARATION":
      score=weightedAvailable([[score,.22],[e.tracking,.36],[e.finish,.22],[e.recent,.12],[e.lineTrust,.08]]);
      if(!sameFirst&&!sameSecond&&(role==="番手"||role==="単騎"))factor=1.24; else if(sameFirst)factor=.74;
      break;
    case"SOLO_RISE":
      score=weightedAvailable([[score,.26],[e.tracking,.34],[e.finish,.18],[e.recent,.14],[e.stamina,.08]]);
      if(role==="番手"||role==="三番手")factor=1.12; else if(role==="自力")factor=.88;
      break;
  }
  return positive(score)*factor;
}

function positionEvidence(branch,participant,target){
  const e=participant.evidence||{};
  const values={recentForm:e.recent??null,startPower:e.start??null,sprintPower:e.sprint??null,finishPower:e.finish??null,trackingSkill:e.tracking??null,roleScore:participant.roleScores?.[target]??null};
  const keys=branchKeys(branch.branchType,target);
  return {number:participant.number,id:participant.id,role:participant.role,target,roleScore:values.roleScore,drivers:keys.map(key=>({key,value:values[key],missing:values[key]===null||values[key]===undefined||values[key]===""||!Number.isFinite(Number(values[key]))})).sort((a,b)=>(Number.isFinite(Number(b.value))?Number(b.value):-1)-(Number.isFinite(Number(a.value))?Number(a.value):-1)||a.key.localeCompare(b.key,"en"))};
}
function branchKeys(type,target){
  if(target==="first"){
    if(type==="LEADER_HOLD")return["startPower","recentForm","finishPower","roleScore"];
    if(type==="BANTE_SASHI")return["finishPower","trackingSkill","recentForm","roleScore"];
    if(type==="MAKURI_SUCCESS")return["sprintPower","finishPower","recentForm","roleScore"];
    return["finishPower","trackingSkill","recentForm","roleScore"];
  }
  if(target==="second")return["trackingSkill","finishPower","recentForm","roleScore"];
  return["trackingSkill","finishPower","recentForm","roleScore"];
}

function branchRoleFactor(branch,participant,target){
  if(target!=="first")return 1;
  if(branch.branchType==="LEAD_BATTLE"){
    if(participant.role==="番手")return 1.08;
    if(participant.role==="自力")return .90;
  }
  if(branch.branchType==="LINE_SEPARATION"&&participant.role==="番手")return 1.12;
  return 1;
}
function sameLine(a,b,lineById){const la=lineById.get(a.id),lb=lineById.get(b.id);return Boolean(la&&lb&&la===lb&&!String(la).startsWith("unknown-"))}
function weightedAvailable(items){const valid=items.filter(([value,weight])=>value!==null&&value!==undefined&&value!==""&&Number.isFinite(Number(value))&&weight>0);const total=valid.reduce((sum,[,weight])=>sum+weight,0);return total>0?valid.reduce((sum,[value,weight])=>sum+Number(value)*weight,0)/total:5}
function positive(value){return Math.max(.05,Number(value)||0)}
