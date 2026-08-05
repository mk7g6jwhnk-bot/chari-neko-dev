
const clamp=(v,min=0,max=10)=>Math.min(max,Math.max(min,v));
export function scoreAutoParticipants({race,trackProfile={}}){
  const trialTimes=race.participants.map(p=>p.trialTime).filter(Number.isFinite),
    min=trialTimes.length?Math.min(...trialTimes):null,
    max=trialTimes.length?Math.max(...trialTimes):null;

  return race.participants.map(p=>{
    const trial=trialScore(p.trialTime,min,max),
      start=clamp(p.startSkill??5),
      opening=clamp(p.openingLapPower??5),
      passing=clamp(p.passingSkill??5),
      late=clamp(p.lateRacePower??5),
      stability=clamp(p.stability??5),
      dry=clamp(p.drySuitability??5),
      wet=clamp(p.wetSuitability??5),
      inside=clamp(p.insideLineSkill??5),
      outside=clamp(p.outsideLineSkill??5),
      handicap=handicapScore(p.handicap),
      recent=clamp(p.recentForm??5),
      track=clamp(p.trackSuitability??5);

    const surfaceSuitability=race.surface==="wet"?wet:race.surface==="dry"?dry:(dry+wet)/2;
    const lineSuitability=trackProfile.lineBias==="inside"?inside:trackProfile.lineBias==="outside"?outside:(inside+outside)/2;

    const first=clamp(.20*trial+.13*start+.12*opening+.12*passing+.12*late+.08*stability+.08*surfaceSuitability+.05*lineSuitability+.05*handicap+.05*recent);
    const second=clamp(.17*trial+.12*start+.10*opening+.14*passing+.12*late+.10*stability+.08*surfaceSuitability+.07*lineSuitability+.05*handicap+.05*track);
    const third=clamp(.13*trial+.09*start+.08*opening+.14*passing+.12*late+.14*stability+.10*surfaceSuitability+.08*lineSuitability+.05*handicap+.07*track);

    return {...p,roleScores:{first,second,third,outside:clamp(10-Math.max(first,second,third))},evidence:{trial,start,opening,passing,late,stability,dry,wet,inside,outside,handicap,recent,track,surfaceSuitability,lineSuitability}};
  });
}
function trialScore(v,min,max){if(!Number.isFinite(v)||!Number.isFinite(min)||!Number.isFinite(max)||min===max)return 5;return clamp(10*(max-v)/(max-min))}
function handicapScore(v){if(!Number.isFinite(v))return 5;return clamp(10-v/10)}
