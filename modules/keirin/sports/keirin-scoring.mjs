const clamp=(v,min=0,max=10)=>Math.min(max,Math.max(min,v));
const finite=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v));
const valueOrNull=v=>finite(v)?clamp(Number(v)):null;

export function scoreKeirinParticipants({race,venueProfile={}}){
  return race.participants.map(p=>{
    const recent=valueOrNull(p.recentForm),start=valueOrNull(p.startPower),sprint=valueOrNull(p.sprintPower),tracking=valueOrNull(p.trackingSkill),finish=valueOrNull(p.finishPower);
    const stamina=valueOrNull(p.stamina),timing=valueOrNull(p.attackTiming),lineTrust=valueOrNull(p.lineTrust),venue=valueOrNull(p.venueSuitability);

    const role=normalizeRole(p);
    const rolePrior=rolePriors(role);
    const evidence={recent,start,sprint,stamina,timing,tracking,finish,lineTrust,venue};

    // Rider Evaluation v2:
    // 1着 / 2着 / 3着 are built independently from mechanism-specific abilities.
    // Missing inputs are excluded and remaining verified weights are renormalized.
    const firstMechanisms={
      escape:scoreMechanism([
        item("startPower",start,.27),item("stamina",stamina,.21),item("recentForm",recent,.17),
        item("attackTiming",timing,.14),item("sprintPower",sprint,.09),item("finishPower",finish,.05),
        item("venueSuitability",venue,.03),item("rolePrior",rolePrior.firstEscape,.04)
      ]),
      makuri:scoreMechanism([
        item("sprintPower",sprint,.28),item("attackTiming",timing,.18),item("recentForm",recent,.16),
        item("finishPower",finish,.14),item("startPower",start,.08),item("stamina",stamina,.07),
        item("venueSuitability",venue,.04),item("rolePrior",rolePrior.firstMakuri,.05)
      ]),
      sashi:scoreMechanism([
        item("finishPower",finish,.27),item("trackingSkill",tracking,.20),item("recentForm",recent,.16),
        item("attackTiming",timing,.12),item("lineTrust",lineTrust,.09),item("stamina",stamina,.05),
        item("venueSuitability",venue,.04),item("rolePrior",rolePrior.firstSashi,.07)
      ]),
      banteSashi:scoreMechanism([
        item("finishPower",finish,.25),item("trackingSkill",tracking,.22),item("lineTrust",lineTrust,.13),
        item("recentForm",recent,.14),item("attackTiming",timing,.10),item("stamina",stamina,.05),
        item("venueSuitability",venue,.04),item("rolePrior",rolePrior.firstBante,.07)
      ])
    };

    const secondMechanisms={
      leaderRemain:scoreMechanism([
        item("stamina",stamina,.23),item("recentForm",recent,.18),item("startPower",start,.15),
        item("finishPower",finish,.12),item("sprintPower",sprint,.09),item("attackTiming",timing,.07),
        item("venueSuitability",venue,.04),item("rolePrior",rolePrior.secondLeader,.12)
      ]),
      lineFollower:scoreMechanism([
        item("trackingSkill",tracking,.28),item("finishPower",finish,.19),item("lineTrust",lineTrust,.15),
        item("recentForm",recent,.15),item("stamina",stamina,.07),item("attackTiming",timing,.05),
        item("venueSuitability",venue,.03),item("rolePrior",rolePrior.secondFollower,.08)
      ]),
      otherLineRemain:scoreMechanism([
        item("recentForm",recent,.20),item("finishPower",finish,.18),item("trackingSkill",tracking,.17),
        item("sprintPower",sprint,.14),item("stamina",stamina,.10),item("attackTiming",timing,.07),
        item("venueSuitability",venue,.04),item("rolePrior",rolePrior.secondOther,.10)
      ])
    };

    const thirdMechanisms={
      lineThird:scoreMechanism([
        item("trackingSkill",tracking,.29),item("lineTrust",lineTrust,.17),item("recentForm",recent,.14),
        item("finishPower",finish,.12),item("stamina",stamina,.08),item("venueSuitability",venue,.04),
        item("rolePrior",rolePrior.thirdLine,.16)
      ]),
      positionRemain:scoreMechanism([
        item("trackingSkill",tracking,.23),item("recentForm",recent,.17),item("finishPower",finish,.15),
        item("stamina",stamina,.11),item("lineTrust",lineTrust,.09),item("sprintPower",sprint,.07),
        item("venueSuitability",venue,.04),item("rolePrior",rolePrior.thirdPosition,.14)
      ]),
      otherLineRemain:scoreMechanism([
        item("recentForm",recent,.19),item("trackingSkill",tracking,.19),item("finishPower",finish,.15),
        item("sprintPower",sprint,.12),item("stamina",stamina,.10),item("attackTiming",timing,.06),
        item("venueSuitability",venue,.04),item("rolePrior",rolePrior.thirdOther,.15)
      ])
    };

    const placement=derivePlacementScores({role,firstMechanisms,secondMechanisms,thirdMechanisms});
    const roleScores={
      first:clamp(placement.first.score),
      second:clamp(placement.second.score),
      third:clamp(placement.third.score),
      outside:clamp(10-Math.max(placement.first.score,placement.second.score,placement.third.score))
    };

    const coreKimarite=[["sprintPower",sprint],["finishPower",finish],["trackingSkill",tracking]];
    const missingCoreAbilities=coreKimarite.filter(([,v])=>v===null).map(([k])=>k);
    const extendedInputs=[["sprintPower",sprint],["finishPower",finish],["trackingSkill",tracking],["stamina",stamina],["attackTiming",timing],["lineTrust",lineTrust]];
    const missingAbilities=extendedInputs.filter(([,v])=>v===null).map(([k])=>k);
    const availableCore=extendedInputs.length-missingAbilities.length;
    const evaluationConfidence=availableCore>=5?"high":availableCore>=3?"medium":"low";

    const riderEvaluationV2={
      version:"RIDER-EVAL-2.0",
      role,
      firstMechanisms:mapScores(firstMechanisms),
      secondMechanisms:mapScores(secondMechanisms),
      thirdMechanisms:mapScores(thirdMechanisms),
      placementScores:{
        first:roleScores.first,second:roleScores.second,third:roleScores.third
      },
      selectedMechanisms:{
        first:placement.first.mechanisms,
        second:placement.second.mechanisms,
        third:placement.third.mechanisms
      },
      reasons:{
        first:placement.first.reasons,
        second:placement.second.reasons,
        third:placement.third.reasons
      },
      confidence:evaluationConfidence,
      missingAbilities
    };

    return {
      ...p,
      roleScores,
      scoreTrace:{
        first:aggregateTrace(placement.first.trace),
        second:aggregateTrace(placement.second.trace),
        third:aggregateTrace(placement.third.trace)
      },
      riderEvaluationV2,
      abilityMissingAudit:{
        missingAbilities:missingCoreAbilities,
        missingCount:missingCoreAbilities.length,
        evaluationConfidence,
        kimariteEvidenceConfidence:p?.kimariteAbilityEvidence?.confidence||null
      },
      evidence
    };
  });
}

