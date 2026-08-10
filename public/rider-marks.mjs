const finite=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v));

export function deriveRiderMarks(snapshot){
  const abilities=Array.isArray(snapshot?.abilitiesUsed)?snapshot.abilitiesUsed:[];
  if(!abilities.length)return [];
  const rows=abilities.map(a=>({
    number:Number(a.number),
    first:finite(a?.roleScores?.first)?Number(a.roleScores.first):null,
    second:finite(a?.roleScores?.second)?Number(a.roleScores.second):null,
    third:finite(a?.roleScores?.third)?Number(a.roleScores.third):null,
    startPower:finite(a?.startPower)?Number(a.startPower):null,
    confidence:deriveConfidence(a)
  }));

  const firstMarks=marksFor(rows,"first");
  const secondMarks=marksFor(rows,"second");
  const thirdMarks=marksFor(rows,"third");

  const context=deriveRaceContext(snapshot,rows);
  const ranked=rows.map(r=>({
    ...r,
    overallScore:deriveOverallPredictionScore(r,context)
  })).sort((a,b)=>(b.overallScore??-Infinity)-(a.overallScore??-Infinity)||a.number-b.number);

  const overallMap=assignOverallMarks(ranked,context);

  return rows.map(r=>({
      number:r.number,
      overallScore:context.overallScores.get(r.number)??null,
      overallMark:overallMap.get(r.number)||"？",
      firstScore:r.first,firstMark:firstMarks.get(r.number)||"？",
      secondScore:r.second,secondMark:secondMarks.get(r.number)||"？",
      thirdScore:r.third,thirdMark:thirdMarks.get(r.number)||"？",
      confidence:r.confidence,
      overallReasons:context.reasons.get(r.number)||[]
    }))
    .sort((a,b)=>a.number-b.number);
}

export function auditRiderMarkConsistency(snapshot, marks=deriveRiderMarks(snapshot)){
  const terminals=Array.isArray(snapshot?.terminalLedger)?snapshot.terminalLedger:[];
  const bets=Array.isArray(snapshot?.betSelections)?snapshot.betSelections:[];
  const familyMass=firstFamilyMass(snapshot,terminals);
  const familyRank=new Map([...familyMass.entries()].sort((a,b)=>b[1]-a[1]||a[0]-b[0]).map(([n],i)=>[n,i+1]));
  const warnings=[];
  for(const m of marks){
    const n=m.number;
    const headBets=bets.filter(b=>Number(b?.order?.[0])===n);
    const thirdBets=bets.filter(b=>Number(b?.order?.[2])===n);
    const mainHead=headBets.filter(b=>b?.category==="MAIN").length;
    if(m.overallMark==="◎" && familyRank.has(n) && familyRank.get(n)>2){
      warnings.push({number:n,type:"OVERALL_MARK_FAMILY_MISMATCH",message:`${n}番は総合印◎ですが、1着ファミリー確率は${familyRank.get(n)}位です。総合印→中心予測の接続を確認。`});
    }
    if(["◎","○"].includes(m.overallMark) && headBets.length===0){
      warnings.push({number:n,type:"OVERALL_MARK_NO_HEAD_BET",message:`${n}番は総合印${m.overallMark}ですが、${n}番頭の購入候補がありません。中心予測→購入採否を確認。`});
    }
    if(m.thirdMark==="◎" && thirdBets.length===0){
      warnings.push({number:n,type:"THIRD_MARK_NO_THIRD_BET",message:`${n}番は3着印◎ですが、${n}番3着の購入候補がありません。3着評価→購入採否を確認。`});
    }
    if(m.overallMark==="×" && mainHead>0){
      warnings.push({number:n,type:"LOW_OVERALL_MARK_MAIN_HEAD",message:`${n}番は総合印×ですが、本線の1着に${mainHead}点採用されています。分類根拠を確認。`});
    }
  }
  return {warnings,warningCount:warnings.length,familyRank:Object.fromEntries(familyRank)};
}

