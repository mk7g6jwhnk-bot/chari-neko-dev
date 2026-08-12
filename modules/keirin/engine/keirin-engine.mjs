import{runKeirinPredictionEngine}from"./prediction-engine.mjs";
import{runKeirinPurchaseEngine}from"./purchase-engine.mjs";

export function runKeirinEngine({race,venueProfile={},oddsByOrder={},budget=3000}){
  const prediction=runKeirinPredictionEngine({race,venueProfile});
  const purchase=runKeirinPurchaseEngine({prediction,oddsByOrder,budget});
  return{
    engineVersion:"KEIRIN-0.19.1-b-led-initiative-strength-guard",
    raceId:race.id,
    lineConfidence:race.lineConfidence,
    scored:prediction.scored,
    lines:prediction.lines,
    branches:prediction.branches,
    predictionExplanation:prediction.explanation,
    terminals:purchase.terminals,
    prediction:{
      predictionVersion:prediction.predictionVersion,
      terminals:prediction.terminals,
      audit:prediction.audit,
      explanation:prediction.explanation,
      generatedAt:prediction.generatedAt
    },
    purchase:{
      purchaseVersion:purchase.purchaseVersion,
      audit:purchase.audit
    },
    audit:{
      ...prediction.audit,
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
