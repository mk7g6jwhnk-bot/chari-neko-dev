
export function generateKeirinBranches({scored,lines,lineConfidence}){
  const branches=[];
  const lineEnabled=lineConfidence==="高";
  for(const line of lines.filter(x=>x.type==="ライン")){
    const l=line.leader,b=line.bante;
    branches.push(make(`LEAD-${line.id}`,`${line.id}先行押し切り`,"先行押し切り","main",(l?.roleScores.first||0)*.45+(l?.evidence.stamina||0)*.25+(l?.evidence.timing||0)*.2+(b?.evidence.lineTrust||5)*.1,[l?.id],lineEnabled));
    if(b)branches.push(make(`BANTE-${line.id}`,`${line.id}番手差し`,"番手差し","main",(b.roleScores.first||0)*.4+(b.evidence.finish||0)*.25+(b.evidence.tracking||0)*.2+(l?.evidence.stamina||0)*.15,[b.id],lineEnabled));
    branches.push(make(`MAKURI-${line.id}`,`${line.id}まくり`,"別線まくり","sub",(l?.roleScores.first||0)*.4+(l?.evidence.sprint||0)*.3+(l?.evidence.timing||0)*.2+(l?.evidence.finish||0)*.1,[l?.id],lineEnabled));
  }
  branches.push(make("BATTLE","踏み合い消耗戦","踏み合い","risk",4.5,scored.map(x=>x.id),true));
  branches.push(make("SOLO","単騎浮上","単騎浮上","risk",avg(scored.filter(x=>x.role==="単騎").map(x=>x.roleScores.first)),scored.filter(x=>x.role==="単騎").map(x=>x.id),true));
  branches.push(make("SEPARATION","番手離れ・繰り上がり","番手離れ","risk",lineEnabled?4.0:0,scored.map(x=>x.id),lineEnabled));
  return branches.filter(x=>x.firstCandidates.length&&x.enabled).sort((a,b)=>b.score-a.score);
}
function make(id,label,scenario,priority,score,firstCandidates,enabled){return{id,label,scenario,priority,score,firstCandidates:firstCandidates.filter(Boolean),enabled:enabled&&score>=2.2}}
function avg(v){const x=v.filter(Number.isFinite);return x.length?x.reduce((a,b)=>a+b,0)/x.length:0}
