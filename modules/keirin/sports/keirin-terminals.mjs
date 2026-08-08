export function generateKeirinTerminals({scored,branches}){
  const byId=new Map(scored.map(item=>[item.id,item]));
  const lineById=new Map(scored.map(item=>[item.id,item.lineId]));
  const raw=[];

  for(const branch of branches){
    const paths=[];
    const firstEntries=branch.firstCandidates
      .map(firstId=>byId.get(firstId))
      .filter(Boolean)
      .filter(first=>branchFirstRoleCompatible(branch,first))
      .map(first=>({first,score:conditionedFirst(branch,first)}))
      .filter(item=>item.score>0);
    const bestFirst=Math.max(...firstEntries.map(item=>item.score),0);

    for(const {first,score:firstScore} of firstEntries){
      const secondEntries=scored
        .filter(second=>second.id!==first.id)
        .map(second=>({second,score:conditionedSecond(branch,first,second,lineById)}))
        .filter(item=>item.score>0);
      const bestSecond=Math.max(...secondEntries.map(item=>item.score),0);

      for(const {second,score:secondScore} of secondEntries){
        const thirdEntries=scored
          .filter(third=>third.id!==first.id&&third.id!==second.id)
          .map(third=>({third,score:conditionedThird(branch,first,second,third,lineById)}))
          .filter(item=>item.score>0);
        const bestThird=Math.max(...thirdEntries.map(item=>item.score),0);

        for(const {third,score:thirdScore} of thirdEntries){
          const pathScore=firstScore*secondScore*thirdScore;
          if(!branchPathCompatible(branch,first,second,third))continue;
          paths.push({
            order:[first.number,second.number,third.number],
            branchId:branch.id,
            branchLabel:branch.label,
            branchPriority:branch.priority,
            branchType:branch.branchType,
            branchScore:branch.score,
            pathScore,
            decisionRatios:{
              first:bestFirst>0?firstScore/bestFirst:0,
              second:bestSecond>0?secondScore/bestSecond:0,
              third:bestThird>0?thirdScore/bestThird:0
            },
            positionScores:{first:firstScore,second:secondScore,third:thirdScore},
            positionEvidence:{first:positionEvidence(branch,first,"first"),second:positionEvidence(branch,second,"second"),third:positionEvidence(branch,third,"third")},
            holdReason:"branch条件ごとに1・2・3着を独立評価して終端まで生成"
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
      branchScore:terminal.branchScore,
      weightedScore:terminal.weightedScore,
      pathScore:terminal.pathScore,
      positionScores:terminal.positionScores,
      positionEvidence:terminal.positionEvidence,
      decisionRatios:terminal.decisionRatios
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
  }
  return terminals.sort((a,b)=>(b.probability-a.probability)||a.order.join("-").localeCompare(b.order.join("-"),"en"));
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
    case"LEADER_HOLD": branchAbility=.30*(participant.roleScores.first||5)+.28*(e.start||5)+.22*(e.stamina||5)+.12*(e.recent||5)+.08*(e.finish||5); break;
    case"BANTE_SASHI": branchAbility=.28*(participant.roleScores.first||5)+.30*(e.finish||5)+.22*(e.tracking||5)+.12*(e.recent||5)+.08*(e.lineTrust||5); break;
    case"MAKURI_SUCCESS": branchAbility=.28*(participant.roleScores.first||5)+.34*(e.sprint||5)+.18*(e.finish||5)+.12*(e.recent||5)+.08*(e.start||5); break;
    case"LEAD_BATTLE": branchAbility=.24*(participant.roleScores.first||5)+.28*(e.finish||5)+.20*(e.tracking||5)+.16*(e.recent||5)+.12*(e.stamina||5); break;
    case"LINE_SEPARATION": branchAbility=.24*(participant.roleScores.first||5)+.30*(e.finish||5)+.26*(e.tracking||5)+.12*(e.recent||5)+.08*(e.lineTrust||5); break;
    case"SOLO_RISE": branchAbility=.30*(participant.roleScores.first||5)+.28*(e.finish||5)+.22*(e.sprint||5)+.12*(e.recent||5)+.08*(e.tracking||5); break;
  }
  return positive(.45*candidate+.55*branchAbility)*branchRoleFactor(branch,participant,"first");
}

function conditionedSecond(branch,first,second,lineById){
  const same=sameLine(first,second,lineById),role=second.role,e=second.evidence||{};
  let score=second.roleScores.second||5;
  let factor=1;
  switch(branch.branchType){
    case"LEADER_HOLD":
      score=.28*score+.30*(e.tracking||5)+.18*(e.finish||5)+.14*(e.lineTrust||5)+.10*(e.recent||5);
      if(same&&role==="番手")factor=1.55; else if(same&&role==="三番手")factor=1.18; else if(role==="番手")factor=1.04; else if(role==="自力")factor=.78;
      break;
    case"BANTE_SASHI":
      score=.30*score+.24*(e.stamina||5)+.18*(e.recent||5)+.16*(e.tracking||5)+.12*(e.finish||5);
      if(same&&role==="自力")factor=1.48; else if(same&&role==="三番手")factor=1.16; else if(role==="自力")factor=.98;
      break;
    case"MAKURI_SUCCESS":
      score=.26*score+.28*(e.tracking||5)+.18*(e.sprint||5)+.16*(e.finish||5)+.12*(e.recent||5);
      if(same&&role==="番手")factor=1.42; else if(same&&role==="三番手")factor=1.16; else if(!same&&role==="番手")factor=1.08; else if(role==="自力")factor=.82;
      break;
    case"LEAD_BATTLE":
      score=.24*score+.28*(e.finish||5)+.24*(e.tracking||5)+.14*(e.recent||5)+.10*(e.stamina||5);
      if(role==="番手")factor=1.30; else if(role==="三番手")factor=1.14; else if(role==="自力")factor=.72;
      break;
    case"LINE_SEPARATION":
      score=.22*score+.32*(e.tracking||5)+.24*(e.finish||5)+.14*(e.recent||5)+.08*(e.lineTrust||5);
      if(!same&&role==="番手")factor=1.30; else if(role==="単騎")factor=1.14; else if(same)factor=.72;
      break;
    case"SOLO_RISE":
      score=.28*score+.26*(e.finish||5)+.22*(e.tracking||5)+.14*(e.recent||5)+.10*(e.sprint||5);
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
      score=.26*score+.34*(e.tracking||5)+.16*(e.stamina||5)+.14*(e.recent||5)+.10*(e.finish||5);
      if(sameFirst&&role==="三番手")factor=1.42; else if(sameFirst&&role==="番手")factor=1.18; else if(!sameFirst&&(role==="番手"||role==="三番手"))factor=1.08; else if(role==="自力")factor=.84;
      break;
    case"BANTE_SASHI":
      score=.26*score+.32*(e.tracking||5)+.18*(e.stamina||5)+.14*(e.recent||5)+.10*(e.finish||5);
      if(sameFirst&&role==="三番手")factor=1.38; else if(sameFirst&&role==="自力")factor=1.22; else if(role==="番手"||role==="三番手")factor=1.06;
      break;
    case"MAKURI_SUCCESS":
      score=.24*score+.30*(e.tracking||5)+.20*(e.finish||5)+.14*(e.recent||5)+.12*(e.stamina||5);
      if(sameFirst&&role==="三番手")factor=1.32; else if(sameFirst&&role==="番手")factor=1.26; else if(!sameFirst&&role==="番手")factor=1.12; else if(role==="自力")factor=.86;
      break;
    case"LEAD_BATTLE":
      score=.22*score+.34*(e.tracking||5)+.22*(e.finish||5)+.12*(e.recent||5)+.10*(e.stamina||5);
      if(role==="三番手")factor=1.28; else if(role==="番手")factor=1.20; else if(role==="自力")factor=.72;
      break;
    case"LINE_SEPARATION":
      score=.22*score+.36*(e.tracking||5)+.22*(e.finish||5)+.12*(e.recent||5)+.08*(e.lineTrust||5);
      if(!sameFirst&&!sameSecond&&(role==="番手"||role==="単騎"))factor=1.24; else if(sameFirst)factor=.74;
      break;
    case"SOLO_RISE":
      score=.26*score+.34*(e.tracking||5)+.18*(e.finish||5)+.14*(e.recent||5)+.08*(e.stamina||5);
      if(role==="番手"||role==="三番手")factor=1.12; else if(role==="自力")factor=.88;
      break;
  }
  return positive(score)*factor;
}

function positionEvidence(branch,participant,target){
  const e=participant.evidence||{};
  const values={recentForm:e.recent??5,startPower:e.start??5,sprintPower:e.sprint??5,finishPower:e.finish??5,trackingSkill:e.tracking??5,roleScore:participant.roleScores?.[target]??5};
  const keys=branchKeys(branch.branchType,target);
  return {number:participant.number,id:participant.id,role:participant.role,target,roleScore:values.roleScore,drivers:keys.map(key=>({key,value:values[key]})).sort((a,b)=>b.value-a.value||a.key.localeCompare(b.key,"en"))};
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
function positive(value){return Math.max(.05,Number(value)||0)}