function normalizeRole(p){
  const raw=String(p?.role||"").trim();
  if(["自力","番手","三番手","単騎"].includes(raw))return raw;
  const pos=Number(p?.lineOrder??p?.linePosition);
  if(Number.isFinite(pos)){
    if(pos===1)return"自力";
    if(pos===2)return"番手";
    if(pos>=3)return"三番手";
  }
  return p?.lineId?"自力":"単騎";
}

function rolePriors(role){
  const table={
    自力:{
      firstEscape:8.6,firstMakuri:8.5,firstSashi:5.8,firstBante:4.8,
      secondLeader:7.7,secondFollower:5.1,secondOther:6.6,
      thirdLine:5.4,thirdPosition:6.7,thirdOther:6.6
    },
    番手:{
      firstEscape:4.8,firstMakuri:5.8,firstSashi:7.9,firstBante:8.5,
      secondLeader:5.4,secondFollower:8.7,secondOther:7.1,
      thirdLine:7.8,thirdPosition:8.0,thirdOther:7.2
    },
    三番手:{
      firstEscape:3.8,firstMakuri:4.7,firstSashi:6.1,firstBante:5.3,
      secondLeader:4.7,secondFollower:7.0,secondOther:6.6,
      thirdLine:8.7,thirdPosition:8.5,thirdOther:7.4
    },
    単騎:{
      firstEscape:5.6,firstMakuri:6.8,firstSashi:6.3,firstBante:4.5,
      secondLeader:5.8,secondFollower:5.5,secondOther:6.6,
      thirdLine:5.8,thirdPosition:6.9,thirdOther:7.0
    }
  };
  return table[role]||table.単騎;
}

