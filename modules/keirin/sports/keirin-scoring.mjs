const clamp=(v,min=0,max=10)=>Math.min(max,Math.max(min,v));

// Only axes that currently have race-time verified inputs are allowed to move the
// positional scores. Research-pending axes stay in evidence for later use but do
// not dilute the live prediction by contributing neutral 5s.
export function scoreKeirinParticipants({race,venueProfile={}}){
  return race.participants.map(p=>{
    const recent=clamp(p.recentForm??5),start=clamp(p.startPower??5),sprint=clamp(p.sprintPower??5),tracking=clamp(p.trackingSkill??5),finish=clamp(p.finishPower??5);
    const stamina=clamp(p.stamina??5),timing=clamp(p.attackTiming??5),lineTrust=clamp(p.lineTrust??5),venue=clamp(p.venueSuitability??5);
    const roleBonus={自力:{f:8.5,s:5.8,t:5.0},番手:{f:7.2,s:8.6,t:7.4},三番手:{f:4.6,s:6.4,t:8.4},単騎:{f:6.0,s:5.8,t:6.8}}[p.role]||{f:5,s:5,t:5};

    const first=.28*recent+.20*sprint+.15*finish+.14*start+.08*tracking+.15*roleBonus.f;
    const second=.24*recent+.18*finish+.22*tracking+.10*sprint+.10*start+.16*roleBonus.s;
    const third=.20*recent+.14*finish+.30*tracking+.08*sprint+.08*start+.20*roleBonus.t;

    const roleScores={first:clamp(first),second:clamp(second),third:clamp(third),outside:clamp(10-Math.max(first,second,third))};
    return {
      ...p,
      roleScores,
      scoreTrace:{
        first:trace([{key:"recentForm",value:recent,weight:.28},{key:"sprintPower",value:sprint,weight:.20},{key:"finishPower",value:finish,weight:.15},{key:"startPower",value:start,weight:.14},{key:"trackingSkill",value:tracking,weight:.08},{key:"role",value:roleBonus.f,weight:.15}]),
        second:trace([{key:"recentForm",value:recent,weight:.24},{key:"finishPower",value:finish,weight:.18},{key:"trackingSkill",value:tracking,weight:.22},{key:"sprintPower",value:sprint,weight:.10},{key:"startPower",value:start,weight:.10},{key:"role",value:roleBonus.s,weight:.16}]),
        third:trace([{key:"recentForm",value:recent,weight:.20},{key:"finishPower",value:finish,weight:.14},{key:"trackingSkill",value:tracking,weight:.30},{key:"sprintPower",value:sprint,weight:.08},{key:"startPower",value:start,weight:.08},{key:"role",value:roleBonus.t,weight:.20}])
      },
      evidence:{recent,start,sprint,stamina,timing,tracking,finish,lineTrust,venue}
    };
  });
}

function trace(items){
  return items.map(item=>({...item,contribution:item.value*item.weight})).sort((a,b)=>b.contribution-a.contribution||a.key.localeCompare(b.key,"en"));
}
