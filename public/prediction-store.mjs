import{buildOutcomeDiagnostics}from"./research-outcome-diagnostics.mjs";
import{deriveRiderMarks}from"./rider-marks.mjs";
import{derivePredictionRatings}from"./prediction-ratings.mjs";
export const STORAGE_KEY="chari-neko:keirin-predictions:v1";
const RESEARCH_LEDGER_KEY="chari-neko:keirin-research-learning:v1";
const MAX_RESEARCH_RECORDS=500;
const PROMOTION_REVIEW_KEY="chari-neko:keirin-promotion-reviews:v1";
const MAX_PROMOTION_REVIEWS=200;
const SHADOW_COMPARISON_KEY="chari-neko:keirin-shadow-comparisons:v1";
const MAX_SHADOW_COMPARISONS=300;
const FINAL_APPROVAL_KEY="chari-neko:keirin-final-promotion-approvals:v1";
const MAX_FINAL_APPROVALS=100;
const CANARY_RUN_KEY="chari-neko:keirin-canary-runs:v1";
const MAX_CANARY_RUNS=200;
const PROMOTION_METHODOLOGY_EPOCH="PROMOTION-METHOD-2026-08-V2-SEALED-ISOLATED";
const SHADOW_EVALUATION_EPOCH="SHADOW-EVAL-ISOLATED-NORMALIZED-V1";
const MAX_SNAPSHOTS=60;
const FULL_SNAPSHOT_COUNT=8;

const STANDARD_PURCHASE_CATEGORIES=new Set(["MAIN","COVER","BUYABLE_HIGH"]);
function normalizeBetClass(value){return ({"本線":"MAIN","押さえ":"COVER","買える高配当":"BUYABLE_HIGH","買える万車":"BUYABLE_HIGH","REFERENCE":"REFERENCE","参考買い目":"REFERENCE"})[String(value||"")]||String(value||"NONE");}
function standardPurchasePlanOf(prediction){
  if(Array.isArray(prediction?.standardPurchasePlan))return prediction.standardPurchasePlan;
  return (prediction?.purchasePlan||[]).filter(b=>normalizeBetClass(b?.betClass)!=="REFERENCE"&&b?.referenceOnly!==true);
}
function referencePurchasePlanOf(prediction){
  if(Array.isArray(prediction?.referencePurchasePlan))return prediction.referencePurchasePlan;
  return (prediction?.purchasePlan||[]).filter(b=>b?.betClass==="REFERENCE"||b?.referenceOnly===true);
}
function selectionRows(plan){return (plan||[]).map(b=>({order:b.order.map(Number),category:normalizeBetClass(b.betClass),stake:b.stake??null,odds:b.odds??null,recommendation:b.purchaseStatus||"購入採用",branchLabel:b.dominantBranchLabel||null,branchPriority:b.dominantBranchPriority||null,reason:b.purchaseReason||null,probability:b.probability??null,probabilityShare:b.probabilityShare??null,expectedValueIndex:b.expectedValueIndex??null,globalRank:b.globalRank??null,familyRank:b.familyRank??null,pairRank:b.pairRank??null,firstFamilyNumber:b.firstFamilyNumber??null,firstFamilyTier:b.firstFamilyTier??null,firstFamilyProbability:b.firstFamilyProbability??null,firstFamilyProbabilityShare:b.firstFamilyProbabilityShare??null,secondFamilyRelativeToBest:b.secondFamilyRelativeToBest??null,thirdFamilyRelativeToBest:b.thirdFamilyRelativeToBest??null,decisionRatios:b.decisionRatios||null,evidenceSummary:b.evidenceSummary||null,positionEvidence:b.positionEvidence||null,highPayoutAttribute:Boolean(b.highPayoutAttribute),highPayoutAttributeLabel:b.highPayoutAttributeLabel||null,chatForecastRole:b.chatForecastRole||null,directMainBranchSupport:Boolean(b.directMainBranchSupport),branchHeadMatched:b.branchHeadMatched!==false,naturalConvergenceScore:b.naturalConvergenceScore??null,naturalConvergenceLevel:b.naturalConvergenceLevel||null,naturalConvergenceReasons:b.naturalConvergenceReasons||[],extraConditionCount:b.extraConditionCount??0,relativeConditionCount:b.relativeConditionCount??0,relativeConditionPenalty:b.relativeConditionPenalty??1,relativeConditionTrace:b.relativeConditionTrace||[],probabilitySeparationPolicy:b.probabilitySeparationPolicy||null,scenarioCoherence:b.scenarioCoherence??null,nodeConditionalProbability:b.nodeConditionalProbability??null,nodeTrace:b.nodeTrace||null,purchaseReason:b.purchaseReason||b.reason||null,dominantBranchId:b.dominantBranchId||null,dominantBranchLabel:b.dominantBranchLabel||b.branchLabel||null,coverParentOrder:b.coverParentOrder||null,coverParentType:b.coverParentType||null,orphanCover:Boolean(b.orphanCover)}));}
function normalizeSelectionBoundary(snapshot){
  if(!snapshot||typeof snapshot!=="object")return snapshot;
  const raw=Array.isArray(snapshot.betSelections)?snapshot.betSelections:[];
  const explicitRefs=Array.isArray(snapshot.referenceBetSelections)?snapshot.referenceBetSelections:[];
  const legacyRefs=raw.filter(b=>b?.category==="REFERENCE");
  const standard=raw.filter(b=>b?.category!=="REFERENCE");
  const refs=explicitRefs.length?explicitRefs:legacyRefs;
  return {...snapshot,betSelections:standard,referenceBetSelections:refs,standardBetCount:standard.length,referenceBetCount:refs.length};
}

export function raceKey(race){return [normalizeDate(race.date),String(race.venueCode||""),Number(race.raceNo)].join(":")}
export function createSnapshot(payload,now=new Date()){
  const race=payload.race||{},prediction=payload.prediction||{};
  const createdAt=now.toISOString(),key=raceKey(race);
  const snapshot={predictionSnapshotId:`${key}:${createdAt}`,createdAt,targetRace:{date:normalizeDate(race.date),venueCode:String(race.venueCode||""),venueName:race.venue||race.venueName||"",raceNo:Number(race.raceNo),raceCategory:race.raceCategory||"standard",lineMode:race.lineMode||"official_line",scheduledStart:race.startTime||race.deadline||"",deadline:race.deadline||race.startTime||""},participants:(race.participants||[]).map(p=>({number:Number(p.number),name:p.name||"",registration:p.registration||"",sourceType:p.sourceType||null,sourcePath:p.sourcePath||null,className:p.className||"",prefecture:p.prefecture||"",lineId:p.lineId||null,line:p.line||null,linePosition:p.linePosition??null,lineOrder:p.lineOrder??null,role:p.role||null,lineStatus:p.lineStatus||null})),predictionVersion:prediction.engineVersion||"STABLE",abilitiesUsed:(prediction.scored||[]).map(p=>({number:p.number,recentForm:p.recentForm??null,startPower:p.startPower??null,startPowerEvidence:p.startPowerEvidence||null,sprintPower:p.sprintPower??null,finishPower:p.finishPower??null,trackingSkill:p.trackingSkill??null,kimariteAbilityEvidence:p.kimariteAbilityEvidence||null,abilityMissingAudit:p.abilityMissingAudit||null,roleScores:p.roleScores||null,riderEvaluationV2:p.riderEvaluationV2||null,scoreTrace:p.scoreTrace||null})),predictionOutput:{recommendationLabel:prediction.recommendationLabel||"",audit:prediction.audit||null,lineConfidence:prediction.lineConfidence||race.lineConfidence||null,lineMode:race.lineMode||payload.dataQuality?.lineMode||null,noBet:Boolean(prediction.noBet),noBetReason:prediction.noBetReason||null},predictionExplanation:prediction.predictionExplanation||prediction?.prediction?.explanation||null,branches:prediction.branches||[],terminalLedger:(prediction.terminals||[]).map(t=>({order:(t.order||[]).map(Number),probability:t.probability??null,purchaseStatus:t.purchaseStatus||null,purchaseRejectCode:t.purchaseRejectCode||null,purchaseReason:t.purchaseReason||null,betClass:t.betClass||"NONE",dominantBranchId:t.dominantBranchId||t.branchId||null,dominantBranchLabel:t.dominantBranchLabel||t.branchLabel||null,chatForecastRole:t.chatForecastRole||null,directMainBranchSupport:Boolean(t.directMainBranchSupport),branchHeadMatched:t.branchHeadMatched!==false,naturalConvergenceScore:t.naturalConvergenceScore??null,naturalConvergenceLevel:t.naturalConvergenceLevel||null,extraConditionCount:t.extraConditionCount??0,relativeConditionCount:t.relativeConditionCount??0,relativeConditionPenalty:t.relativeConditionPenalty??1,relativeConditionTrace:t.relativeConditionTrace||[],probabilitySeparationPolicy:t.probabilitySeparationPolicy||null,nodeConditionalProbability:t.nodeConditionalProbability??null,nodeSummary:summarizeNodeTrace(t.nodeTrace),terminalGlobalRank:t.terminalGlobalRank??null,terminalFamilyRank:t.terminalFamilyRank??null,terminalPairRank:t.terminalPairRank??null,firstFamilyNumber:t.firstFamilyNumber??t.order?.[0]??null,terminalDeleted:Boolean(t.lifecycle?.terminalDeleted)})),betSelections:selectionRows(standardPurchasePlanOf(prediction)),referenceBetSelections:selectionRows(referencePurchasePlanOf(prediction)),standardBetCount:standardPurchasePlanOf(prediction).length,referenceBetCount:referencePurchasePlanOf(prediction).length,category:prediction.recommendationLabel||"",recommendation:prediction.noBet?"見送り":prediction.recommendationLabel||"",noBet:Boolean(prediction.noBet),noBetReason:prediction.noBetReason||null,oddsSnapshot:payload.odds||null,result:null};
  const scenarioByOrder=new Map([...standardPurchasePlanOf(prediction),...referencePurchasePlanOf(prediction)].map(item=>[(item.order||[]).join("-"),item]));
  const attachScenario=selection=>{const source=scenarioByOrder.get((selection.order||[]).join("-"));return{...selection,scenarioExplanation:source?.scenarioExplanation||null,explanationContext:source?.explanationContext||null}};
  snapshot.betSelections=snapshot.betSelections.map(attachScenario);
  snapshot.referenceBetSelections=snapshot.referenceBetSelections.map(attachScenario);
  snapshot.displayRatings=derivePredictionRatings(snapshot);snapshot.riderMarks=deriveRiderMarks(snapshot);
  return snapshot;
}
function summarizeNodeTrace(trace){
  if(!Array.isArray(trace)||!trace.length)return null;
  const out={};
  for(const node of trace){
    const stage=node?.stage;
    if(!["FIRST","SECOND","THIRD"].includes(stage))continue;
    const conditions=Array.isArray(node?.newRequiredConditions)?node.newRequiredConditions:[];
    out[stage]={
      event:node?.event?{participantNumber:Number(node.event.participantNumber),position:Number(node.event.position),label:node.event.label||null}:null,
      conditionalProbability:Number.isFinite(Number(node?.conditionalProbability))?Number(node.conditionalProbability):null,
      newConditionCount:conditions.length,
      extraConditionCount:conditions.filter(c=>c?.kind==="extra").length,
      criticalConditionCount:conditions.filter(c=>c?.critical===true).length,
      conditionLabels:conditions.slice(0,6).map(c=>c?.label).filter(Boolean),
      conditions:conditions.slice(0,6).map(c=>({id:c?.id||null,label:c?.label||null,kind:c?.kind||null,probability:Number.isFinite(Number(c?.probability))?Number(c.probability):null,critical:Boolean(c?.critical),
        requires:c?.requires||{},sets:c?.sets||{},forbids:c?.forbids||{},
        mechanism:c?.mechanism||null
      })).filter(c=>c.id||c.label),
      worldFacts:node?.resultingState?.facts||{},
      worldFactConflicts:Array.isArray(node?.worldFactConflicts)?node.worldFactConflicts.slice(0,4):[]
    };
  }
  return Object.keys(out).length?out:null;
}

export function saveSnapshot(storage,snapshot){
  const all=loadSnapshots(storage);const duplicate=all.find(x=>raceKey(x.targetRace)===raceKey(snapshot.targetRace)&&x.predictionVersion===snapshot.predictionVersion&&JSON.stringify(x.betSelections)===JSON.stringify(snapshot.betSelections)&&JSON.stringify(x.referenceBetSelections||[])===JSON.stringify(snapshot.referenceBetSelections||[])&&!x.result);if(duplicate)return duplicate;
  const next=[snapshot,...all].slice(0,MAX_SNAPSHOTS);
  persistSnapshots(storage,next);
  return snapshot;
}
export function loadSnapshots(storage){try{const value=JSON.parse(storage.getItem(STORAGE_KEY)||"[]");return Array.isArray(value)?value.map(normalizeSelectionBoundary):[]}catch{return[]}}
export function findLatestSnapshot(storage,race){return loadSnapshots(storage).filter(x=>raceKey(x.targetRace)===raceKey(race)).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))[0]||null}
export function attachResult(storage,snapshotId,official,now=new Date()){
  const all=loadSnapshots(storage),index=all.findIndex(x=>x.predictionSnapshotId===snapshotId);
  if(index<0)throw new Error("保存済み予想が見つかりません");
  const result=evaluateResult(all[index],official,now);
  all[index]={...all[index],result};
  persistSnapshots(storage,all);
  const researchRecord=buildResearchLearningRecord(all[index],result);
  saveResearchLearningRecord(storage,applyDirectOfficialEvidence(researchRecord,result.officialEvidence,now));
  return all[index];
}

function deriveEvidenceLearningState(evidence,{includeInNormalLearning=false,learningMode=null}={}){
  const rows=Array.isArray(evidence)?evidence:[];
  const total=rows.length;
  const confirmed=rows.filter(x=>x.status==="CONFIRMED").length;
  const refuted=rows.filter(x=>x.status==="REFUTED").length;
  const unknown=rows.filter(x=>x.status==="UNKNOWN").length;
  const pending=rows.filter(x=>x.status==="EVIDENCE_PENDING").length;
  const reviewComplete=total>0&&pending===0;
  const decisiveEvidenceComplete=total>0&&unknown===0&&pending===0&&(confirmed+refuted===total);
  const normalLearningEligible=Boolean(includeInNormalLearning)||learningMode==="NORMAL";
  const nodeCauseLearningEligible=decisiveEvidenceComplete&&normalLearningEligible;
  let nodeCauseLearningReason="証拠レビュー未完了";
  if(reviewComplete&&!decisiveEvidenceComplete)nodeCauseLearningReason="レビュー完了だがUNKNOWNを含むため因果学習不可";
  else if(decisiveEvidenceComplete&&!normalLearningEligible)nodeCauseLearningReason="証拠は全件確定したが通常学習対象外";
  else if(nodeCauseLearningEligible)nodeCauseLearningReason="全条件がCONFIRMED/REFUTEDで確定し通常学習対象";
  return{
    total,confirmed,refuted,unknown,pending,
    reviewComplete,fullyReviewed:reviewComplete,
    decisiveEvidenceComplete,normalLearningEligible,
    nodeCauseLearningEligible,nodeCauseLearningReason,
    autoResolved:rows.filter(x=>x.autoResolved===true).length
  };
}

