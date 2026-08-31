import{classify,composite,allocate,purchaseDiagnostics}from"./purchase.mjs";
import{applyChatSpecV1}from"./chat-spec-v1-policy.mjs";
import{
  buildReferenceToStandardTransitionAudit,buildLineFallbackDiscriminationAudit,buildNonZeroReferencePlan,
  buildReferencePositionBalanceAudit,buildTerminalLifecycleAudit,isUsableStartPower
}from"./engine-support.mjs";
import{PREDICTION_ENGINE_VERSION,PURCHASE_ENGINE_VERSION,ENGINE_PAIR_ID,buildEnginePairAudit}from"./engine-version.mjs";
import{attachPurchaseScenarioExplanations}from"./purchase-scenario-explanation.mjs";

export function resolvePurchaseBlock({lineBlocked=false,lineAndStartEvidenceBlocked=false,lineFallbackEvidenceBlocked=false,girlsEvidenceBlocked=false,mainInvariantFailed=false}={}){
  const blocked=Boolean(lineBlocked||lineAndStartEvidenceBlocked||lineFallbackEvidenceBlocked||girlsEvidenceBlocked);
  return{blocked,mainInvariantDiagnostic:Boolean(mainInvariantFailed),mainInvariantHardBlock:false};
}

export function runKeirinPurchaseEngine({prediction,oddsByOrder={},budget=3000}){
  if(!prediction||!Array.isArray(prediction.terminals))throw new Error("prediction snapshot is required");
  const enginePairAudit=buildEnginePairAudit();
  if(prediction.audit?.enginePairAudit?.predictionEngineVersion && prediction.audit.enginePairAudit.predictionEngineVersion!==PREDICTION_ENGINE_VERSION){
    throw new Error(`ENGINE_PAIR_MISMATCH: prediction=${prediction.audit.enginePairAudit.predictionEngineVersion} expected=${PREDICTION_ENGINE_VERSION}`);
  }
  if(prediction.audit?.enginePairAudit?.enginePairId && prediction.audit.enginePairAudit.enginePairId!==ENGINE_PAIR_ID){
    throw new Error(`ENGINE_PAIR_MISMATCH: pair=${prediction.audit.enginePairAudit.enginePairId} expected=${ENGINE_PAIR_ID}`);
  }
  const raceMeta={
    id:prediction.raceId,
    lineConfidence:prediction.lineConfidence,
    raceCategory:prediction.raceCategory||"standard"
  };
  const beforeFingerprint=fingerprintPrediction(prediction.terminals);
  const purchaseInput=deepClone(prediction.terminals);
  const generationPassed=Boolean(prediction.audit?.passed);
  const chatSpec=generationPassed?applyChatSpecV1({
    scored:prediction.scored||[],lines:prediction.lines||[],branches:prediction.branches||[],terminals:purchaseInput,oddsByOrder
  }):null;
  const rawClassified=generationPassed
    ?classify(chatSpec.terminals,oddsByOrder)
    :purchaseInput.map(item=>({...item,betClass:"NONE",purchaseStatus:"購入不採用",purchaseReason:`エンジン生成監査不通過: ${(prediction.audit?.errors||[]).slice(0,3).join(" / ")||"原因未記録"}`,purchaseRejectCode:"ENGINE_AUDIT_FAILED",lifecycle:{generated:true,probabilityEvaluated:true,terminalDeleted:false,purchaseDecision:"REJECTED",purchaseDecisionCode:"ENGINE_AUDIT_FAILED",purchaseDecisionReason:`エンジン生成監査不通過: ${(prediction.audit?.errors||[]).slice(0,3).join(" / ")||"原因未記録"}`}}));

  const lineIndependentMainAvailable=(prediction.branches||[]).some(branch=>branch.lineIndependentFallback===true&&branch.priority==="main");
  const lineFallbackDiscriminationAudit=buildLineFallbackDiscriminationAudit({
    scored:prediction.scored||[],terminals:rawClassified,lineIndependentMainAvailable
  });
  const startEvidenceCount=(prediction.scored||[]).filter(item=>isUsableStartPower(item)).length;
  const startEvidenceRequired=Math.max(3,Math.ceil((prediction.scored||[]).length*.5));
  // Missing start-power evidence is a warning, not a race-wide purchase kill switch.
  // When official line data is unavailable, normal purchase is blocked only if the
  // remaining rider/terminal evidence is genuinely non-discriminative.
  const lineAndStartEvidenceBlocked=false;
  const lineFallbackEvidenceInsufficient=Boolean(
    generationPassed&&
    raceMeta.raceCategory!=="girls"&&
    raceMeta.lineConfidence!=="高"&&
    !lineFallbackDiscriminationAudit.sufficient
  );
  // Missing/flat line-fallback evidence is diagnostic only. applyChatSpecV1 has
  // already classified every generated terminal from the available rider and
  // scenario evidence; do not overwrite those purchase decisions race-wide.
  const lineFallbackEvidenceBlocked=false;
  const lineBlocked=false;
  const girlsEvidenceBlocked=generationPassed&&raceMeta.raceCategory==="girls"&&startEvidenceCount<startEvidenceRequired;
  // v230: MAIN absence is not a race-wide kill switch, but COVER/BUYABLE_HIGH-only
  // standard purchase is forbidden inside classification. Main-scenario natural purchases
  // are normalized to MAIN before this diagnostic is evaluated.
  const mainInvariantDiagnostic=Boolean(generationPassed&&chatSpec&&!chatSpec.audit?.mainInvariant?.passed);
  const blockDecision=resolvePurchaseBlock({lineBlocked,lineAndStartEvidenceBlocked,lineFallbackEvidenceBlocked,girlsEvidenceBlocked,mainInvariantFailed:mainInvariantDiagnostic});
  const purchaseBlocked=blockDecision.blocked;
  const blockedReason=lineBlocked
    ?"公式ライン未取得のため購入判定を保留"
    :lineAndStartEvidenceBlocked
      ?"公式ライン未取得かつ主導権入力も不足しているため通常購入を保留し、参考買い目だけを表示します。"
      :lineFallbackEvidenceBlocked
        ?"公式ライン未取得かつ選手間の着順評価差が不足しています。全員を本線扱いせず、参考買い目だけを表示します。"
        :girlsEvidenceBlocked
          ?"ガールズ主導権の公式入力が不足しているため購入判定を保留"
          :null;
  const blockCode=lineBlocked
    ?"LINE_DATA_UNAVAILABLE"
    :lineAndStartEvidenceBlocked
      ?"LINE_AND_START_EVIDENCE_UNAVAILABLE"
      :lineFallbackEvidenceBlocked
        ?"LINE_FALLBACK_INSUFFICIENT_DISCRIMINATION"
        :girlsEvidenceBlocked
          ?"GIRLS_LEAD_EVIDENCE_UNAVAILABLE"
          :null;
  const classified=purchaseBlocked
    ?rawClassified.map(item=>({...item,betClass:"NONE",purchaseStatus:"購入不採用",purchaseReason:blockedReason,purchaseRejectCode:blockCode,lifecycle:{...(item.lifecycle||{}),generated:true,probabilityEvaluated:true,terminalDeleted:false,purchaseDecision:"REJECTED",purchaseDecisionCode:blockCode,purchaseDecisionReason:blockedReason}}))
    :rawClassified;
  const naturalCandidateCount=classified.filter(item=>["MAIN","COVER","BUYABLE_HIGH"].includes(item.betClass)).length;
  const budgetInsufficientForNaturalCluster=naturalCandidateCount>0&&Number(budget||0)<naturalCandidateCount*100;
  const normalPlan=generationPassed&&!purchaseBlocked&&!budgetInsufficientForNaturalCluster?allocate(classified,budget):[];
  const fallbackPlan=generationPassed&&normalPlan.length===0&&prediction.terminals.length
    ?buildNonZeroReferencePlan({rawClassified,classified,budget,blockedReason:purchaseBlocked?blockedReason:"通常購入条件で採用0件",blockCode:purchaseBlocked?blockCode:"NO_STANDARD_PURCHASE_CANDIDATE",lineFallbackDiscriminationAudit,allocator:allocate})
    :[];
  const explanationSources={classified,scored:prediction.scored||[],lines:prediction.lines||[],branches:prediction.branches||[]};
  const standardPurchasePlan=attachPurchaseScenarioExplanations({plans:normalPlan,...explanationSources});
  const referencePurchasePlan=attachPurchaseScenarioExplanations({plans:fallbackPlan,...explanationSources});
  const plan=standardPurchasePlan.length?standardPurchasePlan:referencePurchasePlan;
  const purchase=purchaseDiagnostics(classified,plan,budget);
  const terminalLifecycleAudit=buildTerminalLifecycleAudit({sourceTerminals:prediction.terminals,classified,terminalGenerationAudit:prediction.audit?.terminalGenerationAudit||null});
  const referenceToStandardTransitionAudit=buildReferenceToStandardTransitionAudit({lineConfidence:raceMeta.lineConfidence,purchaseBlocked,blockCode,lineFallbackDiscriminationAudit,normalPlan,fallbackPlan});
  if(plan.length&&fallbackPlan.length){
    purchase.referencePlan=true;
    purchase.referencePlanReason=purchaseBlocked?blockCode:"NO_STANDARD_PURCHASE_CANDIDATE";
    purchase.referencePositionBalanceAudit=buildReferencePositionBalanceAudit(fallbackPlan);
    purchase.purchaseCandidateCountBeforeCompression=fallbackPlan.length;
    purchase.purchaseCandidateCountAfterCompression=fallbackPlan.length;
    purchase.finalBetCount=fallbackPlan.length;
    purchase.minimumRequired=fallbackPlan.length*100;
  }
  if(purchaseBlocked){purchase.noBet=true;purchase.noBetReason=blockCode;}
  if(budgetInsufficientForNaturalCluster){purchase.noBet=true;purchase.noBetReason="DIFFUSE_CLUSTER_EXCEEDS_BUDGET";purchase.purchaseRegime="EXTREMELY_DIFFUSE";purchase.purchaseRegimeReason="NATURAL_CLUSTER_CANNOT_BE_FUNDED_WITHOUT_ARBITRARY_SLICING";purchase.requiredNaturalClusterBudget=naturalCandidateCount*100;purchase.purchaseCandidateCountAfterCompression=0;purchase.finalBetCount=0;purchase.adoptedTerminalCount=0;}
  else if(purchase.noBet)purchase.purchaseRegime="DIFFUSE";
  else if(standardPurchasePlan.length===1)purchase.purchaseRegime="CONCENTRATED";
  else purchase.purchaseRegime="NORMAL";
  purchase.girlsStartEvidenceCount=startEvidenceCount;
  purchase.girlsStartEvidenceRequired=raceMeta.raceCategory==="girls"?startEvidenceRequired:null;
  purchase.mainInvariantAudit={
    diagnosticOnly:true,
    failed:mainInvariantDiagnostic,
    error:chatSpec?.audit?.mainInvariant?.error||null,
    centerScenarioCount:Number(chatSpec?.audit?.mainInvariant?.centerScenarioCount)||0,
    mainCandidateCount:Number(chatSpec?.audit?.mainInvariant?.mainCandidateCount)||0,
    mainPurchasedCount:Number(chatSpec?.audit?.mainInvariant?.mainPurchasedCount)||0,
    raceWidePurchaseBlockedByMainInvariant:false,
    policy:"STANDARD_PURCHASE_REQUIRES_MAIN; MAIN_ABSENCE_DOES_NOT_RACE_WIDE_KILL_PREDICTION"
  };
  const purchaseEligibility=buildPurchaseEligibility({purchase,standardPurchasePlan,referencePurchasePlan,budget});
  purchase.purchaseEligibility=purchaseEligibility;

  const afterFingerprint=fingerprintPrediction(prediction.terminals);
  const boundaryAudit={
    version:"PREDICTION-PURCHASE-BOUNDARY-1.0",
    policy:"PURCHASE_ENGINE_READS_PREDICTION_SNAPSHOT_WITHOUT_MUTATING_OR_DELETING_PREDICTION_TERMINALS",
    predictionTerminalCount:prediction.terminals.length,
    classifiedTerminalCount:classified.length,
    predictionFingerprintBefore:beforeFingerprint,
    predictionFingerprintAfter:afterFingerprint,
    predictionSnapshotUnchanged:beforeFingerprint===afterFingerprint,
    terminalCountPreserved:prediction.terminals.length===classified.length,
    purchaseFieldsWrittenToPrediction:false,
    passed:beforeFingerprint===afterFingerprint&&prediction.terminals.length===classified.length
  };

  return{
    purchaseVersion:PURCHASE_ENGINE_VERSION,
    terminals:classified,
    recommendations:{
      main:classified.filter(item=>item.betClass==="MAIN"&&item.purchaseStatus==="購入採用"),
      backup:classified.filter(item=>item.betClass==="COVER"&&item.purchaseStatus==="購入採用"),
      value:classified.filter(item=>item.betClass==="BUYABLE_HIGH"&&item.purchaseStatus==="購入採用"),
      strong:[]
    },
    compositeOdds:composite(standardPurchasePlan),purchasePlan:plan,standardPurchasePlan,referencePurchasePlan,noBet:!purchaseEligibility.canPurchase,noBetReason:purchaseEligibility.reasonCode,purchaseEligibility,
    audit:{
      ...purchase,
      chatSpecV1:chatSpec?.audit||null,
      scenarioSummary:chatSpec?.scenarioSummary||[],
      firstFamilies:chatSpec?.families||[],
      lineFallbackAudit:{
        lineConfidence:raceMeta.lineConfidence,
        officialLineUnavailable:raceMeta.raceCategory!=="girls"&&raceMeta.lineConfidence!=="高",
        lineIndependentFallbackBranchCount:(prediction.branches||[]).filter(branch=>branch.lineIndependentFallback===true).length,
        lineIndependentMainAvailable,
        blanketLinePurchaseBlockApplied:lineBlocked,
        flatEvidenceWarning:lineFallbackEvidenceInsufficient,
        flatEvidencePurchaseBlockApplied:lineFallbackEvidenceBlocked,
        lineAndStartEvidenceBlockApplied:lineAndStartEvidenceBlocked,
        startEvidenceCount,startEvidenceRequired,
        startEvidenceWarning:Boolean(raceMeta.raceCategory!=="girls"&&raceMeta.lineConfidence!=="高"&&startEvidenceCount<startEvidenceRequired),
        referenceBreadthPolicy:lineFallbackEvidenceBlocked?"FLAT_EVIDENCE_POSITION_BALANCED_REFERENCE_SET":"STANDARD_REFERENCE_SELECTION",
        referenceToStandardTransitionAudit,
        discriminationAudit:lineFallbackDiscriminationAudit,
        unresolvedRelationPolicy:"UNKNOWN_LINE_RELATION_IS_UNCERTAIN_NOT_OTHER_LINE",
        nodeProbabilityPolicy:"NO_DOUBLE_PENALTY_FOR_LINE_INDEPENDENT_FALLBACK"
      },
      terminalLifecycleAudit,
      predictionPurchaseBoundaryAudit:boundaryAudit,
      enginePairAudit,
      selectionBoundaryAudit:{version:"STANDARD-REFERENCE-SELECTION-1.0",standardBetCount:standardPurchasePlan.length,referenceBetCount:referencePurchasePlan.length,referenceExcludedFromFunding:true,referenceExcludedFromStandardPurchase:true,passed:standardPurchasePlan.every(x=>x.betClass!=="REFERENCE")&&referencePurchasePlan.every(x=>x.betClass==="REFERENCE")}
    }
  };
}

