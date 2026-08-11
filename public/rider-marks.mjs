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
  const branches=Array.isArray(snapshot?.branches)?snapshot.branches:[];
  const familyMass=firstFamilyMass(snapshot,terminals);
  const familyRank=new Map([...familyMass.entries()].sort((a,b)=>b[1]-a[1]||a[0]-b[0]).map(([n],i)=>[n,i+1]));
  const markByNumber=new Map(marks.map(m=>[Number(m.number),m]));
  const warnings=[];
  const explanations=[];

  const mainBets=bets.filter(b=>b?.category==="MAIN");
  const highBets=bets.filter(b=>b?.category==="BUYABLE_HIGH");
  const mainHeadCounts=countByPosition(mainBets,0);
  const highHeadCounts=countByPosition(highBets,0);
  const secondCounts=countByPosition(bets,1);
  const thirdCounts=countByPosition(bets,2);
  const mainTotal=mainBets.length||0;
  const highTotal=highBets.length||0;

  for(const m of marks){
    const n=Number(m.number);
    const headBets=bets.filter(b=>Number(b?.order?.[0])===n);
    const mainHead=mainHeadCounts.get(n)||0;
    const highHead=highHeadCounts.get(n)||0;
    const secondBetCount=secondCounts.get(n)||0;
    const thirdBetCount=thirdCounts.get(n)||0;

    if(m.overallMark==="◎" && familyRank.has(n) && familyRank.get(n)>2){
      warnings.push(warn(n,"OVERALL_MARK_FAMILY_MISMATCH","medium",
        `${n}番は総合印◎ですが、1着ファミリー確率は${familyRank.get(n)}位です。総合印→1着評価→展開の接続を確認。`));
    }

    // First-place mark is the primary purchase-head consistency check.
    if(m.firstMark==="◎" && mainHead===0){
      warnings.push(warn(n,"FIRST_MARK_NO_MAIN_HEAD","high",
        `${n}番は1着印◎ですが、本線の1着に1点もありません。1着評価→主展開→本線昇格の接続が切れていないか確認。`));
    }
    if(["◎","○"].includes(m.overallMark) && headBets.length===0){
      warnings.push(warn(n,"OVERALL_MARK_NO_HEAD_BET","medium",
        `${n}番は総合印${m.overallMark}ですが、${n}番頭の購入候補がありません。総合評価と購入採否の差に理由が必要です。`));
    }

    if(m.secondMark==="◎" && secondBetCount===0){
      warnings.push(warn(n,"SECOND_MARK_NO_SECOND_BET","high",
        `${n}番は2着印◎ですが、${n}番2着の購入終端がありません。1着成立後の2着再評価→購入採否を確認。`));
    }
    if(m.thirdMark==="◎" && thirdBetCount===0){
      warnings.push(warn(n,"THIRD_MARK_NO_THIRD_BET","high",
        `${n}番は3着印◎ですが、${n}番3着の購入終端がありません。1-2着成立後の3着再評価→購入採否を確認。`));
    }

    if(["△","×"].includes(m.firstMark) && highTotal>=3 && highHead>=3 && highHead/highTotal>=.60){
      warnings.push(warn(n,"LOW_FIRST_MARK_HIGH_HEAD_MONOPOLY","high",
        `${n}番は1着印${m.firstMark}ですが、買える高配当${highTotal}点中${highHead}点（${Math.round(highHead/highTotal*100)}%）が${n}番頭です。穴頭を残す根拠は必要ですが、高配当枠の独占は1着評価との接続説明が必要です。`));
    }

    if(m.overallMark==="×" && mainHead>0){
      warnings.push(warn(n,"LOW_OVERALL_MARK_MAIN_HEAD","high",
        `${n}番は総合印×ですが、本線の1着に${mainHead}点採用されています。主展開側の明示理由を確認。`));
    }

    if(mainHead>0){
      const mainShare=mainTotal?mainHead/mainTotal:0;
      const branchReasons=unique(headBets.filter(b=>b.category==="MAIN").map(b=>b.dominantBranchLabel||b.branchLabel).filter(Boolean));
      if(mainShare>=.60 && !["◎"].includes(m.firstMark)){
        const reasonText=branchReasons.length?` 主展開理由候補: ${branchReasons.slice(0,2).join(" / ")}。`:"";
        warnings.push(warn(n,"NON_TOP_FIRST_MARK_MAIN_DOMINANCE","medium",
          `${n}番は1着印${m.firstMark}ですが、本線${mainTotal}点中${mainHead}点（${Math.round(mainShare*100)}%）を占めています。${reasonText}印と本線がズレるなら、この展開理由を明示できる必要があります。`));
      }else if(branchReasons.length){
        explanations.push({number:n,type:"MAIN_HEAD_EXPLANATION",
          message:`${n}番頭の本線${mainHead}点は「${branchReasons.slice(0,2).join(" / ")}」由来。1着印${m.firstMark}とのズレがある場合はこの主展開根拠で説明します。`});
      }
    }
  }

  // Cross-rider inversion: 1着◎ has zero MAIN while another lower mark dominates MAIN.
  const firstAce=marks.find(m=>m.firstMark==="◎");
  if(firstAce && (mainHeadCounts.get(Number(firstAce.number))||0)===0 && mainTotal>0){
    const dominant=[...mainHeadCounts.entries()].sort((a,b)=>b[1]-a[1])[0];
    if(dominant){
      const dm=markByNumber.get(Number(dominant[0]));
      if(dm && Number(dominant[0])!==Number(firstAce.number)){
        warnings.push(warn(Number(firstAce.number),"FIRST_MARK_MAIN_HEAD_INVERSION","high",
          `1着印◎は${firstAce.number}番ですが、本線最多頭は${dominant[0]}番（1着印${dm.firstMark}、${dominant[1]}/${mainTotal}点）です。これは許容される場合もありますが、主展開が印順位を逆転させた直接根拠を必須表示にします。`));
      }
    }
  }

  const provenanceAudit=auditMarkScenarioBetProvenance({snapshot,marks,terminals,bets,branches});
  warnings.push(...provenanceAudit.warnings);
  explanations.push(...provenanceAudit.explanations);

  const summary={
    mainHeadCounts:Object.fromEntries(mainHeadCounts),
    highHeadCounts:Object.fromEntries(highHeadCounts),
    secondCounts:Object.fromEntries(secondCounts),
    thirdCounts:Object.fromEntries(thirdCounts),
    mainTotal,highTotal,
    tracedBetCount:provenanceAudit.rows.length,
    missingTerminalTraceCount:provenanceAudit.rows.filter(r=>!r.terminalMatched).length,
    missingBranchTraceCount:provenanceAudit.rows.filter(r=>!r.branchIds.length).length
  };
  return{
    version:"RIDER-MARK-SCENARIO-BET-CONSISTENCY-v3",
    status:warnings.some(w=>w.severity==="high")?"WARN":warnings.length?"CHECK":"OK",
    warnings,
    explanations,
    warningCount:warnings.length,
    familyRank:Object.fromEntries(familyRank),
    provenanceAudit,
    summary
  };
}