function deriveRaceContext(snapshot,rows){
  const terminals=Array.isArray(snapshot?.terminalLedger)?snapshot.terminalLedger:[];
  const familyMass=firstFamilyMass(snapshot,terminals);
  const maxFamily=Math.max(0,...familyMass.values());
  const scenarioHeadBoost=deriveScenarioHeadBoost(snapshot);
  const linePosition=deriveLinePositionScores(snapshot);
  const overallScores=new Map();
  const reasons=new Map();

  for(const r of rows){
    const n=r.number;
    const parts=[];
    let sum=0,weight=0;
    const add=(label,val,w)=>{
      if(!finite(val)||w<=0)return;
      sum+=Number(val)*w; weight+=w; parts.push(`${label}${Number(val).toFixed(2)}`);
    };

    // Overall prediction mark is intentionally NOT a simple average.
    // Head ability and race-level center forecast carry the most weight.
    add("1着",r.first,0.34);
    add("2着",r.second,0.18);
    add("3着",r.third,0.12);
    add("主導権",r.startPower,0.12);

    const fam=maxFamily>0?(familyMass.get(n)||0)/maxFamily:null;
    if(fam!==null){ add("1着ファミリー",fam*10,0.14); }

    const sc=scenarioHeadBoost.get(n);
    if(finite(sc)) add("中心展開",Number(sc)*10,0.07);

    const lp=linePosition.get(n);
    if(finite(lp)) add("位置",Number(lp)*10,0.03);

    const score=weight>0?sum/weight:null;
    overallScores.set(n,score);
    reasons.set(n,parts);
  }
  return {familyMass,maxFamily,scenarioHeadBoost,linePosition,overallScores,reasons};
}

function deriveOverallPredictionScore(r,context){
  return context.overallScores.get(r.number)??null;
}

function assignOverallMarks(ranked,context){
  const valid=ranked.filter(r=>finite(r.overallScore));
  const map=new Map();
  if(!valid.length)return map;

  // Exactly one ◎ and one ○ whenever possible.
  map.set(valid[0].number,"◎");
  if(valid[1])map.set(valid[1].number,"○");

  const top=Number(valid[0].overallScore);
  const starCandidates=[];

  for(let i=2;i<valid.length;i++){
    const r=valid[i],score=Number(r.overallScore),gap=top-score;
    let mark="×";

    const firstUpside=finite(r.first)&&finite(valid[0].first) && Number(r.first)>=Number(valid[0].first)-1.55;
    const familyRelative=context.maxFamily>0?(context.familyMass.get(r.number)||0)/context.maxFamily:0;
    const scenarioBoost=context.scenarioHeadBoost.get(r.number)||0;
    const placeStrength=Math.max(Number(r.second)||0,Number(r.third)||0);

    // ▲ is reserved for realistic win-upside.
    if(firstUpside && gap<=1.55){
      mark="▲";
    }else if(placeStrength>=6.4 && gap<=2.65){
      mark="△";
    }else if(gap<=3.0){
      mark="△";
    }

    map.set(r.number,mark);

    // ☆ is NOT a fallback bucket. Candidate only when race-context uplift is explicit
    // and the rider would otherwise be △/×. Score uplift must be meaningfully stronger
    // than raw overall rank suggests.
    const contextStrength=Math.max(familyRelative,scenarioBoost);
    const rawAbility=(Number(r.first)||0)*0.5+(Number(r.second)||0)*0.3+(Number(r.third)||0)*0.2;
    const contextUplift=score-rawAbility;
    if(i>=2 && contextStrength>=0.52 && contextUplift>=0.55 && !firstUpside){
      starCandidates.push({number:r.number,contextStrength,contextUplift,score});
    }
  }

  // ☆ is rare: at most one rider, and only if clearly separated from other hole candidates.
  starCandidates.sort((a,b)=>
    b.contextStrength-a.contextStrength ||
    b.contextUplift-a.contextUplift ||
    b.score-a.score ||
    a.number-b.number
  );
  if(starCandidates.length){
    const best=starCandidates[0];
    const second=starCandidates[1];
    const clearlyDistinct=!second ||
      best.contextStrength-second.contextStrength>=0.12 ||
      best.contextUplift-second.contextUplift>=0.35;
    if(clearlyDistinct){
      map.set(best.number,"☆");
    }
  }

  return map;
}

