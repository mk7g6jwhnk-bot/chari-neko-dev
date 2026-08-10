import{deriveRiderMarks}from"./rider-marks.mjs";
import{derivePredictionRatings}from"./prediction-ratings.mjs";
export const STORAGE_KEY="chari-neko:keirin-predictions:v1";
const MAX_SNAPSHOTS=60;
const FULL_SNAPSHOT_COUNT=8;

export function raceKey(race){return [normalizeDate(race.date),String(race.venueCode||""),Number(race.raceNo)].join(":")}
export function createSnapshot(payload,now=new Date()){
  const race=payload.race||{},prediction=payload.prediction||{};
  const createdAt=now.toISOString(),key=raceKey(race);
  const snapshot={predictionSnapshotId:`${key}:${createdAt}`,createdAt,targetRace:{date:normalizeDate(race.date),venueCode:String(race.venueCode||""),venueName:race.venue||race.venueName||"",raceNo:Number(race.raceNo),raceCategory:race.raceCategory||"standard",lineMode:race.lineMode||"official_line",scheduledStart:race.startTime||race.deadline||"",deadline:race.deadline||race.startTime||""},participants:(race.participants||[]).map(p=>({number:Number(p.number),name:p.name||"",registration:p.registration||"",sourceType:p.sourceType||null,sourcePath:p.sourcePath||null,className:p.className||"",prefecture:p.prefecture||"",lineId:p.lineId||null,line:p.line||null,linePosition:p.linePosition??null,lineOrder:p.lineOrder??null,role:p.role||null,lineStatus:p.lineStatus||null})),predictionVersion:prediction.engineVersion||"STABLE",abilitiesUsed:(prediction.scored||[]).map(p=>({number:p.number,recentForm:p.recentForm??null,startPower:p.startPower??null,startPowerEvidence:p.startPowerEvidence||null,sprintPower:p.sprintPower??null,finishPower:p.finishPower??null,trackingSkill:p.trackingSkill??null,kimariteAbilityEvidence:p.kimariteAbilityEvidence||null,abilityMissingAudit:p.abilityMissingAudit||null,roleScores:p.roleScores||null,riderEvaluationV2:p.riderEvaluationV2||null,scoreTrace:p.scoreTrace||null})),predictionOutput:{recommendationLabel:prediction.recommendationLabel||"",audit:prediction.audit||null,lineConfidence:prediction.lineConfidence||race.lineConfidence||null,lineMode:race.lineMode||payload.dataQuality?.lineMode||null,noBet:Boolean(prediction.noBet),noBetReason:prediction.noBetReason||null},branches:prediction.branches||[],terminalLedger:(prediction.terminals||[]).map(t=>({order:(t.order||[]).map(Number),probability:t.probability??null,purchaseStatus:t.purchaseStatus||null,purchaseRejectCode:t.purchaseRejectCode||null,purchaseReason:t.purchaseReason||null,betClass:t.betClass||"NONE",dominantBranchId:t.dominantBranchId||t.branchId||null,dominantBranchLabel:t.dominantBranchLabel||t.branchLabel||null,chatForecastRole:t.chatForecastRole||null,directMainBranchSupport:Boolean(t.directMainBranchSupport),branchHeadMatched:t.branchHeadMatched!==false,naturalConvergenceScore:t.naturalConvergenceScore??null,naturalConvergenceLevel:t.naturalConvergenceLevel||null,extraConditionCount:t.extraConditionCount??0,nodeConditionalProbability:t.nodeConditionalProbability??null,nodeSummary:summarizeNodeTrace(t.nodeTrace),terminalGlobalRank:t.terminalGlobalRank??null,terminalFamilyRank:t.terminalFamilyRank??null,terminalPairRank:t.terminalPairRank??null,firstFamilyNumber:t.firstFamilyNumber??t.order?.[0]??null,terminalDeleted:Boolean(t.lifecycle?.terminalDeleted)})),betSelections:(prediction.purchasePlan||[]).map(b=>({order:b.order.map(Number),category:b.betClass,stake:b.stake??null,odds:b.odds??null,recommendation:b.purchaseStatus||"購入採用",branchLabel:b.dominantBranchLabel||null,branchPriority:b.dominantBranchPriority||null,reason:b.purchaseReason||null,probability:b.probability??null,probabilityShare:b.probabilityShare??null,expectedValueIndex:b.expectedValueIndex??null,globalRank:b.globalRank??null,familyRank:b.familyRank??null,pairRank:b.pairRank??null,firstFamilyNumber:b.firstFamilyNumber??null,firstFamilyTier:b.firstFamilyTier??null,firstFamilyProbability:b.firstFamilyProbability??null,firstFamilyProbabilityShare:b.firstFamilyProbabilityShare??null,secondFamilyRelativeToBest:b.secondFamilyRelativeToBest??null,thirdFamilyRelativeToBest:b.thirdFamilyRelativeToBest??null,decisionRatios:b.decisionRatios||null,evidenceSummary:b.evidenceSummary||null,positionEvidence:b.positionEvidence||null,highPayoutAttribute:Boolean(b.highPayoutAttribute),highPayoutAttributeLabel:b.highPayoutAttributeLabel||null,chatForecastRole:b.chatForecastRole||null,directMainBranchSupport:Boolean(b.directMainBranchSupport),branchHeadMatched:b.branchHeadMatched!==false,naturalConvergenceScore:b.naturalConvergenceScore??null,naturalConvergenceLevel:b.naturalConvergenceLevel||null,naturalConvergenceReasons:b.naturalConvergenceReasons||[],extraConditionCount:b.extraConditionCount??0,scenarioCoherence:b.scenarioCoherence??null,nodeConditionalProbability:b.nodeConditionalProbability??null,nodeTrace:b.nodeTrace||null,purchaseReason:b.purchaseReason||b.reason||null,dominantBranchId:b.dominantBranchId||null,dominantBranchLabel:b.dominantBranchLabel||b.branchLabel||null})),category:prediction.recommendationLabel||"",recommendation:prediction.noBet?"見送り":prediction.recommendationLabel||"",noBet:Boolean(prediction.noBet),noBetReason:prediction.noBetReason||null,oddsSnapshot:payload.odds||null,result:null};
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
      conditionLabels:conditions.slice(0,4).map(c=>c?.label).filter(Boolean)
    };
  }
  return Object.keys(out).length?out:null;
}

