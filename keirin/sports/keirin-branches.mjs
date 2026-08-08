export function generateKeirinBranches({scored,lines,lineConfidence}){
  const branches=[];
  const lineEnabled=lineConfidence==="高";

  for(const line of lines.filter(item=>item.type==="ライン")){
    const leader=line.leader,bante=line.bante;
    if(leader){
      branches.push(make({
        id:`LEAD-${line.id}`,
        label:`${line.id}先行押し切り`,
        scenario:"先行押し切り",
        branchType:"LEADER_HOLD",
        score:(leader.roleScores.first||0)*.44+(leader.evidence.stamina||0)*.24+(leader.evidence.start||0)*.18+(leader.evidence.timing||0)*.14,
        firstCandidateScores:{[leader.id]:leader.roleScores.first||0},
        primaryLineId:line.id,
        enabled:lineEnabled
      }));
      branches.push(make({
        id:`MAKURI-${line.id}`,
        label:`${line.id}まくり`,
        scenario:"別線まくり",
        branchType:"MAKURI_SUCCESS",
        score:(leader.roleScores.first||0)*.34+(leader.evidence.sprint||0)*.32+(leader.evidence.timing||0)*.20+(leader.evidence.finish||0)*.14,
        firstCandidateScores:{[leader.id]:leader.roleScores.first||0},
        primaryLineId:line.id,
        enabled:lineEnabled
      }));
    }
    if(bante){
      branches.push(make({
        id:`BANTE-${line.id}`,
        label:`${line.id}番手差し`,
        scenario:"番手差し",
        branchType:"BANTE_SASHI",
        score:(bante.roleScores.first||0)*.38+(bante.evidence.finish||0)*.28+(bante.evidence.tracking||0)*.20+(leader?.evidence.stamina||5)*.14,
        firstCandidateScores:{[bante.id]:bante.roleScores.first||0},
        primaryLineId:line.id,
        enabled:lineEnabled
      }));
    }
  }

  const battleScores=Object.fromEntries(scored.map(p=>[
    p.id,
    (p.roleScores.first||0)*.35+(p.evidence.finish||0)*.25+(p.evidence.sprint||0)*.20+(p.evidence.tracking||0)*.20
  ]));
  branches.push(make({
    id:"BATTLE",label:"踏み合い消耗戦",scenario:"踏み合い",branchType:"LEAD_BATTLE",
    score:avg(Object.values(battleScores)),firstCandidateScores:battleScores,enabled:true
  }));

  const soloScores=Object.fromEntries(scored.filter(p=>p.role==="単騎").map(p=>[
    p.id,(p.roleScores.first||0)*.45+(p.evidence.finish||0)*.30+(p.evidence.timing||0)*.25
  ]));
  branches.push(make({
    id:"SOLO",label:"単騎浮上",scenario:"単騎浮上",branchType:"SOLO_RISE",
    score:avg(Object.values(soloScores)),firstCandidateScores:soloScores,enabled:Object.keys(soloScores).length>0
  }));

  const separationScores=Object.fromEntries(scored.map(p=>[
    p.id,
    (p.roleScores.first||0)*.30+(p.evidence.finish||0)*.30+(p.evidence.tracking||0)*.25+(p.evidence.timing||0)*.15
  ]));
  branches.push(make({
    id:"SEPARATION",label:"番手離れ・繰り上がり",scenario:"番手離れ",branchType:"LINE_SEPARATION",
    score:lineEnabled?avg(Object.values(separationScores)):0,
    firstCandidateScores:separationScores,enabled:lineEnabled
  }));

  const enabled=branches.filter(branch=>branch.firstCandidates.length&&branch.enabled).sort(compareBranch);
  const structured=enabled.filter(branch=>["LEADER_HOLD","BANTE_SASHI","MAKURI_SUCCESS"].includes(branch.branchType));
  const bestStructured=structured[0]||null;
  const mainLineId=bestStructured?.primaryLineId||null;
  const bestOnMainLine=mainLineId
    ? Math.max(...structured.filter(branch=>branch.primaryLineId===mainLineId).map(branch=>branch.score),0)
    : 0;
  return enabled.map(branch=>({
    ...branch,
    // MAIN is the strongest line/scenario family, not every near-tied line.
    // Other structured branches stay alive as SUB so their terminals can be COVER/value candidates.
    priority:structured.includes(branch)
      ? (mainLineId&&branch.primaryLineId===mainLineId&&branch.score>=bestOnMainLine*.90?"main":"sub")
      : "risk"
  }));
}

function make({id,label,scenario,branchType,score,firstCandidateScores={},primaryLineId=null,enabled}){
  const entries=Object.entries(firstCandidateScores)
    .filter(([id,value])=>id&&Number.isFinite(value)&&value>0)
    .sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0]),"en"));
  return{
    id,label,scenario,branchType,primaryLineId,
    score:Number.isFinite(score)?score:0,
    firstCandidates:entries.map(([id])=>id),
    firstCandidateScores:Object.fromEntries(entries),
    enabled:Boolean(enabled)&&(Number.isFinite(score)?score:0)>=2.2,
    priority:"risk"
  };
}
function compareBranch(a,b){return(b.score-a.score)||a.id.localeCompare(b.id,"en")}
function avg(values){const valid=values.filter(Number.isFinite);return valid.length?valid.reduce((sum,value)=>sum+value,0)/valid.length:0}
