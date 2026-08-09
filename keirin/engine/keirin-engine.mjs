import{scoreKeirinParticipants}from"../sports/keirin-scoring.mjs";
import{buildLines}from"../sports/keirin-lines.mjs";
import{generateKeirinBranches}from"../sports/keirin-branches.mjs";
import{generateKeirinTerminals}from"../sports/keirin-terminals.mjs";
import{audit}from"./audit.mjs";
import{classify,composite,allocate,purchaseDiagnostics}from"./purchase.mjs";

export function runKeirinEngine({race,venueProfile={},oddsByOrder={},budget=3000}){
  const scored=scoreKeirinParticipants({race,venueProfile});
  const lines=buildLines(scored);
  const branches=generateKeirinBranches({scored,lines,lineConfidence:race.lineConfidence});
  const terminals=generateKeirinTerminals({scored,branches});
  const a=audit({race,branches,terminals});
  const rawClassified=a.passed?classify(terminals,oddsByOrder):terminals;
  const lineBlocked=a.passed&&race.lineConfidence!=="高";
  const classified=lineBlocked
    ? rawClassified.map(item=>({...item,betClass:"NONE",purchaseStatus:"購入不採用",purchaseReason:"公式ライン未取得のため購入判定を保留"}))
    : rawClassified;
  const plan=a.passed&&!lineBlocked?allocate(classified,budget):[];
  const purchase=purchaseDiagnostics(classified,plan,budget);
  if(lineBlocked){purchase.noBet=true;purchase.noBetReason="LINE_DATA_UNAVAILABLE";purchase.purchaseCandidateCountBeforeCompression=0;purchase.purchaseCandidateCountAfterCompression=0;purchase.finalBetCount=0;purchase.minimumRequired=0;}

  return{
    engineVersion:"KEIRIN-0.5.10-third-variant-purchase-gate",
    raceId:race.id,
    lineConfidence:race.lineConfidence,
    scored,lines,branches,terminals:classified,
    audit:{
      ...a,
      branchSelectionAudit:buildBranchSelectionAudit(branches),
      branchCount:branches.length,
      completedBranchCount:branches.filter(branch=>terminals.some(terminal=>terminal.contributingBranches.includes(branch.id))).length,
      ...purchase
    },
    recommendations:{
      main:classified.filter(item=>item.betClass==="MAIN"&&item.purchaseStatus==="購入採用"),
      backup:classified.filter(item=>item.betClass==="COVER"&&item.purchaseStatus==="購入採用"),
      value:classified.filter(item=>item.betClass==="BUYABLE_HIGH"&&item.purchaseStatus==="購入採用"),
      strong:[]
    },
    compositeOdds:composite(plan),
    purchasePlan:plan,
    noBet:purchase.noBet,
    noBetReason:purchase.noBetReason,
    generatedAt:new Date().toISOString()
  };
}

function buildBranchSelectionAudit(branches){
  const sorted=[...(branches||[])].sort((a,b)=>(b.score||0)-(a.score||0)||String(a.id).localeCompare(String(b.id),"en"));
  const totalScore=sorted.reduce((sum,branch)=>sum+(Number(branch.score)||0),0);
  const structured=sorted.filter(branch=>["LEADER_HOLD","BANTE_SASHI","MAKURI_SUCCESS"].includes(branch.branchType));
  const topStructured=structured[0]||null;
  const topStructuredScore=Number(topStructured?.score)||0;
  const mainBranches=structured.filter(branch=>branch.priority==="main");
  const contenderBranches=structured.filter(branch=>branch.priority==="contender");
  const subBranches=structured.filter(branch=>branch.priority==="sub");
  const topScore=Number(sorted[0]?.score)||0;
  const tailStructured=[...contenderBranches,...subBranches].sort((a,b)=>(b.score||0)-(a.score||0));
  const tailGaps=[];
  for(let i=0;i<tailStructured.length-1;i+=1)tailGaps.push(Math.max(0,(Number(tailStructured[i].score)||0)-(Number(tailStructured[i+1].score)||0)));
  const medianGap=median(tailGaps);
  const madGap=median(tailGaps.map(gap=>Math.abs(gap-medianGap)));
  const contenderMin=contenderBranches.length?Math.min(...contenderBranches.map(branch=>Number(branch.score)||0)):null;
  const subMax=subBranches.length?Math.max(...subBranches.map(branch=>Number(branch.score)||0)):null;
  return{
    totalBranchScore:totalScore,
    topBranchId:sorted[0]?.id||null,
    topBranchLabel:sorted[0]?.label||null,
    topBranchScore:topScore,
    topStructuredBranchId:topStructured?.id||null,
    topStructuredBranchLabel:topStructured?.label||null,
    topStructuredScore,
    mainSelectionMode:"HIERARCHICAL_NATURAL_TIERS",
    mainLineId:null,
    mainLineIds:[...new Set(mainBranches.map(branch=>branch.primaryLineId).filter(Boolean))],
    mainBranchIds:mainBranches.map(branch=>branch.id),
    mainBranchLabels:mainBranches.map(branch=>branch.label),
    contenderBranchIds:contenderBranches.map(branch=>branch.id),
    contenderBranchLabels:contenderBranches.map(branch=>branch.label),
    subBranchIds:subBranches.map(branch=>branch.id),
    subBranchLabels:subBranches.map(branch=>branch.label),
    mainPriorityRatio:null,
    tiering:{
      mainCount:mainBranches.length,
      contenderCount:contenderBranches.length,
      subCount:subBranches.length,
      topTieCount:mainBranches.length,
      tailMedianGap:tailGaps.length?medianGap:null,
      tailMadGap:tailGaps.length?madGap:null,
      contenderCutGap:contenderMin!=null&&subMax!=null?contenderMin-subMax:null,
      contenderCutDetected:contenderMin!=null&&subMax!=null
    },
    rows:sorted.map(branch=>({
      id:branch.id,
      label:branch.label,
      branchType:branch.branchType,
      primaryLineId:branch.primaryLineId||null,
      priority:branch.priority,
      requiredFirstNumber:branch.requiredFirstNumber??null,
      score:Number(branch.score)||0,
      share:totalScore>0?(Number(branch.score)||0)/totalScore:0,
      relativeToTop:topScore>0?(Number(branch.score)||0)/topScore:0,
      scoreTrace:(branch.scoreTrace||[]).map(item=>({key:item.key,value:Number(item.value)||0,weight:Number(item.weight)||0,contribution:Number(item.contribution)||0}))
    }))
  };
}
function median(values){const valid=values.filter(Number.isFinite).sort((a,b)=>a-b);if(!valid.length)return 0;const mid=Math.floor(valid.length/2);return valid.length%2?valid[mid]:(valid[mid-1]+valid[mid])/2}