export function updateResearchConditionEvidence(storage,{snapshotId,evidenceKey,status,source=null,note=null,now=new Date()}={}){
  const allowed=new Set(["CONFIRMED","REFUTED","UNKNOWN","EVIDENCE_PENDING"]);
  if(!snapshotId||!evidenceKey)throw new Error("検証対象の予想・条件を指定してください");
  if(!allowed.has(status))throw new Error("不正な証拠判定です");
  const rows=loadResearchLearningRecords(storage),index=rows.findIndex(r=>r.predictionSnapshotId===snapshotId);
  if(index<0)throw new Error("研究学習レコードが見つかりません");
  const evidence=Array.isArray(rows[index].conditionEvidence)?rows[index].conditionEvidence:[];
  const target=evidence.find(x=>x.evidenceKey===evidenceKey);
  if(!target)throw new Error("検証条件が見つかりません");
  Object.assign(target,{status,source:source||null,note:note||null,updatedAt:now.toISOString()});
  const state=deriveEvidenceLearningState(evidence,rows[index]);
  rows[index].nodeCauseLearningEligible=state.nodeCauseLearningEligible;
  rows[index].nodeCauseLearningReason=state.nodeCauseLearningReason;
  rows[index].evidenceReviewComplete=state.reviewComplete;
  rows[index].decisiveEvidenceComplete=state.decisiveEvidenceComplete;
  rows[index].evidenceSummary=state;
  storage.setItem(RESEARCH_LEDGER_KEY,JSON.stringify(rows.slice(0,MAX_RESEARCH_RECORDS)));
  return rows[index];
}
export function researchEvidenceQueue(storage,{onlyPending=true}={}){
  return loadResearchLearningRecords(storage).flatMap(r=>(Array.isArray(r.conditionEvidence)?r.conditionEvidence:[]).filter(e=>!onlyPending||e.status==="EVIDENCE_PENDING").map(e=>({predictionSnapshotId:r.predictionSnapshotId,raceKey:r.raceKey,date:r.date,venueName:r.venueName,raceNo:r.raceNo,learningMode:r.learningMode,...e})));
}

export function loadPromotionReviews(storage){
  try{
    const rows=JSON.parse(storage.getItem(PROMOTION_REVIEW_KEY)||"[]");
    return Array.isArray(rows)?rows:[];
  }catch{return[]}
}
export function savePromotionReview(storage,{packageKey,packageFingerprint=null,methodologyEpoch=PROMOTION_METHODOLOGY_EPOCH,decision,note="",reviewer="manual",now=new Date()}={}){
  const allowed=new Set(["APPROVE_SHADOW","HOLD","REJECT"]);
  if(!packageKey)throw new Error("昇格候補パッケージを指定してください");
  if(!allowed.has(decision))throw new Error("審査結果が不正です");
  if(decision==="APPROVE_SHADOW"&&!packageFingerprint)throw new Error("現行方法論のパッケージ指紋がないためシャドー承認できません");
  const rows=loadPromotionReviews(storage),previous=rows.find(x=>x.packageKey===packageKey)||null;
  const record={
    reviewVersion:"PROMOTION-REVIEW-1.1-METHODOLOGY-BOUND",
    packageKey,packageFingerprint:packageFingerprint||null,methodologyEpoch,
    decision,note:String(note||"").trim().slice(0,500),
    reviewer:String(reviewer||"manual"),reviewedAt:now.toISOString(),
    productionWriteAllowed:false,
    shadowActivationAllowed:decision==="APPROVE_SHADOW"&&Boolean(packageFingerprint)&&methodologyEpoch===PROMOTION_METHODOLOGY_EPOCH,
    previousDecision:previous?.decision||null,previousPackageFingerprint:previous?.packageFingerprint||null
  };
  storage.setItem(PROMOTION_REVIEW_KEY,JSON.stringify([record,...rows.filter(x=>x.packageKey!==packageKey)].slice(0,MAX_PROMOTION_REVIEWS)));
  return record;
}
export function promotionReviewFor(storage,packageKey){
  return loadPromotionReviews(storage).find(x=>x.packageKey===packageKey)||null;
}
export function summarizePromotionReviews(storage){
  const rows=loadPromotionReviews(storage);
  return{
    total:rows.length,
    approvedShadow:rows.filter(x=>x.decision==="APPROVE_SHADOW").length,
    hold:rows.filter(x=>x.decision==="HOLD").length,
    rejected:rows.filter(x=>x.decision==="REJECT").length,
    productionWriteAllowed:false
  };
}


export function loadShadowComparisons(storage){
  try{
    const rows=JSON.parse(storage.getItem(SHADOW_COMPARISON_KEY)||"[]");
    return Array.isArray(rows)?rows:[];
  }catch{return[]}
}
export function saveShadowComparison(storage,record){
  if(!record?.comparisonId)throw new Error("シャドー比較IDがありません");
  const rows=loadShadowComparisons(storage);
  const next=[record,...rows.filter(x=>x.comparisonId!==record.comparisonId)].slice(0,MAX_SHADOW_COMPARISONS);
  storage.setItem(SHADOW_COMPARISON_KEY,JSON.stringify(next));
  return record;
}
export function summarizeShadowComparisons(storage){
  const rows=loadShadowComparisons(storage),completed=rows.filter(r=>r.status==="RESULT_ATTACHED"),integrityCompleted=completed.filter(r=>r.evaluationIntegrity==="ISOLATED_NORMALIZED"),legacyCompleted=completed.filter(r=>r.evaluationIntegrity!=="ISOLATED_NORMALIZED");
  const qualification=evaluateShadowQualification(rows),finalReview=evaluateFinalPromotionReview(rows,qualification);
  return{total:rows.length,pending:rows.filter(r=>r.status==="PENDING_RESULT").length,completed:completed.length,integrityCompleted:integrityCompleted.length,legacyExcluded:legacyCompleted.length,shadowBetter:integrityCompleted.filter(r=>r.outcome?.winner==="SHADOW").length,currentBetter:integrityCompleted.filter(r=>r.outcome?.winner==="CURRENT").length,tied:integrityCompleted.filter(r=>r.outcome?.winner==="TIE").length,avgCurrentLogLoss:avg(integrityCompleted.map(r=>r.outcome?.currentLogLoss).filter(Number.isFinite)),avgShadowLogLoss:avg(integrityCompleted.map(r=>r.outcome?.shadowLogLoss).filter(Number.isFinite)),qualification,finalReview,productionWriteAllowed:false};
}
export function evaluateShadowQualification(rows){
  const completed=(Array.isArray(rows)?rows:[]).filter(r=>r.status==="RESULT_ATTACHED"),byPackage=new Map();let excludedLegacy=0,excludedOldMethodology=0;const legacyPackageKeys=new Set();
  for(const row of completed)for(const adj of(Array.isArray(row.adjustments)?row.adjustments:[])){if(row.methodologyEpoch!==PROMOTION_METHODOLOGY_EPOCH||row.shadowEvaluationEpoch!==SHADOW_EVALUATION_EPOCH){excludedOldMethodology++;legacyPackageKeys.add(adj.packageKey);continue}const out=packageOutcome(row,adj.packageKey);if(!out){excludedLegacy++;legacyPackageKeys.add(adj.packageKey);continue}if(!byPackage.has(adj.packageKey))byPackage.set(adj.packageKey,[]);byPackage.get(adj.packageKey).push({row,out})}
  const packages=[...byPackage.entries()].map(([packageKey,items])=>{
    const unique=new Map();for(const item of items)unique.set(item.row.comparisonId,item);const samples=[...unique.values()].sort((a,b)=>String(a.row.createdAt).localeCompare(String(b.row.createdAt))),n=samples.length;
    const improvements=samples.map(x=>Number(x.out?.logLossImprovement)).filter(Number.isFinite),avgImprovement=avg(improvements),shadowWins=samples.filter(x=>x.out?.winner==="SHADOW").length,currentWins=samples.filter(x=>x.out?.winner==="CURRENT").length,ties=samples.filter(x=>x.out?.winner==="TIE").length,winShare=n?shadowWins/n:0;
    const recentN=Math.min(20,n),recent=samples.slice(-recentN),recentAvg=avg(recent.map(x=>Number(x.out?.logLossImprovement)).filter(Number.isFinite)),directionFlip=n>=10&&avgImprovement>0&&recentAvg<0;
    const firstHalf=samples.slice(0,Math.floor(n/2)),secondHalf=samples.slice(Math.floor(n/2)),firstAvg=avg(firstHalf.map(x=>Number(x.out?.logLossImprovement)).filter(Number.isFinite)),secondAvg=avg(secondHalf.map(x=>Number(x.out?.logLossImprovement)).filter(Number.isFinite)),temporalStable=n>=20&&firstAvg>0&&secondAvg>0;
    let status="SAMPLE_BUILDING",reason=`孤立パッケージ比較 ${n}件。20件未満は判定保留`;
    if(n>=20){if(directionFlip||recentAvg<=0){status="ROLLBACK_RECOMMENDED";reason="孤立評価の直近サンプルでシャドー改善が消失または反転"}else if(avgImprovement>0&&winShare>=.55&&temporalStable){status="SHADOW_VALIDATED";reason="孤立評価で平均LogLoss改善・勝率55%以上・前後半とも改善"}else{status="SHADOW_CONTINUE";reason="孤立評価20件以上だが、昇格判定またはロールバック判定は未確定"}}
    return{packageKey,n,shadowWins,currentWins,ties,winShare,avgLogLossImprovement:avgImprovement,recentCount:recentN,recentAvgLogLossImprovement:recentAvg,firstHalfAvgImprovement:firstAvg,secondHalfAvgImprovement:secondAvg,temporalStable,directionFlip,status,reason,attributionMode:"ISOLATED_SINGLE_PACKAGE",normalizationMode:"SYMMETRIC_EVALUATION_NORMALIZATION",productionWriteAllowed:false,productionPromotionAllowed:false};
  }).sort((a,b)=>qualificationRank(b.status)-qualificationRank(a.status)||b.n-a.n);
  return{packageCount:packages.length,sampleBuilding:packages.filter(x=>x.status==="SAMPLE_BUILDING").length,continueCount:packages.filter(x=>x.status==="SHADOW_CONTINUE").length,validatedCount:packages.filter(x=>x.status==="SHADOW_VALIDATED").length,rollbackRecommendedCount:packages.filter(x=>x.status==="ROLLBACK_RECOMMENDED").length,excludedLegacy,excludedOldMethodology,legacyPackageKeys:[...legacyPackageKeys],methodologyEpoch:PROMOTION_METHODOLOGY_EPOCH,shadowEvaluationEpoch:SHADOW_EVALUATION_EPOCH,packages,productionWriteAllowed:false,note:"現行方法論epochの孤立・対称正規化比較だけを使用。旧方法論/旧combined記録は判定から除外。"};
}
function qualificationRank(status){
  return({ROLLBACK_RECOMMENDED:4,SHADOW_VALIDATED:3,SHADOW_CONTINUE:2,SAMPLE_BUILDING:1})[status]||0;
}


export function evaluateFinalPromotionReview(rows,qualification){
  const allRows=Array.isArray(rows)?rows:[];
  const packages=Array.isArray(qualification?.packages)?qualification.packages:[];
  const candidates=[];

  for(const q of packages){
    const pkgRows=allRows.filter(r=>r.status==="RESULT_ATTACHED"&&packageOutcome(r,q.packageKey));
    const venues=[...new Set(pkgRows.map(r=>String(r.venueName||"UNKNOWN")).filter(v=>v!=="UNKNOWN"))];
    const resultDates=[...new Set(pkgRows.map(r=>String(r.date||"")).filter(Boolean))].sort();
    const latestDate=resultDates.at(-1)||null;

    const checks=[
      {id:"CURRENT_METHODOLOGY",label:"現行方法論epochの比較のみ",passed:q.attributionMode==="ISOLATED_SINGLE_PACKAGE"&&q.normalizationMode==="SYMMETRIC_EVALUATION_NORMALIZATION"&&qualification?.methodologyEpoch===PROMOTION_METHODOLOGY_EPOCH&&qualification?.shadowEvaluationEpoch===SHADOW_EVALUATION_EPOCH},
      {id:"SHADOW_VALIDATED",label:"シャドー検証済み",passed:q.status==="SHADOW_VALIDATED"},
      {id:"MIN_30_RESULTS",label:"結果付きシャドー比較30件以上",passed:q.n>=30},
      {id:"MIN_3_VENUES",label:"3会場以上で実戦比較",passed:venues.length>=3},
      {id:"POSITIVE_RECENT",label:"直近サンプルでもLogLoss改善",passed:Number(q.recentAvgLogLossImprovement)>0},
      {id:"TEMPORAL_STABLE",label:"前半・後半とも改善",passed:Boolean(q.temporalStable)},
      {id:"WIN_SHARE_55",label:"シャドー勝率55%以上",passed:Number(q.winShare)>=.55},
      {id:"NO_ROLLBACK_SIGNAL",label:"ロールバック信号なし",passed:q.status!=="ROLLBACK_RECOMMENDED"&&!q.directionFlip}
    ];
    const passed=checks.every(x=>x.passed);
    const fingerprint=promotionFingerprint({
      packageKey:q.packageKey,
      n:q.n,
      winShare:q.winShare,
      avg:q.avgLogLossImprovement,
      recent:q.recentAvgLogLossImprovement,
      venues,
      latestDate,methodologyEpoch:PROMOTION_METHODOLOGY_EPOCH,shadowEvaluationEpoch:SHADOW_EVALUATION_EPOCH,attributionMode:q.attributionMode,normalizationMode:q.normalizationMode
    });

    candidates.push({
      packageKey:q.packageKey,
      status:passed?"FINAL_REVIEW_READY":"FINAL_REVIEW_BLOCKED",
      checks,
      passedCount:checks.filter(x=>x.passed).length,
      totalChecks:checks.length,
      comparisonCount:q.n,
      venueCount:venues.length,
      venues,
      latestDate,
      shadowWinShare:q.winShare,
      avgLogLossImprovement:q.avgLogLossImprovement,
      recentAvgLogLossImprovement:q.recentAvgLogLossImprovement,
      fingerprint,
      methodologyEpoch:PROMOTION_METHODOLOGY_EPOCH,shadowEvaluationEpoch:SHADOW_EVALUATION_EPOCH,
      productionWriteAllowed:false,
      productionPromotionAllowed:false,
      finalManualApprovalRequired:true,
      reason:passed
        ?"最終手動審査へ進める条件を満たした。本番反映はまだ禁止"
        :"最終手動審査へ進む条件が不足"
    });
  }

  return{
    readyCount:candidates.filter(x=>x.status==="FINAL_REVIEW_READY").length,
    blockedCount:candidates.filter(x=>x.status==="FINAL_REVIEW_BLOCKED").length,
    candidates:candidates.sort((a,b)=>
      finalReviewRank(b.status)-finalReviewRank(a.status)||
      b.comparisonCount-a.comparisonCount
    ),
    productionWriteAllowed:false,
    note:"FINAL_REVIEW_READYでも本番反映はしない。次工程で最終手動承認と反映方式を別管理する。"
  };
}
function promotionFingerprint(payload){
  const s=JSON.stringify(payload);
  let h=2166136261;
  for(let i=0;i<s.length;i++){
    h^=s.charCodeAt(i);
    h=Math.imul(h,16777619);
  }
  return`FNV1A-${(h>>>0).toString(16).padStart(8,"0")}`;
}
function finalReviewRank(status){
  return({FINAL_REVIEW_READY:2,FINAL_REVIEW_BLOCKED:1})[status]||0;
}

