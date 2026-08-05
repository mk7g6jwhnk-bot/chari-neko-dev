
const clamp=(v,min=0,max=10)=>Math.min(max,Math.max(min,v));
export function scoreKeirinParticipants({race,venueProfile={}}){
  return race.participants.map(p=>{
    const recent=clamp(p.recentForm??5),start=clamp(p.startPower??5),sprint=clamp(p.sprintPower??5),stamina=clamp(p.stamina??5),timing=clamp(p.attackTiming??5),tracking=clamp(p.trackingSkill??5),finish=clamp(p.finishPower??5),lineTrust=clamp(p.lineTrust??5),venue=clamp(p.venueSuitability??5);
    const roleBonus={自力:{f:8.5,s:6,t:5.5},番手:{f:7.5,s:8.5,t:7.5},三番手:{f:4.5,s:6.5,t:8},単騎:{f:6,s:5.8,t:6.8}}[p.role]||{f:5,s:5,t:5};
    let first=.15*recent+.13*sprint+.12*stamina+.15*timing+.14*finish+.09*start+.08*lineTrust+.07*venue+.07*roleBonus.f;
    let second=.14*recent+.10*sprint+.10*stamina+.12*timing+.13*finish+.15*tracking+.13*lineTrust+.07*venue+.06*roleBonus.s;
    let third=.12*recent+.08*sprint+.12*stamina+.08*timing+.10*finish+.18*tracking+.12*lineTrust+.10*venue+.10*roleBonus.t;
    if(p.role==="自力")first+=venueProfile.selfPowerBias||0;if(p.role==="番手")second+=venueProfile.banteBias||0;
    return {...p,roleScores:{first:clamp(first),second:clamp(second),third:clamp(third),outside:clamp(10-Math.max(first,second,third))},evidence:{recent,start,sprint,stamina,timing,tracking,finish,lineTrust,venue}};
  });
}
