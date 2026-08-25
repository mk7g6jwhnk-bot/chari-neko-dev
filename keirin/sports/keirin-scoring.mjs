const clamp=(v,min=0,max=10)=>Math.min(max,Math.max(min,Number(v)));

function evidenceAvailable(p,key){
  if(key==="recentForm") return p?.recentFormEvidence?.selectedMetric!=null && p?.recentFormEvidence?.confidence!=="low";
  if(key==="startPower") return p?.startPowerEvidence?.usable===true && Number.isFinite(Number(p?.startPower));
  if(["sprintPower","finishPower","trackingSkill"].includes(key)){
    return p?.kimariteAbilityEvidence?.adopted===true && Number.isFinite(Number(p?.[key]));
  }
  return Number.isFinite(Number(p?.[key]));
}

function weightedAvailable(items){
  const available=items.filter(item=>evidenceAvailable(item.participant,item.key));
  const total=available.reduce((sum,item)=>sum+item.weight,0);
  if(total<=0)return 0;
  return available.reduce((sum,item)=>sum+Number(item.participant[item.key])*item.weight,0)/total;
}

function roleScore(p, target, roleValue, weights){
  const items=[
    {key:"recentForm",weight:weights.recent},
    {key:"sprintPower",weight:weights.sprint},
    {key:"finishPower",weight:weights.finish},
    {key:"startPower",weight:weights.start},
    {key:"trackingSkill",weight:weights.tracking},
  ];
  const dynamic=weightedAvailable(items.map(item=>({ ...item, participant:p })));
  const availableRole=Number.isFinite(Number(roleValue))?roleValue:5;
  const baseWeights=Object.values(weights).reduce((a,b)=>a+b,0);
  const roleWeight=weights.role;
  const evidenceWeight=baseWeights-roleWeight;
  const evidenceItems=items.filter(item=>evidenceAvailable(p,item.key));
  const evidenceWeightUsed=evidenceItems.reduce((sum,item)=>sum+item.weight,0);
  if(evidenceWeightUsed<=0)return clamp(availableRole);
  return clamp((dynamic*(evidenceWeightUsed)+availableRole*roleWeight)/(evidenceWeightUsed+roleWeight));
}

export function scoreKeirinParticipants({race,venueProfile={}}){
  return race.participants.map(p=>{
    const roleBonus={自力:{f:8.5,s:5.8,t:5.0},番手:{f:7.2,s:8.6,t:7.4},三番手:{f:4.6,s:6.4,t:8.4},単騎:{f:6.0,s:5.8,t:6.8}}[p.role]||{f:5,s:5,t:5};

    const first=roleScore(p,"first",roleBonus.f,{recent:.28,sprint:.20,finish:.15,start:.14,tracking:.08,role:.15});
    const second=roleScore(p,"second",roleBonus.s,{recent:.24,sprint:.10,finish:.18,start:.10,tracking:.22,role:.16});
    const third=roleScore(p,"third",roleBonus.t,{recent:.20,sprint:.08,finish:.14,start:.08,tracking:.30,role:.20});

    const roleScores={first:clamp(first),second:clamp(second),third:clamp(third),outside:clamp(10-Math.max(first,second,third))};

    return {
      ...p,
      roleScores,
      scoreTrace:{
        first:trace([
          {key:"recentForm",value:p.recentForm,weight:.28},
          {key:"sprintPower",value:p.sprintPower,weight:.20},
          {key:"finishPower",value:p.finishPower,weight:.15},
          {key:"startPower",value:p.startPower,weight:.14},
          {key:"trackingSkill",value:p.trackingSkill,weight:.08},
          {key:"role",value:roleBonus.f,weight:.15}
        ],p),
        second:trace([
          {key:"recentForm",value:p.recentForm,weight:.24},
          {key:"finishPower",value:p.finishPower,weight:.18},
          {key:"trackingSkill",value:p.trackingSkill,weight:.22},
          {key:"sprintPower",value:p.sprintPower,weight:.10},
          {key:"startPower",value:p.startPower,weight:.10},
          {key:"role",value:roleBonus.s,weight:.16}
        ],p),
        third:trace([
          {key:"recentForm",value:p.recentForm,weight:.20},
          {key:"finishPower",value:p.finishPower,weight:.14},
          {key:"trackingSkill",value:p.trackingSkill,weight:.30},
          {key:"sprintPower",value:p.sprintPower,weight:.08},
          {key:"startPower",value:p.startPower,weight:.08},
          {key:"role",value:roleBonus.t,weight:.20}
        ],p)
      },
      evidence:{
        recent:Number(p.recentForm),
        start:Number(p.startPower),
        sprint:Number(p.sprintPower),
        stamina:clamp(p.stamina??5),
        timing:clamp(p.attackTiming??5),
        tracking:Number(p.trackingSkill),
        finish:Number(p.finishPower),
        lineTrust:clamp(p.lineTrust??5),
        venue:clamp(p.venueSuitability??5)
      },
      precisionAudit:{
        availableAxes:["recentForm","startPower","sprintPower","finishPower","trackingSkill"]
          .filter(key=>evidenceAvailable(p,key)),
        unavailableAxes:["recentForm","startPower","sprintPower","finishPower","trackingSkill"]
          .filter(key=>!evidenceAvailable(p,key)),
        scoringMode:"EVIDENCE_WEIGHTED_RENORMALIZATION_V1"
      }
    };
  });
}

function trace(items,p){
  return items.map(item=>{
    const available=item.key==="role" || evidenceAvailable(p,item.key);
    return {
      ...item,
      available,
      contribution:available?Number(item.value)*item.weight:0
    };
  }).sort((a,b)=>b.contribution-a.contribution||a.key.localeCompare(b.key,"en"));
}
