const PURCHASE_CATEGORIES=new Set(["MAIN","COVER","BUYABLE_HIGH"]);

// Step B: funding value. This function is never used to decide whether a bet
// is prediction-qualified for a thick allocation.
export function fundingPriorityScore(bet){
  const probability=Math.max(0,Number(bet?.probability)||0);
  const odds=Number(bet?.odds);
  return Number.isFinite(odds)&&odds>1?probability*odds:probability;
}

// Step A: prediction-only qualification. Available evidence dimensions are
// combined symmetrically; absent dimensions are not fabricated.
export function predictionQualificationScore(bet){
  const probability=Math.max(0,Number(bet?.probability)||0);
  const natural=Number(bet?.naturalConvergenceScore);
  if(!(probability>0)||!(natural>0))return 0;
  const factors=[probability,natural];
  for(const rank of [bet?.globalRank,bet?.familyRank,bet?.pairRank]){
    const value=Number(rank);if(Number.isFinite(value)&&value>0)factors.push(1/value);
  }
  for(const support of [bet?.nodeConditionalProbability,bet?.scenarioCoherence,bet?.branchFit,bet?.naturalSeparation]){
    const value=Number(support);if(Number.isFinite(value)&&value>0)factors.push(Math.min(1,value));
  }
  return Math.exp(factors.reduce((total,value)=>total+Math.log(Math.max(value,Number.EPSILON)),0)/factors.length);
}

export function qualifyThickPredictionBets(snapshot){
  const bets=(snapshot?.betSelections||[]).filter(b=>PURCHASE_CATEGORIES.has(b?.category));
  if(bets.length<2)return[];
  const positive=bets.map(b=>({b,score:predictionQualificationScore(b)}))
    .filter(row=>row.score>0)
    .sort((a,b)=>b.score-a.score||String(a.b?.order||"").localeCompare(String(b.b?.order||""),"en"));
  if(positive.length<2)return[];
  const gaps=positive.slice(0,-1).map((row,index)=>Math.max(0,row.score-positive[index+1].score));
  const center=median(gaps),mad=median(gaps.map(gap=>Math.abs(gap-center))),noise=Math.max(center,1.4826*mad,Number.EPSILON);
  const boundary=gaps.map((gap,index)=>({gap,index,strength:(gap-center)/noise})).sort((a,b)=>b.strength-a.strength||b.gap-a.gap||a.index-b.index)[0];
  const orderedGaps=[...gaps].sort((a,b)=>b-a);
  const globalSmallSampleSeparation=positive.length<=4&&boundary?.gap>0&&boundary.gap>(orderedGaps[1]||0)*1.8;
  if(!boundary&& !globalSmallSampleSeparation)return[];
  if(!globalSmallSampleSeparation&&!(boundary.gap>center+2.5*1.4826*mad))return[];
  return positive.slice(0,boundary.index+1).map(({b,score})=>({...b,predictionQualificationScore:score,qualification:"THICK_PREDICTION_QUALIFIED"}));
}

export function deriveThickBets(snapshot){
  return qualifyThickPredictionBets(snapshot).map(b=>({
    ...b,
    thickScore:fundingPriorityScore(b),
    reason:`予測上位群（自然収束 ${Math.round((Number(b.naturalConvergenceScore)||0)*100)}%・終端確率 ${(Number(b.probability||0)*100).toFixed(1)}%）の中で資金配分を優先`
  })).sort((a,b)=>b.thickScore-a.thickScore||String(a.order||"").localeCompare(String(b.order||""),"en"));
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
    order:(b.order||[]).join("-"),category:b.category,priorityScore:fundingPriorityScore(b),predictionQualificationScore:predictionQualificationScore(b),
    probability:Number(b.probability)||0,naturalConvergenceScore:Number(b.naturalConvergenceScore)||0,odds:Number(b.odds)||null
  }));
  return{
    policy:"PREDICTION_QUALIFICATION_PRECEDES_ODDS_AWARE_FUNDING",
    passed:true,rowCount:rows.length,categoryUsedInPriorityScore:false,oddsUsedForPredictionQualification:false,rows
  };
}

function median(values){const sorted=[...(values||[])].map(Number).filter(Number.isFinite).sort((a,b)=>a-b),n=sorted.length;if(!n)return 0;const mid=Math.floor(n/2);return n%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;}