export function normalizeTerminalEvaluationLedger(ledger){
  const entries=(Array.isArray(ledger)?ledger:[]).map(t=>({...t,probability:Number.isFinite(Number(t?.probability))?Math.max(0,Number(t.probability)):0}));
  const rawMassTotal=entries.reduce((s,x)=>s+(Number(x.probability)||0),0);
  const normalized=rawMassTotal>0?entries.map(x=>({...x,evaluationProbability:(Number(x.probability)||0)/rawMassTotal})):entries.map(x=>({...x,evaluationProbability:0}));
  return{version:"SHADOW-EVALUATION-NORMALIZATION-1.0",rawMassTotal,evaluationMassTotal:normalized.reduce((s,x)=>s+(Number(x.evaluationProbability)||0),0),normalizationApplied:rawMassTotal>0&&Math.abs(rawMassTotal-1)>1e-12,entries:normalized};
}
function evaluationLedgerForDisplay(evaluation){return(evaluation?.entries||[]).map(x=>({...x,probability:Number(x.evaluationProbability)||0}))}
function applySingleShadowAdjustment(evaluation,adjustment){
  let entries=(evaluation?.entries||[]).map(x=>({...x,evaluationProbability:Number(x.evaluationProbability)||0}));
  const adj=adjustment||{},ratio=Number(adj.currentProbability)>0?Number(adj.shadowProbability)/Number(adj.currentProbability):1;
  entries=entries.map(t=>{const n=t?.nodeSummary?.[adj.stage];if(!n)return t;const ids=(n.conditions||[]).map(c=>conditionFamily(c?.id||""));return ids.includes(adj.family)?{...t,evaluationProbability:Math.max(0,(Number(t.evaluationProbability)||0)*ratio)}:t});
  const total=entries.reduce((s,x)=>s+(Number(x.evaluationProbability)||0),0);
  if(total>0)entries=entries.map(x=>({...x,evaluationProbability:(Number(x.evaluationProbability)||0)/total}));
  return{version:"SHADOW-EVALUATION-ISOLATED-1.0",packageKey:adj.packageKey||null,baselineRawMassTotal:evaluation?.rawMassTotal??null,evaluationMassTotal:entries.reduce((s,x)=>s+(Number(x.evaluationProbability)||0),0),entries};
}
function applyCombinedShadowAdjustments(evaluation,adjustments){let current={...evaluation,entries:(evaluation?.entries||[]).map(x=>({...x,evaluationProbability:Number(x.evaluationProbability)||0}))};for(const adj of(adjustments||[]))current=applySingleShadowAdjustment(current,adj);return{...current,version:"SHADOW-EVALUATION-COMBINED-DIAGNOSTIC-1.0",packageKey:null}}
export function buildShadowComparisonRecord({snapshot,conditionCalibration,storage,now=new Date()}={}){
  if(!snapshot?.predictionSnapshotId)return null;
  const groups=Array.isArray(conditionCalibration?.groups)?conditionCalibration.groups:[],approved=loadPromotionReviews(storage).filter(x=>x.decision==="APPROVE_SHADOW");
  if(!approved.length)return null;
  const active=groups.filter(g=>{const pkg=g.promotionPackage;if(pkg?.status!=="PROMOTION_PACKAGE_READY"||pkg?.methodologyEpoch!==PROMOTION_METHODOLOGY_EPOCH||!pkg?.approvalFingerprint)return false;return approved.some(r=>r.packageKey===pkg.packageKey&&r.packageFingerprint===pkg.approvalFingerprint&&r.methodologyEpoch===PROMOTION_METHODOLOGY_EPOCH&&r.shadowActivationAllowed===true)});
  if(!active.length)return null;
  const adjustments=active.map(g=>({packageKey:g.promotionPackage.packageKey,stage:g.stage,family:g.family,kind:g.kind,currentProbability:Number(g.promotionPackage.currentProbability),shadowProbability:Number(g.promotionPackage.suggestedProbability),delta:Number(g.promotionPackage.delta)}));
  const rawLedger=Array.isArray(snapshot.terminalLedger)?snapshot.terminalLedger:[],currentEvaluation=normalizeTerminalEvaluationLedger(rawLedger);
  const packageEvaluations=adjustments.map(adj=>({packageKey:adj.packageKey,adjustment:adj,currentEvaluation,shadowEvaluation:applySingleShadowAdjustment(currentEvaluation,adj),attributionMode:"ISOLATED_SINGLE_PACKAGE"}));
  const combinedEvaluation=applyCombinedShadowAdjustments(currentEvaluation,adjustments);
  return{comparisonId:`${snapshot.predictionSnapshotId}|${adjustments.map(x=>x.packageKey).sort().join(",")}`,snapshotId:snapshot.predictionSnapshotId,raceKey:raceKey(snapshot.targetRace),date:snapshot.targetRace?.date||null,venueName:snapshot.targetRace?.venueName||null,raceNo:snapshot.targetRace?.raceNo||null,createdAt:now.toISOString(),status:"PENDING_RESULT",mode:"SHADOW_ONLY",evaluationVersion:"SHADOW-EVALUATION-INTEGRITY-1.1-METHODOLOGY-BOUND",methodologyEpoch:PROMOTION_METHODOLOGY_EPOCH,shadowEvaluationEpoch:SHADOW_EVALUATION_EPOCH,productionWriteAllowed:false,adjustments,currentModel:{predictionVersion:snapshot.predictionVersion||null,terminalLedger:rawLedger,evaluation:currentEvaluation},shadowModel:{note:"評価専用。現行・シャドー双方を同じ正規化基準で比較。複数パッケージ結合は診断用のみ",terminalLedger:evaluationLedgerForDisplay(combinedEvaluation),evaluation:combinedEvaluation},packageEvaluations,combinedDiagnosticOnly:true,result:null,outcome:null,packageOutcomes:null};
}
export function attachShadowComparisonResult(storage,comparisonId,officialOrder){
  const rows=loadShadowComparisons(storage),i=rows.findIndex(r=>r.comparisonId===comparisonId);if(i<0)throw new Error("シャドー比較レコードが見つかりません");
  const order=(officialOrder||[]).map(Number).slice(0,3);if(order.length<3)throw new Error("確定着順が不足しています");
  const row=rows[i],integrityRecord=Array.isArray(row.packageEvaluations)&&row.packageEvaluations.length>0;let packageOutcomes=null;
  if(integrityRecord){packageOutcomes={};for(const p of row.packageEvaluations)packageOutcomes[p.packageKey]=scoreShadowOutcome(realizedEvaluationProbability(p.currentEvaluation,order),realizedEvaluationProbability(p.shadowEvaluation,order))}
  let outcome;
  if(row.currentModel?.evaluation&&row.shadowModel?.evaluation){outcome=scoreShadowOutcome(realizedEvaluationProbability(row.currentModel.evaluation,order),realizedEvaluationProbability(row.shadowModel.evaluation,order));outcome.attributionMode="COMBINED_DIAGNOSTIC_ONLY"}
  else{outcome=scoreShadowOutcome(realizedProbability(row.currentModel?.terminalLedger,order),realizedProbability(row.shadowModel?.terminalLedger,order));outcome.attributionMode="LEGACY_COMBINED_ATTRIBUTION";outcome.qualificationEligible=false}
  rows[i]={...row,status:"RESULT_ATTACHED",result:{officialOrder:order},outcome,packageOutcomes,evaluationIntegrity:integrityRecord?"ISOLATED_NORMALIZED":"LEGACY_COMBINED_ATTRIBUTION"};
  storage.setItem(SHADOW_COMPARISON_KEY,JSON.stringify(rows.slice(0,MAX_SHADOW_COMPARISONS)));return rows[i];
}
function scoreShadowOutcome(currentProbability,shadowProbability){const currentLogLoss=-Math.log(Math.max(1e-9,currentProbability||1e-9)),shadowLogLoss=-Math.log(Math.max(1e-9,shadowProbability||1e-9));const winner=shadowLogLoss+1e-12<currentLogLoss?"SHADOW":currentLogLoss+1e-12<shadowLogLoss?"CURRENT":"TIE";return{currentProbability,shadowProbability,currentLogLoss,shadowLogLoss,winner,logLossImprovement:currentLogLoss-shadowLogLoss,qualificationEligible:true}}
function realizedEvaluationProbability(evaluation,order){const row=(evaluation?.entries||[]).find(t=>Array.isArray(t?.order)&&t.order.join("-")===order.join("-"));return Number.isFinite(Number(row?.evaluationProbability))?Math.max(0,Number(row.evaluationProbability)):0}
function realizedProbability(ledger,order){const row=(Array.isArray(ledger)?ledger:[]).find(t=>Array.isArray(t?.order)&&t.order.join("-")===order.join("-"));return Number.isFinite(Number(row?.probability))?Math.max(0,Number(row.probability)):0}
function packageOutcome(row,packageKey){const x=row?.packageOutcomes?.[packageKey];return x&&x.qualificationEligible!==false?x:null}
function canaryEligibleComparison(row,packageKey){return Boolean(row?.status==="RESULT_ATTACHED"&&row?.methodologyEpoch===PROMOTION_METHODOLOGY_EPOCH&&row?.shadowEvaluationEpoch===SHADOW_EVALUATION_EPOCH&&row?.evaluationIntegrity==="ISOLATED_NORMALIZED"&&packageOutcome(row,packageKey))}



export function loadFinalPromotionApprovals(storage){
  try{
    const rows=JSON.parse(storage.getItem(FINAL_APPROVAL_KEY)||"[]");
    return Array.isArray(rows)?rows:[];
  }catch{return[]}
}
export function finalApprovalFor(storage,packageKey){
  return loadFinalPromotionApprovals(storage).find(x=>x.packageKey===packageKey)||null;
}
export function saveFinalPromotionApproval(storage,{candidate,decision,note="",reviewer="manual",now=new Date()}={}){
  const allowed=new Set(["APPROVE_CANARY","HOLD","REJECT"]);
  if(!candidate?.packageKey)throw new Error("最終審査候補がありません");
  if(candidate.status!=="FINAL_REVIEW_READY"&&decision==="APPROVE_CANARY")throw new Error("最終審査未通過のため承認できません");
  if(!allowed.has(decision))throw new Error("最終承認結果が不正です");

  const rows=loadFinalPromotionApprovals(storage);
  const previous=rows.find(x=>x.packageKey===candidate.packageKey)||null;
  const record={
    approvalVersion:"FINAL-PROMOTION-APPROVAL-1.1-METHODOLOGY-BOUND",
    packageKey:candidate.packageKey,
    fingerprint:candidate.fingerprint||null,
    methodologyEpoch:candidate.methodologyEpoch||null,shadowEvaluationEpoch:candidate.shadowEvaluationEpoch||null,
    decision,
    note:String(note||"").trim().slice(0,500),
    reviewer:String(reviewer||"manual"),
    approvedAt:now.toISOString(),
    previousDecision:previous?.decision||null,
    previousFingerprint:previous?.fingerprint||null,
    canaryActivationAllowed:decision==="APPROVE_CANARY",
    productionWriteAllowed:false,
    productionPromotionAllowed:false
  };
  const next=[record,...rows.filter(x=>x.packageKey!==candidate.packageKey)].slice(0,MAX_FINAL_APPROVALS);
  storage.setItem(FINAL_APPROVAL_KEY,JSON.stringify(next));
  return record;
}
export function summarizeFinalPromotionApprovals(storage){
  const rows=loadFinalPromotionApprovals(storage);
  return{
    total:rows.length,
    canaryApproved:rows.filter(x=>x.decision==="APPROVE_CANARY").length,
    hold:rows.filter(x=>x.decision==="HOLD").length,
    rejected:rows.filter(x=>x.decision==="REJECT").length,
    rollbackLocked:rows.filter(x=>x.decision==="ROLLBACK_LOCKED").length,
    productionWriteAllowed:false,
    productionPromotionAllowed:false
  };
}
function invalidateFinalApprovalForRollback(storage,run,now){
  const rows=loadFinalPromotionApprovals(storage);
  const previous=rows.find(x=>x.packageKey===run.packageKey)||null;
  const record={
    approvalVersion:"FINAL-PROMOTION-APPROVAL-1.2-ROLLBACK-LOCKED",
    packageKey:run.packageKey,
    fingerprint:run.fingerprint||null,
    methodologyEpoch:run.methodologyEpoch||null,
    shadowEvaluationEpoch:run.shadowEvaluationEpoch||null,
    decision:"ROLLBACK_LOCKED",
    note:`カナリアロールバック確定: ${run.rollbackSignal||"manual"}`,
    reviewer:"system",
    approvedAt:now.toISOString(),
    previousDecision:previous?.decision||null,
    previousFingerprint:previous?.fingerprint||null,
    canaryActivationAllowed:false,
    rollbackLocked:true,
    rollbackSignal:run.rollbackSignal||null,
    productionWriteAllowed:false,
    productionPromotionAllowed:false
  };
  storage.setItem(FINAL_APPROVAL_KEY,JSON.stringify([record,...rows.filter(x=>x.packageKey!==run.packageKey)].slice(0,MAX_FINAL_APPROVALS)));
  return record;
}

export function buildCanaryActivationPlan(candidate,approval){
  if(candidate?.status!=="FINAL_REVIEW_READY")return{status:"BLOCKED",reason:"最終審査ゲート未通過",productionWriteAllowed:false};
  if(approval?.decision==="ROLLBACK_LOCKED")return{status:"ROLLBACK_LOCKED",reason:"この監査指紋はカナリアロールバック確定済み。新しい監査指紋で再審査が必要",productionWriteAllowed:false,canaryActivationAllowed:false};
  if(approval?.decision!=="APPROVE_CANARY")return{status:"BLOCKED",reason:"最終手動承認なし",productionWriteAllowed:false};
  if(candidate?.methodologyEpoch!==PROMOTION_METHODOLOGY_EPOCH||candidate?.shadowEvaluationEpoch!==SHADOW_EVALUATION_EPOCH)return{status:"STALE_METHODOLOGY",reason:"候補が現行方法論epochではないため再評価が必要",productionWriteAllowed:false,canaryActivationAllowed:false};
  if(approval?.methodologyEpoch!==PROMOTION_METHODOLOGY_EPOCH||approval?.shadowEvaluationEpoch!==SHADOW_EVALUATION_EPOCH)return{status:"STALE_METHODOLOGY",reason:"承認が旧方法論epochのため再承認が必要",productionWriteAllowed:false,canaryActivationAllowed:false};
  if(approval?.fingerprint!==candidate?.fingerprint)return{
    status:"STALE_APPROVAL",
    reason:"監査指紋が変わったため再承認が必要",
    productionWriteAllowed:false,
    canaryActivationAllowed:false
  };
  return{
    status:"CANARY_PLAN_READY",
    packageKey:candidate.packageKey,
    fingerprint:candidate.fingerprint,
    mode:"CANARY_SHADOW",
    scope:{
      trafficShare:0,
      affectsDisplayedPrediction:false,
      affectsPurchasePlan:false,
      affectsProductionParameters:false
    },
    monitoring:{
      minimumResults:20,
      rollbackOnRecentLogLossFlip:true,
      rollbackOnWinShareBelow:.50,
      rollbackOnEvidenceQualityDrop:true
    },
    canaryActivationAllowed:true,
    productionWriteAllowed:false,
    productionPromotionAllowed:false,
    reason:"本番影響0%のカナリア監視プランのみ許可"
  };
}



function packageIdentity(packageKey){
  const parts=String(packageKey||"").split("|");
  return{stage:parts[0]||null,family:parts[1]||null,kind:parts[2]||null};
}
export function canaryEvidenceQuality(storage,packageKey,{since=null}={}){
  const id=packageIdentity(packageKey);
  const all=[];
  for(const r of loadResearchLearningRecords(storage)){
    const checkedAt=String(r?.checkedAt||"");
    if(since&&checkedAt&&checkedAt<String(since))continue;
    for(const e of (Array.isArray(r?.conditionEvidence)?r.conditionEvidence:[])){
      const family=conditionFamily(e?.conditionId||e?.evidenceKey||"UNKNOWN");
      if(id.stage&&String(e?.stage||"?")!==id.stage)continue;
      if(id.family&&family!==id.family)continue;
      if(id.kind&&String(e?.kind||"?")!==id.kind)continue;
      all.push(e);
    }
  }
  const decisive=all.filter(e=>["CONFIRMED","REFUTED"].includes(e?.status));
  const unknown=all.filter(e=>e?.status==="UNKNOWN");
  const pending=all.filter(e=>e?.status==="EVIDENCE_PENDING");
  const autoResolved=decisive.filter(e=>e?.autoResolved===true);
  const total=all.length;
  const decisiveRate=total?decisive.length/total:null;
  const unresolvedRate=total?(unknown.length+pending.length)/total:null;
  return{
    version:"CANARY-EVIDENCE-QUALITY-1.0",
    packageKey,
    total,
    decisiveCount:decisive.length,
    unknownCount:unknown.length,
    pendingCount:pending.length,
    decisiveRate,
    unresolvedRate,
    autoResolvedCount:autoResolved.length,
    autoResolvedShare:decisive.length?autoResolved.length/decisive.length:null
  };
}
function evidenceQualityRollbackSignal(baseline,current,recent){
  if(!baseline||!current)return null;
  if(Number(current.decisiveCount)<Number(baseline.decisiveCount))
    return{code:"EVIDENCE_DECISIVE_COUNT_DROPPED",reason:"確定証拠数がカナリア開始時より減少"};
  if(Number(recent?.total)>=5){
    const baselineRate=Number(baseline.decisiveRate);
    const recentRate=Number(recent.decisiveRate);
    const floor=Number.isFinite(baselineRate)?Math.max(.60,baselineRate-.20):.60;
    if(Number.isFinite(recentRate)&&recentRate<floor)
      return{code:"EVIDENCE_QUALITY_DROP",reason:`直近証拠の確定率 ${(recentRate*100).toFixed(1)}% が許容下限 ${(floor*100).toFixed(1)}% 未満`};
  }
  return null;
}

