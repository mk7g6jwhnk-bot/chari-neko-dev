import{runKeirinPredictionEngine}from"./prediction-engine.mjs";
import{runKeirinPurchaseEngine}from"./purchase-engine.mjs";
import{PREDICTION_ENGINE_VERSION,PURCHASE_ENGINE_VERSION,ENGINE_PAIR_ID,buildEnginePairAudit}from"./engine-version.mjs";
import{attachScenarioProvenanceId,buildScenarioProvenance}from"./scenario-provenance.mjs";
import{buildTerminalDetailTrace}from"./terminal-trace.mjs";
import{buildBaselineControl,buildRiderSelectionCandidatePrediction}from"./rider-selection-weak.mjs";
import{attachMultiWorldMetadata,buildMultiWorldScenarioStructure}from"./multi-world-scenario.mjs";
import{buildRecommendationTrace,buildWinnerConditionedSecondRankTrace}from"./research-diagnostics-v1.mjs";

export function runKeirinEngine({race,venueProfile={},oddsByOrder={},budget=3000,captureResearchTrace=false}){
  const baselinePrediction=runKeirinPredictionEngine({race,venueProfile});
  const adoptionEnabled=process.env.KEIRIN_RIDER_SELECTION_WEAK!=="0";
  const baselinePurchase=runKeirinPurchaseEngine({prediction:baselinePrediction,oddsByOrder,budget});
  const candidate=adoptionEnabled?buildRiderSelectionCandidatePrediction(baselinePrediction,baselinePurchase.terminals):null;
  const selectedPrediction=candidate?.prediction||baselinePrediction;
  const multiWorldStructure=buildMultiWorldScenarioStructure({branches:selectedPrediction.branches,terminals:selectedPrediction.terminals,lines:selectedPrediction.lines});
  const prediction={...selectedPrediction,terminals:attachMultiWorldMetadata(selectedPrediction.terminals,multiWorldStructure)};
  const purchase=runKeirinPurchaseEngine({prediction,oddsByOrder,budget});
  const provenance=buildScenarioProvenance({terminals:purchase.terminals,branches:prediction.branches,lines:prediction.lines,scored:prediction.scored});
  const apiTerminals=purchase.terminals.map(item=>attachScenarioProvenanceId(item,provenance.terminalScenarioIds));
  const output={
    engineVersion:PREDICTION_ENGINE_VERSION,
    raceId:race.id,
    lineConfidence:race.lineConfidence,
    scored:prediction.scored,
    lines:prediction.lines,
    branches:prediction.branches,
    predictionExplanation:prediction.explanation,
    terminals:apiTerminals.map(compactApiTerminal),
    scenarioProvenanceSchemaVersion:provenance.scenarioProvenanceSchemaVersion,
    scenarioProvenanceStatus:provenance.scenarioProvenanceStatus,
    scenarioProvenances:provenance.scenarioProvenances,
    scenarioProvenanceAudit:provenance.audit,
    multiWorldScenario:{schemaVersion:multiWorldStructure.schemaVersion,scenarios:multiWorldStructure.scenarios,audit:multiWorldStructure.audit,purchase:purchase.audit?.multiWorldPurchase||null},
    prediction:{
      predictionVersion:prediction.predictionVersion,
      // The classified ledger above is the canonical API terminal list. Keep
      // only the immutable prediction identity here; returning the complete
      // branch/evidence tree twice can push a 504-terminal Function response
      // over the platform limit.
      terminals:prediction.terminals.map(item=>compactPredictionTerminal(attachScenarioProvenanceId(item,provenance.terminalScenarioIds))),
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
    purchaseEligibility:purchase.purchaseEligibility,
    generatedAt:new Date().toISOString()
  };
  output.riderSelectionAdoption=candidate?buildBaselineControl({baselinePurchase,candidatePurchase:purchase,ranked:candidate.ranked,inputHash:candidate.inputHash,generatedAt:output.generatedAt}):{schemaVersion:"RIDER_SELECTION_WEAK_ADOPTION_CONTROL_V1",productionVersion:baselinePrediction.predictionVersion,baselineControlVersion:"KEIRIN-0.5.20-girls-evidence-gate",enabled:false,rollbackFlag:"KEIRIN_RIDER_SELECTION_WEAK=0",resultDataUsed:false,temporalStage:"PREDICTION_TIME"};
  const recommendationEnabled=process.env.KEIRIN_RECOMMENDATION_FILTER_V1==="1";
  if(recommendationEnabled)output.recommendationFilter=buildRecommendationTrace({race,prediction,purchase,multiWorldScenario:output.multiWorldScenario,generatedAt:output.generatedAt,enabled:true});
  if(captureResearchTrace){
    output.researchTerminalTrace=buildTerminalDetailTrace({race,prediction,purchase,provenance,generatedAt:output.generatedAt});
    if(process.env.KEIRIN_SECOND_RANK_TRACE_V1==="1")output.researchTerminalTrace.winnerConditionedSecondRankTrace=buildWinnerConditionedSecondRankTrace({race,prediction,purchase,parameterHash:output.riderSelectionAdoption?.parameterHash||null,generatedAt:output.generatedAt});
    if(recommendationEnabled)output.researchTerminalTrace.recommendationTrace=output.recommendationFilter;
  }
  return output;
}

function compactPredictionTerminal(item){
  return{
    order:(item.order||[]).map(Number),
    probability:Number(item.probability)||0,
    score:Number(item.score)||0,
    branchId:item.branchId||null,
    branchLabel:item.branchLabel||null,
    branchType:item.branchType||null,
    scenarioProvenanceId:item.scenarioProvenanceId||null
    ,macroScenarioId:item.macroScenarioId||null,eventId:item.eventId||null,terminalId:item.terminalId||null,scenarioRelativeScore:item.scenarioRelativeScore??null,eventRelativeScore:item.eventRelativeScore??null,terminalRelativeScore:item.terminalRelativeScore??null,rankWithinEvent:item.rankWithinEvent??null,rankWithinScenario:item.rankWithinScenario??null,globalRank:item.globalRank??null
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
    lifecycle:item.lifecycle||null,
    scenarioProvenanceId:item.scenarioProvenanceId||null
    ,macroScenarioId:item.macroScenarioId||null,eventId:item.eventId||null,terminalId:item.terminalId||null,scenarioRelativeScore:item.scenarioRelativeScore??null,eventRelativeScore:item.eventRelativeScore??null,terminalRelativeScore:item.terminalRelativeScore??null,rankWithinEvent:item.rankWithinEvent??null,rankWithinScenario:item.rankWithinScenario??null,globalRank:item.globalRank??null,scenarioPurchaseClass:item.scenarioPurchaseClass||null,scenarioTicketRank:item.scenarioTicketRank??null,dropReason:item.dropReason||null
  };
}
