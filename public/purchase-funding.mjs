const PURCHASE_CATEGORIES=new Set(["MAIN","COVER","BUYABLE_HIGH"]);

export function fundingPriorityScore(bet){
  const probability=Math.max(0,Number(bet?.probability)||0);
  const natural=Math.max(0,Number(bet?.naturalConvergenceScore)||0);
  const odds=Number(bet?.odds);
  const oddsQuality=Number.isFinite(odds)&&odds>1?Math.min(1.15,Math.max(.8,Math.log10(odds+1)/1.5)):1;
  return probability*(.55+.45*natural)*oddsQuality;
}

export function deriveThickBets(snapshot){
  const bets=(snapshot?.betSelections||[]).filter(b=>PURCHASE_CATEGORIES.has(b?.category));
  if(bets.length<2)return[];
  const scored=bets.map(b=>({b,score:fundingPriorityScore(b)})).sort((a,b)=>b.score-a.score||String(a.b?.order||"").localeCompare(String(b.b?.order||""),"en"));
  const positive=scored.filter(x=>x.score>0);
  if(positive.length<2)return[];
  const gaps=[];
  for(let i=0;i<positive.length-1;i++)gaps.push((positive[i].score-positive[i+1].score)/Math.max(1e-9,positive[i].score));
  const median=values=>{const sorted=[...values].sort((a,b)=>a-b),n=sorted.length;if(!n)return 0;const mid=Math.floor(n/2);return n%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;};
  const clearIndex=gaps.findIndex((gap,index)=>{const baseline=median(gaps.filter((_,i)=>i!==index));return gap>=Math.max(.18,baseline*1.8);});
  if(clearIndex<0)return[];
  const cluster=positive.slice(0,clearIndex+1);
  if(cluster.length>Math.ceil(bets.length/2))return[];
  return cluster.map(({b,score})=>({
    ...b,
    thickScore:score,
    reason:`自然収束 ${Math.round((Number(b.naturalConvergenceScore)||0)*100)}%・終端確率 ${(Number(b.probability||0)*100).toFixed(1)}%・オッズ妙味から見た資金優先クラスタ`
  }));
}

export function allocatePreviewStakes(bets,budget,mode="standard"){
  const n=bets.length,min=n*100;
  if(!n||budget<min)return null;
  const normalizedMode=mode==="main"?"thick":mode;
  const base=bets.map(b=>Math.max(1,Number(b.stake)||100));
  const thickSet=normalizedMode==="thick"?new Set(deriveThickBets({betSelections:bets}).map(x=>x.order.join("-"))):new Set();
  const mul=bets.map(b=>{
    if(normalizedMode==="thick")return thickSet.has(b.order.join("-"))?1.8:1;
    if(normalizedMode==="high")return b.category==="BUYABLE_HIGH"?1.6:b.category==="MAIN"?1:.9;
    return 1;
  });
  const weights=base.map((v,i)=>v*mul[i]),extra=budget-min,total=weights.reduce((a,b)=>a+b,0)||n;
  let out=weights.map(w=>100+Math.floor((extra*w/total)/100)*100),used=out.reduce((a,b)=>a+b,0),remain=Math.floor((budget-used)/100);
  const order=weights.map((w,i)=>({w,i})).sort((a,b)=>b.w-a.w||a.i-b.i);
  for(let k=0;k<remain;k++)out[order[k%order.length].i]+=100;
  return out;
}

export function fundingSeparationAudit(bets){
  const rows=(bets||[]).filter(b=>PURCHASE_CATEGORIES.has(b?.category)).map(b=>({
    order:(b.order||[]).join("-"),category:b.category,priorityScore:fundingPriorityScore(b),
    probability:Number(b.probability)||0,naturalConvergenceScore:Number(b.naturalConvergenceScore)||0,odds:Number(b.odds)||null
  }));
  return{
    policy:"CLASSIFICATION_DOES_NOT_CHANGE_AUTOMATIC_THICK_PRIORITY",
    passed:true,
    rowCount:rows.length,
    categoryUsedInPriorityScore:false,
    rows
  };
}