export function loadCanaryRuns(storage){
  try{
    const rows=JSON.parse(storage.getItem(CANARY_RUN_KEY)||"[]");
    return Array.isArray(rows)?rows:[];
  }catch{return[]}
}
export function canaryRunFor(storage,packageKey){
  return loadCanaryRuns(storage).find(x=>x.packageKey===packageKey)||null;
}
export function activateCanaryRun(storage,{candidate,approval,now=new Date()}={}){
  const plan=buildCanaryActivationPlan(candidate,approval);
  if(plan.status!=="CANARY_PLAN_READY")throw new Error(plan.reason||"カナリアを開始できません");
  const rows=loadCanaryRuns(storage);
  const previous=rows.find(x=>x.packageKey===candidate.packageKey)||null;
  if(previous?.status==="CANARY_ROLLED_BACK"&&previous?.fingerprint===candidate.fingerprint)
    throw new Error("同じ監査指紋はロールバック済みです。新しい監査指紋が生成されるまで再開できません");
  const baselineComparisonCount=loadShadowComparisons(storage).filter(r=>canaryEligibleComparison(r,candidate.packageKey)).length;
  const evidenceQualityBaseline=canaryEvidenceQuality(storage,candidate.packageKey);
  const record={
    canaryVersion:"CANARY-RUN-1.2-EVIDENCE-QUALITY-GUARD",
    packageKey:candidate.packageKey,
    fingerprint:candidate.fingerprint,
    methodologyEpoch:PROMOTION_METHODOLOGY_EPOCH,shadowEvaluationEpoch:SHADOW_EVALUATION_EPOCH,
    evidenceQualityBaseline,
    comparisonCohort:{methodologyEpoch:PROMOTION_METHODOLOGY_EPOCH,shadowEvaluationEpoch:SHADOW_EVALUATION_EPOCH,evaluationIntegrity:"ISOLATED_NORMALIZED"},
    status:"CANARY_ACTIVE",
    startedAt:previous?.startedAt||now.toISOString(),
    updatedAt:now.toISOString(),
    baselineComparisonCount,
    minimumNewResults:Number(plan.monitoring?.minimumResults)||20,
    currentNewResults:0,currentShadowWins:0,currentWinShare:null,
    currentAvgLogLossImprovement:null,currentRecentAvgLogLossImprovement:null,
    rollbackSignal:null,
    productionWriteAllowed:false,productionPromotionAllowed:false,
    affectsDisplayedPrediction:false,affectsPurchasePlan:false,affectsProductionParameters:false
  };
  storage.setItem(CANARY_RUN_KEY,JSON.stringify([record,...rows.filter(x=>x.packageKey!==candidate.packageKey)].slice(0,MAX_CANARY_RUNS)));
  return record;
}
export function stopCanaryRun(storage,packageKey,{reason="manual_stop",now=new Date()}={}){
  const rows=loadCanaryRuns(storage);
  const i=rows.findIndex(x=>x.packageKey===packageKey);
  if(i<0)return null;
  rows[i]={...rows[i],status:"CANARY_STOPPED",stopReason:String(reason),updatedAt:now.toISOString(),productionWriteAllowed:false,productionPromotionAllowed:false};
  storage.setItem(CANARY_RUN_KEY,JSON.stringify(rows.slice(0,MAX_CANARY_RUNS)));
  return rows[i];
}
export function acknowledgeCanaryRollback(storage,packageKey,{reason="manual_rollback_ack",now=new Date()}={}){
  const rows=loadCanaryRuns(storage);
  const i=rows.findIndex(x=>x.packageKey===packageKey);
  if(i<0)return null;
  const current=rows[i];
  if(current.status!=="CANARY_ROLLBACK_RECOMMENDED")
    throw new Error("ロールバック推奨状態ではありません");
  rows[i]={
    ...current,
    status:"CANARY_ROLLED_BACK",
    rollbackAcknowledgedAt:now.toISOString(),
    rollbackAcknowledgedReason:String(reason||"manual_rollback_ack"),
    restartBlockedFingerprint:current.fingerprint||null,
    updatedAt:now.toISOString(),
    productionWriteAllowed:false,
    productionPromotionAllowed:false,
    affectsDisplayedPrediction:false,
    affectsPurchasePlan:false,
    affectsProductionParameters:false
  };
  storage.setItem(CANARY_RUN_KEY,JSON.stringify(rows.slice(0,MAX_CANARY_RUNS)));
  const invalidatedApproval=invalidateFinalApprovalForRollback(storage,rows[i],now);
  return {...rows[i],finalApprovalInvalidated:true,invalidatedApprovalDecision:invalidatedApproval.decision};
}
export function refreshCanaryRuns(storage,shadowSummary,now=new Date()){
  const rows=loadCanaryRuns(storage);
  if(!rows.length)return[];
  const finalCandidates=shadowSummary?.finalReview?.candidates||[];
  const allComparisons=loadShadowComparisons(storage);
  const next=rows.map(run=>{
    if(!["CANARY_ACTIVE","CANARY_VALIDATED","CANARY_ROLLBACK_RECOMMENDED"].includes(run.status))return run;
    const candidate=finalCandidates.find(c=>c.packageKey===run.packageKey);
    if(run.methodologyEpoch!==PROMOTION_METHODOLOGY_EPOCH||run.shadowEvaluationEpoch!==SHADOW_EVALUATION_EPOCH)return{...run,status:"CANARY_STALE",rollbackSignal:"METHODOLOGY_EPOCH_CHANGED",updatedAt:now.toISOString(),productionWriteAllowed:false,productionPromotionAllowed:false};
    if(!candidate||candidate.fingerprint!==run.fingerprint||candidate.methodologyEpoch!==PROMOTION_METHODOLOGY_EPOCH){
      return{...run,status:"CANARY_STALE",rollbackSignal:"AUDIT_FINGERPRINT_CHANGED",updatedAt:now.toISOString(),productionWriteAllowed:false,productionPromotionAllowed:false};
    }
    const related=allComparisons.filter(r=>canaryEligibleComparison(r,run.packageKey)).sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));
    const fresh=related.slice(Math.max(0,Number(run.baselineComparisonCount)||0)),outcomes=fresh.map(r=>packageOutcome(r,run.packageKey)).filter(Boolean);
    const improvements=outcomes.map(x=>Number(x.logLossImprovement)).filter(Number.isFinite),wins=outcomes.filter(x=>x.winner==="SHADOW").length,winShare=outcomes.length?wins/outcomes.length:null,avgImp=avg(improvements),recentOutcomes=outcomes.slice(-Math.min(10,outcomes.length)),recentAvg=avg(recentOutcomes.map(x=>Number(x.logLossImprovement)).filter(Number.isFinite));

    const evidenceQualityCurrent=canaryEvidenceQuality(storage,run.packageKey);
    const evidenceQualityRecent=canaryEvidenceQuality(storage,run.packageKey,{since:run.startedAt});
    const evidenceSignal=evidenceQualityRollbackSignal(run.evidenceQualityBaseline,evidenceQualityCurrent,evidenceQualityRecent);
    const postStartDecisiveCount=Number(evidenceQualityRecent?.decisiveCount)||0;
    const postStartEvidenceGatePassed=postStartDecisiveCount>=5&&Number(evidenceQualityRecent?.decisiveRate)>=.60;
    let status="CANARY_ACTIVE",rollbackSignal=null,rollbackReason=null;
    if(evidenceSignal){
      status="CANARY_ROLLBACK_RECOMMENDED";
      rollbackSignal=evidenceSignal.code;
      rollbackReason=evidenceSignal.reason;
    }else if(outcomes.length>=5&&Number.isFinite(recentAvg)&&recentAvg<0){
      status="CANARY_ROLLBACK_RECOMMENDED";
      rollbackSignal="RECENT_LOGLOSS_FLIP";
      rollbackReason="直近LogLoss改善が負へ反転";
    }else if(outcomes.length>=10&&Number.isFinite(winShare)&&winShare<.50){
      status="CANARY_ROLLBACK_RECOMMENDED";
      rollbackSignal="WIN_SHARE_BELOW_50";
      rollbackReason="シャドー勝率が50%未満";
    }else if(outcomes.length>=Number(run.minimumNewResults||20)&&Number.isFinite(avgImp)&&avgImp>0&&Number.isFinite(winShare)&&winShare>=.55&&postStartEvidenceGatePassed){
      status="CANARY_VALIDATED";
    }else if(outcomes.length>=Number(run.minimumNewResults||20)&&Number.isFinite(avgImp)&&avgImp>0&&Number.isFinite(winShare)&&winShare>=.55&&!postStartEvidenceGatePassed){
      status="CANARY_ACTIVE";rollbackSignal="WAIT_POST_START_EVIDENCE";rollbackReason="成績条件は満たしたが、カナリア開始後の確定証拠が5件未満または確定率60%未満";
    }

    return{
      ...run,status,updatedAt:now.toISOString(),
      currentNewResults:outcomes.length,currentShadowWins:wins,currentWinShare:winShare,
      currentAvgLogLossImprovement:avgImp,currentRecentAvgLogLossImprovement:recentAvg,
      evidenceQualityCurrent,evidenceQualityRecent,postStartDecisiveCount,postStartEvidenceGatePassed,
      eligibleComparisonCount:related.length,
      excludedComparisonCount:allComparisons.filter(r=>r.status==="RESULT_ATTACHED"&&Array.isArray(r.adjustments)&&r.adjustments.some(a=>a.packageKey===run.packageKey)&&!canaryEligibleComparison(r,run.packageKey)).length,
      rollbackSignal,rollbackReason,productionWriteAllowed:false,productionPromotionAllowed:false
    };
  });
  storage.setItem(CANARY_RUN_KEY,JSON.stringify(next.slice(0,MAX_CANARY_RUNS)));
  return next;
}
export function summarizeCanaryRuns(storage){
  const rows=loadCanaryRuns(storage);
  return{
    total:rows.length,
    active:rows.filter(x=>x.status==="CANARY_ACTIVE").length,
    validated:rows.filter(x=>x.status==="CANARY_VALIDATED").length,
    rollbackRecommended:rows.filter(x=>x.status==="CANARY_ROLLBACK_RECOMMENDED").length,
    rolledBack:rows.filter(x=>x.status==="CANARY_ROLLED_BACK").length,
    evidenceWaiting:rows.filter(x=>x.status==="CANARY_ACTIVE"&&x.rollbackSignal==="WAIT_POST_START_EVIDENCE").length,
    stale:rows.filter(x=>x.status==="CANARY_STALE").length,
    stopped:rows.filter(x=>x.status==="CANARY_STOPPED").length,
    rows,productionWriteAllowed:false,productionPromotionAllowed:false
  };
}

export function loadResearchLearningRecords(storage){
  try{
    const rows=JSON.parse(storage.getItem(RESEARCH_LEDGER_KEY)||"[]");
    return Array.isArray(rows)?rows:[];
  }catch{return[]}
}


export function backfillResearchLearningLedger(storage,{now=new Date()}={}){
  const snapshots=loadSnapshots(storage);
  const existing=loadResearchLearningRecords(storage);
  const existingIds=new Set(existing.map(r=>r?.predictionSnapshotId).filter(Boolean));
  const additions=[];
  let skippedExisting=0,skippedNoResult=0,skippedInvalid=0,degradedCount=0;

  for(const snapshot of snapshots){
    const id=snapshot?.predictionSnapshotId;
    if(!id){skippedInvalid++;continue}
    if(existingIds.has(id)){skippedExisting++;continue}
    if(!snapshot?.result){skippedNoResult++;continue}

    const result=normalizeStoredResultForBackfill(snapshot,now);
    if(!result){skippedInvalid++;continue}

    try{
      let record=buildResearchLearningRecord(snapshot,result);
      record={
        ...record,
        version:"RESEARCH-LEARNING-1.1-BACKFILLED",
        backfilled:true,
        backfilledAt:now.toISOString(),
        backfillSourceVersion:snapshot?.predictionVersion||null,
        backfillDegraded:Boolean(snapshot?.storageCompacted)||!Array.isArray(result?.verification?.stages)||!result.verification.stages.length
      };
      if(record.backfillDegraded)degradedCount++;
      record=applyDirectOfficialEvidence(record,result.officialEvidence,now);
      additions.push(record);
      existingIds.add(id);
    }catch{
      skippedInvalid++;
    }
  }

  if(additions.length){
    const merged=[...additions,...existing].slice(0,MAX_RESEARCH_RECORDS);
    try{storage.setItem(RESEARCH_LEDGER_KEY,JSON.stringify(merged))}
    catch{
      try{storage.setItem(RESEARCH_LEDGER_KEY,JSON.stringify(merged.slice(0,100)))}catch{}
    }
  }

  return{
    version:"RESEARCH-BACKFILL-1.0",
    scannedSnapshots:snapshots.length,
    added:additions.length,
    skippedExisting,skippedNoResult,skippedInvalid,degradedCount,
    idempotent:true,
    overwroteExisting:false
  };
}

function normalizeStoredResultForBackfill(snapshot,now){
  const stored=snapshot?.result;
  if(!stored||typeof stored!=="object")return null;
  const order=(stored.officialFinishOrder||stored.finishOrder||[]).slice(0,3).map(Number);
  const status=String(stored.resultStatus||stored.status||"").toLowerCase();
  const learningDisposition=stored.learningDisposition||(
    status==="cancelled"||status==="refund"
      ?{mode:"EXCEPTIONAL_SEPARATE",includeInNormalLearning:false,reason:"stored_exceptional_result",details:[]}
      :{mode:"NORMAL",includeInNormalLearning:true,reason:null,details:[]}
  );

  let verification=stored.verification||null;
  if(!verification&&order.length>=3){
    const terminal=(snapshot?.terminalLedger||[]).find(t=>(t?.order||[]).join("-")===order.join("-"))||null;
    const matched=(snapshot?.betSelections||[]).find(b=>(b?.order||[]).join("-")===order.join("-"))||null;
    verification=buildResultVerification(snapshot,order,terminal,matched?"hit":"miss",learningDisposition);
  }

  if(!verification&&(status==="cancelled"||status==="refund")){
    verification=buildResultVerification(snapshot,order,null,status,learningDisposition);
  }
  if(!verification)return null;

  return{
    ...stored,
    resultStatus:stored.resultStatus||status||null,
    officialFinishOrder:order,
    checkedAt:stored.checkedAt||snapshot?.result?.checkedAt||snapshot?.createdAt||now.toISOString(),
    learningDisposition,
    officialEvidence:stored.officialEvidence||null,
    verification
  };
}

