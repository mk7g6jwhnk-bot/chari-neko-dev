
export function generateAutoBranches({scored,race,trackProfile={}}){
  const trial=[...scored].sort((a,b)=>b.evidence.trial-a.evidence.trial),
    start=[...scored].sort((a,b)=>b.evidence.start-a.evidence.start),
    passing=[...scored].sort((a,b)=>b.evidence.passing-a.evidence.passing),
    front=[...scored].sort((a,b)=>(a.handicap??0)-(b.handicap??0));

  const branches=[
    make("FRONT_ESCAPE","前ハン逃げ残り","main",avg(front.slice(0,3).map(p=>p.roleScores.first*.35+p.evidence.start*.25+p.evidence.opening*.2+p.evidence.stability*.2)),front.slice(0,3).map(p=>p.id)),
    make("TRIAL_ATTACK","試走上位追い上げ","main",avg(trial.slice(0,3).map(p=>p.roleScores.first*.38+p.evidence.trial*.28+p.evidence.passing*.2+p.evidence.late*.14)),trial.slice(0,3).map(p=>p.id)),
    make("START_DOMINANCE","スタート先行押し切り","sub",avg(start.slice(0,3).map(p=>p.roleScores.first*.34+p.evidence.start*.32+p.evidence.opening*.22+p.evidence.stability*.12)),start.slice(0,3).map(p=>p.id)),
    make("PASSING_ADVANCE","捌き上位浮上","sub",avg(passing.slice(0,4).map(p=>p.roleScores.first*.32+p.evidence.passing*.34+p.evidence.late*.2+p.evidence.track*.14)),passing.slice(0,4).map(p=>p.id)),
    make("INNER_LINE","内線進出","risk",avg(scored.map(p=>p.evidence.inside*.45+p.evidence.passing*.3+p.roleScores.third*.25)),scored.filter(p=>p.evidence.inside>=6).map(p=>p.id)),
    make("OUTER_SWEEP","外伸び一気","risk",avg(scored.map(p=>p.evidence.outside*.4+p.evidence.trial*.25+p.evidence.late*.2+p.roleScores.first*.15)),scored.filter(p=>p.evidence.outside>=6).map(p=>p.id)),
    make("WET_SPECIALIST","湿走路巧者浮上","risk",race.surface==="wet"?avg(scored.map(p=>p.evidence.wet*.45+p.evidence.stability*.25+p.roleScores.first*.3)):0,race.surface==="wet"?scored.filter(p=>p.evidence.wet>=6).map(p=>p.id):[]),
    make("CONTACT_CHAOS","接触・混戦繰り上がり","risk",(race.incidentRisk??3)*.45+avg(scored.map(p=>p.roleScores.third))*.35+avg(scored.map(p=>p.evidence.stability))*.2,scored.map(p=>p.id))
  ];

  return branches.filter(x=>x.enabled).sort((a,b)=>b.score-a.score);
}
function make(id,label,priority,score,firstCandidates){return{id,label,priority,score,firstCandidates:firstCandidates.filter(Boolean),enabled:score>=2.4&&firstCandidates.length>0}}
function avg(v){const x=v.filter(Number.isFinite);return x.length?x.reduce((a,b)=>a+b,0)/x.length:0}
