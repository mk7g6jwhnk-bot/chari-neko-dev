const clamp=(v,min=0,max=10)=>Math.min(max,Math.max(min,v));
const finite=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v));
const valueOrNull=v=>finite(v)?clamp(Number(v)):null;

// Missing ability inputs are not treated as a neutral 5.  They are excluded from
// that placing calculation and the remaining verified weights are renormalized.
// This keeps "unknown" separate from "average" and prevents data gaps from
// suppressing a rider's 2nd/3rd-place role score.
export function scoreKeirinParticipants({race,venueProfile={}}){
  return race.participants.map(p=>{
    const recent=valueOrNull(p.recentForm),start=valueOrNull(p.startPower),sprint=valueOrNull(p.sprintPower),tracking=valueOrNull(p.trackingSkill),finish=valueOrNull(p.finishPower);
    const stamina=valueOrNull(p.stamina),timing=valueOrNull(p.attackTiming),lineTrust=valueOrNull(p.lineTrust),venue=valueOrNull(p.venueSuitability);
    const roleBonus={自力:{f:8.5,s:5.8,t:5.0},番手:{f:7.2,s:8.6,t:7.4},三番手:{f:4.6,s:6.4,t:8.4},単騎:{f:6.0,s:5.8,t:6.8}}[p.role]||{f:5,s:5,t:5};

    const firstItems=[item("recentForm",recent,.28),item("sprintPower",sprint,.20),item("finishPower",finish,.15),item("startPower",start,.14),item("trackingSkill",tracking,.08),item("role",roleBonus.f,.15)];
    const secondItems=[item("recentForm",recent,.24),item("finishPower",finish,.18),item("trackingSkill",tracking,.22),item("sprintPower",sprint,.10),item("startPower",start,.10),item("role",roleBonus.s,.16)];
    const thirdItems=[item("recentForm",recent,.20),item("finishPower",finish,.14),item("trackingSkill",tracking,.30),item("sprintPower",sprint,.08),item("startPower",start,.08),item("role",roleBonus.t,.20)];

    const first=weightedAvailable(firstItems),second=weightedAvailable(secondItems),third=weightedAvailable(thirdItems);
    const roleScores={first:clamp(first),second:clamp(second),third:clamp(third),outside:clamp(10-Math.max(first,second,third))};
    const missingAbilities=[['sprintPower',sprint],['finishPower',finish],['trackingSkill',tracking]].filter(([,v])=>v===null).map(([k])=>k);
    return {
      ...p,
      roleScores,
      scoreTrace:{first:trace(firstItems),second:trace(secondItems),third:trace(thirdItems)},
      abilityMissingAudit:{missingAbilities,missingCount:missingAbilities.length,kimariteEvidenceConfidence:p?.kimariteAbilityEvidence?.confidence||null},
      evidence:{recent,start,sprint,stamina,timing,tracking,finish,lineTrust,venue}
    };
  });
}

function item(key,value,weight){return{key,value,weight,available:finite(value)}}
function weightedAvailable(items){
  const available=items.filter(x=>x.available&&x.weight>0);
  const weight=available.reduce((s,x)=>s+x.weight,0);
  if(weight<=0)return 5;
  return available.reduce((s,x)=>s+Number(x.value)*x.weight,0)/weight;
}
function trace(items){
  const availableWeight=items.filter(x=>x.available).reduce((s,x)=>s+x.weight,0);
  return items.map(x=>({
    key:x.key,value:x.available?Number(x.value):null,weight:x.weight,
    effectiveWeight:x.available&&availableWeight>0?x.weight/availableWeight:0,
    contribution:x.available&&availableWeight>0?Number(x.value)*(x.weight/availableWeight):0,
    missing:!x.available
  })).sort((a,b)=>b.contribution-a.contribution||a.key.localeCompare(b.key,"en"));
}