function derivePlacementScores({role,firstMechanisms,secondMechanisms,thirdMechanisms}){
  const firstChoice=role==="自力"
    ?blend([["逃げ",firstMechanisms.escape,.48],["捲り",firstMechanisms.makuri,.44],["差し",firstMechanisms.sashi,.08]])
    :role==="番手"
      ?blend([["番手差し",firstMechanisms.banteSashi,.62],["差し",firstMechanisms.sashi,.28],["捲り",firstMechanisms.makuri,.10]])
      :role==="三番手"
        ?blend([["差し",firstMechanisms.sashi,.58],["捲り",firstMechanisms.makuri,.27],["番手差し",firstMechanisms.banteSashi,.15]])
        :blend([["捲り",firstMechanisms.makuri,.52],["差し",firstMechanisms.sashi,.34],["逃げ",firstMechanisms.escape,.14]]);

  const secondChoice=role==="自力"
    ?blend([["先行残り",secondMechanisms.leaderRemain,.58],["別線残り",secondMechanisms.otherLineRemain,.42]])
    :role==="番手"
      ?blend([["追走残り",secondMechanisms.lineFollower,.72],["別線残り",secondMechanisms.otherLineRemain,.28]])
      :role==="三番手"
        ?blend([["追走残り",secondMechanisms.lineFollower,.63],["別線残り",secondMechanisms.otherLineRemain,.37]])
        :blend([["別線残り",secondMechanisms.otherLineRemain,.72],["先行残り",secondMechanisms.leaderRemain,.28]]);

  const thirdChoice=role==="三番手"
    ?blend([["ライン3番手残り",thirdMechanisms.lineThird,.62],["位置残り",thirdMechanisms.positionRemain,.28],["別線残り",thirdMechanisms.otherLineRemain,.10]])
    :role==="番手"
      ?blend([["位置残り",thirdMechanisms.positionRemain,.54],["ライン残り",thirdMechanisms.lineThird,.28],["別線残り",thirdMechanisms.otherLineRemain,.18]])
      :role==="自力"
        ?blend([["位置残り",thirdMechanisms.positionRemain,.55],["別線残り",thirdMechanisms.otherLineRemain,.45]])
        :blend([["別線残り",thirdMechanisms.otherLineRemain,.60],["位置残り",thirdMechanisms.positionRemain,.40]]);

  return{first:firstChoice,second:secondChoice,third:thirdChoice};
}

function blend(entries){
  const valid=entries.filter(([,m,w])=>m&&finite(m.score)&&w>0);
  const total=valid.reduce((s,[,,w])=>s+w,0);
  const score=total?valid.reduce((s,[,m,w])=>s+Number(m.score)*w,0)/total:5;
  const mechanisms=valid.map(([name,m,w])=>({name,score:Number(m.score),weight:w/total}));
  const reasons=mechanisms
    .sort((a,b)=>b.weight-a.weight||b.score-a.score)
    .slice(0,3)
    .map(x=>`${x.name} ${x.score.toFixed(2)}×${Math.round(x.weight*100)}%`);
  const trace=valid.flatMap(([name,m,w])=>(m.trace||[]).map(t=>({
    ...t,
    mechanism:name,
    mechanismWeight:w/total,
    effectiveWeight:(t.effectiveWeight||0)*(w/total),
    contribution:(t.contribution||0)*(w/total)
  }))).sort((a,b)=>b.contribution-a.contribution);
  return{score,mechanisms,reasons,trace};
}

function item(key,value,weight){return{key,value,weight,available:finite(value)}}
function scoreMechanism(items){
  const available=items.filter(x=>x.available&&x.weight>0);
  const total=available.reduce((s,x)=>s+x.weight,0);
  const score=total>0?available.reduce((s,x)=>s+Number(x.value)*x.weight,0)/total:5;
  return{
    score:clamp(score),
    trace:items.map(x=>({
      key:x.key,value:x.available?Number(x.value):null,weight:x.weight,
      effectiveWeight:x.available&&total>0?x.weight/total:0,
      contribution:x.available&&total>0?Number(x.value)*(x.weight/total):0,
      missing:!x.available
    })).sort((a,b)=>b.contribution-a.contribution||a.key.localeCompare(b.key,"en"))
  };
}
function aggregateTrace(rows){
  const byKey=new Map();
  for(const row of rows||[]){
    const key=row.key;
    const cur=byKey.get(key)||{key,value:row.value??null,weight:0,effectiveWeight:0,contribution:0,missing:true};
    cur.weight+=Number(row.weight||0)*Number(row.mechanismWeight||1);
    cur.effectiveWeight+=Number(row.effectiveWeight||0);
    cur.contribution+=Number(row.contribution||0);
    if(row.missing===false){cur.missing=false;cur.value=row.value}
    byKey.set(key,cur);
  }
  return [...byKey.values()].sort((a,b)=>b.contribution-a.contribution||a.key.localeCompare(b.key,"en"));
}
function mapScores(object){return Object.fromEntries(Object.entries(object).map(([k,v])=>[k,v.score]))}
