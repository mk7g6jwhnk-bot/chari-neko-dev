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
    engineVersion:"KEIRIN-0.4.4-evidence-traced",
    raceId:race.id,
    lineConfidence:race.lineConfidence,
    scored,lines,branches,terminals:classified,
    audit:{
      ...a,
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
