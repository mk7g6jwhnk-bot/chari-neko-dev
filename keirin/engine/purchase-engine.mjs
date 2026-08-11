import{composite,allocate,purchaseDiagnostics}from"./purchase.mjs";
import{applyChatSpecV1}from"./chat-spec-v1-policy.mjs";
import{
  buildReferenceToStandardTransitionAudit,buildLineFallbackDiscriminationAudit,buildNonZeroReferencePlan,
  buildReferencePositionBalanceAudit,buildTerminalLifecycleAudit,isUsableStartPower
}from"./engine-support.mjs";

export function runKeirinPurchaseEngine({prediction,oddsByOrder={},budget=3000}){
  if(!prediction||!Array.isArray(prediction.terminals))throw new Error("prediction snapshot is required");
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
    ?chatSpec.terminals
    :purchaseInput.map(item=>({...item,betClass:"NONE",purchaseStatus:"購入不採用",purchaseReason:`エンジン生成監査不通過: ${(prediction.audit?.errors||[]).slice(0,3).join(" / ")||"原因未記録"}`,purchaseRejectCode:"ENGINE_AUDIT_FAILED",lifecycle:{generated:true,probabilityEvaluated:true,terminalDeleted:false,purchaseDecision:"REJECTED",purchaseDecisionCode:"ENGINE_AUDIT_FAILED",purchaseDecisionReason:`エンジン生成監査不通過: ${(prediction.audit?.errors||[]).slice(0,3).join(" / ")||"原因未記録"}`}}));

  const lineIndependentMainAvailable=(prediction.branches||[]).some(branch=>branch.lineIndependentFallback===true&&branch.priority==="main");
  const lineFallbackDiscriminationAudit=buildLineFallbackDiscriminationAudit({
    scored:prediction.scored||[],terminals:rawClassified,lineIndependentMainAvailable
  });
  const startEvidenceCount=(prediction.scored||[]).filter(item=>isUsableStartPower(item)).length;
  const startEvidenceRequired=Math.max(3,Math.ceil((prediction.scored||[]).length*.5));
  const lineAndStartEvidenceBlocked=Boolean(generationPassed&&raceMeta.raceCategory!=="girls"&&raceMeta.lineConfidence!=="高"&&startEvidenceCount<startEvidenceRequired);
  const lineFallbackEvidenceBlocked=Boolean(generationPassed&&raceMeta.raceCategory!=="girls"&&raceMeta.lineConfidence!=="高"&&!lineAndStartEvidenceBlocked&&lineIndependentMainAvailable&&!lineFallbackDiscriminationAudit.sufficient);
  const lineBlocked=generationPassed&&raceMeta.raceCategory!=="girls"&&raceMeta.lineConfidence!=="高"&&!lineAndStartEvidenceBlocked&&!lineIndependentMainAvailable;
  const girlsEvidenceBlocked=generationPassed&&raceMeta.raceCategory==="girls"&&startEvidenceCount<startEvidenceRequired;
  const mainInvariantBlocked=Boolean(generationPassed&&chatSpec&&!chatSpec.audit?.mainInvariant?.passed);
  const purchaseBlocked=lineBlocked||lineAndStartEvidenceBlocked||lineFallbackEvidenceBlocked||girlsEvidenceBlocked||mainInvariantBlocked;
  const blockedReason=lineBlocked
    ?"公式ライン未取得のため購入判定を保留"
    :lineAndStartEvidenceBlocked
      ?"公式ライン未取得かつ主導権入力も不足しているため通常購入を保留し、参考買い目だけを表示します。"
      :lineFallbackEvidenceBlocked
        ?"公式ライン未取得かつ選手間の着順評価差が不足しています。全員を本線扱いせず、参考買い目だけを表示します。"
        :girlsEvidenceBlocked
          ?"ガールズ主導権の公式入力が不足しているため購入判定を保留"
          :"中心シナリオから本線となる自然終端を確定できませんでした。予想成立条件を満たしていないため購入処理を停止しました。";
  const blockCode=lineBlocked
    ?"LINE_DATA_UNAVAILABLE"
    :lineAndStartEvidenceBlocked
      ?"LINE_AND_START_EVIDENCE_UNAVAILABLE"
      :lineFallbackEvidenceBlocked
        ?"LINE_FALLBACK_INSUFFICIENT_DISCRIMINATION"
        :girlsEvidenceBlocked
          ?"GIRLS_LEAD_EVIDENCE_UNAVAILABLE"
          :"MAIN_INVARIANT_FAILED";
  const classified=purchaseBlocked
    ?rawClassified.map(item=>({...item,betClass:"NONE",purchaseStatus:"購入不採用",purchaseReason:blockedReason,purchaseRejectCode:blockCode,lifecycle:{...(item.lifecycle||{}),generated:true,probabilityEvaluated:true,terminalDeleted:false,purchaseDecision:"REJECTED",purchaseDecisionCode:blockCode,purchaseDecisionReason:blockedReason}}))
    :rawClassified;
  const normalPlan=generationPassed&&!purchaseBlocked?allocate(classified,budget):[];
  const fallbackPlan=generationPassed&&normalPlan.length===0&&prediction.terminals.length
    ?buildNonZeroReferencePlan({rawClassified,classified,budget,blockedReason:purchaseBlocked?blockedReason:"通常購入条件で採用0件",blockCode,lineFallbackDiscriminationAudit,allocator:allocate})
    :[];
  const standardPurchasePlan=normalPlan;
  const referencePurchasePlan=fallbackPlan;
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
  purchase.girlsStartEvidenceCount=startEvidenceCount;
  purchase.girlsStartEvidenceRequired=raceMeta.raceCategory==="girls"?startEvidenceRequired:null;

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
    purchaseVersion:"KEIRIN-PURCHASE-1.1",
    terminals:classified,
    recommendations:{
      main:classified.filter(item=>item.betClass==="MAIN"&&item.purchaseStatus==="購入採用"),
      backup:classified.filter(item=>item.betClass==="COVER"&&item.purchaseStatus==="購入採用"),
      value:classified.filter(item=>item.betClass==="BUYABLE_HIGH"&&item.purchaseStatus==="購入採用"),
      strong:[]
    },
    compositeOdds:composite(standardPurchasePlan),purchasePlan:plan,standardPurchasePlan,referencePurchasePlan,noBet:purchase.noBet,noBetReason:purchase.noBetReason,
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
        flatEvidencePurchaseBlockApplied:lineFallbackEvidenceBlocked,
        lineAndStartEvidenceBlockApplied:lineAndStartEvidenceBlocked,
        startEvidenceCount,startEvidenceRequired,
        referenceBreadthPolicy:(lineFallbackEvidenceBlocked||lineAndStartEvidenceBlocked)?"FLAT_EVIDENCE_POSITION_BALANCED_REFERENCE_SET":"STANDARD_REFERENCE_SELECTION",
        referenceToStandardTransitionAudit,
        discriminationAudit:lineFallbackDiscriminationAudit,
        unresolvedRelationPolicy:"UNKNOWN_LINE_RELATION_IS_UNCERTAIN_NOT_OTHER_LINE",
        nodeProbabilityPolicy:"NO_DOUBLE_PENALTY_FOR_LINE_INDEPENDENT_FALLBACK"
      },
      terminalLifecycleAudit,
      predictionPurchaseBoundaryAudit:boundaryAudit,
      selectionBoundaryAudit:{version:"STANDARD-REFERENCE-SELECTION-1.0",standardBetCount:standardPurchasePlan.length,referenceBetCount:referencePurchasePlan.length,referenceExcludedFromFunding:true,referenceExcludedFromStandardPurchase:true,passed:standardPurchasePlan.every(x=>x.betClass!=="REFERENCE")&&referencePurchasePlan.every(x=>x.betClass==="REFERENCE")}
    }
  };
}

function deepClone(value){return JSON.parse(JSON.stringify(value));}
function fingerprintPrediction(terminals=[]){
  return JSON.stringify((terminals||[]).map(item=>({order:item.order,probability:Number(item.probability)||0,score:Number(item.score)||0,branches:item.contributingBranches||[]})));
}