function auditMarkScenarioBetProvenance({marks,terminals,bets,branches}){
  const markByNumber=new Map((marks||[]).map(m=>[Number(m.number),m]));
  const branchById=new Map((branches||[]).map(b=>[String(b?.id||b?.branchId||""),b]).filter(([id])=>id));
  const terminalByOrder=new Map();
  for(const t of terminals||[]){
    const key=orderKey(t?.order);
    if(!key)continue;
    if(!terminalByOrder.has(key))terminalByOrder.set(key,[]);
    terminalByOrder.get(key).push(t);
  }
  const warnings=[],explanations=[],rows=[];
  for(const bet of bets||[]){
    const order=(bet?.order||[]).map(Number);
    const key=orderKey(order);
    if(!key)continue;
    const matches=terminalByOrder.get(key)||[];
    const terminal=matches.slice().sort((a,b)=>(Number(b?.probability)||0)-(Number(a?.probability)||0))[0]||null;
    const contributionIds=(Array.isArray(terminal?.branchContributions)?terminal.branchContributions:[])
      .map(c=>String(c?.branchId||"")).filter(Boolean);
    const explicitIds=[bet?.dominantBranchId,bet?.branchId,terminal?.dominantBranchId,terminal?.branchId,...(terminal?.chatSupportingBranchIds||[]),...contributionIds]
      .map(x=>String(x||"")).filter(Boolean);
    const branchIds=unique(explicitIds);
    const branchLabels=unique([bet?.dominantBranchLabel,bet?.branchLabel,terminal?.dominantBranchLabel,terminal?.branchLabel,...branchIds.map(id=>branchById.get(id)?.label)].filter(Boolean));
    const head=Number(order[0]),second=Number(order[1]),third=Number(order[2]);
    const hm=markByNumber.get(head)||{},sm=markByNumber.get(second)||{},tm=markByNumber.get(third)||{};
    const row={
      order:key,category:bet?.category||"UNCLASSIFIED",terminalMatched:Boolean(terminal),
      terminalProbability:finite(terminal?.probability)?Number(terminal.probability):null,
      branchIds,branchLabels,
      firstMark:hm.firstMark||"？",secondMark:sm.secondMark||"？",thirdMark:tm.thirdMark||"？",
      classificationReason:bet?.classificationReason||bet?.purchaseReason||bet?.reason||null
    };
    rows.push(row);
    if(!terminal){
      warnings.push({type:"BET_WITHOUT_GENERATED_TERMINAL",severity:"high",order:key,message:`${key} は購入候補ですが、同一着順の生成終端が見つかりません。印→展開→終端→買い目の順序を確認。`});
      continue;
    }
    if(!branchIds.length){
      warnings.push({type:"BET_WITHOUT_BRANCH_PROVENANCE",severity:"high",order:key,message:`${key} は終端まで存在しますが、由来する展開枝IDを追跡できません。買い目分類前に branch provenance を保持する必要があります。`});
    }
    if(bet?.category==="MAIN" && ["△","×","？"].includes(hm.firstMark) && !branchLabels.length && !row.classificationReason){
      warnings.push({type:"MAIN_HEAD_MARK_REVERSAL_WITHOUT_REASON",severity:"high",number:head,order:key,message:`${key} は本線ですが、${head}番の1着印は${hm.firstMark}です。印順位を展開が逆転させた直接理由が記録されていません。`});
    }
    if(bet?.category==="MAIN" && ["△","×","？"].includes(sm.secondMark) && !branchLabels.length && !row.classificationReason){
      warnings.push({type:"MAIN_SECOND_MARK_REVERSAL_WITHOUT_REASON",severity:"medium",number:second,order:key,message:`${key} は本線ですが、${second}番の2着印は${sm.secondMark}です。2着再評価から本線採用へ進んだ根拠が必要です。`});
    }
    if(bet?.category==="MAIN" && ["△","×","？"].includes(tm.thirdMark) && !branchLabels.length && !row.classificationReason){
      warnings.push({type:"MAIN_THIRD_MARK_REVERSAL_WITHOUT_REASON",severity:"medium",number:third,order:key,message:`${key} は本線ですが、${third}番の3着印は${tm.thirdMark}です。3着再評価から本線採用へ進んだ根拠が必要です。`});
    }
    if(branchIds.length){
      explanations.push({type:"BET_PROVENANCE_TRACE",order,message:`${key} [${bet?.category||"未分類"}] → 終端 ${key} → 枝 ${branchLabels.length?branchLabels.join(" / "):branchIds.join(" / ")}。印は 1着${hm.firstMark||"？"} / 2着${sm.secondMark||"？"} / 3着${tm.thirdMark||"？"}。`});
    }
  }
  return{
    version:"MARK-SCENARIO-BET-PROVENANCE-v1",
    passed:!warnings.some(w=>w.severity==="high"),
    rows,warnings,explanations,
    tracedBetCount:rows.length,
    terminalMatchedCount:rows.filter(r=>r.terminalMatched).length,
    branchTracedCount:rows.filter(r=>r.branchIds.length).length
  };
}

function orderKey(order){
  const a=(Array.isArray(order)?order:[]).map(Number);
  return a.length===3&&a.every(Number.isFinite)?a.join("-"):"";
}

function countByPosition(rows,index){
  const map=new Map();
  for(const row of rows){
    const n=Number(row?.order?.[index]);
    if(Number.isFinite(n))map.set(n,(map.get(n)||0)+1);
  }
  return map;
}
function unique(rows){return [...new Set(rows)]}
function warn(number,type,severity,message){return{number,type,severity,message}}

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
