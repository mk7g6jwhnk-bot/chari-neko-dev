const finite=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v));

export function deriveRiderMarks(snapshot){
  const abilities=Array.isArray(snapshot?.abilitiesUsed)?snapshot.abilitiesUsed:[];
  if(!abilities.length)return [];
  const rows=abilities.map(a=>({
    number:Number(a.number),
    first:finite(a?.roleScores?.first)?Number(a.roleScores.first):null,
    second:finite(a?.roleScores?.second)?Number(a.roleScores.second):null,
    third:finite(a?.roleScores?.third)?Number(a.roleScores.third):null,
    confidence:deriveConfidence(a)
  }));
  const firstMarks=marksFor(rows,"first"),secondMarks=marksFor(rows,"second"),thirdMarks=marksFor(rows,"third");
  return rows.map(r=>{
    const vals=[r.first,r.second,r.third].filter(finite);
    const overall=vals.length?vals.reduce((s,v)=>s+Number(v),0)/vals.length:null;
    return {
      number:r.number,
      overallScore:overall,
      overallMark:overall===null?"？":overallMark(overall, rows),
      firstScore:r.first,firstMark:firstMarks.get(r.number)||"？",
      secondScore:r.second,secondMark:secondMarks.get(r.number)||"？",
      thirdScore:r.third,thirdMark:thirdMarks.get(r.number)||"？",
      confidence:r.confidence
    };
  }).sort((a,b)=>a.number-b.number);
}

export function auditRiderMarkConsistency(snapshot, marks=deriveRiderMarks(snapshot)){
  const terminals=Array.isArray(snapshot?.terminalLedger)?snapshot.terminalLedger:[];
  const bets=Array.isArray(snapshot?.betSelections)?snapshot.betSelections:[];
  const familyMass=new Map();
  for(const t of terminals){
    const first=Number(t?.order?.[0]),p=Number(t?.probability);
    if(Number.isFinite(first)&&Number.isFinite(p))familyMass.set(first,(familyMass.get(first)||0)+p);
  }
  const familyRank=new Map([...familyMass.entries()].sort((a,b)=>b[1]-a[1]||a[0]-b[0]).map(([n],i)=>[n,i+1]));
  const warnings=[];
  for(const m of marks){
    const n=m.number;
    const headBets=bets.filter(b=>Number(b?.order?.[0])===n);
    const thirdBets=bets.filter(b=>Number(b?.order?.[2])===n);
    const mainHead=headBets.filter(b=>b?.category==="MAIN").length;
    if(m.firstMark==="◎" && familyRank.has(n) && familyRank.get(n)>2){
      warnings.push({number:n,type:"FIRST_MARK_FAMILY_MISMATCH",message:`${n}番は1着印◎ですが、1着ファミリー確率は${familyRank.get(n)}位です。1着評価→展開確率の接続を確認。`});
    }
    if(["◎","○"].includes(m.firstMark) && headBets.length===0){
      warnings.push({number:n,type:"FIRST_MARK_NO_HEAD_BET",message:`${n}番は1着印${m.firstMark}ですが、${n}番頭の購入候補がありません。購入採否を確認。`});
    }
    if(m.thirdMark==="◎" && thirdBets.length===0){
      warnings.push({number:n,type:"THIRD_MARK_NO_THIRD_BET",message:`${n}番は3着印◎ですが、${n}番3着の購入候補がありません。3着評価→購入採否を確認。`});
    }
    if(m.firstMark==="×" && mainHead>0){
      warnings.push({number:n,type:"LOW_FIRST_MARK_MAIN_HEAD",message:`${n}番は1着印×ですが、本線の1着に${mainHead}点採用されています。分類根拠を確認。`});
    }
  }
  return {warnings,warningCount:warnings.length,familyRank:Object.fromEntries(familyRank)};
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
function overallMark(score,rows){
  const vals=rows.map(r=>[r.first,r.second,r.third].filter(finite)).flat().map(Number);
  if(!vals.length)return"？";
  const max=Math.max(...vals);
  const gap=max-Number(score);
  if(gap<=0.7)return"◎";
  if(gap<=1.3)return"○";
  if(gap<=2.0)return"▲";
  if(gap<=2.8)return"△";
  return"×";
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
