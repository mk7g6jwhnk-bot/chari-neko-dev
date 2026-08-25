const PURCHASED="購入採用";

export function classify(terminals,odds={}){
  const sorted=[...terminals].sort((a,b)=>(b.probability||0)-(a.probability||0));
  if(!sorted.length)return[];

  // Purchase engine no longer cares whether a branch is main/contender/sub.
  // It evaluates the terminal itself: probability, independent support,
  // evidence quality, contradiction, and price value.
  const max=sorted[0].probability||0;
  const concentration=max*sorted.length;

  return sorted.map((t,index)=>{
    const key=t.order.join("-");
    const odd=Number(odds[key]);
    const hasOdds=Number.isFinite(odd)&&odd>1;
    const support=(t.branchContributions||[]).length;
    const supportMass=(t.branchContributions||[]).reduce((s,c)=>s+(c.probability||0),0);
    const evidenceScore=terminalEvidenceScore(t);
    const contradiction=Number(t.contradictionScore||0);
    const priceValue=hasOdds?Math.max(0,odd*0.01):0;

    // No branch-type privilege. A terminal wins because its own evidence wins.
    const decisionScore=
      .48*(t.probability||0)+
      .18*Math.min(1,support/3)+
      .14*Math.min(1,supportMass/Math.max(t.probability||1,1e-9))+
      .12*evidenceScore+
      .08*priceValue-
      .18*contradiction;

    const strong=decisionScore>=0.045 && (t.probability||0)>=Math.max(0.012,max*0.28);
    const main=strong && (t.probability||0)>=Math.max(0.025,max*0.55);

    return {
      ...t, odds:hasOdds?odd:null,
      betClass:strong?(main?"MAIN":"COVER"):"NONE",
      purchaseStatus:strong?PURCHASED:"購入不採用",
      purchaseReason:strong
        ?"終端そのものの確率・根拠・独立支持で採用"
        :"終端確率または根拠・独立支持が購入基準未達",
      purchaseRejectCode:strong?"ADOPTED":"TERMINAL_SUPPORT",
      branchSupport:support,
      weightedBranchSupport:supportMass,
      dominantBranchId:null,
      dominantBranchLabel:null,
      dominantBranchPriority:"hypothesis",
      terminalDecisionScore:decisionScore,
      evidenceScore,
      contradictionScore:contradiction,
      highPayoutAttribute:hasOdds&&odd>=100,
      highPayoutAttributeLabel:hasOdds&&odd>=100?"高配当":""
    };
  });
}

function terminalEvidenceScore(t){
  const all=[];
  for(const c of t.branchContributions||[]){
    const e=c.positionEvidence||{};
    for(const side of ["first","second","third"]){
      const d=e[side]?.drivers||{};
      all.push(
        Number(d.first||5),Number(d.finish||5),
        Number(d.tracking||5),Number(d.recent||5)
      );
    }
  }
  if(!all.length)return .5;
  const avg=all.reduce((a,b)=>a+b,0)/all.length;
  return Math.max(0,Math.min(1,avg/10));
}

export function composite(items){
  const values=items.filter(x=>(x.purchaseStatus==null||x.purchaseStatus===PURCHASED)&&x.odds>1);
  return values.length?1/values.reduce((s,x)=>s+1/x.odds,0):null;
}

export function allocate(items,budget){
  const selected=items.filter(x=>x.purchaseStatus===PURCHASED)
    .sort((a,b)=>(b.terminalDecisionScore||0)-(a.terminalDecisionScore||0));
  if(!selected.length)return[];
  const total=Math.max(0,Number(budget||0));
  const weights=selected.map(x=>Math.max(x.terminalDecisionScore,.001));
  const sum=weights.reduce((a,b)=>a+b,0);
  return selected.map((x,i)=>({
    order:x.order,betClass:x.betClass,
    stake:Math.floor((total*weights[i]/sum)/100)*100,
    odds:x.odds,probability:x.probability,
    purchaseReason:x.purchaseReason,
    terminalDecisionScore:x.terminalDecisionScore
  }));
}

export function purchaseDiagnostics(classified){
  const selected=classified.filter(x=>x.purchaseStatus===PURCHASED);
  const types={};
  for(const x of selected){
    const t=x.branchType||"UNKNOWN";
    types[t]=(types[t]||0)+1;
  }
  return {
    generatedTerminalCount:classified.length,
    finalBetCount:selected.length,
    selectedBranchTypeCounts:types,
    templateConcentration:selected.length?
      Math.max(...Object.values(types))/selected.length:0,
    dominantTemplateWarning:selected.length?
      Math.max(...Object.values(types))/selected.length>=.75:false
  };
}
