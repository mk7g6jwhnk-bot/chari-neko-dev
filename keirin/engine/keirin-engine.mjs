import{runKeirinPredictionEngine}from"./prediction-engine.mjs";
import{runKeirinPurchaseEngine}from"./purchase-engine.mjs";
import{PREDICTION_ENGINE_VERSION,PURCHASE_ENGINE_VERSION,ENGINE_PAIR_ID,buildEnginePairAudit}from"./engine-version.mjs";

export function runKeirinEngine({race,venueProfile={},oddsByOrder={},budget=3000}){
  const prediction=runKeirinPredictionEngine({race,venueProfile});
  const purchase=runKeirinPurchaseEngine({prediction,oddsByOrder,budget});
  return{
    engineVersion:PREDICTION_ENGINE_VERSION,
    raceId:race.id,
    lineConfidence:race.lineConfidence,
    scored:prediction.scored,
    lines:prediction.lines,
    branches:prediction.branches,
    predictionExplanation:prediction.explanation,
    terminals:purchase.terminals.map(compactApiTerminal),
    prediction:{
      predictionVersion:prediction.predictionVersion,
      // The classified ledger above is the canonical API terminal list. Keep
      // only the immutable prediction identity here; returning the complete
      // branch/evidence tree twice can push a 504-terminal Function response
      // over the platform limit.
      terminals:prediction.terminals.map(compactPredictionTerminal),
      audit:prediction.audit,
      explanation:prediction.explanation,
      generatedAt:prediction.generatedAt
    },
    enginePair:buildEnginePairAudit(),
    purchase:{
      purchaseVersion:PURCHASE_ENGINE_VERSION,
      enginePairId:ENGINE_PAIR_ID,
      audit:purchase.audit
    },
    audit:{
      ...prediction.audit,
      enginePairAudit:buildEnginePairAudit(),
      ...purchase.audit,
      predictionAudit:prediction.audit,
      purchaseAudit:purchase.audit,
      predictionPurchaseBoundaryAudit:purchase.audit?.predictionPurchaseBoundaryAudit||null
    },
    recommendations:purchase.recommendations,
    compositeOdds:purchase.compositeOdds,
    purchasePlan:purchase.purchasePlan,
    standardPurchasePlan:purchase.standardPurchasePlan,
    referencePurchasePlan:purchase.referencePurchasePlan,
    noBet:purchase.noBet,
    noBetReason:purchase.noBetReason,
    generatedAt:new Date().toISOString()
  };
}

function compactPredictionTerminal(item){
  return{
    order:(item.order||[]).map(Number),
    probability:Number(item.probability)||0,
    score:Number(item.score)||0,
    branchId:item.branchId||null,
    branchLabel:item.branchLabel||null,
    branchType:item.branchType||null
  };
}

function compactApiTerminal(item){
  // Detailed evidence remains available for the leading/purchased terminals
  // and in the race-level purchase audit. Rejected tail rows only need their
  // ledger identity and decision fields in the browser/snapshot response.
  if(item.purchaseStatus==="購入採用"||Number(item.purchaseRank)<=10||item.purchaseDistributionAudit)return item;
  return{
    order:(item.order||[]).map(Number),
    probability:Number(item.probability)||0,
    score:Number(item.score)||0,
    terminalScore:Number(item.terminalScore)||0,
    betClass:item.betClass||"NONE",
    purchaseStatus:item.purchaseStatus||null,
    purchaseReason:item.purchaseReason||null,
    purchaseRejectCode:item.purchaseRejectCode||null,
    purchaseRank:item.purchaseRank??null,
    purchaseCandidateCount:item.purchaseCandidateCount??0,
    purchaseCutoff:item.purchaseCutoff??0,
    representativeTerminal:Boolean(item.representativeTerminal),
    branchId:item.branchId||null,
    branchLabel:item.branchLabel||null,
    branchType:item.branchType||null,
    dominantBranchId:item.dominantBranchId||item.branchId||null,
    dominantBranchLabel:item.dominantBranchLabel||item.branchLabel||null,
    branchContributions:(item.branchContributions||[]).map(contribution=>({branchId:contribution.branchId})),
    terminalGlobalRank:item.terminalGlobalRank??null,
    terminalFamilyRank:item.terminalFamilyRank??null,
    terminalPairRank:item.terminalPairRank??null,
    firstFamilyNumber:item.firstFamilyNumber??item.order?.[0]??null,
    naturalConvergenceScore:item.naturalConvergenceScore??null,
    naturalConvergenceLevel:item.naturalConvergenceLevel||null,
    lifecycle:item.lifecycle||null
  };
}