function firstFamilyMass(snapshot,terminals){
  const direct=Array.isArray(snapshot?.firstFamilies)?snapshot.firstFamilies:[];
  const map=new Map();
  for(const f of direct){
    const n=Number(f?.first??f?.number);
    const p=Number(f?.probability??f?.totalProbability??f?.mass);
    if(Number.isFinite(n)&&Number.isFinite(p))map.set(n,p);
  }
  if(map.size)return map;
  for(const t of terminals){
    const first=Number(t?.order?.[0]),p=Number(t?.probability);
    if(Number.isFinite(first)&&Number.isFinite(p))map.set(first,(map.get(first)||0)+p);
  }
  return map;
}

function deriveScenarioHeadBoost(snapshot){
  const map=new Map();
  const scenarios=Array.isArray(snapshot?.scenarios)?snapshot.scenarios:
                  Array.isArray(snapshot?.scenarioBranches)?snapshot.scenarioBranches:[];
  for(const s of scenarios){
    const head=Number(s?.first??s?.head??s?.winner??s?.order?.[0]);
    if(!Number.isFinite(head))continue;
    const role=String(s?.forecastRole??s?.role??s?.forecastTier??s?.tier??"").toLowerCase();
    const prob=Number(s?.probability??s?.score??s?.weight);
    let boost=Number.isFinite(prob)?Math.max(0,Math.min(1,prob)):0;
    if(role.includes("center")||role.includes("main")||role.includes("中心"))boost=Math.max(boost,.9);
    else if(role.includes("contender")||role.includes("有力"))boost=Math.max(boost,.65);
    else if(role.includes("possible")||role.includes("可能"))boost=Math.max(boost,.35);
    map.set(head,Math.max(map.get(head)||0,boost));
  }
  return map;
}

function deriveLinePositionScores(snapshot){
  const map=new Map();
  const lines=Array.isArray(snapshot?.lineModel)?snapshot.lineModel:
              Array.isArray(snapshot?.lines)?snapshot.lines:[];
  for(const line of lines){
    const members=Array.isArray(line?.members)?line.members:
                  Array.isArray(line)?line:[];
    members.forEach((m,i)=>{
      const n=Number(m?.number??m);
      if(!Number.isFinite(n))return;
      const pos=String(m?.position??m?.role??"").toLowerCase();
      let v= i===0?.65:i===1?.8:i===2?.7:.45;
      if(pos.includes("番手"))v=.85;
      if(pos.includes("3番手")||pos.includes("三番手"))v=.72;
      if(pos.includes("先頭")||pos.includes("自力"))v=.68;
      if(pos.includes("単騎"))v=.5;
      map.set(n,Math.max(map.get(n)||0,v));
    });
  }
  return map;
}

function marksFor(rows,key){
  const valid=rows.filter(r=>finite(r[key])).sort((a,b)=>Number(b[key])-Number(a[key])||a.number-b.number);
  const map=new Map();
  if(!valid.length)return map;
  const top=Number(valid[0][key]);
  for(let i=0;i<valid.length;i++){
    const v=Number(valid[i][key]),gap=top-v;
    let mark="×";
    if(i===0)mark="◎";
    else if(gap<=0.55)mark="○";
    else if(gap<=1.15)mark="▲";
    else if(gap<=2.0)mark="△";
    map.set(valid[i].number,mark);
  }
  return map;
}

function deriveConfidence(a){
  const miss=Number(a?.abilityMissingAudit?.missingCount);
  if(Number.isFinite(miss)){
    if(miss>=3)return"低";
    if(miss>=1)return"中";
    return"高";
  }
  return"不明";
}
