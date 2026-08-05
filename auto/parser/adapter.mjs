
export function adaptAutoOfficialData({programResult,trackName,date}){
  const r=programResult.race;
  return {
    race:{
      id:`${date}-${trackName}-${r.raceNo}`,
      venue:trackName,
      raceNo:r.raceNo,
      surface:r.surface,
      incidentRisk:3,
      deadline:r.deadline,
      weather:r.weather,
      participants:r.participants
    },
    trackProfile:{
      lineBias:inferLineBias(r),
      highSpeedPassingBias:inferPassingBias(r)
    },
    diagnostics:{
      source:"autorace.jp公式出走表",
      participantCount:r.participants.length,
      surface:r.surface
    }
  };
}

function inferLineBias(race){
  const inside=race.participants.reduce((s,p)=>s+(p.insideLineSkill||5),0);
  const outside=race.participants.reduce((s,p)=>s+(p.outsideLineSkill||5),0);
  if(inside-outside>=4)return"inside";
  if(outside-inside>=4)return"outside";
  return"neutral";
}
function inferPassingBias(race){
  const avg=race.participants.reduce((s,p)=>s+(p.passingSkill||5),0)/race.participants.length;
  return avg>=7;
}