export function summarizeResearchLearning(storage){
  const rows=loadResearchLearningRecords(storage),normal=rows.filter(r=>r.learningMode==="NORMAL"),exceptional=rows.filter(r=>r.learningMode==="EXCEPTIONAL_SEPARATE");
  const hit=normal.filter(r=>r.verificationStatus==="PURCHASE_HIT"),sel=normal.filter(r=>r.verificationStatus==="PURCHASE_SELECTION_MISS");
  const fm=normal.filter(r=>r.verificationStatus==="FIRST_FAMILY_GENERATION_MISS"),sm=normal.filter(r=>r.verificationStatus==="SECOND_BRANCH_GENERATION_MISS"),tm=normal.filter(r=>r.verificationStatus==="THIRD_TERMINAL_GENERATION_MISS");
  const probs=normal.map(r=>Number(r.realizedTerminalProbability)).filter(v=>Number.isFinite(v)&&v>0&&v<=1),ranks=normal.map(r=>Number(r.terminalGlobalRank)).filter(v=>Number.isFinite(v)&&v>0);
  return{
    version:"RESEARCH-SUMMARY-1.1-STAGE-CALIBRATION",totalRecords:rows.length,normalCount:normal.length,exceptionalCount:exceptional.length,
    purchaseHitCount:hit.length,purchaseSelectionMissCount:sel.length,terminalGenerationMissCount:fm.length+sm.length+tm.length,
    firstFamilyGenerationMissCount:fm.length,secondBranchGenerationMissCount:sm.length,thirdTerminalGenerationMissCount:tm.length,
    firstFamilyGeneratedRate:ratio(normal.filter(r=>r.firstPlaceFamilyGenerated).length,normal.length),pairGeneratedRate:ratio(normal.filter(r=>r.firstSecondPairGenerated).length,normal.length),
    exactTerminalGeneratedRate:ratio(normal.filter(r=>r.exactTerminalGenerated).length,normal.length),purchaseHitRate:ratio(hit.length,normal.length),
    avgTerminalRank:avg(ranks),top10TerminalRate:ratio(ranks.filter(x=>x<=10).length,normal.length),
    terminalLogLoss:probs.length?avg(probs.map(p=>-Math.log(Math.max(1e-9,p)))):null,
    stageCalibration:{FIRST:stageCalibration(normal,"FIRST"),SECOND:stageCalibration(normal,"SECOND"),THIRD:stageCalibration(normal,"THIRD")},
    probabilityMass:summarizeProbabilityMass(normal),
    evidenceReview:summarizeEvidenceReview(rows),
    conditionCalibration:summarizeConditionCalibration(normal),
    autoPromotionEnabled:false,note:"研究版の集計のみ。本番予想ロジックへ自動反映しない。"
  };
}
function summarizeConditionCalibration(records){
  const samples=[];
  for(const r of records){
    if(r.learningMode!=="NORMAL")continue;
    const checkedAt=String(r.checkedAt||"");
    for(const e of (Array.isArray(r.conditionEvidence)?r.conditionEvidence:[])){
      if(!["CONFIRMED","REFUTED"].includes(e.status))continue;
      const predicted=Number(e.predictedProbability);
      if(!Number.isFinite(predicted)||predicted<0||predicted>1)continue;
      samples.push({
        family:conditionFamily(e.conditionId||e.evidenceKey||"UNKNOWN"),
        conditionId:e.conditionId||null,stage:e.stage||null,kind:e.kind||null,
        predicted,outcome:e.status==="CONFIRMED"?1:0,source:e.source||null,
        autoResolved:Boolean(e.autoResolved),checkedAt,
        venueName:r.venueName||null,venueCode:r.venueCode||null,date:r.date||null
      });
    }
  }
  const grouped=new Map();
  for(const s of samples){const key=[s.stage||"?",s.family,s.kind||"?"].join("|");if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(s)}
  const groups=[...grouped.entries()].map(([key,rows])=>{
    const predictedAvg=avg(rows.map(x=>x.predicted)),observedRate=avg(rows.map(x=>x.outcome)),gap=observedRate-predictedAvg;
    const brier=avg(rows.map(x=>(x.predicted-x.outcome)**2));
    const logLoss=avg(rows.map(x=>binaryLogLoss(x.predicted,x.outcome)));
    const success=rows.reduce((s,x)=>s+x.outcome,0),interval=wilsonInterval(success,rows.length),stability=temporalStability(rows,predictedAvg);
    const reviewStatus=conditionReviewStatus(rows.length,Math.abs(gap),interval,predictedAvg);
    const descriptiveShadowProposal=shadowProposal({rows,predictedAvg,observedRate,gap,interval,stability,reviewStatus});
    const holdoutAnalysis=buildTrainOnlyHoldoutAnalysis(rows,descriptiveShadowProposal);
    const proposal=holdoutAnalysis.trainCandidate?.proposal||holdoutAnalysis.gatingProposal;
    const holdoutValidation=holdoutAnalysis.holdoutValidation;
    const contextRobustness=validateContextRobustness(rows,proposal,holdoutValidation,holdoutAnalysis);
    const promotionAudit=buildPromotionAudit(rows,proposal,holdoutValidation,contextRobustness,holdoutAnalysis);
    const independentAudit=runIndependentPromotionAudit(rows,proposal,promotionAudit,holdoutAnalysis);
    const promotionPackage=buildPromotionPackage(rows,proposal,independentAudit,holdoutAnalysis);
    return{
      key,stage:rows[0]?.stage||null,family:rows[0]?.family||"UNKNOWN",kind:rows[0]?.kind||null,
      sampleCount:rows.length,confirmedCount:success,refutedCount:rows.length-success,
      predictedAvg,observedRate,gap,absGap:Math.abs(gap),brier,logLoss,
      observedWilsonLow:interval.low,observedWilsonHigh:interval.high,
      autoResolvedCount:rows.filter(x=>x.autoResolved).length,
      reviewStatus,temporalStability:stability,
      descriptiveShadowProposal,
      trainCandidate:holdoutAnalysis.trainCandidate,
      shadowProposal:proposal,
      holdoutValidation,contextRobustness,promotionAudit,independentAudit,promotionPackage
    };
  }).sort((a,b)=>independentRank(b.independentAudit?.status)-independentRank(a.independentAudit?.status)||promotionRank(b.promotionAudit?.status)-promotionRank(a.promotionAudit?.status)||contextRank(b.contextRobustness?.status)-contextRank(a.contextRobustness?.status)||holdoutRank(b.holdoutValidation?.status)-holdoutRank(a.holdoutValidation?.status)||proposalRank(b.shadowProposal?.status)-proposalRank(a.shadowProposal?.status)||reviewRank(b.reviewStatus)-reviewRank(a.reviewStatus)||b.sampleCount-a.sampleCount||b.absGap-a.absGap);
  const proposals=groups.filter(g=>g.shadowProposal?.status==="READY_FOR_RESEARCH_REVIEW");
  const holdoutPassed=groups.filter(g=>g.holdoutValidation?.status==="HOLDOUT_PASS");
  const contextPassed=groups.filter(g=>g.contextRobustness?.status==="CONTEXT_PASS");
  const promotionReady=groups.filter(g=>g.promotionAudit?.status==="PROMOTION_AUDIT_READY");
  const independentPassed=groups.filter(g=>g.independentAudit?.status==="INDEPENDENT_AUDIT_PASS");
  const packagesReady=groups.filter(g=>g.promotionPackage?.status==="PROMOTION_PACKAGE_READY");
  return{
    version:"CONDITION-CALIBRATION-1.3-TRAIN-ONLY-HOLDOUT",
    decisiveSampleCount:samples.length,groupCount:groups.length,groups,
    shadowProposalCount:proposals.length,
    holdoutPassedCount:holdoutPassed.length,
    contextPassedCount:contextPassed.length,
    promotionAuditReadyCount:promotionReady.length,
    independentAuditPassedCount:independentPassed.length,
    promotionPackageReadyCount:packagesReady.length,
    shadowProposals:proposals.map(g=>({
      key:g.key,stage:g.stage,family:g.family,kind:g.kind,
      currentProbability:g.predictedAvg,suggestedProbability:g.shadowProposal.suggestedProbability,
      rawObservedRate:g.observedRate,sampleCount:g.sampleCount,
      shrinkageWeight:g.shadowProposal.shrinkageWeight,temporalStability:g.temporalStability,
      status:g.shadowProposal.status,reason:g.shadowProposal.reason,
      holdoutValidation:g.holdoutValidation,
      contextRobustness:g.contextRobustness,
      promotionAudit:g.promotionAudit,
      independentAudit:g.independentAudit,
      promotionPackage:g.promotionPackage
    })),
    productionApplyEnabled:false,autoPromotionEnabled:false,
    rule:"独立監査通過後は、本番反映そのものではなく昇格候補パッケージを固定生成する。手動承認なしでは本番へ反映しない。"
  };
}
function temporalStability(rows,predictedAvg){
  const sorted=[...rows].sort((a,b)=>String(a.checkedAt).localeCompare(String(b.checkedAt)));
  if(sorted.length<10)return{status:"INSUFFICIENT",earlierN:0,recentN:0,earlierRate:null,recentRate:null,directionConsistent:false};
  const split=Math.floor(sorted.length/2),earlier=sorted.slice(0,split),recent=sorted.slice(split);
  const earlierRate=avg(earlier.map(x=>x.outcome)),recentRate=avg(recent.map(x=>x.outcome)),d1=Math.sign(earlierRate-predictedAvg),d2=Math.sign(recentRate-predictedAvg),consistent=d1!==0&&d1===d2,drift=Math.abs(recentRate-earlierRate);
  return{status:earlier.length>=5&&recent.length>=5?(consistent&&drift<=.18?"STABLE_DIRECTION":"UNSTABLE"):"INSUFFICIENT",earlierN:earlier.length,recentN:recent.length,earlierRate,recentRate,directionConsistent:consistent,drift};
}
function shadowProposal({rows,predictedAvg,observedRate,gap,interval,stability,reviewStatus}){
  const n=rows.length,weight=Math.max(0,Math.min(.80,n/(n+30))),shrunk=predictedAvg*(1-weight)+observedRate*weight,capped=Math.max(.12,Math.min(.95,shrunk));
  const outside=Number.isFinite(interval?.low)&&Number.isFinite(interval?.high)&&(predictedAvg<interval.low||predictedAvg>interval.high);
  const ready=n>=20&&reviewStatus==="RECALIBRATION_CANDIDATE"&&outside&&Math.abs(gap)>=.10&&stability?.status==="STABLE_DIRECTION";
  const watch=n>=10&&Math.abs(gap)>=.10;
  return{status:ready?"READY_FOR_RESEARCH_REVIEW":watch?"SHADOW_WATCH":"NO_CHANGE_PROPOSED",suggestedProbability:ready?capped:null,shrinkageWeight:weight,rawObservedRate:observedRate,reason:ready?`N=${n}、95%区間外、差${(Math.abs(gap)*100).toFixed(1)}pt、前後半で方向安定。観測率をそのまま使わず縮約した研究値を提案`:watch?"差は大きいが、標本数・95%区間・時系列安定性のいずれかが昇格条件未達":"変更提案条件を満たさない"};
}
function buildTrainOnlyHoldoutAnalysis(rows,descriptiveProposal){
  const sorted=[...rows].sort((a,b)=>String(a.checkedAt).localeCompare(String(b.checkedAt)));
  if(sorted.length<24){
    const gatingProposal=descriptiveProposal?.status==="READY_FOR_RESEARCH_REVIEW"
      ?{...descriptiveProposal,status:"SHADOW_WATCH",suggestedProbability:null,reason:"全体記述では候補だが、未使用ホールドアウトを確保できないため研究提案へ昇格しない"}
      :descriptiveProposal;
    return{trainCandidate:null,gatingProposal,holdoutValidation:{status:"INSUFFICIENT_HOLDOUT",reason:"ホールドアウト用標本が不足",trainCount:0,holdoutCount:0,selectionLeakagePrevented:true}};
  }
  const split=Math.max(16,Math.floor(sorted.length*.70));
  const train=sorted.slice(0,split),holdout=sorted.slice(split);
  if(holdout.length<6){
    const gatingProposal=descriptiveProposal?.status==="READY_FOR_RESEARCH_REVIEW"
      ?{...descriptiveProposal,status:"SHADOW_WATCH",suggestedProbability:null,reason:"全体記述では候補だが、未使用ホールドアウトが6件未満のため研究提案へ昇格しない"}
      :descriptiveProposal;
    return{trainCandidate:null,gatingProposal,holdoutValidation:{status:"INSUFFICIENT_HOLDOUT",reason:"ホールドアウトが6件未満",trainCount:train.length,holdoutCount:holdout.length,selectionLeakagePrevented:true}};
  }
  const predictedAvg=avg(train.map(x=>x.predicted)),observedRate=avg(train.map(x=>x.outcome)),gap=observedRate-predictedAvg;
  const success=train.reduce((s,x)=>s+x.outcome,0),interval=wilsonInterval(success,train.length);
  const stability=temporalStability(train,predictedAvg);
  const reviewStatus=conditionReviewStatus(train.length,Math.abs(gap),interval,predictedAvg);
  const proposal=shadowProposal({rows:train,predictedAvg,observedRate,gap,interval,stability,reviewStatus});
  const trainCandidate={sampleCount:train.length,predictedAvg,observedRate,gap,absGap:Math.abs(gap),observedWilsonLow:interval.low,observedWilsonHigh:interval.high,reviewStatus,temporalStability:stability,proposal};
  const holdoutValidation=validateTrainOnlyShadowProposalHoldout(train,holdout,trainCandidate);
  return{
    trainCandidate,gatingProposal:proposal,holdoutValidation,
    split:{
      method:"CHRONOLOGICAL_70_30",
      trainCount:train.length,
      holdoutCount:holdout.length,
      trainEndCheckedAt:train.at(-1)?.checkedAt||null,
      holdoutStartCheckedAt:holdout[0]?.checkedAt||null
    }
  };
}
function validateTrainOnlyShadowProposalHoldout(train,holdout,trainCandidate){
  const proposal=trainCandidate?.proposal;
  if(!proposal||proposal.status!=="READY_FOR_RESEARCH_REVIEW"){
    return{status:"TRAIN_NOT_READY",reason:"訓練側だけでは研究提案条件を満たさないため、ホールドアウトは合否判定に使用しない",trainCount:train.length,holdoutCount:holdout.length,selectionLeakagePrevented:true,holdoutSealed:true};
  }
  const current=Number(trainCandidate.predictedAvg),proposed=Number(proposal.suggestedProbability),trainObserved=Number(trainCandidate.observedRate);
  const currentBrier=avg(holdout.map(x=>(current-x.outcome)**2)),proposedBrier=avg(holdout.map(x=>(proposed-x.outcome)**2));
  const currentLogLoss=avg(holdout.map(x=>binaryLogLoss(current,x.outcome))),proposedLogLoss=avg(holdout.map(x=>binaryLogLoss(proposed,x.outcome)));
  const holdoutObserved=avg(holdout.map(x=>x.outcome)),directionTrain=Math.sign(trainObserved-current),directionHoldout=Math.sign(holdoutObserved-current);
  const directionConsistent=directionTrain!==0&&directionTrain===directionHoldout,brierImprovement=currentBrier-proposedBrier,logLossImprovement=currentLogLoss-proposedLogLoss;
  const pass=directionConsistent&&brierImprovement>0&&logLossImprovement>0;
  return{status:pass?"HOLDOUT_PASS":"HOLDOUT_FAIL",trainCount:train.length,holdoutCount:holdout.length,trainCurrentProbability:current,trainObservedRate:trainObserved,trainProposedProbability:proposed,holdoutObservedRate:holdoutObserved,currentBrier,proposedBrier,brierImprovement,currentLogLoss,proposedLogLoss,logLossImprovement,directionConsistent,selectionLeakagePrevented:true,holdoutSealedUntilTrainReady:true,reason:pass?"訓練側だけで候補生成後、未使用ホールドアウトでもBrier/LogLossが両方改善しズレ方向も一致":"訓練側だけで候補生成したが、未使用ホールドアウトで改善またはズレ方向を確認できない"};
}