export function buildPurchaseEligibility({purchase={},standardPurchasePlan=[],referencePurchasePlan=[],budget=0}={}){
  const standardBetCount=standardPurchasePlan.length,minimumRequired=standardBetCount*100;
  const budgetSufficient=Number(budget||0)>=minimumRequired;
  const canPurchase=!purchase.noBet&&standardBetCount>0&&budgetSufficient;
  const reasonCode=canPurchase?null:(purchase.noBetReason||(!standardBetCount&&referencePurchasePlan.length?"REFERENCE_ONLY":!standardBetCount?"NO_STANDARD_PURCHASE_CANDIDATE":"BUDGET_INSUFFICIENT"));
  return{version:"PURCHASE-ELIGIBILITY-1.0",state:canPurchase?"PURCHASE_ALLOWED":"PURCHASE_BLOCKED",canPurchase,noBet:!canPurchase,reasonCode,standardBetCount,referenceBetCount:referencePurchasePlan.length,budget:Number(budget||0),minimumRequired,budgetSufficient,allowMainCoverPurchase:canPurchase,allowThick:canPurchase,allowFunding:canPurchase,showPurchasePanel:canPurchase};
}

function deepClone(value){return JSON.parse(JSON.stringify(value));}
function fingerprintPrediction(terminals=[]){
  return JSON.stringify((terminals||[]).map(item=>({order:item.order,probability:Number(item.probability)||0,score:Number(item.score)||0,branches:item.contributingBranches||[]})));
}
