const PURCHASED="購入採用";

export function classify(terminals,odds={}){
  const sorted=[...terminals].sort(compareTerminal),max=sorted[0]?.probability||0;
  const mainThreshold=Math.max(.0035,max*.96);
  const coverThreshold=Math.max(.002,max*.88),concentrationRatio=max*sorted.length;
  const bestByBranch=new Set();
  for(const terminal of sorted){
    for(const branchId of terminal.contributingBranches||[]){
      if(![...bestByBranch].some(key=>key.startsWith(`${branchId}|`)))bestByBranch.add(`${branchId}|${terminal.order.join("-")}`);
    }
  }
  return sorted.map((terminal,index)=>{
    const key=terminal.order.join("-"),value=Number(odds[key]),hasOdds=Number.isFinite(value)&&value>1;
    const support=(terminal.contributingBranches||[]).length;
    const independent=(terminal.contributingBranches||[]).some(branchId=>bestByBranch.has(`${branchId}|${key}`));
    const hasMainSupport=(terminal.contributingBranches||[]).some(branchId=>/^(?:LEAD|BANTE|MAKURI)-/.test(branchId));
    let betClass="COVER";
    if(hasOdds&&value>=100&&terminal.probability>=coverThreshold)betClass="BUYABLE_HIGH";
    else if(hasMainSupport&&terminal.probability>=mainThreshold)betClass="MAIN";
    const mainQualified=betClass==="MAIN"&&terminal.probability>=mainThreshold;
    const coverageQualified=betClass==="COVER"&&independent&&terminal.probability>=coverThreshold;
    const adopted=betClass==="BUYABLE_HIGH"||(concentrationRatio>=1.12&&(mainQualified||coverageQualified));
    return{...terminal,odds:hasOdds?value:null,betClass,purchaseStatus:adopted?PURCHASED:"購入不採用",purchaseReason:adopted?`${betClass}: terminal分布・branch support基準`:concentrationRatio<1.12?`terminal分布が平坦（集中比${concentrationRatio.toFixed(3)}）`:`確率${terminal.probability.toFixed(6)} / cover基準${coverThreshold.toFixed(6)}未満`,branchSupport:support,independentBranchCoverage:independent,mainThreshold,coverThreshold,concentrationRatio,index};
  });
}

export function composite(items){const values=items.filter(item=>(item.purchaseStatus==null||item.purchaseStatus===PURCHASED)&&item.odds>1);return values.length?1/values.reduce((sum,item)=>sum+1/item.odds,0):null}

export function allocate(items,budget){
  const natural=items.filter(item=>item.purchaseStatus===PURCHASED).sort(compareTerminal);
  const capacity=Math.max(0,Math.floor(Number(budget||0)/100));
  const selected=natural.slice(0,capacity);
  if(!selected.length)return[];
  const weights=selected.map(item=>Math.max(item.probability,.0001)),sum=weights.reduce((a,b)=>a+b,0);
  const stakes=weights.map(weight=>Math.floor((budget*weight/sum)/100)*100);
  let remaining=budget-stakes.reduce((a,b)=>a+b,0),index=0;
  while(remaining>=100){stakes[index%stakes.length]+=100;remaining-=100;index+=1;}
  return selected.map((item,i)=>({order:item.order,betClass:item.betClass,stake:stakes[i],odds:item.odds,expectedPayout:item.odds?Math.floor(stakes[i]*item.odds):null,probability:item.probability,branchSupport:item.branchSupport}));
}

export function purchaseDiagnostics(classified,plan,budget){
  const probabilities=classified.map(item=>item.probability).sort((a,b)=>b-a),natural=classified.filter(item=>item.purchaseStatus===PURCHASED);
  const noBet=plan.length===0;
  const noBetReason=!noBet?null:classified.length===0?"NO_TERMINALS":natural.length===0?"FLAT_DISTRIBUTION_NO_SUPPORTED_CANDIDATE":Number(budget)<100?"BUDGET_BELOW_MINIMUM":"QUALITY_GATE";
  return{terminalCount:classified.length,terminalProbabilitySum:sum(probabilities),maxTerminalProbability:probabilities[0]||0,top3Mass:sum(probabilities.slice(0,3)),top5Mass:sum(probabilities.slice(0,5)),top10Mass:sum(probabilities.slice(0,10)),mainThreshold:classified[0]?.mainThreshold||0,coverThreshold:classified[0]?.coverThreshold||0,purchaseCandidateCountBeforeCompression:natural.length,purchaseCandidateCountAfterCompression:plan.length,finalBetCount:plan.length,noBet,noBetReason};
}

function compareTerminal(a,b){return(b.probability-a.probability)||(b.contributingBranches?.length||0)-(a.contributingBranches?.length||0)||a.order.join("-").localeCompare(b.order.join("-"),"en")}
function sum(values){return values.reduce((total,value)=>total+value,0)}