function validationPartition(rows,holdoutAnalysis){
  const sorted=[...(Array.isArray(rows)?rows:[])].sort((a,b)=>String(a.checkedAt).localeCompare(String(b.checkedAt)));
  const trainCount=Number(holdoutAnalysis?.split?.trainCount);
  if(!Number.isFinite(trainCount)||trainCount<1||trainCount>=sorted.length)return{train:[],holdout:[]};
  return{train:sorted.slice(0,trainCount),holdout:sorted.slice(trainCount)};
}
function validateContextRobustness(rows,proposal,holdoutValidation,holdoutAnalysis){
  if(!proposal||proposal.status!=="READY_FOR_RESEARCH_REVIEW")
    return{status:"NOT_APPLICABLE",reason:"訓練側研究提案値が未生成",selectionLeakagePrevented:true};
  if(holdoutValidation?.status!=="HOLDOUT_PASS")
    return{status:"WAIT_HOLDOUT",reason:"時系列ホールドアウト未通過",selectionLeakagePrevented:true};

  const partition=validationPartition(rows,holdoutAnalysis);
  const validationRows=partition.holdout;
  if(!validationRows.length)
    return{status:"INSUFFICIENT_CONTEXT",reason:"未使用ホールドアウト行を復元できない",venueCount:0,venues:[],selectionLeakagePrevented:true};

  const current=Number(holdoutAnalysis?.trainCandidate?.predictedAvg);
  const proposed=Number(proposal.suggestedProbability);
  if(!Number.isFinite(current)||!Number.isFinite(proposed))
    return{status:"NOT_APPLICABLE",reason:"訓練側固定値が不足",selectionLeakagePrevented:true};

  const venueMap=new Map();
  for(const row of validationRows){
    const venue=String(row.venueName||row.venueCode||"UNKNOWN");
    if(!venueMap.has(venue))venueMap.set(venue,[]);
    venueMap.get(venue).push(row);
  }
  const venueRows=[...venueMap.entries()].map(([venue,rs])=>{
    const observed=avg(rs.map(x=>x.outcome));
    const currentBrier=avg(rs.map(x=>(current-x.outcome)**2));
    const proposedBrier=avg(rs.map(x=>(proposed-x.outcome)**2));
    return{
      venue,sampleCount:rs.length,observedRate:observed,
      direction:Math.sign(observed-current),
      brierImprovement:currentBrier-proposedBrier,
      improved:proposedBrier<currentBrier
    };
  }).filter(v=>v.venue!=="UNKNOWN");

  const eligible=venueRows.filter(v=>v.sampleCount>=2);
  if(eligible.length<3)
    return{
      status:"INSUFFICIENT_CONTEXT",
      reason:"未使用ホールドアウト内で3会場以上・各2件以上が必要。訓練データを足して水増ししない",
      venueCount:eligible.length,venues:eligible,
      validationSampleCount:validationRows.length,
      fixedCurrentProbability:current,fixedProposedProbability:proposed,
      selectionLeakagePrevented:true,validationScope:"SEALED_HOLDOUT_ONLY"
    };

  const overallDirection=Math.sign(avg(validationRows.map(x=>x.outcome))-current);
  const sameDirection=eligible.filter(v=>v.direction!==0&&v.direction===overallDirection).length;
  const improved=eligible.filter(v=>v.improved).length;
  const directionShare=sameDirection/eligible.length,improvementShare=improved/eligible.length;
  const pass=directionShare>=.70&&improvementShare>=.70;

  return{
    status:pass?"CONTEXT_PASS":"CONTEXT_FAIL",
    venueCount:eligible.length,sameDirectionVenueCount:sameDirection,improvedVenueCount:improved,
    directionShare,improvementShare,venues:eligible.slice(0,12),
    validationSampleCount:validationRows.length,
    fixedCurrentProbability:current,fixedProposedProbability:proposed,
    selectionLeakagePrevented:true,validationScope:"SEALED_HOLDOUT_ONLY",
    reason:pass
      ?"未使用ホールドアウトの複数会場70%以上でズレ方向一致かつ固定提案値のBrier改善"
      :"未使用ホールドアウトだけでは会場横断再現性が不足"
  };
}
function buildPromotionAudit(rows,proposal,holdoutValidation,contextRobustness,holdoutAnalysis){
  const checks=[
    {id:"SAMPLE_30",passed:rows.length>=30,label:"証拠確定標本30件以上"},
    {id:"TRAIN_ONLY_PROPOSAL",passed:holdoutAnalysis?.trainCandidate?.proposal?.status==="READY_FOR_RESEARCH_REVIEW",label:"訓練側だけで研究提案値生成"},
    {id:"PROPOSAL_READY",passed:proposal?.status==="READY_FOR_RESEARCH_REVIEW",label:"固定研究提案値生成済み"},
    {id:"HOLDOUT_PASS",passed:holdoutValidation?.status==="HOLDOUT_PASS"&&holdoutValidation?.selectionLeakagePrevented===true,label:"未使用時系列ホールドアウト通過"},
    {id:"CONTEXT_PASS",passed:contextRobustness?.status==="CONTEXT_PASS"&&contextRobustness?.validationScope==="SEALED_HOLDOUT_ONLY",label:"未使用ホールドアウト内の複数会場再現性通過"}
  ];
  const passed=checks.every(x=>x.passed);
  return{
    status:passed?"PROMOTION_AUDIT_READY":"PROMOTION_AUDIT_BLOCKED",
    checks,
    passedCount:checks.filter(x=>x.passed).length,
    totalChecks:checks.length,
    productionApplyEnabled:false,
    reason:passed
      ?"独立昇格監査へ回せる条件を満たした。本番反映はまだ禁止"
      :"独立昇格監査へ進む条件が不足"
  };
}
function contextRank(status){return({CONTEXT_PASS:4,CONTEXT_FAIL:3,INSUFFICIENT_CONTEXT:2,WAIT_HOLDOUT:1,NOT_APPLICABLE:0})[status]||0}
function promotionRank(status){return({PROMOTION_AUDIT_READY:2,PROMOTION_AUDIT_BLOCKED:1})[status]||0}


function runIndependentPromotionAudit(rows,proposal,promotionAudit,holdoutAnalysis){
  if(promotionAudit?.status!=="PROMOTION_AUDIT_READY"||!Number.isFinite(Number(proposal?.suggestedProbability)))
    return{status:"NOT_APPLICABLE",reason:"独立昇格監査の前提条件未達",selectionLeakagePrevented:true};

  const partition=validationPartition(rows,holdoutAnalysis);
  const validationRows=partition.holdout;
  const fixedCurrent=Number(holdoutAnalysis?.trainCandidate?.predictedAvg);
  const fixedProposed=Number(proposal.suggestedProbability);
  if(!validationRows.length||!Number.isFinite(fixedCurrent)||!Number.isFinite(fixedProposed))
    return{status:"INSUFFICIENT_INDEPENDENT_CONTEXT",reason:"固定提案値または未使用検証データ不足",selectionLeakagePrevented:true};

  const venueMap=new Map();
  for(const row of validationRows){
    const venue=String(row.venueName||row.venueCode||"UNKNOWN");
    if(venue==="UNKNOWN")continue;
    if(!venueMap.has(venue))venueMap.set(venue,[]);
    venueMap.get(venue).push(row);
  }
  const folds=[];
  for(const [heldVenue,test] of venueMap){
    if(test.length<2)continue;
    const observedTest=avg(test.map(x=>x.outcome));
    const currentBrier=avg(test.map(x=>(fixedCurrent-x.outcome)**2));
    const proposedBrier=avg(test.map(x=>(fixedProposed-x.outcome)**2));
    const currentLogLoss=avg(test.map(x=>binaryLogLoss(fixedCurrent,x.outcome)));
    const proposedLogLoss=avg(test.map(x=>binaryLogLoss(fixedProposed,x.outcome)));
    const trainDirection=Math.sign(Number(holdoutAnalysis?.trainCandidate?.observedRate)-fixedCurrent);
    const testDirection=Math.sign(observedTest-fixedCurrent);
    const directionConsistent=trainDirection!==0&&trainDirection===testDirection;
    folds.push({
      heldVenue,testCount:test.length,
      currentProbability:fixedCurrent,proposedProbability:fixedProposed,
      testObservedRate:observedTest,directionConsistent,
      brierImprovement:currentBrier-proposedBrier,
      logLossImprovement:currentLogLoss-proposedLogLoss,
      pass:directionConsistent&&proposedBrier<currentBrier&&proposedLogLoss<currentLogLoss
    });
  }
  if(folds.length<3)
    return{
      status:"INSUFFICIENT_INDEPENDENT_CONTEXT",
      reason:"未使用ホールドアウト内の有効会場foldが3未満。全データ再学習で補わない",
      foldCount:folds.length,folds,
      fixedProposal:true,selectionLeakagePrevented:true,validationScope:"SEALED_HOLDOUT_ONLY"
    };

  const passCount=folds.filter(f=>f.pass).length,passShare=passCount/folds.length;
  const avgBrierImprovement=avg(folds.map(f=>f.brierImprovement));
  const avgLogLossImprovement=avg(folds.map(f=>f.logLossImprovement));
  const sensitivity=sensitivityAuditFixed(validationRows,fixedCurrent,fixedProposed);
  const pass=passShare>=.75&&avgBrierImprovement>0&&avgLogLossImprovement>0&&sensitivity.status==="SENSITIVITY_PASS";
  return{
    status:pass?"INDEPENDENT_AUDIT_PASS":"INDEPENDENT_AUDIT_FAIL",
    foldCount:folds.length,passCount,passShare,
    proposalSpread:0,
    avgBrierImprovement,avgLogLossImprovement,
    fixedCurrentProbability:fixedCurrent,fixedProposedProbability:fixedProposed,
    sensitivity,folds:folds.slice(0,12),
    fixedProposal:true,selectionLeakagePrevented:true,validationScope:"SEALED_HOLDOUT_ONLY",
    productionApplyEnabled:false,
    reason:pass
      ?"訓練側で固定した同一提案値が未使用ホールドアウト会場の75%以上で改善し、固定値感度も許容"
      :"固定提案値の未使用会場再現性または感度監査が不足"
  };
}
function sensitivityAuditFixed(validationRows,current,proposed){
  if(validationRows.length<6)return{status:"INSUFFICIENT",reason:"未使用検証標本6件以上必要",fixedProposal:true};
  const currentBrier=avg(validationRows.map(x=>(current-x.outcome)**2));
  const currentLogLoss=avg(validationRows.map(x=>binaryLogLoss(current,x.outcome)));
  const scales=[.50,.75,1.00,1.25];
  const delta=proposed-current;
  const candidates=scales.map(scale=>{
    const probability=Math.max(.12,Math.min(.95,current+delta*scale));
    const brier=avg(validationRows.map(x=>(probability-x.outcome)**2));
    const logLoss=avg(validationRows.map(x=>binaryLogLoss(probability,x.outcome)));
    return{scale,probability,brier,logLoss,improves:brier<currentBrier&&logLoss<currentLogLoss};
  });
  const improved=candidates.filter(x=>x.improves);
  const pass=improved.length>=3&&candidates.find(x=>x.scale===1)?.improves===true;
  return{
    status:pass?"SENSITIVITY_PASS":"SENSITIVITY_FAIL",
    improvedCount:improved.length,candidateCount:candidates.length,candidates,
    fixedBaseCurrent:current,fixedBaseProposed:proposed,
    fullDataRecalculation:false,
    reason:pass
      ?"訓練側固定提案値の周辺強度でも未使用検証データ上で改善"
      :"固定提案値の改善が周辺強度で安定しない"
  };
}
function independentRank(status){return({INDEPENDENT_AUDIT_PASS:4,INDEPENDENT_AUDIT_FAIL:3,INSUFFICIENT_INDEPENDENT_CONTEXT:2,NOT_APPLICABLE:1})[status]||0}


function buildPromotionPackage(rows,proposal,independentAudit,holdoutAnalysis){
  if(independentAudit?.status!=="INDEPENDENT_AUDIT_PASS"||!Number.isFinite(Number(proposal?.suggestedProbability)))
    return{status:"NOT_READY",reason:"独立監査未通過"};
  const currentProbability=Number(holdoutAnalysis?.trainCandidate?.predictedAvg);
  const suggestedProbability=Number(proposal.suggestedProbability);
  if(!Number.isFinite(currentProbability))
    return{status:"NOT_READY",reason:"訓練側固定現行確率が不足"};
  const delta=suggestedProbability-currentProbability;
  const reviewAfterSamples=Math.max(20,Math.min(50,Math.ceil(rows.length*.50)));
  const rollbackThreshold=Math.max(.03,Math.min(.08,Math.abs(delta)*.50));
  const packageKey=`${rows[0]?.stage||"?"}|${rows[0]?.family||"UNKNOWN"}|${rows[0]?.kind||"?"}|${currentProbability.toFixed(4)}|${suggestedProbability.toFixed(4)}`;
  const approvalFingerprint=promotionFingerprint({methodologyEpoch:PROMOTION_METHODOLOGY_EPOCH,packageVersion:"PROMOTION-PACKAGE-1.2-METHODOLOGY-BOUND",packageKey,currentProbability,suggestedProbability,proposalSource:"TRAIN_ONLY_FIXED",validationScope:"SEALED_HOLDOUT_ONLY",trainSampleCount:Number(holdoutAnalysis?.split?.trainCount)||0,validationSampleCount:Number(holdoutAnalysis?.split?.holdoutCount)||0});
  return{
    status:"PROMOTION_PACKAGE_READY",packageVersion:"PROMOTION-PACKAGE-1.2-METHODOLOGY-BOUND",packageKey,
    methodologyEpoch:PROMOTION_METHODOLOGY_EPOCH,approvalFingerprint,
    currentProbability,suggestedProbability,delta,direction:delta>0?"UP":delta<0?"DOWN":"UNCHANGED",
    proposalSource:"TRAIN_ONLY_FIXED",
    validationScope:"SEALED_HOLDOUT_ONLY",
    selectionLeakagePrevented:true,
    trainSampleCount:Number(holdoutAnalysis?.split?.trainCount)||0,
    validationSampleCount:Number(holdoutAnalysis?.split?.holdoutCount)||0,
    sampleCount:rows.length,evidenceSources:countBy(rows.map(x=>x.source||"unknown")),
    autoResolvedShare:rows.length?rows.filter(x=>x.autoResolved).length/rows.length:0,
    independentAudit:{foldCount:independentAudit.foldCount,passCount:independentAudit.passCount,passShare:independentAudit.passShare,proposalSpread:independentAudit.proposalSpread,avgBrierImprovement:independentAudit.avgBrierImprovement,avgLogLossImprovement:independentAudit.avgLogLossImprovement,sensitivityStatus:independentAudit.sensitivity?.status||null},
    rolloutPolicy:{mode:"SHADOW_ONLY",productionWriteAllowed:false,requiresManualApproval:true,canaryEnabled:false},
    rollbackPolicy:{reviewAfterSamples,rollbackIfBrierWorsensBy:rollbackThreshold,rollbackIfDirectionFlips:true,rollbackIfEvidenceQualityDrops:true},
    approvalChecklist:[
      {id:"INDEPENDENT_AUDIT_PASS",label:"独立監査合格",passed:true},
      {id:"NO_AUTO_PROMOTION",label:"自動昇格禁止",passed:true},
      {id:"ROLLBACK_POLICY_DEFINED",label:"ロールバック条件定義済み",passed:true},
      {id:"MANUAL_APPROVAL_REQUIRED",label:"手動承認必須",passed:true}
    ],
    reason:"本番値を変更する前の固定監査パッケージ。現在はSHADOW_ONLY"
  };
}
function countBy(values){const out={};for(const v of values)out[v]=(out[v]||0)+1;return out}

