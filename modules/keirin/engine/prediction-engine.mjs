import{scoreKeirinParticipants}from"../sports/keirin-scoring.mjs";
import{buildLines}from"../sports/keirin-lines.mjs";
import{generateKeirinBranches}from"../sports/keirin-branches.mjs";
import{generateKeirinTerminals}from"../sports/keirin-terminals.mjs";
import{audit}from"./audit.mjs";
import{buildWholeLinkageAudit}from"./whole-linkage-audit.mjs";
import{buildCentralRulesAudit}from"./central-rules-audit.mjs";
import{buildRiderBranchLinkAudit}from"./rider-branch-link-audit.mjs";
import{buildBranchSelectionAudit,buildRiderAbilityEvaluationAudit,buildStartPowerInputAudit}from"./engine-support.mjs";
import{buildPredictionExplanation}from"./prediction-explanation.mjs";
import{buildProbabilityPathAudit}from"./probability-path-audit.mjs";
import{buildConditionalProbabilityDistributionAudit}from"./conditional-probability-distribution-audit.mjs";

export function runKeirinPredictionEngine({race,venueProfile={}}){
  const scored=scoreKeirinParticipants({race,venueProfile});
  const lines=buildLines(scored);
  const branches=generateKeirinBranches({scored,lines,lineConfidence:race.lineConfidence,raceCategory:race.raceCategory||"standard"});
  const terminals=generateKeirinTerminals({scored,branches});
  const terminalGenerationAudit=terminals.generationAudit||null;
  const generationAudit=audit({race,branches,terminals,terminalGenerationAudit});
  const riderBranchLinkAudit=buildRiderBranchLinkAudit({scored,branches});
  const wholeLinkageAudit=buildWholeLinkageAudit({scored,lines,branches,terminals,lineConfidence:race.lineConfidence});
  const centralRulesAudit=buildCentralRulesAudit({terminals,terminalGenerationAudit});
  const boundaryAudit=buildPredictionBoundaryAudit(terminals);
  const explanation=buildPredictionExplanation({scored,lines,branches,terminals});
  const probabilityPathAudit=buildProbabilityPathAudit(terminals);
  const conditionalProbabilityDistributionAudit=buildConditionalProbabilityDistributionAudit(terminals);
  return{
    predictionVersion:"KEIRIN-PREDICTION-1.3-LEADER-HOLD-AXIS-COMPARISON",
    raceId:race.id,
    lineConfidence:race.lineConfidence,
    raceCategory:race.raceCategory||"standard",
    scored,lines,branches,terminals,explanation,probabilityPathAudit,conditionalProbabilityDistributionAudit,
    audit:{
      ...generationAudit,
      branchSelectionAudit:buildBranchSelectionAudit(branches),
      branchCount:branches.length,
      completedBranchCount:branches.filter(branch=>terminals.some(terminal=>terminal.contributingBranches.includes(branch.id))).length,
      terminalGenerationAudit,
      startPowerInputAudit:buildStartPowerInputAudit(scored,branches),
      riderAbilityEvaluationAudit:buildRiderAbilityEvaluationAudit(scored),
      riderBranchLinkAudit,wholeLinkageAudit,centralRulesAudit,
      predictionBoundaryAudit:boundaryAudit
    },
    generatedAt:new Date().toISOString()
  };
}

function buildPredictionBoundaryAudit(terminals=[]){
  const forbidden=["betClass","purchaseStatus","purchaseReason","purchaseRejectCode","amount","fundingWeight","purchaseBorderEligible"];
  const contaminated=[];
  for(const item of terminals||[]){
    const keys=forbidden.filter(key=>Object.prototype.hasOwnProperty.call(item,key));
    if(keys.length)contaminated.push({order:item.order?.join("-")||null,keys});
  }
  return{
    version:"PREDICTION-PURCHASE-BOUNDARY-1.0",
    policy:"PREDICTION_GENERATES_ALL_SUPPORTED_TERMINALS_AND_PROBABILITIES_ONLY; NO_PURCHASE_CLASSIFICATION_OR_PRUNING",
    terminalCount:(terminals||[]).length,
    purchaseFieldContaminationCount:contaminated.length,
    contaminated,
    terminalDeletionAllowed:false,
    purchaseClassificationAllowed:false,
    passed:contaminated.length===0
  };
}
