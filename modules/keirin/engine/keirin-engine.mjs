import{scoreKeirinParticipants}from"../sports/keirin-scoring.mjs";
import{buildLines}from"../sports/keirin-lines.mjs";
import{generateKeirinBranches}from"../sports/keirin-branches.mjs";
import{generateKeirinTerminals}from"../sports/keirin-terminals.mjs";
import{audit}from"./audit.mjs";
import{composite,allocate,purchaseDiagnostics}from"./purchase.mjs";
import{applyChatSpecV1}from"./chat-spec-v1-policy.mjs";
import{buildWholeLinkageAudit}from"./whole-linkage-audit.mjs";

export function runKeirinEngine({race,venueProfile={},oddsByOrder={},budget=3000}){
  const scored=scoreKeirinParticipants({race,venueProfile});
  const lines=buildLines(scored);
  const branches=generateKeirinBranches({scored,lines,lineConfidence:race.lineConfidence,raceCategory:race.raceCategory||"standard"});
  const terminals=generateKeirinTerminals({scored,branches});
  const terminalGenerationAudit=terminals.generationAudit||null;
  const a=audit({race,branches,terminals});
  const chatSpec=a.passed?applyChatSpecV1({scored,lines,branches,terminals,oddsByOrder}):null;
  const rawClassified=a.passed?chatSpec.terminals:terminals.map(item=>({...item,betClass:"NONE",purchaseStatus:"購入不採用",purchaseReason:`エンジン生成監査不通過: ${(a.errors||[]).slice(0,3).join(" / ")||"原因未記録"}`,purchaseRejectCode:"ENGINE_AUDIT_FAILED",lifecycle:{generated:true,probabilityEvaluated:true,terminalDeleted:false,purchaseDecision:"REJECTED",purchaseDecisionCode:"ENGINE_AUDIT_FAILED",purchaseDecisionReason:`エンジン生成監査不通過: ${(a.errors||[]).slice(0,3).join(" / ")||"原因未記録"}`}}));
  const wholeLinkageAudit=buildWholeLinkageAudit({scored,lines,branches,terminals:rawClassified});
  const lineBlocked=a.passed&&race.raceCategory!=="girls"&&race.lineConfidence!=="高";
  const girlsStartEvidenceCount=scored.filter(item=>item?.startPowerEvidence&&(!Array.isArray(item.startPowerEvidence.missingInputs)||item.startPowerEvidence.missingInputs.length===0)).length;
  const girlsEvidenceRequired=Math.max(3,Math.ceil(scored.length*.5));
  const girlsEvidenceBlocked=a.passed&&race.raceCategory==="girls"&&girlsStartEvidenceCount<girlsEvidenceRequired;
  const mainInvariantBlocked=Boolean(a.passed&&chatSpec&&!chatSpec.audit?.mainInvariant?.passed);
  const purchaseBlocked=lineBlocked||girlsEvidenceBlocked||mainInvariantBlocked;
  const blockedReason=lineBlocked
    ?"公式ライン未取得のため購入判定を保留"
    :girlsEvidenceBlocked
      ?"ガールズ主導権の公式入力が不足しているため購入判定を保留"
      :"中心シナリオから本線となる自然終端を確定できませんでした。予想成立条件を満たしていないため購入処理を停止しました。";
  const classified=purchaseBlocked
    ? rawClassified.map(item=>({...item,betClass:"NONE",purchaseStatus:"購入不採用",purchaseReason:blockedReason,purchaseRejectCode:lineBlocked?"LINE_DATA_UNAVAILABLE":girlsEvidenceBlocked?"GIRLS_LEAD_EVIDENCE_UNAVAILABLE":"MAIN_INVARIANT_FAILED",lifecycle:{...(item.lifecycle||{}),generated:true,probabilityEvaluated:true,terminalDeleted:false,purchaseDecision:"REJECTED",purchaseDecisionCode:lineBlocked?"LINE_DATA_UNAVAILABLE":girlsEvidenceBlocked?"GIRLS_LEAD_EVIDENCE_UNAVAILABLE":"MAIN_INVARIANT_FAILED",purchaseDecisionReason:blockedReason}}))
    : rawClassified;
  const plan=a.passed&&!purchaseBlocked?allocate(classified,budget):[];
  const purchase=purchaseDiagnostics(classified,plan,budget);
  const terminalLifecycleAudit=buildTerminalLifecycleAudit({sourceTerminals:terminals,classified,terminalGenerationAudit});
  if(purchaseBlocked){purchase.noBet=true;purchase.noBetReason=lineBlocked?"LINE_DATA_UNAVAILABLE":girlsEvidenceBlocked?"GIRLS_LEAD_EVIDENCE_UNAVAILABLE":"MAIN_INVARIANT_FAILED";purchase.purchaseCandidateCountBeforeCompression=0;purchase.purchaseCandidateCountAfterCompression=0;purchase.finalBetCount=0;purchase.minimumRequired=0;}
  purchase.girlsStartEvidenceCount=girlsStartEvidenceCount;
  purchase.girlsStartEvidenceRequired=race.raceCategory==="girls"?girlsEvidenceRequired:null;

  return{
    engineVersion:"KEIRIN-0.6.9-main-invariant-branch-head-gate",
    raceId:race.id,
    lineConfidence:race.lineConfidence,
    scored,lines,branches,terminals:classified,
    audit:{
      ...a,
      branchSelectionAudit:buildBranchSelectionAudit(branches),
      branchCount:branches.length,
      completedBranchCount:branches.filter(branch=>terminals.some(terminal=>terminal.contributingBranches.includes(branch.id))).length,
      ...purchase,
      terminalGenerationAudit,
      terminalLifecycleAudit,
      startPowerInputAudit:buildStartPowerInputAudit(scored),
      chatSpecV1:chatSpec?.audit||null,
      scenarioSummary:chatSpec?.scenarioSummary||[],
      firstFamilies:chatSpec?.families||[],
      wholeLinkageAudit
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

function buildStartPowerInputAudit(scored){
  const rows=(Array.isArray(scored)?scored:[]).map(item=>{
    const e=item?.startPowerEvidence||null;
    const missing=Array.isArray(e?.missingInputs)?e.missingInputs.filter(Boolean):[];
    const hasEvidence=Boolean(e);
    const hasComputed=Number.isFinite(Number(item?.startPower));
    let status="VERIFIED";
    if(!hasEvidence)status="EVIDENCE_UNAVAILABLE";
    else if(missing.length)status="MISSING_INPUTS";
    else if(Number(e?.officialTotalStarts)===0)status="ZERO_STARTS";
    else if(!hasComputed)status="VALUE_UNAVAILABLE";
    return{
      number:Number(item?.number),
      status,
      auditable:hasEvidence,
      verified:status==="VERIFIED",
      startPower:hasComputed?Number(item.startPower):null,
      confidence:e?.confidence||null,
      missingInputs:missing,
      profileIdentityPassed:e?.profileIdentityPassed===true,
      officialTotalStarts:numberOrNull(e?.officialTotalStarts),
      rawBackCount:numberOrNull(e?.rawBackCount),
      rawHomeCount:numberOrNull(e?.rawHomeCount),
      bFrequency:numberOrNull(e?.bFrequency),
      hFrequency:numberOrNull(e?.hFrequency),
      shrunkBFrequency:numberOrNull(e?.shrunkBFrequency),
      shrunkHFrequency:numberOrNull(e?.shrunkHFrequency),
      bPercentileScore:numberOrNull(e?.bPercentileScore),
      hPercentileScore:numberOrNull(e?.hPercentileScore),
      latentScore:numberOrNull(e?.latentScore),
      raceCategory:e?.raceCategory||null,
      priorStrength:numberOrNull(e?.priorStrength),
      startsQuality:numberOrNull(e?.startsQuality)
    };
  });
  const verifiedCount=rows.filter(row=>row.verified).length;
  const missingCount=rows.filter(row=>row.status==="MISSING_INPUTS").length;
  const unavailableCount=rows.filter(row=>["EVIDENCE_UNAVAILABLE","VALUE_UNAVAILABLE"].includes(row.status)).length;
  return{
    policy:"REQUIRED_OR_EXPLICITLY_UNAUDITABLE",
    totalRiders:rows.length,
    verifiedCount,
    missingCount,
    unavailableCount,
    passed:rows.length>0&&unavailableCount===0,
    rows
  };
}
function numberOrNull(value){
  if(value===null||value===undefined||value==="")return null;
  const n=Number(value);
  return Number.isFinite(n)?n:null;
}

function buildTerminalLifecycleAudit({sourceTerminals,classified,terminalGenerationAudit}){
  const sourceKeys=new Set((sourceTerminals||[]).map(item=>item.order.join("-")));
  const classifiedKeys=new Set((classified||[]).map(item=>item.order.join("-")));
  const violations=[];
  for(const key of sourceKeys)if(!classifiedKeys.has(key))violations.push(`確率・購入評価前後で終端消失:${key}`);
  for(const item of classified||[]){
    if(!Number.isFinite(Number(item.probability)))violations.push(`確率未評価:${item.order.join("-")}`);
    if(item.purchaseStatus!=="購入採用"&&(!item.purchaseRejectCode||item.purchaseRejectCode==="UNCLASSIFIED"||!item.purchaseReason))violations.push(`購入不採用理由なし:${item.order.join("-")}`);
    if(item.lifecycle?.terminalDeleted)violations.push(`終端削除フラグ検出:${item.order.join("-")}`);
  }
  if(Number(terminalGenerationAudit?.unexplainedExclusionCount||0)>0)violations.push(`生成段階の理由なし除外:${terminalGenerationAudit.unexplainedExclusionCount}件`);
  const preserved=sourceKeys.size===classifiedKeys.size&&[...sourceKeys].every(key=>classifiedKeys.has(key));
  return{
    policy:"GENERATE_ALL_SUPPORTED_TERMINALS_THEN_SCORE_THEN_PURCHASE",
    terminalDeletionPolicy:"終端は低確率・低人気・点数圧縮を理由に削除禁止。競技上不成立・入力矛盾のみ生成段階で理由付き除外、重複は統合。",
    allowedGenerationExclusionReasonGroups:["RULE_IMPOSSIBLE","DATA_CONTRADICTION","DUPLICATE"],
    generatedTerminalCount:sourceKeys.size,
    probabilityEvaluatedTerminalCount:classified.length,
    purchaseDecisionTerminalCount:classified.length,
    preservedAcrossStages:preserved,
    unreasonedPurchaseRejectCount:(classified||[]).filter(item=>item.purchaseStatus!=="購入採用"&&(!item.purchaseRejectCode||item.purchaseRejectCode==="UNCLASSIFIED"||!item.purchaseReason)).length,
    unexplainedGenerationExclusionCount:Number(terminalGenerationAudit?.unexplainedExclusionCount||0),
    fixedRankDeletionApplied:false,
    fixedProbabilityDeletionApplied:false,
    passed:preserved&&violations.length===0,
    violations,
    rows:(classified||[]).map(item=>({order:item.order.join("-"),probability:Number(item.probability)||0,purchaseStatus:item.purchaseStatus,purchaseRejectCode:item.purchaseRejectCode||null,purchaseReason:item.purchaseReason||null,betClass:item.betClass||"NONE",dominantBranchId:item.dominantBranchId||null,dominantBranchLabel:item.dominantBranchLabel||null,terminalDeleted:false}))
  };
}