export function saveSnapshot(storage,snapshot){
  const all=loadSnapshots(storage);const duplicate=all.find(x=>raceKey(x.targetRace)===raceKey(snapshot.targetRace)&&x.predictionVersion===snapshot.predictionVersion&&JSON.stringify(x.betSelections)===JSON.stringify(snapshot.betSelections)&&!x.result);if(duplicate)return duplicate;
  const next=[snapshot,...all].slice(0,MAX_SNAPSHOTS);
  persistSnapshots(storage,next);
  return snapshot;
}
export function loadSnapshots(storage){try{const value=JSON.parse(storage.getItem(STORAGE_KEY)||"[]");return Array.isArray(value)?value:[]}catch{return[]}}
export function findLatestSnapshot(storage,race){return loadSnapshots(storage).filter(x=>raceKey(x.targetRace)===raceKey(race)).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))[0]||null}
export function attachResult(storage,snapshotId,official,now=new Date()){const all=loadSnapshots(storage),index=all.findIndex(x=>x.predictionSnapshotId===snapshotId);if(index<0)throw new Error("保存済み予想が見つかりません");const result=evaluateResult(all[index],official,now);all[index]={...all[index],result};persistSnapshots(storage,all);return all[index]}
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
    checkedAt:now.toISOString(),learningDisposition,
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
      conditionValidation:node
        ?{status:"EVIDENCE_PENDING",reason:"確定着順だけでは、位置取り・追走・捲り成功等の成立原因までは確定できない"}
        :{status:generated?"NODE_SUMMARY_UNAVAILABLE":"TERMINAL_NOT_GENERATED",reason:generated?"旧保存形式等でノード要約なし":"正解終端自体が予想時に未生成"}
    };
  });

  let failureClass="NONE";
  if(!generated)failureClass="TERMINAL_GENERATION_MISS";
  else if(!purchased)failureClass="PURCHASE_SELECTION_MISS";
  else if(resultStatus==="hit")failureClass="PURCHASE_HIT";

  const firstHeadGenerated=(snapshot.terminalLedger||[]).some(t=>Number(t?.order?.[0])===Number(order[0]));
  const pairGenerated=(snapshot.terminalLedger||[]).some(t=>Number(t?.order?.[0])===Number(order[0])&&Number(t?.order?.[1])===Number(order[1]));

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
    oddsSnapshot:aggressive?null:s.oddsSnapshot,
    storageCompacted:true
  };
}
function isQuotaError(error){return error?.name==="QuotaExceededError"||error?.name==="NS_ERROR_DOM_QUOTA_REACHED"||Number(error?.code)===22||/quota/i.test(String(error?.message||""))}
function normalizeStatus(value){const v=String(value||"confirmed").toLowerCase();if(v==="not_finished")return"not_finished";if(["cancelled","canceled","中止"].includes(v))return"cancelled";if(["refund","refunded","返還"].includes(v))return"refund";return"confirmed"}
function normalizeDate(value){return String(value||"").replace(/\D/g,"").slice(0,8)}

function detectExceptionalRace(official){const pool=[official?.incident,official?.incidents,official?.accident,official?.accidents,official?.disqualification,official?.disqualifications,official?.remarks,official?.note,official?.notes,official?.statusText,official?.resultNote,official?.raw?.incident,official?.raw?.remarks];const text=pool.flatMap(v=>Array.isArray(v)?v:[v]).filter(v=>v!=null).map(v=>typeof v==="string"?v:JSON.stringify(v)).join(" ");const hit=text.match(/落車|失格|棄権|再乗|事故|審議|妨害|過失走行|重大走行注意/i);return hit?{reason:"落車・失格等を含むため通常学習から分離",details:[hit[0]]}:null}