function binaryLogLoss(p,y){const q=Math.max(1e-9,Math.min(1-1e-9,Number(p)));return-(Number(y)*Math.log(q)+(1-Number(y))*Math.log(1-q))}
function proposalRank(status){return({READY_FOR_RESEARCH_REVIEW:3,SHADOW_WATCH:2,NO_CHANGE_PROPOSED:1})[status]||0}
function holdoutRank(status){return({HOLDOUT_PASS:4,HOLDOUT_FAIL:3,INSUFFICIENT_HOLDOUT:2,NOT_APPLICABLE:1})[status]||0}

function conditionFamily(id){
  return String(id||"UNKNOWN")
    .replace(/_\d+(?=_|$)/g,"_N")
    .replace(/__+/g,"_");
}
function wilsonInterval(success,n,z=1.96){
  if(!n)return{low:null,high:null};
  const phat=success/n,z2=z*z,den=1+z2/n;
  const center=(phat+z2/(2*n))/den;
  const margin=(z*Math.sqrt((phat*(1-phat)+z2/(4*n))/n))/den;
  return{low:Math.max(0,center-margin),high:Math.min(1,center+margin)};
}
function conditionReviewStatus(n,absGap,interval,predicted){
  if(n<5)return"INSUFFICIENT";
  const outside=Number.isFinite(interval?.low)&&Number.isFinite(interval?.high)&&(predicted<interval.low||predicted>interval.high);
  if(n>=20&&outside&&absGap>=.10)return"RECALIBRATION_CANDIDATE";
  if(n>=10&&absGap>=.10)return"WATCH";
  return"STABLE_OR_UNCLEAR";
}
function reviewRank(status){
  return({RECALIBRATION_CANDIDATE:4,WATCH:3,STABLE_OR_UNCLEAR:2,INSUFFICIENT:1})[status]||0;
}

function summarizeProbabilityMass(records){
  const rows=records.map(r=>r?.probabilityMassDiagnostics).filter(Boolean);
  const verified=rows.filter(x=>x.status==="OK");
  const invalid=rows.filter(x=>x.status!=="OK");
  const unverifiedCount=records.length-rows.length;
  return{
    totalRecords:records.length,
    verifiedCount:verified.length,
    invalidCount:invalid.length,
    unverifiedCount,
    avgTerminalMass:rows.length?avg(rows.map(x=>Number(x.terminalMassTotal)).filter(Number.isFinite)):null,
    maxMassDeviation:rows.length?Math.max(...rows.map(x=>Number(x.totalMassDeviation)).filter(Number.isFinite),0):null,
    calibrationStatus:invalid.length?"MASS_INVALID_PRESENT":unverifiedCount?"MASS_PARTLY_UNVERIFIED":"MASS_VERIFIED",
    note:"確率質量が監査済みになるまではBrier/LogLossを校正済み確率とは扱わない"
  };
}

function summarizeEvidenceReview(records){
  const evidence=records.flatMap(r=>Array.isArray(r?.conditionEvidence)?r.conditionEvidence:[]);
  const states=records.map(r=>deriveEvidenceLearningState(r?.conditionEvidence,r));
  return{
    total:evidence.length,
    confirmed:evidence.filter(x=>x.status==="CONFIRMED").length,
    refuted:evidence.filter(x=>x.status==="REFUTED").length,
    unknown:evidence.filter(x=>x.status==="UNKNOWN").length,
    pending:evidence.filter(x=>x.status==="EVIDENCE_PENDING").length,
    autoResolved:evidence.filter(x=>x.autoResolved===true).length,
    fullyReviewedRaceCount:states.filter(s=>s.reviewComplete).length,
    reviewCompleteRaceCount:states.filter(s=>s.reviewComplete).length,
    decisiveEvidenceCompleteRaceCount:states.filter(s=>s.decisiveEvidenceComplete).length,
    nodeCauseLearningEligibleRaceCount:states.filter(s=>s.nodeCauseLearningEligible).length
  };
}

function stageCalibration(records,stage){
  const samples=records.flatMap(r=>
    (Array.isArray(r?.calibrationSamples?.[stage])?r.calibrationSamples[stage]:[])
      .map(s=>({...s,_massStatus:r?.probabilityMassDiagnostics?.status||"UNVERIFIED"}))
  ).filter(s=>Number.isFinite(Number(s?.probability))&&Number(s.probability)>=0&&Number(s.probability)<=1&&(s.outcome===0||s.outcome===1));
  if(!samples.length)return{sampleCount:0,brier:null,logLoss:null,bins:[],probabilityMassStatus:"NO_SAMPLES",massVerifiedRecordCount:0,massInvalidRecordCount:0,massUnverifiedRecordCount:0};
  const brier=avg(samples.map(s=>{const p=Number(s.probability),y=Number(s.outcome);return(p-y)*(p-y)}));
  const logLoss=avg(samples.map(s=>{const p=Math.max(1e-9,Math.min(1-1e-9,Number(s.probability))),y=Number(s.outcome);return-(y*Math.log(p)+(1-y)*Math.log(1-p))}));
  const bins=[];
  for(let i=0;i<10;i++){const low=i/10,high=(i+1)/10,rs=samples.filter(s=>Number(s.probability)>=low&&(i===9?Number(s.probability)<=1:Number(s.probability)<high));if(rs.length)bins.push({low,high,count:rs.length,avgPredicted:avg(rs.map(x=>Number(x.probability))),observedRate:avg(rs.map(x=>Number(x.outcome)))})}
  const uniqueRecords=records.filter(r=>Array.isArray(r?.calibrationSamples?.[stage])&&r.calibrationSamples[stage].length);
  const massVerifiedRecordCount=uniqueRecords.filter(r=>r?.probabilityMassDiagnostics?.status==="OK").length;
  const massInvalidRecordCount=uniqueRecords.filter(r=>["INVALID_TOTAL_MASS","INVALID_CONDITIONAL_MASS"].includes(r?.probabilityMassDiagnostics?.status)).length;
  const massUnverifiedRecordCount=uniqueRecords.length-massVerifiedRecordCount-massInvalidRecordCount;
  const probabilityMassStatus=massInvalidRecordCount>0?"MASS_INVALID":massUnverifiedRecordCount>0?"MASS_PARTLY_UNVERIFIED":"MASS_VERIFIED";
  return{sampleCount:samples.length,brier,logLoss,bins,probabilityMassStatus,massVerifiedRecordCount,massInvalidRecordCount,massUnverifiedRecordCount};
}

function buildOperationalRaceMetrics(snapshot,result){
  const bets=Array.isArray(snapshot?.betSelections)?snapshot.betSelections:[];
  const order=(result?.officialFinishOrder||[]).map(Number).slice(0,3),officialKey=order.join("-");
  const matched=bets.find(b=>(b?.order||[]).map(Number).join("-")===officialKey)||null;
  const payout=Number(result?.officialPayout),totalStake=bets.reduce((sum,b)=>sum+(Number.isFinite(Number(b?.stake))?Number(b.stake):0),0),hitStake=matched&&Number.isFinite(Number(matched.stake))?Number(matched.stake):0;
  const grossReturn=matched&&Number.isFinite(payout)&&hitStake>0?payout/100*hitStake:0;
  const thick=buildOutcomeDiagnostics(snapshot,result);
  return{
    version:"OPERATIONAL-RACE-METRICS-1.0",betCount:bets.length,totalStake,grossReturn,
    thickEligible:Number(thick?.thickBetCount)>0,thickHit:Boolean(thick?.thickHit),
    mainHit:bets.some(b=>b?.category==="MAIN"&&(b?.order||[]).map(Number).join("-")===officialKey),
    supportHit:bets.some(b=>["COVER","BUYABLE_HIGH"].includes(b?.category)&&(b?.order||[]).map(Number).join("-")===officialKey)
  };
}

function buildResearchLearningRecord(snapshot,result){
  const v=result?.verification||{};
  const order=(result?.officialFinishOrder||[]).map(Number);
  const ledger=Array.isArray(snapshot?.terminalLedger)?snapshot.terminalLedger:[];
  const first=order[0],second=order[1];
  const realizedFirstFamilyProbability=Number.isFinite(first)
    ?ledger.filter(t=>Number(t?.order?.[0])===first).reduce((s,t)=>s+(Number(t?.probability)||0),0)
    :null;
  const realizedPairProbability=Number.isFinite(first)&&Number.isFinite(second)
    ?ledger.filter(t=>Number(t?.order?.[0])===first&&Number(t?.order?.[1])===second).reduce((s,t)=>s+(Number(t?.probability)||0),0)
    :null;

  return{
    version:"RESEARCH-LEARNING-1.0",
    predictionSnapshotId:snapshot?.predictionSnapshotId||null,
    raceKey:raceKey(snapshot?.targetRace||{}),
    date:snapshot?.targetRace?.date||null,
    venueName:snapshot?.targetRace?.venueName||null,
    venueCode:snapshot?.targetRace?.venueCode||null,
    raceNo:snapshot?.targetRace?.raceNo??null,
    predictionVersion:snapshot?.predictionVersion||null,
    checkedAt:result?.checkedAt||new Date().toISOString(),
    resultStatus:result?.resultStatus||null,
    verificationStatus:v?.status||null,
    learningMode:v?.researchLearning?.mode||result?.learningDisposition?.mode||"NORMAL",
    includeInNormalLearning:Boolean(v?.researchLearning?.includeInNormalLearning),
    autoPromoteToProduction:false,
    officialFinishOrder:order,
    officialEvidence:result?.officialEvidence||null,
    exactTerminalGenerated:Boolean(v?.exactTerminalGenerated),
    exactTerminalPurchased:Boolean(v?.exactTerminalPurchased),
    firstPlaceFamilyGenerated:Boolean(v?.firstPlaceFamilyGenerated),
    firstSecondPairGenerated:Boolean(v?.firstSecondPairGenerated),
    realizedTerminalProbability:Number.isFinite(Number(v?.terminalProbability))?Number(v.terminalProbability):null,
    realizedFirstFamilyProbability:Number.isFinite(realizedFirstFamilyProbability)?realizedFirstFamilyProbability:null,
    realizedPairProbability:Number.isFinite(realizedPairProbability)?realizedPairProbability:null,
    probabilityMassDiagnostics:buildProbabilityMassDiagnostics(ledger,order),
    terminalGlobalRank:v?.terminalGlobalRank??null,
    terminalFamilyRank:v?.terminalFamilyRank??null,
    terminalPairRank:v?.terminalPairRank??null,
    naturalConvergenceScore:v?.naturalConvergenceScore??null,
    extraConditionCount:v?.extraConditionCount??null,
    purchaseRejectCode:v?.purchaseRejectCode||null,
    purchaseRejectReason:v?.purchaseRejectReason||null,
    stageProbabilities:Array.isArray(v?.stages)?v.stages.map(x=>({
      stage:x.stage,number:x.number,position:x.position,
      conditionalProbability:x.conditionalProbability??null,
      conditionValidation:x.conditionValidation?.status||null
    })):[],
    conditionEvidence:buildConditionEvidence(v?.stages),
    calibrationSamples:buildStageCalibrationSamples(ledger,order),
    evidenceReviewComplete:false,
    decisiveEvidenceComplete:false,
    nodeCauseLearningEligible:false,
    nodeCauseLearningReason:"証拠レビュー未完了",
    outcomeDiagnostics:buildOutcomeDiagnostics(snapshot,result),
    operationalMetrics:buildOperationalRaceMetrics(snapshot,result)
  };
}

function extractOfficialEvidence(official){
  if(!official||typeof official!=="object")return null;
  const winningMethod=normalizeOfficialMethod(official.winningMethod||official.kimarite||official.winningTechnique||null);
  const markers=official.markers&&typeof official.markers==="object"
    ?{startNumber:finiteNumberOrNull(official.markers.startNumber??official.markers.S),backNumber:finiteNumberOrNull(official.markers.backNumber??official.markers.B)}
    :{startNumber:null,backNumber:null};
  const riderResults=Array.isArray(official.riderResults)?official.riderResults.slice(0,12):[];
  const incidents=Array.isArray(official.incidents)?official.incidents.slice(0,20):[];
  const raceNotes=Array.isArray(official.raceNotes)?official.raceNotes.slice(0,10):[];
  return (winningMethod||markers.startNumber||markers.backNumber||riderResults.length||incidents.length||raceNotes.length)
    ?{winningMethod,markers,riderResults,incidents,raceNotes,source:official.source||"official"}:null;
}
function normalizeOfficialMethod(value){
  const raw=String(value||"").trim();if(!raw)return null;
  if(/逃/.test(raw))return"逃げ";
  if(/捲|まく/.test(raw))return"捲り";
  if(/差/.test(raw))return"差し";
  if(/マーク/.test(raw))return"マーク";
  return raw;
}
function finiteNumberOrNull(v){const n=Number(v);return Number.isFinite(n)?n:null}
function applyDirectOfficialEvidence(record,officialEvidence,now=new Date()){
  if(!record||!officialEvidence)return record;
  const evidence=Array.isArray(record.conditionEvidence)?record.conditionEvidence:[];
  const winner=Number(record.officialFinishOrder?.[0]);
  const method=normalizeOfficialMethod(officialEvidence.winningMethod);
  const rules=[
    {prefix:"LEADER_FINISH_",method:"逃げ"},
    {prefix:"MAKURI_REACH_",method:"捲り"},
    {prefix:"BANTE_PASS_",method:"差し"}
  ];
  for(const item of evidence){
    if(item.status!=="EVIDENCE_PENDING")continue;
    const id=String(item.conditionId||"");
    const rule=rules.find(r=>id.startsWith(r.prefix));
    if(!rule||!method||!Number.isFinite(winner))continue;
    const subject=Number(id.slice(rule.prefix.length));
    if(subject!==winner)continue;
    item.status=method===rule.method?"CONFIRMED":"REFUTED";
    item.source="official_winning_method";
    item.note=`公式決まり手: ${method}`;
    item.updatedAt=now.toISOString();
    item.autoResolved=true;
  }
  const state=deriveEvidenceLearningState(evidence,record);
  record.nodeCauseLearningEligible=state.nodeCauseLearningEligible;
  record.nodeCauseLearningReason=state.nodeCauseLearningReason;
  record.evidenceReviewComplete=state.reviewComplete;
  record.decisiveEvidenceComplete=state.decisiveEvidenceComplete;
  record.evidenceSummary=state;
  return record;
}

function buildConditionEvidence(stages){
  return (Array.isArray(stages)?stages:[]).flatMap(stage=>(Array.isArray(stage?.conditions)?stage.conditions:[]).map((c,index)=>({
    evidenceKey:`${stage.stage}:${c.id||index}`,
    stage:stage.stage,number:stage.number,position:stage.position,
    conditionId:c.id||null,label:c.label||null,kind:c.kind||null,
    predictedProbability:c.probability??null,critical:Boolean(c.critical),
    status:"EVIDENCE_PENDING",source:null,note:null,updatedAt:null
  })));
}

