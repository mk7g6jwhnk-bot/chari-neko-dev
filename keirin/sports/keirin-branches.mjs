export function generateKeirinBranches({scored,lines,lineConfidence}){
  const branches=[];
  const lineEnabled=lineConfidence==="高";

  for(const line of lines.filter(item=>item.type==="ライン")){
    const leader=line.leader,bante=line.bante;
    if(leader){
      branches.push(make({
        id:`LEAD-${line.id}`,label:`${line.id}先行押し切り`,scenario:"先行押し切り",branchType:"LEADER_HOLD",primaryLineId:line.id,requiredFirstNumber:leader.number,enabled:lineEnabled,
        scoreParts:[part("first",leader.roleScores.first,.40),part("startPower",leader.evidence.start,.35),part("recentForm",leader.evidence.recent,.15),part("finishPower",leader.evidence.finish,.10)],
        firstCandidateScores:{[leader.id]:leader.roleScores.first||0}
      }));
      branches.push(make({
        id:`MAKURI-${line.id}`,label:`${line.id}まくり`,scenario:"別線まくり",branchType:"MAKURI_SUCCESS",primaryLineId:line.id,requiredFirstNumber:leader.number,enabled:lineEnabled,
        scoreParts:[part("first",leader.roleScores.first,.32),part("sprintPower",leader.evidence.sprint,.42),part("finishPower",leader.evidence.finish,.16),part("recentForm",leader.evidence.recent,.10)],
        firstCandidateScores:{[leader.id]:leader.roleScores.first||0}
      }));
    }
    if(bante){
      branches.push(make({
        id:`BANTE-${line.id}`,label:`${line.id}番手差し`,scenario:"番手差し",branchType:"BANTE_SASHI",primaryLineId:line.id,requiredFirstNumber:bante.number,enabled:lineEnabled,
        scoreParts:[part("first",bante.roleScores.first,.32),part("finishPower",bante.evidence.finish,.34),part("trackingSkill",bante.evidence.tracking,.24),part("recentForm",bante.evidence.recent,.10)],
        firstCandidateScores:{[bante.id]:bante.roleScores.first||0}
      }));
    }
  }

  const battleScores=Object.fromEntries(scored.map(p=>[p.id,(p.roleScores.first||0)*.32+(p.evidence.finish||0)*.26+(p.evidence.tracking||0)*.22+(p.evidence.start||0)*.10+(p.evidence.recent||0)*.10]));
  branches.push(make({id:"BATTLE",label:"踏み合い消耗戦",scenario:"踏み合い",branchType:"LEAD_BATTLE",scoreParts:[part("candidateMean",avg(Object.values(battleScores)),1)],firstCandidateScores:battleScores,enabled:true}));

  const soloScores=Object.fromEntries(scored.filter(p=>p.role==="単騎").map(p=>[p.id,(p.roleScores.first||0)*.38+(p.evidence.finish||0)*.26+(p.evidence.sprint||0)*.22+(p.evidence.recent||0)*.14]));
  branches.push(make({id:"SOLO",label:"単騎浮上",scenario:"単騎浮上",branchType:"SOLO_RISE",scoreParts:[part("candidateMean",avg(Object.values(soloScores)),1)],firstCandidateScores:soloScores,enabled:Object.keys(soloScores).length>0}));

  const separationScores=Object.fromEntries(scored.map(p=>[p.id,(p.roleScores.first||0)*.28+(p.evidence.finish||0)*.28+(p.evidence.tracking||0)*.30+(p.evidence.recent||0)*.14]));
  branches.push(make({id:"SEPARATION",label:"番手離れ・繰り上がり",scenario:"番手離れ",branchType:"LINE_SEPARATION",scoreParts:[part("candidateMean",lineEnabled?avg(Object.values(separationScores)):0,1)],firstCandidateScores:separationScores,enabled:lineEnabled}));

  const enabled=branches.filter(branch=>branch.firstCandidates.length&&branch.enabled).sort(compareBranch);
  const structured=enabled.filter(branch=>["LEADER_HOLD","BANTE_SASHI","MAKURI_SUCCESS"].includes(branch.branchType));
  const bestStructuredScore=structured[0]?.score||0;
  const mainScoreFloor=bestStructuredScore*.90;
  return enabled.map(branch=>({
    ...branch,
    // Main-scenario candidates are compared across every official line.
    // Do not lock the race to the line that happens to own the top branch.
    priority:structured.includes(branch)&&(bestStructuredScore>0&&branch.score>=mainScoreFloor)?"main":structured.includes(branch)?"sub":"risk"
  }));
}

function part(key,value,weight){return{key,value:Number(value)||0,weight,contribution:(Number(value)||0)*weight}}
function make({id,label,scenario,branchType,scoreParts=[],firstCandidateScores={},primaryLineId=null,requiredFirstNumber=null,enabled}){
  const score=scoreParts.reduce((sum,item)=>sum+item.contribution,0);
  const entries=Object.entries(firstCandidateScores).filter(([id,value])=>id&&Number.isFinite(value)&&value>0).sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0]),"en"));
  return{id,label,scenario,branchType,primaryLineId,requiredFirstNumber,score,scoreTrace:[...scoreParts].sort((a,b)=>b.contribution-a.contribution),firstCandidates:entries.map(([id])=>id),firstCandidateScores:Object.fromEntries(entries),enabled:Boolean(enabled)&&score>=2.2,priority:"risk"};
}
function compareBranch(a,b){return(b.score-a.score)||a.id.localeCompare(b.id,"en")}
function avg(values){const valid=values.filter(Number.isFinite);return valid.length?valid.reduce((sum,value)=>sum+value,0)/valid.length:0}