function buildStageCalibrationSamples(ledger,order){
  if(!Array.isArray(ledger)||!Array.isArray(order)||order.length<3)return{FIRST:[],SECOND:[],THIRD:[]};
  const [a,b,c]=order.map(Number);
  const first=new Map();
  for(const t of ledger){const n=Number(t?.order?.[0]),p=Number(t?.probability)||0;if(Number.isFinite(n))first.set(n,(first.get(n)||0)+p)}
  const FIRST=[...first].map(([number,probability])=>({stage:"FIRST",number,probability,probabilityValid:Number.isFinite(probability)&&probability>=0&&probability<=1,outcome:number===a?1:0}));
  const firstProb=first.get(a)||0,pairs=new Map();
  for(const t of ledger){if(Number(t?.order?.[0])!==a)continue;const n=Number(t?.order?.[1]),p=Number(t?.probability)||0;if(Number.isFinite(n))pairs.set(n,(pairs.get(n)||0)+p)}
  const SECOND=[...pairs].map(([number,p])=>{const probability=firstProb>0?p/firstProb:null;return{stage:"SECOND",parent:[a],number,probability,probabilityValid:Number.isFinite(probability)&&probability>=0&&probability<=1,outcome:number===b?1:0}}).filter(x=>Number.isFinite(Number(x.probability)));
  const pairProb=pairs.get(b)||0,thirds=new Map();
  for(const t of ledger){if(Number(t?.order?.[0])!==a||Number(t?.order?.[1])!==b)continue;const n=Number(t?.order?.[2]),p=Number(t?.probability)||0;if(Number.isFinite(n))thirds.set(n,(thirds.get(n)||0)+p)}
  const THIRD=[...thirds].map(([number,p])=>{const probability=pairProb>0?p/pairProb:null;return{stage:"THIRD",parent:[a,b],number,probability,probabilityValid:Number.isFinite(probability)&&probability>=0&&probability<=1,outcome:number===c?1:0}}).filter(x=>Number.isFinite(Number(x.probability)));
  return{FIRST,SECOND,THIRD};
}
function buildProbabilityMassDiagnostics(ledger,order){
  const rows=Array.isArray(ledger)?ledger:[];
  const valid=rows.map(t=>Number(t?.probability)).filter(Number.isFinite);
  const terminalMassTotal=valid.reduce((s,p)=>s+p,0);
  const tolerance=.02;
  const totalMassDeviation=Math.abs(terminalMassTotal-1);

  let actualFirstConditionalSecondMass=null;
  let actualPairConditionalThirdMass=null;
  const [a,b]=Array.isArray(order)?order.map(Number):[null,null];
  if(Number.isFinite(a)){
    const firstMass=rows.filter(t=>Number(t?.order?.[0])===a).reduce((s,t)=>s+(Number(t?.probability)||0),0);
    if(firstMass>0){
      const secondMass=rows.filter(t=>Number(t?.order?.[0])===a).reduce((s,t)=>s+(Number(t?.probability)||0),0);
      actualFirstConditionalSecondMass=secondMass/firstMass;
    }
    if(Number.isFinite(b)){
      const pairMass=rows.filter(t=>Number(t?.order?.[0])===a&&Number(t?.order?.[1])===b).reduce((s,t)=>s+(Number(t?.probability)||0),0);
      if(pairMass>0){
        const thirdMass=rows.filter(t=>Number(t?.order?.[0])===a&&Number(t?.order?.[1])===b).reduce((s,t)=>s+(Number(t?.probability)||0),0);
        actualPairConditionalThirdMass=thirdMass/pairMass;
      }
    }
  }
  const invalidTerminalValues=rows.filter(t=>!Number.isFinite(Number(t?.probability))||Number(t.probability)<0).length;
  let status="OK";
  if(invalidTerminalValues>0||!Number.isFinite(terminalMassTotal)||terminalMassTotal<=0||totalMassDeviation>tolerance)status="INVALID_TOTAL_MASS";
  else if((Number.isFinite(actualFirstConditionalSecondMass)&&Math.abs(actualFirstConditionalSecondMass-1)>tolerance)||(Number.isFinite(actualPairConditionalThirdMass)&&Math.abs(actualPairConditionalThirdMass-1)>tolerance))status="INVALID_CONDITIONAL_MASS";
  return{
    version:"PROBABILITY-MASS-AUDIT-1.0",
    terminalCount:rows.length,
    terminalMassTotal,
    totalMassDeviation,
    tolerance,
    actualFirstConditionalSecondMass,
    actualPairConditionalThirdMass,
    invalidTerminalValues,
    status,
    calibrationEligible:status==="OK",
    note:status==="OK"?"確率質量は監査許容範囲":"確率質量が1.0から外れているため校正指標の解釈に注意"
  };
}

function clampProbability(v){return Math.max(0,Math.min(1,Number(v)||0))}

function saveResearchLearningRecord(storage,record){
  if(!record?.predictionSnapshotId)return;
  const rows=loadResearchLearningRecords(storage);
  const filtered=rows.filter(r=>r.predictionSnapshotId!==record.predictionSnapshotId);
  const next=[record,...filtered].slice(0,MAX_RESEARCH_RECORDS);
  try{storage.setItem(RESEARCH_LEDGER_KEY,JSON.stringify(next))}catch{
    try{storage.setItem(RESEARCH_LEDGER_KEY,JSON.stringify(next.slice(0,100)))}catch{}
  }
}
function ratio(a,b){return b>0?a/b:null}
function avg(values){return values.length?values.reduce((a,b)=>a+b,0)/values.length:null}

export function compactStoredSnapshots(storage){const all=loadSnapshots(storage);persistSnapshots(storage,all);return loadSnapshots(storage)}
export function isResultPending(official){return String(official?.status||"").toLowerCase()==="not_finished"}
export function evaluateResult(snapshot,official,now=new Date()){
  const status=normalizeStatus(official.status);
  if(status==="not_finished")throw new Error("公式結果はまだ確定していません");
  const order=(official.finishOrder||official.order||[]).slice(0,3).map(Number);
  const exceptional=detectExceptionalRace(official);
  const learningDisposition=exceptional
    ?{mode:"EXCEPTIONAL_SEPARATE",includeInNormalLearning:false,reason:exceptional.reason,details:exceptional.details}
    :{mode:"NORMAL",includeInNormalLearning:true,reason:null,details:[]};

  if(status==="cancelled"||status==="refund")return {
    resultStatus:status,officialFinishOrder:order,officialPayout:official.payout??null,
    matchedSelection:null,betCategory:null,predictionSnapshotId:snapshot.predictionSnapshotId,
    checkedAt:now.toISOString(),officialEvidence:extractOfficialEvidence(official),learningDisposition,
    verification:buildResultVerification(snapshot,order,null,status,learningDisposition)
  };

  if(order.length<3)throw new Error("公式の確定着順を取得できません");

  const key=order.join("-");
  const matched=(snapshot.betSelections||[]).find(b=>b.order.join("-")===key)||null;
  const terminal=(snapshot.terminalLedger||[]).find(t=>(t.order||[]).join("-")===key)||null;
  const verification=buildResultVerification(snapshot,order,terminal,matched?"hit":"miss",learningDisposition);

  return {
    resultStatus:matched?"hit":"miss",
    officialFinishOrder:order,
    officialPayout:official.payout??null,
    matchedSelection:matched?.order||null,
    betCategory:matched?.category||null,
    terminalWasGenerated:Boolean(terminal),
    terminalProbability:terminal?.probability??null,
    terminalPurchaseStatus:terminal?.purchaseStatus||null,
    terminalRejectCode:terminal?.purchaseRejectCode||null,
    terminalRejectReason:terminal?.purchaseReason||null,
    predictionSnapshotId:snapshot.predictionSnapshotId,
    checkedAt:now.toISOString(),
    officialEvidence:extractOfficialEvidence(official),
    learningDisposition,
    verification
  };
}

function buildResultVerification(snapshot,order,terminal,resultStatus,learningDisposition){
  if(!Array.isArray(order)||order.length<3){
    return{
      version:"RESULT-VERIFY-1.0",
      status:"NOT_APPLICABLE",
      researchLearning:{mode:learningDisposition?.mode||"NONE",savedToResearch:true,autoPromoteToProduction:false},
      note:"中止・返還等のため通常の着順ノード検証は行わない"
    };
  }

  const generated=Boolean(terminal);
  const purchased=terminal?.purchaseStatus==="購入採用" || (snapshot.betSelections||[]).some(b=>(b.order||[]).join("-")===order.join("-"));
  const nodeSummary=terminal?.nodeSummary||null;
  const stageRows=[
    {stage:"FIRST",number:Number(order[0]),position:1},
    {stage:"SECOND",number:Number(order[1]),position:2},
    {stage:"THIRD",number:Number(order[2]),position:3}
  ].map(row=>{
    const node=nodeSummary?.[row.stage]||null;
    return{
      ...row,
      finishEventConfirmed:true,
      predictedNodePresent:Boolean(node),
      conditionalProbability:node?.conditionalProbability??null,
      newConditionCount:node?.newConditionCount??null,
      extraConditionCount:node?.extraConditionCount??null,
      conditionLabels:node?.conditionLabels||[],
      conditions:(node?.conditions||[]).map(c=>({...c,evidenceStatus:"EVIDENCE_PENDING",evidenceSource:null,evidenceNote:null})),
      conditionValidation:node
        ?{status:"EVIDENCE_PENDING",reason:"確定着順だけでは、位置取り・追走・捲り成功等の成立原因までは確定できない"}
        :{status:generated?"NODE_SUMMARY_UNAVAILABLE":"TERMINAL_NOT_GENERATED",reason:generated?"旧保存形式等でノード要約なし":"正解終端自体が予想時に未生成"}
    };
  });

  const firstHeadGenerated=(snapshot.terminalLedger||[]).some(t=>Number(t?.order?.[0])===Number(order[0]));
  const pairGenerated=(snapshot.terminalLedger||[]).some(t=>Number(t?.order?.[0])===Number(order[0])&&Number(t?.order?.[1])===Number(order[1]));

  let failureClass="NONE";
  if(!firstHeadGenerated)failureClass="FIRST_FAMILY_GENERATION_MISS";
  else if(!pairGenerated)failureClass="SECOND_BRANCH_GENERATION_MISS";
  else if(!generated)failureClass="THIRD_TERMINAL_GENERATION_MISS";
  else if(!purchased)failureClass="PURCHASE_SELECTION_MISS";
  else if(resultStatus==="hit")failureClass="PURCHASE_HIT";

  return{
    version:"RESULT-VERIFY-1.0",
    status:failureClass,
    exactTerminalGenerated:generated,
    exactTerminalPurchased:purchased,
    firstPlaceFamilyGenerated:firstHeadGenerated,
    firstSecondPairGenerated:pairGenerated,
    terminalProbability:terminal?.probability??null,
    terminalGlobalRank:terminal?.terminalGlobalRank??null,
    terminalFamilyRank:terminal?.terminalFamilyRank??null,
    terminalPairRank:terminal?.terminalPairRank??null,
    naturalConvergenceScore:terminal?.naturalConvergenceScore??null,
    extraConditionCount:terminal?.extraConditionCount??null,
    purchaseRejectCode:terminal?.purchaseRejectCode||null,
    purchaseRejectReason:terminal?.purchaseReason||null,
    stages:stageRows,
    researchLearning:{
      mode:learningDisposition?.mode||"NORMAL",
      includeInNormalLearning:Boolean(learningDisposition?.includeInNormalLearning),
      savedToResearch:true,
      autoPromoteToProduction:false,
      calibrationEligible:Boolean(learningDisposition?.includeInNormalLearning)&&generated,
      nodeCauseLearningEligible:false,
      nodeCauseLearningReason:"途中経過の成立原因は確定着順だけから推測せず、公式経過・映像等の証拠取得まで保留"
    }
  };
}
function persistSnapshots(storage,rows){
  const ordered=(rows||[]).slice(0,MAX_SNAPSHOTS);
  const attempts=[
    ordered,
    ordered.map((s,i)=>i<FULL_SNAPSHOT_COUNT?s:compactSnapshot(s,false)),
    ordered.slice(0,30).map((s,i)=>i<4?s:compactSnapshot(s,true)),
    ordered.slice(0,15).map((s,i)=>i<2?s:compactSnapshot(s,true)),
    ordered.slice(0,8).map(s=>compactSnapshot(s,true)),
    ordered.slice(0,4).map(s=>compactSnapshot(s,true)),
    ordered.slice(0,2).map(s=>compactSnapshot(s,true)),
    ordered.slice(0,1).map(s=>compactSnapshot(s,true))
  ];
  let lastError=null;
  for(const attempt of attempts){try{storage.setItem(STORAGE_KEY,JSON.stringify(attempt));return}catch(error){lastError=error;if(!isQuotaError(error))throw error}}
  const err=new Error("保存領域がいっぱいです。古い予想を自動整理しても保存できませんでした。");err.name="PredictionStorageQuotaError";err.cause=lastError;throw err;
}
function compactSnapshot(s,aggressive){
  const terminalLedger=(s.terminalLedger||[]).map(t=>({order:t.order,probability:t.probability??null,purchaseStatus:t.purchaseStatus||null,purchaseRejectCode:t.purchaseRejectCode||null,betClass:t.betClass||"NONE"}));
  return {...s,
    participants:(s.participants||[]).map(p=>({number:p.number,name:p.name||"",lineId:p.lineId??null,linePosition:p.linePosition??null,role:p.role||null})),
    abilitiesUsed:(s.abilitiesUsed||[]).map(a=>({number:a.number,recentForm:a.recentForm??null,startPower:a.startPower??null,sprintPower:a.sprintPower??null,finishPower:a.finishPower??null,trackingSkill:a.trackingSkill??null,roleScores:a.roleScores||null,riderEvaluationV2:a.riderEvaluationV2||null,abilityMissingAudit:a.abilityMissingAudit||null})),
    predictionOutput:{recommendationLabel:s.predictionOutput?.recommendationLabel||"",lineConfidence:s.predictionOutput?.lineConfidence??null,lineMode:s.predictionOutput?.lineMode||null,noBet:Boolean(s.predictionOutput?.noBet),noBetReason:s.predictionOutput?.noBetReason||null},
    branches:aggressive?[]:(s.branches||[]).map(b=>({id:b.id||b.branchId||null,label:b.label||b.name||null,priority:b.priority||b.forecastClass||null,probability:b.probability??null})),
    terminalLedger,
    betSelections:(s.betSelections||[]).map(b=>({order:b.order,category:b.category,stake:b.stake??null,odds:b.odds??null,probability:b.probability??null,globalRank:b.globalRank??null,familyRank:b.familyRank??null,reason:aggressive?null:(b.reason||null)})),
    referenceBetSelections:(s.referenceBetSelections||[]).map(b=>({order:b.order,category:"REFERENCE",stake:null,odds:b.odds??null,probability:b.probability??null,globalRank:b.globalRank??null,familyRank:b.familyRank??null,reason:aggressive?null:(b.reason||null)})),
    standardBetCount:(s.betSelections||[]).length,referenceBetCount:(s.referenceBetSelections||[]).length,
    oddsSnapshot:aggressive?null:s.oddsSnapshot,
    result:s.result?{
      resultStatus:s.result.resultStatus,
      officialFinishOrder:s.result.officialFinishOrder||[],
      officialPayout:s.result.officialPayout??null,
      checkedAt:s.result.checkedAt,
      learningDisposition:s.result.learningDisposition||null,
      verification:s.result.verification||null
    }:null,
    storageCompacted:true
  };
}
function isQuotaError(error){return error?.name==="QuotaExceededError"||error?.name==="NS_ERROR_DOM_QUOTA_REACHED"||Number(error?.code)===22||/quota/i.test(String(error?.message||""))}
function normalizeStatus(value){const v=String(value||"confirmed").toLowerCase();if(v==="not_finished")return"not_finished";if(["cancelled","canceled","中止"].includes(v))return"cancelled";if(["refund","refunded","返還"].includes(v))return"refund";return"confirmed"}
function normalizeDate(value){return String(value||"").replace(/\D/g,"").slice(0,8)}

function detectExceptionalRace(official){const pool=[official?.incident,official?.incidents,official?.accident,official?.accidents,official?.disqualification,official?.disqualifications,official?.remarks,official?.note,official?.notes,official?.statusText,official?.resultNote,official?.raw?.incident,official?.raw?.remarks];const text=pool.flatMap(v=>Array.isArray(v)?v:[v]).filter(v=>v!=null).map(v=>typeof v==="string"?v:JSON.stringify(v)).join(" ");const hit=text.match(/落車|失格|棄権|再乗|事故|審議|妨害|過失走行|重大走行注意/i);return hit?{reason:"落車・失格等を含むため通常学習から分離",details:[hit[0]]}:null}
