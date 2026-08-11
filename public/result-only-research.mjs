const KEY="chari-neko:keirin-result-only-research:v1";
const MAX=2000;
const AGG_KEY="chari-neko:keirin-result-only-objective-aggregate:v1";
const REVIEW_DECISION_KEY="chari-neko:keirin-result-only-research-review-decision:v1";
const TRIAL_PLAN_KEY="chari-neko:keirin-result-only-research-trial-plan:v1";
const TRIAL_ACTIVATION_REVIEW_KEY="chari-neko:keirin-result-only-research-trial-activation-review:v1";
const TRIAL_RUN_KEY="chari-neko:keirin-result-only-research-trial-run:v1";
const TRIAL_MONITOR_KEY="chari-neko:keirin-result-only-research-trial-monitor:v1";
const POST_TRIAL_REVIEW_KEY="chari-neko:keirin-result-only-post-research-trial-review:v1";
const POST_TRIAL_DECISION_KEY="chari-neko:keirin-result-only-post-research-trial-decision:v1";
const LIMITED_APPLICATION_PLAN_KEY="chari-neko:keirin-result-only-limited-research-application-plan:v1";
const LIMITED_APPLICATION_ACTIVATION_REVIEW_KEY="chari-neko:keirin-result-only-limited-research-application-activation-review:v1";
const LIMITED_APPLICATION_RUN_KEY="chari-neko:keirin-result-only-limited-research-application-run:v1";
const LIMITED_APPLICATION_MONITOR_KEY="chari-neko:keirin-result-only-limited-research-application-monitor:v1";
const POST_LIMITED_APPLICATION_REVIEW_KEY="chari-neko:keirin-result-only-post-limited-research-application-review:v1";
const POST_LIMITED_APPLICATION_DECISION_KEY="chari-neko:keirin-result-only-post-limited-research-application-decision:v1";
const INDEPENDENT_RESEARCH_EVALUATION_PLAN_KEY="chari-neko:keirin-result-only-independent-research-evaluation-plan:v1";
const INDEPENDENT_RESEARCH_EVALUATION_ACTIVATION_REVIEW_KEY="chari-neko:keirin-result-only-independent-research-evaluation-activation-review:v1";
const INDEPENDENT_RESEARCH_EVALUATION_RUN_KEY="chari-neko:keirin-result-only-independent-research-evaluation-run:v1";
const INDEPENDENT_RESEARCH_EVALUATION_MONITOR_KEY="chari-neko:keirin-result-only-independent-research-evaluation-monitor:v1";
const POST_INDEPENDENT_RESEARCH_EVALUATION_REVIEW_KEY="chari-neko:keirin-result-only-post-independent-research-evaluation-review:v1";
const normDate=v=>String(v||"").replace(/\D/g,"").slice(0,8);
export const resultOnlyRaceKey=r=>[normDate(r?.date),String(r?.venueCode||""),Number(r?.raceNo)].join(":");
function evidenceOf(official,race){
  const method=String(official?.winningMethod||"").trim()||null;
  const s=Number(official?.markers?.startNumber),b=Number(official?.markers?.backNumber);
  const raceRiders=Array.isArray(race?.riders)?race.riders:[];
  const riderResults=(Array.isArray(official?.riderResults)?official.riderResults.slice(0,12):[]).map(rr=>{const n=Number(rr?.number);const meta=raceRiders.find(r=>Number(r?.number)===n)||{};return{...rr,name:rr?.name||meta?.name||null,registrationNumber:rr?.registrationNumber||meta?.registrationNumber||meta?.registrationNo||meta?.id||null}});
  const incidents=Array.isArray(official?.incidents)?official.incidents.slice(0,20):[];
  const raceNotes=Array.isArray(official?.raceNotes)?official.raceNotes.slice(0,10):[];
  return{winningMethod:method,markers:{startNumber:Number.isFinite(s)?s:null,backNumber:Number.isFinite(b)?b:null},riderResults,incidents,raceNotes,source:official?.source||"official"};
}
function objectiveNodes(order,e){
  const out=[];
  if(order.length>=3)out.push({type:"FINISH_ORDER",status:"CONFIRMED",value:order.slice(0,3),source:"official_finish_order"});
  if(e.winningMethod)out.push({type:"WINNING_METHOD",status:"CONFIRMED",number:order[0]||null,value:e.winningMethod,source:"official_winning_method"});
  if(Number.isFinite(e.markers.startNumber))out.push({type:"START_MARKER",status:"CONFIRMED",number:e.markers.startNumber,source:"official_marker"});
  if(Number.isFinite(e.markers.backNumber))out.push({type:"BACK_MARKER",status:"CONFIRMED",number:e.markers.backNumber,source:"official_marker"});
  for(const r of e.riderResults){if(Number.isFinite(Number(r?.number))&&Number.isFinite(Number(r?.finish)))out.push({type:"RIDER_FINISH",status:"CONFIRMED",number:Number(r.number),value:Number(r.finish),source:"official_rider_result"})}
  for(const x of e.incidents)out.push({type:"INCIDENT",status:"CONFIRMED",number:Number.isFinite(Number(x?.number))?Number(x.number):null,value:x?.type||"incident",note:x?.note||null,source:"official_incident"});
  return out;
}
const deferred=["主導権の途中推移","仕掛け順","途中の追走状態","飛び付き","分断","離れの原因","切り替えの原因"].map(label=>({label,status:"EVIDENCE_PENDING",reason:"公式確定着順だけでは途中経過を確定しない"}));
export function loadResultOnlyResearch(storage){try{const v=JSON.parse(storage.getItem(KEY)||"[]");return Array.isArray(v)?v:[]}catch{return[]}}
export function hasResultOnlyResearch(storage,race){const k=resultOnlyRaceKey(race);return loadResultOnlyResearch(storage).some(x=>x.raceKey===k)}
function countBy(rows,keyFn){const m=new Map();for(const row of rows){const k=keyFn(row);if(k==null||k==="")continue;m.set(String(k),(m.get(String(k))||0)+1)}return [...m.entries()].map(([key,count])=>({key,count})).sort((a,b)=>b.count-a.count||a.key.localeCompare(b.key))}
function riderStats(records){
  const map=new Map();
  for(const rec of records){
    const method=rec.officialEvidence?.winningMethod||null;
    const s=Number(rec.officialEvidence?.markers?.startNumber),b=Number(rec.officialEvidence?.markers?.backNumber);
    for(const rr of rec.officialEvidence?.riderResults||[]){
      const number=Number(rr?.number),finish=Number(rr?.finish);if(!Number.isFinite(number)||!Number.isFinite(finish))continue;
      const riderId=String(rr?.registrationNumber||rr?.riderId||rr?.name||`${rec.raceKey}#${number}`);
      const row=map.get(riderId)||{riderId,name:rr?.name||null,starts:0,wins:0,top2:0,top3:0,startMarkerCount:0,backMarkerCount:0,winningMethods:{}};
      row.starts++;if(finish===1){row.wins++;if(method)row.winningMethods[method]=(row.winningMethods[method]||0)+1}if(finish<=2)row.top2++;if(finish<=3)row.top3++;if(s===number)row.startMarkerCount++;if(b===number)row.backMarkerCount++;map.set(riderId,row);
    }
  }
  return [...map.values()].map(r=>({...r,winRate:r.starts?r.wins/r.starts:0,top2Rate:r.starts?r.top2/r.starts:0,top3Rate:r.starts?r.top3/r.starts:0})).sort((a,b)=>b.starts-a.starts||b.wins-a.wins).slice(0,1000);
}
function researchCandidates(records,riders){
  const out=[];
  for(const r of riders){
    if(r.starts>=8&&r.backMarkerCount>=4&&r.top3Rate>=0.625)out.push({type:"RIDER_BACK_MARKER_TOP3_ASSOCIATION",status:"RESEARCH_CANDIDATE_ONLY",riderId:r.riderId,name:r.name,sampleCount:r.starts,backMarkerCount:r.backMarkerCount,top3Rate:r.top3Rate,reason:"公式Bと上位着の客観併存が一定件数。因果関係は未確定"});
    if(r.starts>=8&&r.startMarkerCount>=4&&r.top2Rate>=0.5)out.push({type:"RIDER_START_MARKER_TOP2_ASSOCIATION",status:"RESEARCH_CANDIDATE_ONLY",riderId:r.riderId,name:r.name,sampleCount:r.starts,startMarkerCount:r.startMarkerCount,top2Rate:r.top2Rate,reason:"公式Sと上位着の客観併存が一定件数。因果関係は未確定"});
  }
  for(const x of countBy(records,r=>r.officialEvidence?.winningMethod||null).filter(x=>x.count>=8))out.push({type:"WINNING_METHOD_FREQUENCY",status:"RESEARCH_CANDIDATE_ONLY",key:x.key,sampleCount:x.count,reason:"決まり手頻度の客観集計。会場・級班・展開条件を分離する前の粗い候補"});
  return out.slice(0,200);
}

const HYP_KEY="chari-neko:keirin-result-only-hypothesis-gate:v1";
function sortedRecords(records){return [...records].sort((a,b)=>String(a.date||"").localeCompare(String(b.date||""))||String(a.raceKey||"").localeCompare(String(b.raceKey||"")))}
function riderCandidateStats(records,c){
  let starts=0,marker=0,success=0;const venues=new Set();
  for(const rec of records){
    const rr=(rec.officialEvidence?.riderResults||[]).find(x=>String(x?.registrationNumber||x?.riderId||x?.name||"")===String(c.riderId));
    if(!rr)continue;const finish=Number(rr.finish),num=Number(rr.number);if(!Number.isFinite(finish)||!Number.isFinite(num))continue;starts++;venues.add(String(rec.venueCode||rec.venueName||""));
    if(c.type==="RIDER_BACK_MARKER_TOP3_ASSOCIATION"){if(Number(rec.officialEvidence?.markers?.backNumber)===num)marker++;if(finish<=3)success++;}
    else if(c.type==="RIDER_START_MARKER_TOP2_ASSOCIATION"){if(Number(rec.officialEvidence?.markers?.startNumber)===num)marker++;if(finish<=2)success++;}
  }
  return{starts,markerCount:marker,successCount:success,successRate:starts?success/starts:0,venueCount:[...venues].filter(Boolean).length};
}
function winningMethodCandidateStats(records,c){const rows=records.filter(r=>String(r.officialEvidence?.winningMethod||"")===String(c.key));return{starts:records.length,markerCount:rows.length,successCount:rows.length,successRate:records.length?rows.length/records.length:0,venueCount:new Set(rows.map(r=>String(r.venueCode||r.venueName||"")).filter(Boolean)).size}}
function statsForCandidate(records,c){return c.type==="WINNING_METHOD_FREQUENCY"?winningMethodCandidateStats(records,c):riderCandidateStats(records,c)}
function thresholdFor(c){return c.type==="RIDER_BACK_MARKER_TOP3_ASSOCIATION"?.625:c.type==="RIDER_START_MARKER_TOP2_ASSOCIATION"?.5:null}
export function buildResultOnlyHypothesisGate(storage){
  const aggregate=loadResultOnlyObjectiveAggregate(storage)||buildResultOnlyObjectiveAggregate(storage);
  const records=sortedRecords(loadResultOnlyResearch(storage).filter(x=>x.includeInObjectiveResearch));
  const candidates=Array.isArray(aggregate.researchCandidates)?aggregate.researchCandidates:[];
  const mid=Math.floor(records.length/2),early=records.slice(0,mid),late=records.slice(mid);
  const hypotheses=candidates.map(c=>{
    const all=statsForCandidate(records,c),a=statsForCandidate(early,c),b=statsForCandidate(late,c),threshold=thresholdFor(c);
    const enoughTemporal=c.type==="WINNING_METHOD_FREQUENCY"?(a.markerCount>=4&&b.markerCount>=4):(a.starts>=4&&b.starts>=4&&a.markerCount>=2&&b.markerCount>=2);
    const replicated=c.type==="WINNING_METHOD_FREQUENCY"?enoughTemporal:(enoughTemporal&&a.successRate>=threshold&&b.successRate>=threshold);
    const contextAudited=all.venueCount>=2;
    let status="VALIDATION_PENDING";
    if(enoughTemporal&&!replicated)status="TEMPORAL_REPLICATION_FAILED";
    else if(replicated&&!contextAudited)status="CONTEXT_EVIDENCE_PENDING";
    else if(replicated&&contextAudited)status="RESEARCH_VALIDATION_CANDIDATE_ONLY";
    return{...c,status,validation:{early:a,late:b,overall:all,temporalEvidenceSufficient:enoughTemporal,temporallyReplicated:replicated,contextVenueCount:all.venueCount,contextEvidenceSufficient:contextAudited},eligibleForResearchValidation:status==="RESEARCH_VALIDATION_CANDIDATE_ONLY",eligibleForPrediction:false,eligibleForProbabilityCalibration:false,productionWriteAllowed:false,autoPromoteToProduction:false};
  });
  const gate={version:"RESULT-ONLY-HYPOTHESIS-GATE-1.0",generatedAt:new Date().toISOString(),sourceObjectiveRaceCount:records.length,candidateCount:candidates.length,hypotheses,validationCandidateCount:hypotheses.filter(x=>x.eligibleForResearchValidation).length,pendingCount:hypotheses.filter(x=>x.status==="VALIDATION_PENDING"||x.status==="CONTEXT_EVIDENCE_PENDING").length,failedCount:hypotheses.filter(x=>x.status==="TEMPORAL_REPLICATION_FAILED").length,researchOnly:true,includeInPredictionAccuracy:false,includeInReturnRate:false,includeInProbabilityCalibration:false,productionWriteAllowed:false,autoPromoteToProduction:false,note:"結果のみ研究候補を時系列再現と会場分散で監査する。通過しても研究検証候補に留め、本番評価へは使用しない"};
  storage.setItem(HYP_KEY,JSON.stringify(gate));return gate;
}
export function loadResultOnlyHypothesisGate(storage){try{const v=JSON.parse(storage.getItem(HYP_KEY)||"null");return v&&typeof v==="object"?v:null}catch{return null}}


const CROSS_KEY="chari-neko:keirin-result-only-prediction-crosscheck:v1";
function snapshotParticipantNumber(snapshot,riderId){
  const rid=String(riderId||"");
  const p=(snapshot?.participants||[]).find(x=>String(x?.registration||x?.registrationNumber||x?.id||"")===rid);
  return p?Number(p.number):null;
}
function neutralShare(snapshot,places){const n=(snapshot?.participants||[]).length;return n>0?Math.min(1,Number(places)/n):null}
function riderPredictionShare(snapshot,number,places){
  const ledger=Array.isArray(snapshot?.terminalLedger)?snapshot.terminalLedger:[];
  const mass=ledger.reduce((s,t)=>s+(Number(t?.probability)||0),0);
  if(!(mass>0)||!Number.isFinite(Number(number)))return null;
  const hit=ledger.reduce((s,t)=>{const order=Array.isArray(t?.order)?t.order:[];const idx=order.findIndex(x=>Number(x)===Number(number));return s+(idx>=0&&idx<places?(Number(t?.probability)||0):0)},0);
  return hit/mass;
}
function predictionCrosscheckFor(h,snapshots){
  if(!h?.riderId)return{status:"PREDICTION_CROSSCHECK_NOT_APPLICABLE",sampleCount:0,directionalSupport:false,reason:"選手単位で照合できない仮説"};
  const places=h.type==="RIDER_START_MARKER_TOP2_ASSOCIATION"?2:3;
  const rows=[];
  for(const snapshot of snapshots||[]){
    const number=snapshotParticipantNumber(snapshot,h.riderId);if(!Number.isFinite(number))continue;
    const predicted=riderPredictionShare(snapshot,number,places),neutral=neutralShare(snapshot,places);
    if(!Number.isFinite(predicted)||!Number.isFinite(neutral))continue;
    rows.push({predictionSnapshotId:snapshot.predictionSnapshotId||null,date:snapshot.targetRace?.date||null,venueCode:snapshot.targetRace?.venueCode||null,raceNo:snapshot.targetRace?.raceNo??null,predictedShare:predicted,neutralShare:neutral,delta:predicted-neutral});
  }
  const sampleCount=rows.length;
  const avgPredicted=sampleCount?rows.reduce((s,x)=>s+x.predictedShare,0)/sampleCount:null;
  const avgNeutral=sampleCount?rows.reduce((s,x)=>s+x.neutralShare,0)/sampleCount:null;
  const avgDelta=sampleCount?rows.reduce((s,x)=>s+x.delta,0)/sampleCount:null;
  const positiveCount=rows.filter(x=>x.delta>0).length,positiveShare=sampleCount?positiveCount/sampleCount:null;
  let status="PREDICTION_CROSSCHECK_PENDING";
  if(sampleCount>=5)status="PREDICTION_CROSSCHECK_OBSERVED";
  return{status,sampleCount,places,avgPredictedShare:avgPredicted,avgNeutralShare:avgNeutral,avgDelta,positiveCount,positiveShare,directionalSupport:sampleCount>=5&&avgDelta>0&&positiveShare>=.6,rows:rows.slice(-50),reason:sampleCount>=5?"予想時スナップショットとの独立方向照合を記録。自動昇格条件には使用しない":"予想ありスナップショットが5件未満のため照合待ち"};
}
export function buildResultOnlyPredictionCrosscheckLedger(storage,snapshots=[]){
  const gate=loadResultOnlyHypothesisGate(storage)||buildResultOnlyHypothesisGate(storage);
  const eligible=(gate.hypotheses||[]).filter(x=>x.status==="RESEARCH_VALIDATION_CANDIDATE_ONLY");
  const hypotheses=eligible.map(h=>{const crosscheck=predictionCrosscheckFor(h,snapshots);return{hypothesisType:h.type,riderId:h.riderId||null,name:h.name||null,key:h.key||null,sourceStatus:h.status,status:crosscheck.status,crosscheck,eligibleForManualResearchReview:crosscheck.status==="PREDICTION_CROSSCHECK_OBSERVED",eligibleForPrediction:false,eligibleForProbabilityCalibration:false,productionWriteAllowed:false,autoPromoteToProduction:false}});
  const ledger={version:"RESULT-ONLY-PREDICTION-CROSSCHECK-1.0",generatedAt:new Date().toISOString(),sourceGateVersion:gate.version,sourceValidationCandidateCount:eligible.length,hypotheses,observedCount:hypotheses.filter(x=>x.status==="PREDICTION_CROSSCHECK_OBSERVED").length,pendingCount:hypotheses.filter(x=>x.status==="PREDICTION_CROSSCHECK_PENDING").length,notApplicableCount:hypotheses.filter(x=>x.status==="PREDICTION_CROSSCHECK_NOT_APPLICABLE").length,directionalSupportCount:hypotheses.filter(x=>x.crosscheck?.directionalSupport).length,manualResearchReviewRequired:true,includeInPredictionAccuracy:false,includeInReturnRate:false,includeInProbabilityCalibration:false,productionWriteAllowed:false,autoPromoteToProduction:false,note:"結果のみ研究で通過した仮説を、保存済み予想スナップショットの事前確率方向と別台帳で照合する。照合結果だけで本番へ昇格しない"};
  storage.setItem(CROSS_KEY,JSON.stringify(ledger));return ledger;
}
export function loadResultOnlyPredictionCrosscheckLedger(storage){try{const v=JSON.parse(storage.getItem(CROSS_KEY)||"null");return v&&typeof v==="object"?v:null}catch{return null}}

export function buildResultOnlyObjectiveAggregate(storage){
  const all=loadResultOnlyResearch(storage),records=all.filter(x=>x.includeInObjectiveResearch),riders=riderStats(records);
  const aggregate={version:"RESULT-ONLY-OBJECTIVE-AGGREGATE-1.0",generatedAt:new Date().toISOString(),sourceRecordCount:all.length,objectiveRaceCount:records.length,objectiveNodeCount:records.reduce((n,r)=>n+(r.objectiveNodes?.length||0),0),byWinningMethod:countBy(records,r=>r.officialEvidence?.winningMethod||null),byVenue:countBy(records,r=>r.venueName||r.venueCode),byFinishPattern:countBy(records,r=>(r.officialFinishOrder||[]).slice(0,3).join("-")),startMarkerRaceCount:records.filter(r=>Number.isFinite(Number(r.officialEvidence?.markers?.startNumber))).length,backMarkerRaceCount:records.filter(r=>Number.isFinite(Number(r.officialEvidence?.markers?.backNumber))).length,riders,researchCandidates:researchCandidates(records,riders),includeInPredictionAccuracy:false,includeInReturnRate:false,includeInProbabilityCalibration:false,researchOnly:true,autoPromoteToProduction:false,productionWriteAllowed:false,note:"予想なし公式結果の客観統計。相関候補は仮説発見専用で因果学習・本番反映には使わない"};
  storage.setItem(AGG_KEY,JSON.stringify(aggregate));return aggregate;
}
export function loadResultOnlyObjectiveAggregate(storage){try{const v=JSON.parse(storage.getItem(AGG_KEY)||"null");return v&&typeof v==="object"?v:null}catch{return null}}
export function saveResultOnlyResearch(storage,race,official,checkedAt=new Date().toISOString()){
  const status=String(official?.status||"").toLowerCase();
  if(status==="not_finished")return null;
  const order=(official?.finishOrder||official?.order||[]).map(Number).filter(Number.isFinite).slice(0,3);
  const exceptional=["cancelled","refund"].includes(status);
  if(!exceptional&&order.length<3)return null;
  const evidence=evidenceOf(official,race),record={version:"RESULT-ONLY-RESEARCH-1.0",recordId:`RESULT-ONLY:${resultOnlyRaceKey(race)}`,raceKey:resultOnlyRaceKey(race),date:normDate(race?.date),venueCode:String(race?.venueCode||""),venueName:race?.venueName||race?.venue||"",raceNo:Number(race?.raceNo),checkedAt,resultStatus:exceptional?status:"confirmed",officialFinishOrder:order,officialPayout:Number(official?.payout)||null,officialEvidence:evidence,objectiveNodes:exceptional?[]:objectiveNodes(order,evidence),deferredNodes:deferred,learningMode:"RESULT_ONLY_OBJECTIVE",predictionAvailable:false,includeInPredictionAccuracy:false,includeInReturnRate:false,includeInProbabilityCalibration:false,includeInObjectiveResearch:!exceptional,autoPromoteToProduction:false,productionWriteAllowed:false,note:exceptional?"中止・返還は通常の客観ノード研究から除外":"予想なし。公式結果から確定できる客観事実だけを研究保存"};
  const rows=loadResultOnlyResearch(storage),next=[record,...rows.filter(x=>x.raceKey!==record.raceKey)].slice(0,MAX);storage.setItem(KEY,JSON.stringify(next));buildResultOnlyObjectiveAggregate(storage);buildResultOnlyHypothesisGate(storage);return record;
}
export function summarizeResultOnlyResearch(storage,snapshots=[]){const rows=loadResultOnlyResearch(storage),normal=rows.filter(x=>x.includeInObjectiveResearch),nodes=normal.flatMap(x=>x.objectiveNodes||[]),aggregate=loadResultOnlyObjectiveAggregate(storage)||buildResultOnlyObjectiveAggregate(storage),gate=loadResultOnlyHypothesisGate(storage)||buildResultOnlyHypothesisGate(storage),cross=buildResultOnlyPredictionCrosscheckLedger(storage,snapshots);return{total:rows.length,objectiveRaces:normal.length,exceptionalRaces:rows.length-normal.length,objectiveNodes:nodes.length,winningMethodNodes:nodes.filter(x=>x.type==="WINNING_METHOD").length,startMarkerNodes:nodes.filter(x=>x.type==="START_MARKER").length,backMarkerNodes:nodes.filter(x=>x.type==="BACK_MARKER").length,incidentNodes:nodes.filter(x=>x.type==="INCIDENT").length,aggregateRiderCount:aggregate.riders?.length||0,researchCandidateCount:aggregate.researchCandidates?.length||0,researchValidationCandidateCount:gate.validationCandidateCount||0,researchValidationPendingCount:gate.pendingCount||0,researchValidationFailedCount:gate.failedCount||0,predictionCrosscheckObservedCount:cross.observedCount||0,predictionCrosscheckPendingCount:cross.pendingCount||0,predictionCrosscheckNotApplicableCount:cross.notApplicableCount||0,predictionDirectionalSupportCount:cross.directionalSupportCount||0,researchReviewCandidateCount:(buildResultOnlyResearchReviewPackage(storage,snapshots).manualReviewCandidateCount||0),researchReviewPendingCount:(loadResultOnlyResearchReviewPackage(storage)?.pendingCount||0),researchTrialCandidateCount:(loadResultOnlyResearchReviewDecision(storage)?.decision==="RESEARCH_TRIAL_CANDIDATE_ONLY"?1:0),researchReviewDecisionStatus:loadResultOnlyResearchReviewDecision(storage)?.status||null,postResearchTrialReviewStatus:loadPostResultOnlyResearchTrialReviewPackage(storage)?.status||null,postResearchTrialDecisionStatus:loadPostResultOnlyResearchTrialDecision(storage)?.status||null,limitedResearchApplicationCandidateCount:loadPostResultOnlyResearchTrialDecision(storage)?.decision==="LIMITED_RESEARCH_APPLICATION_CANDIDATE_ONLY"?1:0,limitedResearchApplicationPlanStatus:loadResultOnlyLimitedResearchApplicationPlan(storage)?.status||null,limitedResearchApplicationPlanReadyCount:loadResultOnlyLimitedResearchApplicationPlan(storage)?.decision==="MANUAL_LIMITED_RESEARCH_APPLICATION_ACTIVATION_REVIEW_ONLY"?1:0,limitedResearchApplicationActivationReviewStatus:loadResultOnlyLimitedResearchApplicationActivationReview(storage)?.status||null,limitedResearchApplicationStartAuthorizedCount:loadResultOnlyLimitedResearchApplicationActivationReview(storage)?.decision==="AUTHORIZED_LIMITED_RESEARCH_APPLICATION_START_ONLY"?1:0,limitedResearchApplicationRunStatus:loadResultOnlyLimitedResearchApplicationRun(storage)?.status||null,limitedResearchApplicationRunActiveCount:loadResultOnlyLimitedResearchApplicationRun(storage)?.limitedResearchApplicationActive===true?1:0,limitedResearchApplicationMonitorStatus:loadResultOnlyLimitedResearchApplicationMonitor(storage)?.status||null,limitedResearchApplicationMonitorObservedRaces:Number(loadResultOnlyLimitedResearchApplicationMonitor(storage)?.observedRaces||0),limitedResearchApplicationRollbackCount:(loadResultOnlyLimitedResearchApplicationMonitor(storage)?.triggeredRollbackConditions||[]).length,limitedResearchApplicationPostReviewRequiredCount:loadResultOnlyLimitedResearchApplicationMonitor(storage)?.decision==="POST_LIMITED_RESEARCH_APPLICATION_REVIEW_REQUIRED"?1:0,postLimitedResearchApplicationReviewStatus:loadPostResultOnlyLimitedResearchApplicationReviewPackage(storage)?.status||null,postLimitedResearchApplicationReviewReadyCount:loadPostResultOnlyLimitedResearchApplicationReviewPackage(storage)?.decision==="MANUAL_POST_LIMITED_RESEARCH_APPLICATION_DECISION_ONLY"?1:0,postLimitedResearchApplicationDecisionStatus:loadPostResultOnlyLimitedResearchApplicationDecision(storage)?.status||null,independentResearchEvaluationCandidateCount:loadPostResultOnlyLimitedResearchApplicationDecision(storage)?.decision==="INDEPENDENT_RESEARCH_EVALUATION_CANDIDATE_ONLY"?1:0,independentResearchEvaluationPlanStatus:loadResultOnlyIndependentResearchEvaluationPlan(storage)?.status||null,independentResearchEvaluationPlanReadyCount:loadResultOnlyIndependentResearchEvaluationPlan(storage)?.decision==="MANUAL_INDEPENDENT_RESEARCH_EVALUATION_ACTIVATION_REVIEW_ONLY"?1:0,independentResearchEvaluationActivationReviewStatus:loadResultOnlyIndependentResearchEvaluationActivationReview(storage)?.status||null,independentResearchEvaluationStartAuthorizedCount:loadResultOnlyIndependentResearchEvaluationActivationReview(storage)?.decision==="AUTHORIZED_INDEPENDENT_RESEARCH_EVALUATION_START_ONLY"?1:0,independentResearchEvaluationRunStatus:loadResultOnlyIndependentResearchEvaluationRun(storage)?.status||null,independentResearchEvaluationRunActiveCount:loadResultOnlyIndependentResearchEvaluationRun(storage)?.independentEvaluationActive===true?1:0,independentResearchEvaluationMonitorStatus:loadResultOnlyIndependentResearchEvaluationMonitor(storage)?.status||null,independentResearchEvaluationMonitorObservedRaces:Number(loadResultOnlyIndependentResearchEvaluationMonitor(storage)?.observedFutureRaces||0),independentResearchEvaluationFailureCount:(loadResultOnlyIndependentResearchEvaluationMonitor(storage)?.triggeredFailureConditions||[]).length,independentResearchEvaluationReviewRequiredCount:loadResultOnlyIndependentResearchEvaluationMonitor(storage)?.decision==="POST_INDEPENDENT_RESEARCH_EVALUATION_REVIEW_REQUIRED"?1:0,postIndependentResearchEvaluationReviewStatus:loadPostResultOnlyIndependentResearchEvaluationReviewPackage(storage)?.status||null,postIndependentResearchEvaluationReviewReadyCount:loadPostResultOnlyIndependentResearchEvaluationReviewPackage(storage)?.decision==="MANUAL_POST_INDEPENDENT_RESEARCH_EVALUATION_DECISION_ONLY"?1:0,topWinningMethods:(aggregate.byWinningMethod||[]).slice(0,5),predictionAccuracyIncluded:0,returnRateIncluded:0,probabilityCalibrationIncluded:0,productionWriteAllowed:false}}

const REVIEW_KEY="chari-neko:keirin-result-only-research-review-package:v1";
const stableReviewValue=value=>{
  if(Array.isArray(value))return value.map(stableReviewValue);
  if(value&&typeof value==="object")return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stableReviewValue(value[k])]));
  return value;
};
const simpleReviewSealHash=text=>{let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)}return(h>>>0).toString(16).padStart(8,"0")};
const reviewHypothesisId=h=>[h?.hypothesisType||h?.type||"UNKNOWN",h?.riderId||h?.key||"GLOBAL"].join(":");
function reviewEntryPayload(entry){return stableReviewValue({
  hypothesisId:entry?.hypothesisId||null,hypothesisType:entry?.hypothesisType||null,riderId:entry?.riderId||null,key:entry?.key||null,
  sourceGateStatus:entry?.sourceGateStatus||null,sourceCrosscheckStatus:entry?.sourceCrosscheckStatus||null,status:entry?.status||null,
  supportingEvidence:entry?.supportingEvidence||[],counterEvidence:entry?.counterEvidence||[],unresolvedIssues:entry?.unresolvedIssues||[],
  safeguards:{researchOnly:true,eligibleForPrediction:false,eligibleForProbabilityCalibration:false,productionWriteAllowed:false,autoPromoteToProduction:false}
})}
function reviewPackagePayload(pkg){return stableReviewValue({
  version:pkg?.version||null,sourceGateVersion:pkg?.sourceGateVersion||null,sourceCrosscheckVersion:pkg?.sourceCrosscheckVersion||null,
  entries:(pkg?.entries||[]).map(e=>({hypothesisId:e.hypothesisId,entrySeal:e.entrySeal,status:e.status})).sort((a,b)=>String(a.hypothesisId).localeCompare(String(b.hypothesisId))),
  manualReviewCandidateCount:Number(pkg?.manualReviewCandidateCount)||0,pendingCount:Number(pkg?.pendingCount)||0,
  safeguards:{researchOnly:true,productionWriteAllowed:false,autoPromoteToProduction:false}
})}
function buildResearchReviewEntry(h,cross){
  const rows=Array.isArray(cross?.crosscheck?.rows)?cross.crosscheck.rows:[];
  const adverseRows=rows.filter(x=>Number(x?.delta)<=0).slice(-20);
  const supporting=[];
  if(cross?.crosscheck?.directionalSupport)supporting.push({type:"PRE_RESULT_DIRECTIONAL_SUPPORT",sampleCount:Number(cross.crosscheck.sampleCount)||0,avgDelta:Number(cross.crosscheck.avgDelta),positiveShare:Number(cross.crosscheck.positiveShare)});
  if(h?.validation?.temporallyReplicated)supporting.push({type:"TEMPORAL_REPLICATION",early:h.validation.early,late:h.validation.late});
  if(h?.validation?.contextEvidenceSufficient)supporting.push({type:"MULTI_VENUE_CONTEXT_EVIDENCE",venueCount:Number(h.validation.contextVenueCount)||0});
  const counterEvidence=adverseRows.map(x=>({type:"NON_SUPPORTING_PRE_RESULT_PREDICTION",predictionSnapshotId:x.predictionSnapshotId||null,date:x.date||null,venueCode:x.venueCode||null,raceNo:x.raceNo??null,delta:Number(x.delta)}));
  const unresolvedIssues=[];
  if(!cross?.crosscheck?.directionalSupport)unresolvedIssues.push({type:"DIRECTIONAL_SUPPORT_NOT_ESTABLISHED",reason:"保存済み予想の平均方向支持が基準未達"});
  if(counterEvidence.length===0)unresolvedIssues.push({type:"COUNTEREVIDENCE_NOT_OBSERVED",reason:"反対方向または中立の事前予想行がなく、反証探索の深さを確認できない"});
  if(Number(cross?.crosscheck?.sampleCount)<5)unresolvedIssues.push({type:"PREDICTION_CROSSCHECK_SAMPLE_SHORTAGE",actual:Number(cross?.crosscheck?.sampleCount)||0,required:5});
  const ready=cross?.status==="PREDICTION_CROSSCHECK_OBSERVED"&&supporting.length>=2&&counterEvidence.length>0&&unresolvedIssues.length===0;
  const entry={hypothesisId:reviewHypothesisId(cross),hypothesisType:cross?.hypothesisType||null,riderId:cross?.riderId||null,name:cross?.name||null,key:cross?.key||null,sourceGateStatus:h?.status||null,sourceCrosscheckStatus:cross?.status||null,status:ready?"MANUAL_RESEARCH_REVIEW_CANDIDATE":"REVIEW_EVIDENCE_PENDING",supportingEvidence:supporting,counterEvidence,unresolvedIssues,eligibleForManualResearchReview:ready,eligibleForPrediction:false,eligibleForProbabilityCalibration:false,productionWriteAllowed:false,autoPromoteToProduction:false};
  const payload=reviewEntryPayload(entry),entrySeal=simpleReviewSealHash(JSON.stringify(payload));
  return{...entry,payload,entrySeal};
}
export function buildResultOnlyResearchReviewPackage(storage,snapshots=[]){
  const gate=loadResultOnlyHypothesisGate(storage)||buildResultOnlyHypothesisGate(storage);
  const cross=buildResultOnlyPredictionCrosscheckLedger(storage,snapshots);
  const byId=new Map((gate.hypotheses||[]).map(h=>[reviewHypothesisId({hypothesisType:h.type,riderId:h.riderId,key:h.key}),h]));
  const entries=(cross.hypotheses||[]).filter(x=>x.status==="PREDICTION_CROSSCHECK_OBSERVED").map(x=>buildResearchReviewEntry(byId.get(reviewHypothesisId(x))||null,x));
  const pkg={version:"RESULT-ONLY-RESEARCH-REVIEW-PACKAGE-1.0",generatedAt:new Date().toISOString(),sourceGateVersion:gate.version,sourceCrosscheckVersion:cross.version,entries,manualReviewCandidateCount:entries.filter(x=>x.status==="MANUAL_RESEARCH_REVIEW_CANDIDATE").length,pendingCount:entries.filter(x=>x.status==="REVIEW_EVIDENCE_PENDING").length,manualDecisionRequired:true,researchOnly:true,includeInPredictionAccuracy:false,includeInReturnRate:false,includeInProbabilityCalibration:false,productionWriteAllowed:false,autoPromoteToProduction:false,note:"結果のみ仮説の支持・反証・未解決点を同時固定する。反証探索が空ならレビュー候補へ上げない"};
  const payload=reviewPackagePayload(pkg),reviewSeal=simpleReviewSealHash(JSON.stringify(payload)),sealed={...pkg,payload,reviewSeal};storage.setItem(REVIEW_KEY,JSON.stringify(sealed));return sealed;
}
export function loadResultOnlyResearchReviewPackage(storage){try{const v=JSON.parse(storage.getItem(REVIEW_KEY)||"null");return v&&typeof v==="object"?v:null}catch{return null}}
export function verifyResultOnlyResearchReviewPackage(pkg){
  if(!pkg?.reviewSeal||!pkg?.payload)return{status:"MISSING_SEAL",valid:false};
  for(const entry of pkg.entries||[]){const actual=simpleReviewSealHash(JSON.stringify(reviewEntryPayload(entry)));if(actual!==entry.entrySeal)return{status:"SEAL_MISMATCH",valid:false,hypothesisId:entry.hypothesisId}}
  const actual=simpleReviewSealHash(JSON.stringify(reviewPackagePayload(pkg))),valid=actual===pkg.reviewSeal&&JSON.stringify(reviewPackagePayload(pkg))===JSON.stringify(stableReviewValue(pkg.payload));
  return{status:valid?"RESULT_ONLY_RESEARCH_REVIEW_PACKAGE_VERIFIED":"SEAL_MISMATCH",valid,expectedSeal:pkg.reviewSeal,actualSeal:actual};
}

function reviewDecisionPayload(d){return stableReviewValue({
  version:d?.version||null,sourceReviewSeal:d?.sourceReviewSeal||null,hypothesisId:d?.hypothesisId||null,reviewerId:d?.reviewerId||null,reviewedAt:d?.reviewedAt||null,verdict:d?.verdict||null,rationale:d?.rationale||null,
  acknowledgements:d?.acknowledgements||{},decision:d?.decision||null,
  safeguards:{researchOnly:true,productionWriteAllowed:false,autoPromoteToProduction:false,predictionUseAllowed:false,probabilityCalibrationAllowed:false}
})}
export function finalizeResultOnlyResearchReviewDecision(storage,reviewPkg,input={}){
  const verified=verifyResultOnlyResearchReviewPackage(reviewPkg);if(!verified.valid)return{status:"REVIEW_PACKAGE_INVALID",valid:false,reason:verified.status};
  const hypothesisId=String(input?.hypothesisId||"");const entry=(reviewPkg.entries||[]).find(x=>String(x.hypothesisId)===hypothesisId);
  if(!entry)return{status:"RESEARCH_REVIEW_HYPOTHESIS_NOT_FOUND",valid:false};
  if(entry.status!=="MANUAL_RESEARCH_REVIEW_CANDIDATE")return{status:"RESEARCH_REVIEW_EVIDENCE_NOT_READY",valid:false};
  const reviewerId=String(input?.reviewerId||"").trim();if(!reviewerId)return{status:"RESEARCH_REVIEWER_REQUIRED",valid:false};
  const reviewedAt=String(input?.reviewedAt||"").trim();if(!reviewedAt)return{status:"RESEARCH_REVIEWED_AT_REQUIRED",valid:false};
  const verdict=String(input?.verdict||"");if(!["APPROVE_RESEARCH_TRIAL","HOLD","REJECT"].includes(verdict))return{status:"RESEARCH_REVIEW_VERDICT_INVALID",valid:false};
  const ack=input?.acknowledgements||{};
  if(verdict==="APPROVE_RESEARCH_TRIAL"&&(!ack.supportingEvidenceReviewed||!ack.counterEvidenceReviewed||!ack.unresolvedIssuesReviewed))return{status:"RESEARCH_REVIEW_ACKNOWLEDGEMENTS_REQUIRED",valid:false};
  const rationale=String(input?.rationale||"").trim();if(!rationale)return{status:"RESEARCH_REVIEW_RATIONALE_REQUIRED",valid:false};
  const decision=verdict==="APPROVE_RESEARCH_TRIAL"?"RESEARCH_TRIAL_CANDIDATE_ONLY":verdict==="HOLD"?"RESEARCH_REVIEW_HELD":"RESEARCH_REVIEW_REJECTED";
  const base={version:"RESULT-ONLY-RESEARCH-REVIEW-DECISION-1.0",sourceReviewSeal:reviewPkg.reviewSeal,hypothesisId,reviewerId,reviewedAt,verdict,rationale,acknowledgements:{supportingEvidenceReviewed:!!ack.supportingEvidenceReviewed,counterEvidenceReviewed:!!ack.counterEvidenceReviewed,unresolvedIssuesReviewed:!!ack.unresolvedIssuesReviewed},status:verdict==="APPROVE_RESEARCH_TRIAL"?"RESEARCH_REVIEW_APPROVED":verdict==="HOLD"?"RESEARCH_REVIEW_HELD":"RESEARCH_REVIEW_REJECTED",decision,researchTrialPlanningAllowed:verdict==="APPROVE_RESEARCH_TRIAL",researchTrialExecutionAllowed:false,eligibleForPrediction:false,eligibleForProbabilityCalibration:false,productionWriteAllowed:false,autoPromoteToProduction:false};
  const payload=reviewDecisionPayload(base),decisionSeal=simpleReviewSealHash(JSON.stringify(payload)),sealed={...base,payload,decisionSeal};
  storage.setItem(REVIEW_DECISION_KEY,JSON.stringify(sealed));return sealed;
}
export function loadResultOnlyResearchReviewDecision(storage){try{const v=JSON.parse(storage.getItem(REVIEW_DECISION_KEY)||"null");return v&&typeof v==="object"?v:null}catch{return null}}
export function verifyResultOnlyResearchReviewDecision(decision,reviewPkg){
  if(!decision?.decisionSeal||!decision?.payload)return{status:"MISSING_SEAL",valid:false};
  const verified=verifyResultOnlyResearchReviewPackage(reviewPkg);if(!verified.valid)return{status:"REVIEW_PACKAGE_INVALID",valid:false};
  if(decision.sourceReviewSeal!==reviewPkg.reviewSeal)return{status:"SOURCE_REVIEW_SEAL_MISMATCH",valid:false};
  const actual=simpleReviewSealHash(JSON.stringify(reviewDecisionPayload(decision))),valid=actual===decision.decisionSeal&&JSON.stringify(reviewDecisionPayload(decision))===JSON.stringify(stableReviewValue(decision.payload));
  return{status:valid?"RESULT_ONLY_RESEARCH_REVIEW_DECISION_VERIFIED":"SEAL_MISMATCH",valid,expectedSeal:decision.decisionSeal,actualSeal:actual};
}


function researchTrialPlanPayload(p){return stableReviewValue({
  version:p?.version||null,sourceDecisionSeal:p?.sourceDecisionSeal||null,hypothesisId:p?.hypothesisId||null,createdBy:p?.createdBy||null,createdAt:p?.createdAt||null,
  executionMode:p?.executionMode||null,targetCohort:p?.targetCohort||null,minimumRaces:Number(p?.minimumRaces)||0,
  evaluationMetrics:Array.isArray(p?.evaluationMetrics)?[...p.evaluationMetrics].sort():[],stopConditions:Array.isArray(p?.stopConditions)?[...p.stopConditions].sort():[],
  postTrialReviewRequired:!!p?.postTrialReviewRequired,
  safeguards:{researchOnly:true,shadowOnly:true,researchTrialExecutionAllowed:false,predictionUseAllowed:false,probabilityCalibrationAllowed:false,productionWriteAllowed:false,autoPromoteToProduction:false}
})}
export function createResultOnlyResearchTrialPlan(storage,decision,reviewPkg,input={}){
  const dv=verifyResultOnlyResearchReviewDecision(decision,reviewPkg);if(!dv.valid)return{status:"RESEARCH_TRIAL_DECISION_INVALID",valid:false,reason:dv.status};
  if(decision.decision!=="RESEARCH_TRIAL_CANDIDATE_ONLY"||decision.status!=="RESEARCH_REVIEW_APPROVED"||!decision.researchTrialPlanningAllowed)return{status:"RESEARCH_TRIAL_APPROVAL_REQUIRED",valid:false};
  const hypothesisId=String(input?.hypothesisId||decision.hypothesisId||"");if(hypothesisId!==String(decision.hypothesisId||""))return{status:"RESEARCH_TRIAL_HYPOTHESIS_MISMATCH",valid:false};
  const createdBy=String(input?.createdBy||"").trim();if(!createdBy)return{status:"RESEARCH_TRIAL_PLANNER_REQUIRED",valid:false};
  const createdAt=String(input?.createdAt||"").trim();if(!createdAt)return{status:"RESEARCH_TRIAL_CREATED_AT_REQUIRED",valid:false};
  const executionMode=String(input?.executionMode||"SHADOW_ONLY");if(executionMode!=="SHADOW_ONLY")return{status:"RESEARCH_TRIAL_SHADOW_ONLY_REQUIRED",valid:false};
  const targetCohort=String(input?.targetCohort||"").trim();if(!targetCohort)return{status:"RESEARCH_TRIAL_TARGET_COHORT_REQUIRED",valid:false};
  const minimumRaces=Number(input?.minimumRaces);if(!Number.isInteger(minimumRaces)||minimumRaces<30)return{status:"RESEARCH_TRIAL_MINIMUM_RACES_REQUIRED",valid:false,minimum:30};
  const evaluationMetrics=[...new Set((input?.evaluationMetrics||[]).map(String).filter(Boolean))].sort();
  const requiredMetrics=["directionalAgreement","top3ProbabilityDelta","top2ProbabilityDelta","predictionImpactZero"];
  if(requiredMetrics.some(x=>!evaluationMetrics.includes(x)))return{status:"RESEARCH_TRIAL_METRICS_INCOMPLETE",valid:false,required:requiredMetrics};
  const stopConditions=[...new Set((input?.stopConditions||[]).map(String).filter(Boolean))].sort();
  const requiredStops=["DATA_LEAKAGE_DETECTED","PREDICTION_MUTATION_DETECTED","SOURCE_SEAL_MISMATCH","TRIAL_SCOPE_BREACH"];
  if(requiredStops.some(x=>!stopConditions.includes(x)))return{status:"RESEARCH_TRIAL_STOP_CONDITIONS_INCOMPLETE",valid:false,required:requiredStops};
  if(input?.postTrialReviewRequired!==true)return{status:"RESEARCH_TRIAL_POST_REVIEW_REQUIRED",valid:false};
  const base={version:"RESULT-ONLY-RESEARCH-TRIAL-PLAN-1.0",sourceDecisionSeal:decision.decisionSeal,hypothesisId,createdBy,createdAt,executionMode,targetCohort,minimumRaces,evaluationMetrics,stopConditions,postTrialReviewRequired:true,status:"RESEARCH_TRIAL_PLAN_READY",decision:"MANUAL_RESEARCH_TRIAL_ACTIVATION_REVIEW_ONLY",researchTrialActivationReviewAllowed:true,researchTrialExecutionAllowed:false,eligibleForPrediction:false,eligibleForProbabilityCalibration:false,productionWriteAllowed:false,autoPromoteToProduction:false};
  const payload=researchTrialPlanPayload(base),planSeal=simpleReviewSealHash(JSON.stringify(payload)),sealed={...base,payload,planSeal};storage.setItem(TRIAL_PLAN_KEY,JSON.stringify(sealed));return sealed;
}
export function loadResultOnlyResearchTrialPlan(storage){try{const v=JSON.parse(storage.getItem(TRIAL_PLAN_KEY)||"null");return v&&typeof v==="object"?v:null}catch{return null}}
export function verifyResultOnlyResearchTrialPlan(plan,decision,reviewPkg){
  if(!plan?.planSeal||!plan?.payload)return{status:"MISSING_SEAL",valid:false};
  const dv=verifyResultOnlyResearchReviewDecision(decision,reviewPkg);if(!dv.valid)return{status:"RESEARCH_TRIAL_DECISION_INVALID",valid:false};
  if(plan.sourceDecisionSeal!==decision.decisionSeal||plan.hypothesisId!==decision.hypothesisId)return{status:"SOURCE_DECISION_SEAL_MISMATCH",valid:false};
  const actual=simpleReviewSealHash(JSON.stringify(researchTrialPlanPayload(plan))),valid=actual===plan.planSeal&&JSON.stringify(researchTrialPlanPayload(plan))===JSON.stringify(stableReviewValue(plan.payload));
  return{status:valid?"RESULT_ONLY_RESEARCH_TRIAL_PLAN_VERIFIED":"SEAL_MISMATCH",valid,expectedSeal:plan.planSeal,actualSeal:actual};
}


function researchTrialActivationReviewPayload(r){return stableReviewValue({
  version:r?.version||null,sourcePlanSeal:r?.sourcePlanSeal||null,sourceDecisionSeal:r?.sourceDecisionSeal||null,hypothesisId:r?.hypothesisId||null,reviewerId:r?.reviewerId||null,reviewedAt:r?.reviewedAt||null,verdict:r?.verdict||null,rationale:r?.rationale||null,
  acknowledgements:r?.acknowledgements||{},decision:r?.decision||null,
  safeguards:{researchOnly:true,shadowOnly:true,researchTrialStartAllowed:!!r?.researchTrialStartAllowed,researchTrialExecutionAllowed:false,predictionUseAllowed:false,probabilityCalibrationAllowed:false,productionWriteAllowed:false,autoPromoteToProduction:false}
})}
export function finalizeResultOnlyResearchTrialActivationReview(storage,plan,decision,reviewPkg,input={}){
  const pv=verifyResultOnlyResearchTrialPlan(plan,decision,reviewPkg);if(!pv.valid)return{status:"RESEARCH_TRIAL_PLAN_INVALID",valid:false,reason:pv.status};
  if(plan.status!=="RESEARCH_TRIAL_PLAN_READY"||plan.decision!=="MANUAL_RESEARCH_TRIAL_ACTIVATION_REVIEW_ONLY"||!plan.researchTrialActivationReviewAllowed)return{status:"RESEARCH_TRIAL_ACTIVATION_REVIEW_NOT_ALLOWED",valid:false};
  if(plan.executionMode!=="SHADOW_ONLY")return{status:"RESEARCH_TRIAL_ACTIVATION_SHADOW_ONLY_REQUIRED",valid:false};
  if(!String(plan.targetCohort||"").trim())return{status:"RESEARCH_TRIAL_ACTIVATION_TARGET_COHORT_REQUIRED",valid:false};
  if(!Number.isInteger(Number(plan.minimumRaces))||Number(plan.minimumRaces)<30)return{status:"RESEARCH_TRIAL_ACTIVATION_MINIMUM_RACES_REQUIRED",valid:false};
  const requiredMetrics=["directionalAgreement","top3ProbabilityDelta","top2ProbabilityDelta","predictionImpactZero"];
  if(requiredMetrics.some(x=>!(plan.evaluationMetrics||[]).includes(x)))return{status:"RESEARCH_TRIAL_ACTIVATION_METRICS_INCOMPLETE",valid:false};
  const requiredStops=["DATA_LEAKAGE_DETECTED","PREDICTION_MUTATION_DETECTED","SOURCE_SEAL_MISMATCH","TRIAL_SCOPE_BREACH"];
  if(requiredStops.some(x=>!(plan.stopConditions||[]).includes(x)))return{status:"RESEARCH_TRIAL_ACTIVATION_STOP_CONDITIONS_INCOMPLETE",valid:false};
  if(plan.postTrialReviewRequired!==true)return{status:"RESEARCH_TRIAL_ACTIVATION_POST_REVIEW_REQUIRED",valid:false};
  const reviewerId=String(input?.reviewerId||"").trim();if(!reviewerId)return{status:"RESEARCH_TRIAL_ACTIVATION_REVIEWER_REQUIRED",valid:false};
  if(reviewerId===String(plan.createdBy||"")||reviewerId===String(decision.reviewerId||""))return{status:"RESEARCH_TRIAL_ACTIVATION_INDEPENDENT_REVIEWER_REQUIRED",valid:false};
  const reviewedAt=String(input?.reviewedAt||"").trim();if(!reviewedAt)return{status:"RESEARCH_TRIAL_ACTIVATION_REVIEWED_AT_REQUIRED",valid:false};
  const verdict=String(input?.verdict||"");if(!["APPROVE_TRIAL_ACTIVATION","HOLD","REJECT"].includes(verdict))return{status:"RESEARCH_TRIAL_ACTIVATION_VERDICT_INVALID",valid:false};
  const ack=input?.acknowledgements||{};
  if(verdict==="APPROVE_TRIAL_ACTIVATION"&&(!ack.shadowOnlyConfirmed||!ack.scopeLockedConfirmed||!ack.metricsReviewed||!ack.stopConditionsReviewed||!ack.postTrialReviewRequiredConfirmed))return{status:"RESEARCH_TRIAL_ACTIVATION_ACKNOWLEDGEMENTS_REQUIRED",valid:false};
  const rationale=String(input?.rationale||"").trim();if(!rationale)return{status:"RESEARCH_TRIAL_ACTIVATION_RATIONALE_REQUIRED",valid:false};
  const approved=verdict==="APPROVE_TRIAL_ACTIVATION";
  const base={version:"RESULT-ONLY-RESEARCH-TRIAL-ACTIVATION-REVIEW-1.0",sourcePlanSeal:plan.planSeal,sourceDecisionSeal:decision.decisionSeal,hypothesisId:plan.hypothesisId,reviewerId,reviewedAt,verdict,rationale,acknowledgements:{shadowOnlyConfirmed:!!ack.shadowOnlyConfirmed,scopeLockedConfirmed:!!ack.scopeLockedConfirmed,metricsReviewed:!!ack.metricsReviewed,stopConditionsReviewed:!!ack.stopConditionsReviewed,postTrialReviewRequiredConfirmed:!!ack.postTrialReviewRequiredConfirmed},status:approved?"RESEARCH_TRIAL_ACTIVATION_REVIEW_APPROVED":verdict==="HOLD"?"RESEARCH_TRIAL_ACTIVATION_REVIEW_HELD":"RESEARCH_TRIAL_ACTIVATION_REVIEW_REJECTED",decision:approved?"AUTHORIZED_RESEARCH_TRIAL_START_ONLY":verdict==="HOLD"?"RESEARCH_TRIAL_ACTIVATION_HELD":"RESEARCH_TRIAL_ACTIVATION_REJECTED",researchTrialStartAllowed:approved,researchTrialExecutionAllowed:false,eligibleForPrediction:false,eligibleForProbabilityCalibration:false,productionWriteAllowed:false,autoPromoteToProduction:false};
  const payload=researchTrialActivationReviewPayload(base),activationReviewSeal=simpleReviewSealHash(JSON.stringify(payload)),sealed={...base,payload,activationReviewSeal};storage.setItem(TRIAL_ACTIVATION_REVIEW_KEY,JSON.stringify(sealed));return sealed;
}
export function loadResultOnlyResearchTrialActivationReview(storage){try{const v=JSON.parse(storage.getItem(TRIAL_ACTIVATION_REVIEW_KEY)||"null");return v&&typeof v==="object"?v:null}catch{return null}}
export function verifyResultOnlyResearchTrialActivationReview(review,plan,decision,reviewPkg){
  if(!review?.activationReviewSeal||!review?.payload)return{status:"MISSING_SEAL",valid:false};
  const pv=verifyResultOnlyResearchTrialPlan(plan,decision,reviewPkg);if(!pv.valid)return{status:"RESEARCH_TRIAL_PLAN_INVALID",valid:false};
  if(review.sourcePlanSeal!==plan.planSeal||review.sourceDecisionSeal!==decision.decisionSeal||review.hypothesisId!==plan.hypothesisId)return{status:"SOURCE_PLAN_SEAL_MISMATCH",valid:false};
  const actual=simpleReviewSealHash(JSON.stringify(researchTrialActivationReviewPayload(review))),valid=actual===review.activationReviewSeal&&JSON.stringify(researchTrialActivationReviewPayload(review))===JSON.stringify(stableReviewValue(review.payload));
  return{status:valid?"RESULT_ONLY_RESEARCH_TRIAL_ACTIVATION_REVIEW_VERIFIED":"SEAL_MISMATCH",valid,expectedSeal:review.activationReviewSeal,actualSeal:actual};
}


function researchTrialRunPayload(r){return stableReviewValue({
  version:r?.version||null,sourceActivationReviewSeal:r?.sourceActivationReviewSeal||null,sourcePlanSeal:r?.sourcePlanSeal||null,sourceDecisionSeal:r?.sourceDecisionSeal||null,hypothesisId:r?.hypothesisId||null,
  executorId:r?.executorId||null,startedAt:r?.startedAt||null,executionMode:r?.executionMode||null,targetCohort:r?.targetCohort||null,minimumRaces:Number(r?.minimumRaces)||0,
  evaluationMetrics:Array.isArray(r?.evaluationMetrics)?[...r.evaluationMetrics].sort():[],stopConditions:Array.isArray(r?.stopConditions)?[...r.stopConditions].sort():[],postTrialReviewRequired:!!r?.postTrialReviewRequired,
  status:r?.status||null,decision:r?.decision||null,
  safeguards:{researchOnly:true,shadowOnly:true,shadowTrialExecutionAllowed:true,predictionUseAllowed:false,predictionMutationAllowed:false,probabilityCalibrationAllowed:false,productionWriteAllowed:false,autoPromoteToProduction:false}
})}
export function startResultOnlyResearchTrial(storage,activationReview,plan,decision,reviewPkg,input={}){
  const av=verifyResultOnlyResearchTrialActivationReview(activationReview,plan,decision,reviewPkg);if(!av.valid)return{status:"RESEARCH_TRIAL_ACTIVATION_REVIEW_INVALID",valid:false,reason:av.status};
  if(activationReview.status!=="RESEARCH_TRIAL_ACTIVATION_REVIEW_APPROVED"||activationReview.decision!=="AUTHORIZED_RESEARCH_TRIAL_START_ONLY"||!activationReview.researchTrialStartAllowed)return{status:"RESEARCH_TRIAL_START_APPROVAL_REQUIRED",valid:false};
  if(plan.executionMode!=="SHADOW_ONLY")return{status:"RESEARCH_TRIAL_START_SHADOW_ONLY_REQUIRED",valid:false};
  const targetCohort=String(input?.targetCohort||plan.targetCohort||"").trim();if(targetCohort!==String(plan.targetCohort||""))return{status:"RESEARCH_TRIAL_START_COHORT_MISMATCH",valid:false};
  const minimumRaces=Number(input?.minimumRaces??plan.minimumRaces);if(minimumRaces!==Number(plan.minimumRaces)||!Number.isInteger(minimumRaces)||minimumRaces<30)return{status:"RESEARCH_TRIAL_START_MINIMUM_RACES_MISMATCH",valid:false};
  const evaluationMetrics=[...new Set((input?.evaluationMetrics||plan.evaluationMetrics||[]).map(String).filter(Boolean))].sort();
  if(JSON.stringify(evaluationMetrics)!==JSON.stringify([...(plan.evaluationMetrics||[])].sort()))return{status:"RESEARCH_TRIAL_START_METRICS_MISMATCH",valid:false};
  const stopConditions=[...new Set((input?.stopConditions||plan.stopConditions||[]).map(String).filter(Boolean))].sort();
  if(JSON.stringify(stopConditions)!==JSON.stringify([...(plan.stopConditions||[])].sort()))return{status:"RESEARCH_TRIAL_START_STOP_CONDITIONS_MISMATCH",valid:false};
  const postTrialReviewRequired=input?.postTrialReviewRequired??plan.postTrialReviewRequired;if(postTrialReviewRequired!==true||plan.postTrialReviewRequired!==true)return{status:"RESEARCH_TRIAL_START_POST_REVIEW_REQUIRED",valid:false};
  const executorId=String(input?.executorId||"").trim();if(!executorId)return{status:"RESEARCH_TRIAL_EXECUTOR_REQUIRED",valid:false};
  const startedAt=String(input?.startedAt||"").trim();if(!startedAt)return{status:"RESEARCH_TRIAL_STARTED_AT_REQUIRED",valid:false};
  const base={version:"RESULT-ONLY-RESEARCH-TRIAL-RUN-1.0",sourceActivationReviewSeal:activationReview.activationReviewSeal,sourcePlanSeal:plan.planSeal,sourceDecisionSeal:decision.decisionSeal,hypothesisId:plan.hypothesisId,executorId,startedAt,executionMode:"SHADOW_ONLY",targetCohort,minimumRaces,evaluationMetrics,stopConditions,postTrialReviewRequired:true,status:"RESEARCH_TRIAL_SHADOW_MONITORING_ACTIVE",decision:"MONITOR_RESEARCH_TRIAL_ONLY",shadowTrialExecutionAllowed:true,researchTrialExecutionAllowed:true,eligibleForPrediction:false,predictionMutationAllowed:false,eligibleForProbabilityCalibration:false,productionWriteAllowed:false,autoPromoteToProduction:false};
  const payload=researchTrialRunPayload(base),runSeal=simpleReviewSealHash(JSON.stringify(payload)),sealed={...base,payload,runSeal,runId:`RESULT-ONLY-RESEARCH-TRIAL-RUN-${runSeal}`};storage.setItem(TRIAL_RUN_KEY,JSON.stringify(sealed));return sealed;
}
export function loadResultOnlyResearchTrialRun(storage){try{const v=JSON.parse(storage.getItem(TRIAL_RUN_KEY)||"null");return v&&typeof v==="object"?v:null}catch{return null}}
export function verifyResultOnlyResearchTrialRun(run,activationReview,plan,decision,reviewPkg){
  if(!run?.runSeal||!run?.payload)return{status:"MISSING_SEAL",valid:false};
  const av=verifyResultOnlyResearchTrialActivationReview(activationReview,plan,decision,reviewPkg);if(!av.valid)return{status:"RESEARCH_TRIAL_ACTIVATION_REVIEW_INVALID",valid:false};
  if(run.sourceActivationReviewSeal!==activationReview.activationReviewSeal||run.sourcePlanSeal!==plan.planSeal||run.sourceDecisionSeal!==decision.decisionSeal||run.hypothesisId!==plan.hypothesisId)return{status:"SOURCE_ACTIVATION_REVIEW_SEAL_MISMATCH",valid:false};
  const actual=simpleReviewSealHash(JSON.stringify(researchTrialRunPayload(run))),valid=actual===run.runSeal&&JSON.stringify(researchTrialRunPayload(run))===JSON.stringify(stableReviewValue(run.payload));
  return{status:valid?"RESULT_ONLY_RESEARCH_TRIAL_RUN_VERIFIED":"SEAL_MISMATCH",valid,expectedSeal:run.runSeal,actualSeal:actual};
}

function researchTrialMonitorPayload(m){return stableReviewValue({
  version:m?.version||null,sourceRunSeal:m?.sourceRunSeal||null,sourceActivationReviewSeal:m?.sourceActivationReviewSeal||null,sourcePlanSeal:m?.sourcePlanSeal||null,hypothesisId:m?.hypothesisId||null,
  monitoredAt:m?.monitoredAt||null,targetCohort:m?.targetCohort||null,evaluatedRaces:Number(m?.evaluatedRaces)||0,minimumRaces:Number(m?.minimumRaces)||0,
  evaluationMetrics:m?.evaluationMetrics||{},stopConditions:Array.isArray(m?.stopConditions)?[...m.stopConditions].sort():[],triggeredStopConditions:Array.isArray(m?.triggeredStopConditions)?[...m.triggeredStopConditions].sort():[],
  status:m?.status||null,decision:m?.decision||null,postTrialReviewRequired:!!m?.postTrialReviewRequired,
  safeguards:{researchOnly:true,shadowOnly:true,predictionUseAllowed:false,predictionMutationAllowed:false,probabilityCalibrationAllowed:false,productionWriteAllowed:false,autoPromoteToProduction:false}
})}
export function monitorResultOnlyResearchTrial(storage,run,activationReview,plan,decision,reviewPkg,input={}){
  const rv=verifyResultOnlyResearchTrialRun(run,activationReview,plan,decision,reviewPkg);if(!rv.valid)return{status:"RESEARCH_TRIAL_RUN_INVALID",valid:false,reason:rv.status};
  if(run.status!=="RESEARCH_TRIAL_SHADOW_MONITORING_ACTIVE"||run.decision!=="MONITOR_RESEARCH_TRIAL_ONLY")return{status:"RESEARCH_TRIAL_MONITOR_NOT_ACTIVE",valid:false};
  const targetCohort=String(input?.targetCohort||run.targetCohort||"").trim();if(targetCohort!==String(run.targetCohort||""))return{status:"RESEARCH_TRIAL_MONITOR_COHORT_MISMATCH",valid:false};
  const evaluatedRaces=Number(input?.evaluatedRaces);if(!Number.isInteger(evaluatedRaces)||evaluatedRaces<0)return{status:"RESEARCH_TRIAL_MONITOR_RACE_COUNT_INVALID",valid:false};
  const minimumRaces=Number(run.minimumRaces);if(!Number.isInteger(minimumRaces)||minimumRaces<30)return{status:"RESEARCH_TRIAL_MONITOR_MINIMUM_RACES_INVALID",valid:false};
  const requiredMetrics=[...(run.evaluationMetrics||[])].sort();const values=input?.evaluationMetrics||{};
  if(requiredMetrics.some(k=>!Object.prototype.hasOwnProperty.call(values,k)))return{status:"RESEARCH_TRIAL_MONITOR_METRICS_INCOMPLETE",valid:false};
  const evaluationMetrics={};for(const k of requiredMetrics){const n=Number(values[k]);if(!Number.isFinite(n))return{status:"RESEARCH_TRIAL_MONITOR_METRIC_INVALID",valid:false,metric:k};evaluationMetrics[k]=n}
  const stopConditions=[...(run.stopConditions||[])].sort();let triggered=[...new Set((input?.triggeredStopConditions||[]).map(String).filter(Boolean))].sort();
  if(triggered.some(x=>!stopConditions.includes(x)))return{status:"RESEARCH_TRIAL_MONITOR_UNKNOWN_STOP_CONDITION",valid:false};
  if(evaluationMetrics.predictionImpactZero!==1&&!triggered.includes("PREDICTION_MUTATION_DETECTED"))triggered=[...triggered,"PREDICTION_MUTATION_DETECTED"].sort();
  const monitoredAt=String(input?.monitoredAt||"").trim();if(!monitoredAt)return{status:"RESEARCH_TRIAL_MONITORED_AT_REQUIRED",valid:false};
  const breached=triggered.length>0,minimumReached=evaluatedRaces>=minimumRaces;
  const status=breached?"RESEARCH_TRIAL_STOP_REQUIRED":minimumReached?"RESEARCH_TRIAL_MINIMUM_SAMPLE_REACHED_NO_BREACH":"RESEARCH_TRIAL_MONITORING_CONTINUES";
  const nextDecision=breached?"STOP_RESEARCH_TRIAL":minimumReached?"RETAIN_FOR_POST_RESEARCH_TRIAL_REVIEW_ONLY":"CONTINUE_RESEARCH_TRIAL_MONITORING";
  const base={version:"RESULT-ONLY-RESEARCH-TRIAL-MONITOR-1.0",sourceRunSeal:run.runSeal,sourceActivationReviewSeal:activationReview.activationReviewSeal,sourcePlanSeal:plan.planSeal,hypothesisId:run.hypothesisId,monitoredAt,targetCohort,evaluatedRaces,minimumRaces,evaluationMetrics,stopConditions,triggeredStopConditions:triggered,status,decision:nextDecision,postTrialReviewRequired:true,researchTrialMonitoringActive:!breached&&!minimumReached,researchTrialStopped:breached,postTrialReviewAllowed:minimumReached&&!breached,eligibleForPrediction:false,predictionMutationAllowed:false,eligibleForProbabilityCalibration:false,productionWriteAllowed:false,autoPromoteToProduction:false};
  const payload=researchTrialMonitorPayload(base),monitorSeal=simpleReviewSealHash(JSON.stringify(payload)),sealed={...base,payload,monitorSeal,monitorId:`RESULT-ONLY-RESEARCH-TRIAL-MONITOR-${monitorSeal}`};storage.setItem(TRIAL_MONITOR_KEY,JSON.stringify(sealed));return sealed;
}
export function loadResultOnlyResearchTrialMonitor(storage){try{const v=JSON.parse(storage.getItem(TRIAL_MONITOR_KEY)||"null");return v&&typeof v==="object"?v:null}catch{return null}}
export function verifyResultOnlyResearchTrialMonitor(monitor,run,activationReview,plan,decision,reviewPkg){
  if(!monitor?.monitorSeal||!monitor?.payload)return{status:"MISSING_SEAL",valid:false};
  const rv=verifyResultOnlyResearchTrialRun(run,activationReview,plan,decision,reviewPkg);if(!rv.valid)return{status:"RESEARCH_TRIAL_RUN_INVALID",valid:false};
  if(monitor.sourceRunSeal!==run.runSeal||monitor.sourceActivationReviewSeal!==activationReview.activationReviewSeal||monitor.sourcePlanSeal!==plan.planSeal||monitor.hypothesisId!==run.hypothesisId)return{status:"SOURCE_RUN_SEAL_MISMATCH",valid:false};
  const actual=simpleReviewSealHash(JSON.stringify(researchTrialMonitorPayload(monitor))),valid=actual===monitor.monitorSeal&&JSON.stringify(researchTrialMonitorPayload(monitor))===JSON.stringify(stableReviewValue(monitor.payload));
  return{status:valid?"RESULT_ONLY_RESEARCH_TRIAL_MONITOR_VERIFIED":"SEAL_MISMATCH",valid,expectedSeal:monitor.monitorSeal,actualSeal:actual};
}


function postResearchTrialReviewPayload(r){return stableReviewValue({
  version:r?.version||null,sourceMonitorSeal:r?.sourceMonitorSeal||null,sourceRunSeal:r?.sourceRunSeal||null,sourcePlanSeal:r?.sourcePlanSeal||null,sourceReviewSeal:r?.sourceReviewSeal||null,hypothesisId:r?.hypothesisId||null,
  generatedAt:r?.generatedAt||null,targetCohort:r?.targetCohort||null,evaluatedRaces:Number(r?.evaluatedRaces)||0,minimumRaces:Number(r?.minimumRaces)||0,evaluationMetrics:r?.evaluationMetrics||{},
  supportingEvidence:r?.supportingEvidence||[],counterEvidence:r?.counterEvidence||[],unresolvedIssues:r?.unresolvedIssues||[],stopConditionNonTriggerEvidence:r?.stopConditionNonTriggerEvidence||[],
  status:r?.status||null,decision:r?.decision||null,
  safeguards:{researchOnly:true,shadowOnly:true,predictionUseAllowed:false,predictionMutationAllowed:false,probabilityCalibrationAllowed:false,productionWriteAllowed:false,autoPromoteToProduction:false,manualDecisionRequired:true}
})}
export function buildPostResultOnlyResearchTrialReviewPackage(storage,monitor,run,activationReview,plan,decision,reviewPkg,input={}){
  const mv=verifyResultOnlyResearchTrialMonitor(monitor,run,activationReview,plan,decision,reviewPkg);if(!mv.valid)return{status:"POST_TRIAL_MONITOR_INVALID",valid:false,reason:mv.status};
  if(monitor.status!=="RESEARCH_TRIAL_MINIMUM_SAMPLE_REACHED_NO_BREACH"||monitor.decision!=="RETAIN_FOR_POST_RESEARCH_TRIAL_REVIEW_ONLY"||monitor.postTrialReviewAllowed!==true)return{status:"POST_TRIAL_REVIEW_NOT_ALLOWED",valid:false};
  if((monitor.triggeredStopConditions||[]).length)return{status:"POST_TRIAL_REVIEW_STOP_BREACH_PRESENT",valid:false};
  const generatedAt=String(input?.generatedAt||"").trim();if(!generatedAt)return{status:"POST_TRIAL_REVIEW_GENERATED_AT_REQUIRED",valid:false};
  const entry=(reviewPkg.entries||[]).find(x=>String(x.hypothesisId)===String(monitor.hypothesisId));if(!entry)return{status:"POST_TRIAL_SOURCE_REVIEW_ENTRY_NOT_FOUND",valid:false};
  const requiredMetrics=[...(run.evaluationMetrics||[])].sort();const metrics=monitor.evaluationMetrics||{};
  if(requiredMetrics.some(k=>!Object.prototype.hasOwnProperty.call(metrics,k)))return{status:"POST_TRIAL_REVIEW_METRICS_INCOMPLETE",valid:false};
  const requiredStops=[...(run.stopConditions||[])].sort();
  const stopConditionNonTriggerEvidence=requiredStops.map(type=>({type,triggered:false,sourceMonitorSeal:monitor.monitorSeal}));
  const supportingEvidence=[
    {type:"SHADOW_MINIMUM_SAMPLE_REACHED",evaluatedRaces:Number(monitor.evaluatedRaces),minimumRaces:Number(monitor.minimumRaces)},
    {type:"SHADOW_EVALUATION_METRICS",metrics:stableReviewValue(metrics)},
    {type:"ZERO_PREDICTION_IMPACT_CONFIRMED",value:Number(metrics.predictionImpactZero)}
  ];
  const counterEvidence=(entry.counterEvidence||[]).map(x=>stableReviewValue(x));
  const unresolvedIssues=[];
  if(counterEvidence.length===0)unresolvedIssues.push({type:"COUNTEREVIDENCE_NOT_AVAILABLE",reason:"元研究レビューの反証証拠が空"});
  if(Number(metrics.directionalAgreement)<0.5)unresolvedIssues.push({type:"LOW_DIRECTIONAL_AGREEMENT",value:Number(metrics.directionalAgreement)});
  if(Number(metrics.top3ProbabilityDelta)<=0)unresolvedIssues.push({type:"TOP3_DELTA_NON_POSITIVE",value:Number(metrics.top3ProbabilityDelta)});
  if(Number(metrics.top2ProbabilityDelta)<=0)unresolvedIssues.push({type:"TOP2_DELTA_NON_POSITIVE",value:Number(metrics.top2ProbabilityDelta)});
  if(Number(metrics.predictionImpactZero)!==1)unresolvedIssues.push({type:"PREDICTION_IMPACT_NOT_ZERO",value:Number(metrics.predictionImpactZero)});
  const ready=counterEvidence.length>0&&unresolvedIssues.length===0&&stopConditionNonTriggerEvidence.length===requiredStops.length;
  const base={version:"RESULT-ONLY-POST-RESEARCH-TRIAL-REVIEW-1.0",sourceMonitorSeal:monitor.monitorSeal,sourceRunSeal:run.runSeal,sourcePlanSeal:plan.planSeal,sourceReviewSeal:reviewPkg.reviewSeal,hypothesisId:monitor.hypothesisId,generatedAt,targetCohort:monitor.targetCohort,evaluatedRaces:monitor.evaluatedRaces,minimumRaces:monitor.minimumRaces,evaluationMetrics:stableReviewValue(metrics),supportingEvidence,counterEvidence,unresolvedIssues,stopConditionNonTriggerEvidence,status:ready?"POST_RESEARCH_TRIAL_REVIEW_PACKAGE_READY":"POST_RESEARCH_TRIAL_REVIEW_EVIDENCE_PENDING",decision:ready?"MANUAL_POST_RESEARCH_TRIAL_DECISION_ONLY":"HOLD_FOR_MORE_RESEARCH_EVIDENCE",manualDecisionRequired:ready,eligibleForPrediction:false,predictionMutationAllowed:false,eligibleForProbabilityCalibration:false,productionWriteAllowed:false,autoPromoteToProduction:false};
  const payload=postResearchTrialReviewPayload(base),postTrialReviewSeal=simpleReviewSealHash(JSON.stringify(payload)),sealed={...base,payload,postTrialReviewSeal};storage.setItem(POST_TRIAL_REVIEW_KEY,JSON.stringify(sealed));return sealed;
}
export function loadPostResultOnlyResearchTrialReviewPackage(storage){try{const v=JSON.parse(storage.getItem(POST_TRIAL_REVIEW_KEY)||"null");return v&&typeof v==="object"?v:null}catch{return null}}
export function verifyPostResultOnlyResearchTrialReviewPackage(pkg,monitor,run,activationReview,plan,decision,reviewPkg){
  if(!pkg?.postTrialReviewSeal||!pkg?.payload)return{status:"MISSING_SEAL",valid:false};
  const mv=verifyResultOnlyResearchTrialMonitor(monitor,run,activationReview,plan,decision,reviewPkg);if(!mv.valid)return{status:"POST_TRIAL_MONITOR_INVALID",valid:false};
  if(pkg.sourceMonitorSeal!==monitor.monitorSeal||pkg.sourceRunSeal!==run.runSeal||pkg.sourcePlanSeal!==plan.planSeal||pkg.sourceReviewSeal!==reviewPkg.reviewSeal||pkg.hypothesisId!==monitor.hypothesisId)return{status:"SOURCE_MONITOR_SEAL_MISMATCH",valid:false};
  const actual=simpleReviewSealHash(JSON.stringify(postResearchTrialReviewPayload(pkg))),valid=actual===pkg.postTrialReviewSeal&&JSON.stringify(postResearchTrialReviewPayload(pkg))===JSON.stringify(stableReviewValue(pkg.payload));
  return{status:valid?"RESULT_ONLY_POST_RESEARCH_TRIAL_REVIEW_VERIFIED":"SEAL_MISMATCH",valid,expectedSeal:pkg.postTrialReviewSeal,actualSeal:actual};
}


function postResearchTrialDecisionPayload(r){return stableReviewValue({
  version:r?.version||null,sourcePostTrialReviewSeal:r?.sourcePostTrialReviewSeal||null,sourceMonitorSeal:r?.sourceMonitorSeal||null,hypothesisId:r?.hypothesisId||null,
  reviewerId:r?.reviewerId||null,reviewedAt:r?.reviewedAt||null,verdict:r?.verdict||null,rationale:r?.rationale||null,acknowledgements:r?.acknowledgements||{},status:r?.status||null,decision:r?.decision||null,
  safeguards:{researchOnly:true,limitedResearchApplicationPlanningAllowed:!!r?.limitedResearchApplicationPlanningAllowed,limitedResearchApplicationExecutionAllowed:false,predictionUseAllowed:false,predictionMutationAllowed:false,probabilityCalibrationAllowed:false,productionWriteAllowed:false,autoPromoteToProduction:false}
})}
export function finalizePostResultOnlyResearchTrialDecision(storage,postTrialReview,monitor,run,activationReview,plan,decision,reviewPkg,input={}){
  const rv=verifyPostResultOnlyResearchTrialReviewPackage(postTrialReview,monitor,run,activationReview,plan,decision,reviewPkg);if(!rv.valid)return{status:"POST_TRIAL_REVIEW_INVALID",valid:false,reason:rv.status};
  if(postTrialReview.status!=="POST_RESEARCH_TRIAL_REVIEW_PACKAGE_READY"||postTrialReview.decision!=="MANUAL_POST_RESEARCH_TRIAL_DECISION_ONLY"||postTrialReview.manualDecisionRequired!==true)return{status:"POST_TRIAL_MANUAL_DECISION_NOT_ALLOWED",valid:false};
  if((postTrialReview.counterEvidence||[]).length===0)return{status:"POST_TRIAL_COUNTEREVIDENCE_REQUIRED",valid:false};
  if((postTrialReview.unresolvedIssues||[]).length!==0)return{status:"POST_TRIAL_UNRESOLVED_ISSUES_PRESENT",valid:false};
  const requiredStops=[...(run.stopConditions||[])].sort(),nonTriggers=postTrialReview.stopConditionNonTriggerEvidence||[];
  if(requiredStops.some(type=>!nonTriggers.some(x=>x?.type===type&&x?.triggered===false)))return{status:"POST_TRIAL_STOP_NON_TRIGGER_EVIDENCE_INCOMPLETE",valid:false};
  if(Number(postTrialReview.evaluationMetrics?.predictionImpactZero)!==1)return{status:"POST_TRIAL_ZERO_IMPACT_REQUIRED",valid:false};
  const reviewerId=String(input?.reviewerId||"").trim();if(!reviewerId)return{status:"POST_TRIAL_DECISION_REVIEWER_REQUIRED",valid:false};
  const excluded=new Set([run?.executorId,activationReview?.reviewerId,plan?.createdBy,decision?.reviewerId].map(x=>String(x||"")).filter(Boolean));
  if(excluded.has(reviewerId))return{status:"POST_TRIAL_DECISION_INDEPENDENT_REVIEWER_REQUIRED",valid:false};
  const reviewedAt=String(input?.reviewedAt||"").trim();if(!reviewedAt)return{status:"POST_TRIAL_DECISION_REVIEWED_AT_REQUIRED",valid:false};
  const verdict=String(input?.verdict||"");if(!["APPROVE_LIMITED_RESEARCH_APPLICATION","HOLD","REJECT"].includes(verdict))return{status:"POST_TRIAL_DECISION_VERDICT_INVALID",valid:false};
  const rationale=String(input?.rationale||"").trim();if(!rationale)return{status:"POST_TRIAL_DECISION_RATIONALE_REQUIRED",valid:false};
  const ack=input?.acknowledgements||{};
  if(verdict==="APPROVE_LIMITED_RESEARCH_APPLICATION"&&(!ack.supportingEvidenceReviewed||!ack.counterEvidenceReviewed||!ack.stopEvidenceReviewed||!ack.zeroPredictionImpactConfirmed||!ack.researchOnlyConfirmed))return{status:"POST_TRIAL_DECISION_ACKNOWLEDGEMENTS_REQUIRED",valid:false};
  const approved=verdict==="APPROVE_LIMITED_RESEARCH_APPLICATION";
  const base={version:"RESULT-ONLY-POST-RESEARCH-TRIAL-DECISION-1.0",sourcePostTrialReviewSeal:postTrialReview.postTrialReviewSeal,sourceMonitorSeal:monitor.monitorSeal,hypothesisId:postTrialReview.hypothesisId,reviewerId,reviewedAt,verdict,rationale,acknowledgements:{supportingEvidenceReviewed:!!ack.supportingEvidenceReviewed,counterEvidenceReviewed:!!ack.counterEvidenceReviewed,stopEvidenceReviewed:!!ack.stopEvidenceReviewed,zeroPredictionImpactConfirmed:!!ack.zeroPredictionImpactConfirmed,researchOnlyConfirmed:!!ack.researchOnlyConfirmed},status:approved?"POST_RESEARCH_TRIAL_DECISION_APPROVED":verdict==="HOLD"?"POST_RESEARCH_TRIAL_DECISION_HELD":"POST_RESEARCH_TRIAL_DECISION_REJECTED",decision:approved?"LIMITED_RESEARCH_APPLICATION_CANDIDATE_ONLY":verdict==="HOLD"?"HOLD_FOR_MORE_RESEARCH_EVIDENCE":"RESEARCH_HYPOTHESIS_REJECTED",limitedResearchApplicationPlanningAllowed:approved,limitedResearchApplicationExecutionAllowed:false,eligibleForPrediction:false,predictionMutationAllowed:false,eligibleForProbabilityCalibration:false,productionWriteAllowed:false,autoPromoteToProduction:false};
  const payload=postResearchTrialDecisionPayload(base),postTrialDecisionSeal=simpleReviewSealHash(JSON.stringify(payload)),sealed={...base,payload,postTrialDecisionSeal};storage.setItem(POST_TRIAL_DECISION_KEY,JSON.stringify(sealed));return sealed;
}
export function loadPostResultOnlyResearchTrialDecision(storage){try{const v=JSON.parse(storage.getItem(POST_TRIAL_DECISION_KEY)||"null");return v&&typeof v==="object"?v:null}catch{return null}}
export function verifyPostResultOnlyResearchTrialDecision(record,postTrialReview,monitor,run,activationReview,plan,decision,reviewPkg){
  if(!record?.postTrialDecisionSeal||!record?.payload)return{status:"MISSING_SEAL",valid:false};
  const rv=verifyPostResultOnlyResearchTrialReviewPackage(postTrialReview,monitor,run,activationReview,plan,decision,reviewPkg);if(!rv.valid)return{status:"POST_TRIAL_REVIEW_INVALID",valid:false};
  if(record.sourcePostTrialReviewSeal!==postTrialReview.postTrialReviewSeal||record.sourceMonitorSeal!==monitor.monitorSeal||record.hypothesisId!==postTrialReview.hypothesisId)return{status:"SOURCE_POST_TRIAL_REVIEW_SEAL_MISMATCH",valid:false};
  const actual=simpleReviewSealHash(JSON.stringify(postResearchTrialDecisionPayload(record))),valid=actual===record.postTrialDecisionSeal&&JSON.stringify(postResearchTrialDecisionPayload(record))===JSON.stringify(stableReviewValue(record.payload));
  return{status:valid?"RESULT_ONLY_POST_RESEARCH_TRIAL_DECISION_VERIFIED":"SEAL_MISMATCH",valid,expectedSeal:record.postTrialDecisionSeal,actualSeal:actual};
}


function limitedResearchApplicationPlanPayload(p){return stableReviewValue({
  version:p?.version||null,sourcePostTrialDecisionSeal:p?.sourcePostTrialDecisionSeal||null,sourcePostTrialReviewSeal:p?.sourcePostTrialReviewSeal||null,hypothesisId:p?.hypothesisId||null,
  createdBy:p?.createdBy||null,createdAt:p?.createdAt||null,applicationMode:p?.applicationMode||null,targetCohort:p?.targetCohort||null,maximumAffectedRaces:Number(p?.maximumAffectedRaces)||0,maxResearchScoreAdjustment:Number(p?.maxResearchScoreAdjustment)||0,
  monitoringMetrics:Array.isArray(p?.monitoringMetrics)?[...p.monitoringMetrics].sort():[],rollbackConditions:Array.isArray(p?.rollbackConditions)?[...p.rollbackConditions].sort():[],status:p?.status||null,decision:p?.decision||null,
  safeguards:{researchOnly:true,sandboxOnly:true,applicationExecutionAllowed:false,predictionUseAllowed:false,userFacingPredictionMutationAllowed:false,probabilityCalibrationAllowed:false,productionWriteAllowed:false,autoPromoteToProduction:false,manualActivationReviewRequired:true}
})}
export function buildResultOnlyLimitedResearchApplicationPlan(storage,postTrialDecision,postTrialReview,monitor,run,activationReview,trialPlan,decision,reviewPkg,input={}){
  const dv=verifyPostResultOnlyResearchTrialDecision(postTrialDecision,postTrialReview,monitor,run,activationReview,trialPlan,decision,reviewPkg);if(!dv.valid)return{status:"LIMITED_APPLICATION_SOURCE_DECISION_INVALID",valid:false,reason:dv.status};
  if(postTrialDecision.status!=="POST_RESEARCH_TRIAL_DECISION_APPROVED"||postTrialDecision.decision!=="LIMITED_RESEARCH_APPLICATION_CANDIDATE_ONLY"||postTrialDecision.limitedResearchApplicationPlanningAllowed!==true)return{status:"LIMITED_APPLICATION_PLANNING_NOT_ALLOWED",valid:false};
  const createdBy=String(input?.createdBy||"").trim();if(!createdBy)return{status:"LIMITED_APPLICATION_PLAN_CREATOR_REQUIRED",valid:false};
  const createdAt=String(input?.createdAt||"").trim();if(!createdAt)return{status:"LIMITED_APPLICATION_PLAN_CREATED_AT_REQUIRED",valid:false};
  const applicationMode=String(input?.applicationMode||"");if(applicationMode!=="RESEARCH_SANDBOX_ONLY")return{status:"LIMITED_APPLICATION_MODE_INVALID",valid:false};
  const targetCohort=String(input?.targetCohort||postTrialReview?.targetCohort||"").trim();if(!targetCohort||targetCohort!==String(postTrialReview?.targetCohort||""))return{status:"LIMITED_APPLICATION_COHORT_MISMATCH",valid:false};
  const maximumAffectedRaces=Number(input?.maximumAffectedRaces);if(!Number.isInteger(maximumAffectedRaces)||maximumAffectedRaces<10||maximumAffectedRaces>30)return{status:"LIMITED_APPLICATION_RACE_CAP_INVALID",valid:false};
  const maxResearchScoreAdjustment=Number(input?.maxResearchScoreAdjustment);if(!Number.isFinite(maxResearchScoreAdjustment)||maxResearchScoreAdjustment<=0||maxResearchScoreAdjustment>0.02)return{status:"LIMITED_APPLICATION_SCORE_ADJUSTMENT_INVALID",valid:false};
  const requiredMetrics=["directionalAgreement","top2ProbabilityDelta","top3ProbabilityDelta","predictionImpactZero","researchSandboxEffect"].sort();
  const monitoringMetrics=[...new Set((input?.monitoringMetrics||[]).map(String))].sort();if(requiredMetrics.some(x=>!monitoringMetrics.includes(x)))return{status:"LIMITED_APPLICATION_MONITORING_METRICS_INCOMPLETE",valid:false};
  const requiredRollbacks=["APPLICATION_SCOPE_BREACH","DIRECTIONAL_REGRESSION","PREDICTION_MUTATION_DETECTED","PRODUCTION_WRITE_ATTEMPTED","SOURCE_SEAL_MISMATCH"].sort();
  const rollbackConditions=[...new Set((input?.rollbackConditions||[]).map(String))].sort();if(requiredRollbacks.some(x=>!rollbackConditions.includes(x)))return{status:"LIMITED_APPLICATION_ROLLBACK_CONDITIONS_INCOMPLETE",valid:false};
  const base={version:"RESULT-ONLY-LIMITED-RESEARCH-APPLICATION-PLAN-1.0",sourcePostTrialDecisionSeal:postTrialDecision.postTrialDecisionSeal,sourcePostTrialReviewSeal:postTrialReview.postTrialReviewSeal,hypothesisId:postTrialDecision.hypothesisId,createdBy,createdAt,applicationMode,targetCohort,maximumAffectedRaces,maxResearchScoreAdjustment,monitoringMetrics,rollbackConditions,status:"LIMITED_RESEARCH_APPLICATION_PLAN_READY",decision:"MANUAL_LIMITED_RESEARCH_APPLICATION_ACTIVATION_REVIEW_ONLY",limitedResearchApplicationExecutionAllowed:false,eligibleForPrediction:false,userFacingPredictionMutationAllowed:false,eligibleForProbabilityCalibration:false,productionWriteAllowed:false,autoPromoteToProduction:false,manualActivationReviewRequired:true};
  const payload=limitedResearchApplicationPlanPayload(base),applicationPlanSeal=simpleReviewSealHash(JSON.stringify(payload)),sealed={...base,payload,applicationPlanSeal,applicationPlanId:`RESULT-ONLY-LIMITED-APPLICATION-PLAN-${applicationPlanSeal}`};storage.setItem(LIMITED_APPLICATION_PLAN_KEY,JSON.stringify(sealed));return sealed;
}
export function loadResultOnlyLimitedResearchApplicationPlan(storage){try{const v=JSON.parse(storage.getItem(LIMITED_APPLICATION_PLAN_KEY)||"null");return v&&typeof v==="object"?v:null}catch{return null}}
export function verifyResultOnlyLimitedResearchApplicationPlan(plan,postTrialDecision,postTrialReview,monitor,run,activationReview,trialPlan,decision,reviewPkg){
  if(!plan?.applicationPlanSeal||!plan?.payload)return{status:"MISSING_SEAL",valid:false};
  const dv=verifyPostResultOnlyResearchTrialDecision(postTrialDecision,postTrialReview,monitor,run,activationReview,trialPlan,decision,reviewPkg);if(!dv.valid)return{status:"LIMITED_APPLICATION_SOURCE_DECISION_INVALID",valid:false};
  if(plan.sourcePostTrialDecisionSeal!==postTrialDecision.postTrialDecisionSeal||plan.sourcePostTrialReviewSeal!==postTrialReview.postTrialReviewSeal||plan.hypothesisId!==postTrialDecision.hypothesisId)return{status:"SOURCE_POST_TRIAL_DECISION_SEAL_MISMATCH",valid:false};
  const actual=simpleReviewSealHash(JSON.stringify(limitedResearchApplicationPlanPayload(plan))),valid=actual===plan.applicationPlanSeal&&JSON.stringify(limitedResearchApplicationPlanPayload(plan))===JSON.stringify(stableReviewValue(plan.payload));
  return{status:valid?"RESULT_ONLY_LIMITED_RESEARCH_APPLICATION_PLAN_VERIFIED":"SEAL_MISMATCH",valid,expectedSeal:plan.applicationPlanSeal,actualSeal:actual};
}


function limitedResearchApplicationActivationReviewPayload(r){return stableReviewValue({
  version:r?.version||null,sourceApplicationPlanSeal:r?.sourceApplicationPlanSeal||null,sourcePostTrialDecisionSeal:r?.sourcePostTrialDecisionSeal||null,hypothesisId:r?.hypothesisId||null,reviewerId:r?.reviewerId||null,reviewedAt:r?.reviewedAt||null,verdict:r?.verdict||null,rationale:r?.rationale||null,acknowledgements:r?.acknowledgements||{},status:r?.status||null,decision:r?.decision||null,
  safeguards:{researchOnly:true,sandboxOnly:true,limitedResearchApplicationStartAllowed:!!r?.limitedResearchApplicationStartAllowed,limitedResearchApplicationExecutionAllowed:false,predictionUseAllowed:false,userFacingPredictionMutationAllowed:false,probabilityCalibrationAllowed:false,productionWriteAllowed:false,autoPromoteToProduction:false}
})}
export function finalizeResultOnlyLimitedResearchApplicationActivationReview(storage,plan,postTrialDecision,postTrialReview,monitor,run,activationReview,trialPlan,decision,reviewPkg,input={}){
  const pv=verifyResultOnlyLimitedResearchApplicationPlan(plan,postTrialDecision,postTrialReview,monitor,run,activationReview,trialPlan,decision,reviewPkg);if(!pv.valid)return{status:"LIMITED_APPLICATION_PLAN_INVALID",valid:false,reason:pv.status};
  if(plan.status!=="LIMITED_RESEARCH_APPLICATION_PLAN_READY"||plan.decision!=="MANUAL_LIMITED_RESEARCH_APPLICATION_ACTIVATION_REVIEW_ONLY")return{status:"LIMITED_APPLICATION_ACTIVATION_REVIEW_NOT_ALLOWED",valid:false};
  if(plan.applicationMode!=="RESEARCH_SANDBOX_ONLY")return{status:"LIMITED_APPLICATION_ACTIVATION_SANDBOX_ONLY_REQUIRED",valid:false};
  if(!String(plan.targetCohort||"").trim())return{status:"LIMITED_APPLICATION_ACTIVATION_COHORT_REQUIRED",valid:false};
  if(!Number.isInteger(Number(plan.maximumAffectedRaces))||Number(plan.maximumAffectedRaces)<10||Number(plan.maximumAffectedRaces)>30)return{status:"LIMITED_APPLICATION_ACTIVATION_RACE_CAP_INVALID",valid:false};
  if(!Number.isFinite(Number(plan.maxResearchScoreAdjustment))||Number(plan.maxResearchScoreAdjustment)<=0||Number(plan.maxResearchScoreAdjustment)>0.02)return{status:"LIMITED_APPLICATION_ACTIVATION_SCORE_CAP_INVALID",valid:false};
  const requiredMetrics=["directionalAgreement","top2ProbabilityDelta","top3ProbabilityDelta","predictionImpactZero","researchSandboxEffect"];if(requiredMetrics.some(x=>!(plan.monitoringMetrics||[]).includes(x)))return{status:"LIMITED_APPLICATION_ACTIVATION_METRICS_INCOMPLETE",valid:false};
  const requiredRollbacks=["APPLICATION_SCOPE_BREACH","DIRECTIONAL_REGRESSION","PREDICTION_MUTATION_DETECTED","PRODUCTION_WRITE_ATTEMPTED","SOURCE_SEAL_MISMATCH"];if(requiredRollbacks.some(x=>!(plan.rollbackConditions||[]).includes(x)))return{status:"LIMITED_APPLICATION_ACTIVATION_ROLLBACKS_INCOMPLETE",valid:false};
  const reviewerId=String(input?.reviewerId||"").trim();if(!reviewerId)return{status:"LIMITED_APPLICATION_ACTIVATION_REVIEWER_REQUIRED",valid:false};
  const excluded=new Set([plan?.createdBy,postTrialDecision?.reviewerId,run?.executorId,activationReview?.reviewerId,decision?.reviewerId].map(x=>String(x||"")).filter(Boolean));if(excluded.has(reviewerId))return{status:"LIMITED_APPLICATION_ACTIVATION_INDEPENDENT_REVIEWER_REQUIRED",valid:false};
  const reviewedAt=String(input?.reviewedAt||"").trim();if(!reviewedAt)return{status:"LIMITED_APPLICATION_ACTIVATION_REVIEWED_AT_REQUIRED",valid:false};
  const verdict=String(input?.verdict||"");if(!["APPROVE_LIMITED_APPLICATION_ACTIVATION","HOLD","REJECT"].includes(verdict))return{status:"LIMITED_APPLICATION_ACTIVATION_VERDICT_INVALID",valid:false};
  const ack=input?.acknowledgements||{};if(verdict==="APPROVE_LIMITED_APPLICATION_ACTIVATION"&&(!ack.sandboxOnlyConfirmed||!ack.scopeAndRaceCapConfirmed||!ack.scoreAdjustmentCapConfirmed||!ack.monitoringMetricsReviewed||!ack.rollbackConditionsReviewed||!ack.zeroProductionImpactConfirmed))return{status:"LIMITED_APPLICATION_ACTIVATION_ACKNOWLEDGEMENTS_REQUIRED",valid:false};
  const rationale=String(input?.rationale||"").trim();if(!rationale)return{status:"LIMITED_APPLICATION_ACTIVATION_RATIONALE_REQUIRED",valid:false};
  const approved=verdict==="APPROVE_LIMITED_APPLICATION_ACTIVATION";
  const base={version:"RESULT-ONLY-LIMITED-RESEARCH-APPLICATION-ACTIVATION-REVIEW-1.0",sourceApplicationPlanSeal:plan.applicationPlanSeal,sourcePostTrialDecisionSeal:postTrialDecision.postTrialDecisionSeal,hypothesisId:plan.hypothesisId,reviewerId,reviewedAt,verdict,rationale,acknowledgements:{sandboxOnlyConfirmed:!!ack.sandboxOnlyConfirmed,scopeAndRaceCapConfirmed:!!ack.scopeAndRaceCapConfirmed,scoreAdjustmentCapConfirmed:!!ack.scoreAdjustmentCapConfirmed,monitoringMetricsReviewed:!!ack.monitoringMetricsReviewed,rollbackConditionsReviewed:!!ack.rollbackConditionsReviewed,zeroProductionImpactConfirmed:!!ack.zeroProductionImpactConfirmed},status:approved?"LIMITED_RESEARCH_APPLICATION_ACTIVATION_REVIEW_APPROVED":verdict==="HOLD"?"LIMITED_RESEARCH_APPLICATION_ACTIVATION_REVIEW_HELD":"LIMITED_RESEARCH_APPLICATION_ACTIVATION_REVIEW_REJECTED",decision:approved?"AUTHORIZED_LIMITED_RESEARCH_APPLICATION_START_ONLY":verdict==="HOLD"?"LIMITED_RESEARCH_APPLICATION_ACTIVATION_HELD":"LIMITED_RESEARCH_APPLICATION_ACTIVATION_REJECTED",limitedResearchApplicationStartAllowed:approved,limitedResearchApplicationExecutionAllowed:false,eligibleForPrediction:false,userFacingPredictionMutationAllowed:false,eligibleForProbabilityCalibration:false,productionWriteAllowed:false,autoPromoteToProduction:false};
  const payload=limitedResearchApplicationActivationReviewPayload(base),applicationActivationReviewSeal=simpleReviewSealHash(JSON.stringify(payload)),sealed={...base,payload,applicationActivationReviewSeal};storage.setItem(LIMITED_APPLICATION_ACTIVATION_REVIEW_KEY,JSON.stringify(sealed));return sealed;
}
export function loadResultOnlyLimitedResearchApplicationActivationReview(storage){try{const v=JSON.parse(storage.getItem(LIMITED_APPLICATION_ACTIVATION_REVIEW_KEY)||"null");return v&&typeof v==="object"?v:null}catch{return null}}
export function verifyResultOnlyLimitedResearchApplicationActivationReview(review,plan,postTrialDecision,postTrialReview,monitor,run,activationReview,trialPlan,decision,reviewPkg){
  if(!review?.applicationActivationReviewSeal||!review?.payload)return{status:"MISSING_SEAL",valid:false};
  const pv=verifyResultOnlyLimitedResearchApplicationPlan(plan,postTrialDecision,postTrialReview,monitor,run,activationReview,trialPlan,decision,reviewPkg);if(!pv.valid)return{status:"LIMITED_APPLICATION_PLAN_INVALID",valid:false};
  if(review.sourceApplicationPlanSeal!==plan.applicationPlanSeal||review.sourcePostTrialDecisionSeal!==postTrialDecision.postTrialDecisionSeal||review.hypothesisId!==plan.hypothesisId)return{status:"SOURCE_LIMITED_APPLICATION_PLAN_SEAL_MISMATCH",valid:false};
  const actual=simpleReviewSealHash(JSON.stringify(limitedResearchApplicationActivationReviewPayload(review))),valid=actual===review.applicationActivationReviewSeal&&JSON.stringify(limitedResearchApplicationActivationReviewPayload(review))===JSON.stringify(stableReviewValue(review.payload));
  return{status:valid?"RESULT_ONLY_LIMITED_RESEARCH_APPLICATION_ACTIVATION_REVIEW_VERIFIED":"SEAL_MISMATCH",valid,expectedSeal:review.applicationActivationReviewSeal,actualSeal:actual};
}


function limitedResearchApplicationRunPayload(r){return stableReviewValue({
  version:r?.version||null,sourceActivationReviewSeal:r?.sourceActivationReviewSeal||null,sourceApplicationPlanSeal:r?.sourceApplicationPlanSeal||null,sourcePostTrialDecisionSeal:r?.sourcePostTrialDecisionSeal||null,hypothesisId:r?.hypothesisId||null,executorId:r?.executorId||null,startedAt:r?.startedAt||null,executionMode:r?.executionMode||null,targetCohort:r?.targetCohort||null,maximumAffectedRaces:Number(r?.maximumAffectedRaces)||0,maxResearchScoreAdjustment:Number(r?.maxResearchScoreAdjustment)||0,monitoringMetrics:Array.isArray(r?.monitoringMetrics)?[...r.monitoringMetrics].sort():[],rollbackConditions:Array.isArray(r?.rollbackConditions)?[...r.rollbackConditions].sort():[],status:r?.status||null,decision:r?.decision||null,
  safeguards:{researchOnly:true,sandboxOnly:true,limitedResearchApplicationActive:!!r?.limitedResearchApplicationActive,predictionUseAllowed:false,userFacingPredictionMutationAllowed:false,probabilityCalibrationAllowed:false,productionWriteAllowed:false,autoPromoteToProduction:false}
})}
export function startResultOnlyLimitedResearchApplication(storage,activationReview,plan,postTrialDecision,postTrialReview,monitor,run,activationReviewTrial,trialPlan,decision,reviewPkg,input={}){
  const av=verifyResultOnlyLimitedResearchApplicationActivationReview(activationReview,plan,postTrialDecision,postTrialReview,monitor,run,activationReviewTrial,trialPlan,decision,reviewPkg);if(!av.valid)return{status:"LIMITED_APPLICATION_ACTIVATION_REVIEW_INVALID",valid:false,reason:av.status};
  if(activationReview.status!=="LIMITED_RESEARCH_APPLICATION_ACTIVATION_REVIEW_APPROVED"||activationReview.decision!=="AUTHORIZED_LIMITED_RESEARCH_APPLICATION_START_ONLY"||activationReview.limitedResearchApplicationStartAllowed!==true)return{status:"LIMITED_APPLICATION_START_NOT_AUTHORIZED",valid:false};
  if(plan.applicationMode!=="RESEARCH_SANDBOX_ONLY")return{status:"LIMITED_APPLICATION_RUN_SANDBOX_ONLY_REQUIRED",valid:false};
  const executionMode=String(input?.executionMode||"RESEARCH_SANDBOX_ONLY");if(executionMode!=="RESEARCH_SANDBOX_ONLY")return{status:"LIMITED_APPLICATION_RUN_SANDBOX_ONLY_REQUIRED",valid:false};
  const targetCohort=String(input?.targetCohort||plan.targetCohort||"").trim();if(!targetCohort||targetCohort!==String(plan.targetCohort||""))return{status:"LIMITED_APPLICATION_RUN_COHORT_MISMATCH",valid:false};
  const maximumAffectedRaces=Number(input?.maximumAffectedRaces??plan.maximumAffectedRaces);if(!Number.isInteger(maximumAffectedRaces)||maximumAffectedRaces<10||maximumAffectedRaces>30||maximumAffectedRaces!==Number(plan.maximumAffectedRaces))return{status:"LIMITED_APPLICATION_RUN_RACE_CAP_MISMATCH",valid:false};
  const maxResearchScoreAdjustment=Number(input?.maxResearchScoreAdjustment??plan.maxResearchScoreAdjustment);if(!Number.isFinite(maxResearchScoreAdjustment)||maxResearchScoreAdjustment<=0||maxResearchScoreAdjustment>0.02||maxResearchScoreAdjustment!==Number(plan.maxResearchScoreAdjustment))return{status:"LIMITED_APPLICATION_RUN_SCORE_CAP_MISMATCH",valid:false};
  const monitoringMetrics=[...new Set((input?.monitoringMetrics||plan.monitoringMetrics||[]).map(String).filter(Boolean))].sort();if(JSON.stringify(monitoringMetrics)!==JSON.stringify([...(plan.monitoringMetrics||[])].sort()))return{status:"LIMITED_APPLICATION_RUN_METRICS_MISMATCH",valid:false};
  const rollbackConditions=[...new Set((input?.rollbackConditions||plan.rollbackConditions||[]).map(String).filter(Boolean))].sort();if(JSON.stringify(rollbackConditions)!==JSON.stringify([...(plan.rollbackConditions||[])].sort()))return{status:"LIMITED_APPLICATION_RUN_ROLLBACKS_MISMATCH",valid:false};
  const executorId=String(input?.executorId||"").trim();if(!executorId)return{status:"LIMITED_APPLICATION_RUN_EXECUTOR_REQUIRED",valid:false};
  const excluded=new Set([plan?.createdBy,activationReview?.reviewerId,postTrialDecision?.reviewerId,run?.executorId].map(x=>String(x||"")).filter(Boolean));if(excluded.has(executorId))return{status:"LIMITED_APPLICATION_RUN_INDEPENDENT_EXECUTOR_REQUIRED",valid:false};
  const startedAt=String(input?.startedAt||"").trim();if(!startedAt)return{status:"LIMITED_APPLICATION_RUN_STARTED_AT_REQUIRED",valid:false};
  const base={version:"RESULT-ONLY-LIMITED-RESEARCH-APPLICATION-RUN-1.0",sourceActivationReviewSeal:activationReview.applicationActivationReviewSeal,sourceApplicationPlanSeal:plan.applicationPlanSeal,sourcePostTrialDecisionSeal:postTrialDecision.postTrialDecisionSeal,hypothesisId:plan.hypothesisId,executorId,startedAt,executionMode:"RESEARCH_SANDBOX_ONLY",targetCohort,maximumAffectedRaces,maxResearchScoreAdjustment,monitoringMetrics,rollbackConditions,status:"LIMITED_RESEARCH_APPLICATION_SANDBOX_MONITORING_ACTIVE",decision:"MONITOR_LIMITED_RESEARCH_APPLICATION_ONLY",limitedResearchApplicationActive:true,limitedResearchApplicationExecutionAllowed:true,eligibleForPrediction:false,userFacingPredictionMutationAllowed:false,eligibleForProbabilityCalibration:false,productionWriteAllowed:false,autoPromoteToProduction:false};
  const payload=limitedResearchApplicationRunPayload(base),applicationRunSeal=simpleReviewSealHash(JSON.stringify(payload)),sealed={...base,payload,applicationRunSeal,applicationRunId:`RESULT-ONLY-LIMITED-RESEARCH-APPLICATION-RUN-${applicationRunSeal}`};storage.setItem(LIMITED_APPLICATION_RUN_KEY,JSON.stringify(sealed));return sealed;
}
export function loadResultOnlyLimitedResearchApplicationRun(storage){try{const v=JSON.parse(storage.getItem(LIMITED_APPLICATION_RUN_KEY)||"null");return v&&typeof v==="object"?v:null}catch{return null}}
export function verifyResultOnlyLimitedResearchApplicationRun(applicationRun,activationReview,plan,postTrialDecision,postTrialReview,monitor,run,activationReviewTrial,trialPlan,decision,reviewPkg){
  if(!applicationRun?.applicationRunSeal||!applicationRun?.payload)return{status:"MISSING_SEAL",valid:false};
  const av=verifyResultOnlyLimitedResearchApplicationActivationReview(activationReview,plan,postTrialDecision,postTrialReview,monitor,run,activationReviewTrial,trialPlan,decision,reviewPkg);if(!av.valid)return{status:"LIMITED_APPLICATION_ACTIVATION_REVIEW_INVALID",valid:false};
  if(applicationRun.sourceActivationReviewSeal!==activationReview.applicationActivationReviewSeal||applicationRun.sourceApplicationPlanSeal!==plan.applicationPlanSeal||applicationRun.sourcePostTrialDecisionSeal!==postTrialDecision.postTrialDecisionSeal||applicationRun.hypothesisId!==plan.hypothesisId)return{status:"SOURCE_LIMITED_APPLICATION_ACTIVATION_SEAL_MISMATCH",valid:false};
  const actual=simpleReviewSealHash(JSON.stringify(limitedResearchApplicationRunPayload(applicationRun))),valid=actual===applicationRun.applicationRunSeal&&JSON.stringify(limitedResearchApplicationRunPayload(applicationRun))===JSON.stringify(stableReviewValue(applicationRun.payload));
  return{status:valid?"RESULT_ONLY_LIMITED_RESEARCH_APPLICATION_RUN_VERIFIED":"SEAL_MISMATCH",valid,expectedSeal:applicationRun.applicationRunSeal,actualSeal:actual};
}


function limitedResearchApplicationMonitorPayload(r){return stableReviewValue({
  version:r?.version||null,sourceApplicationRunSeal:r?.sourceApplicationRunSeal||null,sourceActivationReviewSeal:r?.sourceActivationReviewSeal||null,sourceApplicationPlanSeal:r?.sourceApplicationPlanSeal||null,hypothesisId:r?.hypothesisId||null,observedAt:r?.observedAt||null,observedRaces:Number(r?.observedRaces||0),maximumAffectedRaces:Number(r?.maximumAffectedRaces||0),metrics:r?.metrics||{},triggeredRollbackConditions:r?.triggeredRollbackConditions||[],status:r?.status||null,decision:r?.decision||null,
  safeguards:{researchOnly:true,sandboxOnly:true,limitedResearchApplicationActive:!!r?.limitedResearchApplicationActive,predictionUseAllowed:false,userFacingPredictionMutationAllowed:false,probabilityCalibrationAllowed:false,productionWriteAllowed:false,autoPromoteToProduction:false,manualPostApplicationReviewRequired:!!r?.manualPostApplicationReviewRequired}
})}
export function monitorResultOnlyLimitedResearchApplication(storage,applicationRun,activationReview,plan,postTrialDecision,postTrialReview,monitor,run,trialActivationReview,trialPlan,decision,reviewPkg,input={}){
  const rv=verifyResultOnlyLimitedResearchApplicationRun(applicationRun,activationReview,plan,postTrialDecision,postTrialReview,monitor,run,trialActivationReview,trialPlan,decision,reviewPkg);if(!rv.valid)return{status:"LIMITED_APPLICATION_MONITOR_SOURCE_RUN_INVALID",valid:false,reason:rv.status};
  if(applicationRun.status!=="LIMITED_RESEARCH_APPLICATION_SANDBOX_MONITORING_ACTIVE"||applicationRun.executionMode!=="RESEARCH_SANDBOX_ONLY")return{status:"LIMITED_APPLICATION_MONITOR_NOT_ACTIVE",valid:false};
  const observedAt=String(input?.observedAt||"").trim();if(!observedAt)return{status:"LIMITED_APPLICATION_MONITOR_OBSERVED_AT_REQUIRED",valid:false};
  const observedRaces=Number(input?.observedRaces);if(!Number.isInteger(observedRaces)||observedRaces<0)return{status:"LIMITED_APPLICATION_MONITOR_RACE_COUNT_INVALID",valid:false};
  const maximumAffectedRaces=Number(applicationRun.maximumAffectedRaces);
  const raw=input?.metrics||{};const metrics={directionalAgreement:Number(raw.directionalAgreement),top3ProbabilityDelta:Number(raw.top3ProbabilityDelta),top2ProbabilityDelta:Number(raw.top2ProbabilityDelta),predictionImpactZero:Number(raw.predictionImpactZero),researchSandboxEffect:Number(raw.researchSandboxEffect),maxObservedResearchScoreAdjustment:Number(raw.maxObservedResearchScoreAdjustment||0),productionWriteAttempted:!!raw.productionWriteAttempted};
  if(!Number.isFinite(metrics.directionalAgreement)||metrics.directionalAgreement<0||metrics.directionalAgreement>1)return{status:"LIMITED_APPLICATION_MONITOR_DIRECTIONAL_METRIC_INVALID",valid:false};
  for(const k of ["top3ProbabilityDelta","top2ProbabilityDelta","predictionImpactZero","researchSandboxEffect","maxObservedResearchScoreAdjustment"])if(!Number.isFinite(metrics[k]))return{status:"LIMITED_APPLICATION_MONITOR_METRIC_INVALID",valid:false,metric:k};
  const triggered=[];
  if(observedRaces>maximumAffectedRaces||Math.abs(metrics.maxObservedResearchScoreAdjustment)>Number(applicationRun.maxResearchScoreAdjustment)+1e-12)triggered.push("APPLICATION_SCOPE_BREACH");
  if(observedRaces>0&&metrics.directionalAgreement<0.5)triggered.push("DIRECTIONAL_REGRESSION");
  if(metrics.predictionImpactZero!==1)triggered.push("PREDICTION_MUTATION_DETECTED");
  if(metrics.productionWriteAttempted)triggered.push("PRODUCTION_WRITE_ATTEMPTED");
  const sourceSealsMatch=applicationRun.sourceActivationReviewSeal===activationReview.applicationActivationReviewSeal&&applicationRun.sourceApplicationPlanSeal===plan.applicationPlanSeal;
  if(!sourceSealsMatch)triggered.push("SOURCE_SEAL_MISMATCH");
  const allowed=new Set(applicationRun.rollbackConditions||[]),triggeredRollbackConditions=[...new Set(triggered)].filter(x=>allowed.has(x)).sort();
  const rolledBack=triggeredRollbackConditions.length>0,complete=!rolledBack&&observedRaces>=maximumAffectedRaces;
  const status=rolledBack?"LIMITED_RESEARCH_APPLICATION_ROLLED_BACK":complete?"LIMITED_RESEARCH_APPLICATION_MONITOR_COMPLETE":"LIMITED_RESEARCH_APPLICATION_SANDBOX_MONITORING_ACTIVE";
  const nextDecision=rolledBack?"LIMITED_RESEARCH_APPLICATION_STOPPED":complete?"POST_LIMITED_RESEARCH_APPLICATION_REVIEW_REQUIRED":"CONTINUE_LIMITED_RESEARCH_APPLICATION_MONITORING";
  const base={version:"RESULT-ONLY-LIMITED-RESEARCH-APPLICATION-MONITOR-1.0",sourceApplicationRunSeal:applicationRun.applicationRunSeal,sourceActivationReviewSeal:activationReview.applicationActivationReviewSeal,sourceApplicationPlanSeal:plan.applicationPlanSeal,hypothesisId:applicationRun.hypothesisId,observedAt,observedRaces,maximumAffectedRaces,metrics,triggeredRollbackConditions,status,decision:nextDecision,limitedResearchApplicationActive:!rolledBack&&!complete,manualPostApplicationReviewRequired:complete,eligibleForPrediction:false,userFacingPredictionMutationAllowed:false,eligibleForProbabilityCalibration:false,productionWriteAllowed:false,autoPromoteToProduction:false};
  const payload=limitedResearchApplicationMonitorPayload(base),applicationMonitorSeal=simpleReviewSealHash(JSON.stringify(payload)),sealed={...base,payload,applicationMonitorSeal};storage.setItem(LIMITED_APPLICATION_MONITOR_KEY,JSON.stringify(sealed));return sealed;
}
export function loadResultOnlyLimitedResearchApplicationMonitor(storage){try{const v=JSON.parse(storage.getItem(LIMITED_APPLICATION_MONITOR_KEY)||"null");return v&&typeof v==="object"?v:null}catch{return null}}
export function verifyResultOnlyLimitedResearchApplicationMonitor(applicationMonitor,applicationRun,activationReview,plan,postTrialDecision,postTrialReview,monitor,run,trialActivationReview,trialPlan,decision,reviewPkg){
  if(!applicationMonitor?.applicationMonitorSeal||!applicationMonitor?.payload)return{status:"MISSING_SEAL",valid:false};
  const rv=verifyResultOnlyLimitedResearchApplicationRun(applicationRun,activationReview,plan,postTrialDecision,postTrialReview,monitor,run,trialActivationReview,trialPlan,decision,reviewPkg);if(!rv.valid)return{status:"LIMITED_APPLICATION_MONITOR_SOURCE_RUN_INVALID",valid:false};
  if(applicationMonitor.sourceApplicationRunSeal!==applicationRun.applicationRunSeal||applicationMonitor.sourceActivationReviewSeal!==activationReview.applicationActivationReviewSeal||applicationMonitor.sourceApplicationPlanSeal!==plan.applicationPlanSeal||applicationMonitor.hypothesisId!==applicationRun.hypothesisId)return{status:"SOURCE_LIMITED_APPLICATION_RUN_SEAL_MISMATCH",valid:false};
  const actual=simpleReviewSealHash(JSON.stringify(limitedResearchApplicationMonitorPayload(applicationMonitor))),valid=actual===applicationMonitor.applicationMonitorSeal&&JSON.stringify(limitedResearchApplicationMonitorPayload(applicationMonitor))===JSON.stringify(stableReviewValue(applicationMonitor.payload));
  return{status:valid?"RESULT_ONLY_LIMITED_RESEARCH_APPLICATION_MONITOR_VERIFIED":"SEAL_MISMATCH",valid,expectedSeal:applicationMonitor.applicationMonitorSeal,actualSeal:actual};
}

function postLimitedResearchApplicationReviewPayload(r){return stableReviewValue({
  version:r?.version||null,sourceApplicationMonitorSeal:r?.sourceApplicationMonitorSeal||null,sourceApplicationRunSeal:r?.sourceApplicationRunSeal||null,sourceApplicationPlanSeal:r?.sourceApplicationPlanSeal||null,sourcePostTrialDecisionSeal:r?.sourcePostTrialDecisionSeal||null,sourcePostTrialReviewSeal:r?.sourcePostTrialReviewSeal||null,hypothesisId:r?.hypothesisId||null,
  generatedAt:r?.generatedAt||null,targetCohort:r?.targetCohort||null,observedRaces:Number(r?.observedRaces||0),maximumAffectedRaces:Number(r?.maximumAffectedRaces||0),metrics:r?.metrics||{},supportingEvidence:r?.supportingEvidence||[],counterEvidence:r?.counterEvidence||[],unresolvedIssues:r?.unresolvedIssues||[],rollbackConditionNonTriggerEvidence:r?.rollbackConditionNonTriggerEvidence||[],status:r?.status||null,decision:r?.decision||null,
  safeguards:{researchOnly:true,sandboxOnly:true,predictionUseAllowed:false,userFacingPredictionMutationAllowed:false,probabilityCalibrationAllowed:false,productionWriteAllowed:false,autoPromoteToProduction:false,manualDecisionRequired:true}
})}
export function buildPostResultOnlyLimitedResearchApplicationReviewPackage(storage,applicationMonitor,applicationRun,activationReview,applicationPlan,postTrialDecision,postTrialReview,trialMonitor,trialRun,trialActivationReview,trialPlan,decision,reviewPkg,input={}){
  const mv=verifyResultOnlyLimitedResearchApplicationMonitor(applicationMonitor,applicationRun,activationReview,applicationPlan,postTrialDecision,postTrialReview,trialMonitor,trialRun,trialActivationReview,trialPlan,decision,reviewPkg);if(!mv.valid)return{status:"POST_LIMITED_APPLICATION_MONITOR_INVALID",valid:false,reason:mv.status};
  if(applicationMonitor.status!=="LIMITED_RESEARCH_APPLICATION_MONITOR_COMPLETE"||applicationMonitor.decision!=="POST_LIMITED_RESEARCH_APPLICATION_REVIEW_REQUIRED"||applicationMonitor.manualPostApplicationReviewRequired!==true)return{status:"POST_LIMITED_APPLICATION_REVIEW_NOT_ALLOWED",valid:false};
  if((applicationMonitor.triggeredRollbackConditions||[]).length)return{status:"POST_LIMITED_APPLICATION_REVIEW_ROLLBACK_PRESENT",valid:false};
  const generatedAt=String(input?.generatedAt||"").trim();if(!generatedAt)return{status:"POST_LIMITED_APPLICATION_REVIEW_GENERATED_AT_REQUIRED",valid:false};
  const metrics=stableReviewValue(applicationMonitor.metrics||{}),requiredRollbacks=[...(applicationRun.rollbackConditions||[])].sort();
  const rollbackConditionNonTriggerEvidence=requiredRollbacks.map(type=>({type,triggered:false,sourceApplicationMonitorSeal:applicationMonitor.applicationMonitorSeal}));
  const supportingEvidence=[
    {type:"LIMITED_APPLICATION_RACE_CAP_REACHED",observedRaces:Number(applicationMonitor.observedRaces),maximumAffectedRaces:Number(applicationMonitor.maximumAffectedRaces)},
    {type:"RESEARCH_SANDBOX_EFFECT_OBSERVED",value:Number(metrics.researchSandboxEffect)},
    {type:"LIMITED_APPLICATION_EVALUATION_METRICS",metrics},
    {type:"ZERO_USER_FACING_PREDICTION_IMPACT_CONFIRMED",value:Number(metrics.predictionImpactZero)},
    {type:"RESEARCH_SCORE_ADJUSTMENT_CAP_RESPECTED",observed:Number(metrics.maxObservedResearchScoreAdjustment||0),cap:Number(applicationRun.maxResearchScoreAdjustment)}
  ];
  const counterEvidence=(postTrialReview?.counterEvidence||[]).map(x=>stableReviewValue(x));
  const unresolvedIssues=[];
  if(counterEvidence.length===0)unresolvedIssues.push({type:"COUNTEREVIDENCE_NOT_AVAILABLE",reason:"試験前から保持していた反証証拠が空"});
  if(Number(applicationMonitor.observedRaces)<Number(applicationMonitor.maximumAffectedRaces))unresolvedIssues.push({type:"APPLICATION_SAMPLE_CAP_NOT_REACHED",observedRaces:Number(applicationMonitor.observedRaces),maximumAffectedRaces:Number(applicationMonitor.maximumAffectedRaces)});
  if(Number(metrics.directionalAgreement)<0.5)unresolvedIssues.push({type:"LOW_DIRECTIONAL_AGREEMENT",value:Number(metrics.directionalAgreement)});
  if(Number(metrics.top3ProbabilityDelta)<=0)unresolvedIssues.push({type:"TOP3_DELTA_NON_POSITIVE",value:Number(metrics.top3ProbabilityDelta)});
  if(Number(metrics.top2ProbabilityDelta)<=0)unresolvedIssues.push({type:"TOP2_DELTA_NON_POSITIVE",value:Number(metrics.top2ProbabilityDelta)});
  if(Number(metrics.researchSandboxEffect)<=0)unresolvedIssues.push({type:"RESEARCH_SANDBOX_EFFECT_NON_POSITIVE",value:Number(metrics.researchSandboxEffect)});
  if(Number(metrics.predictionImpactZero)!==1)unresolvedIssues.push({type:"PREDICTION_IMPACT_NOT_ZERO",value:Number(metrics.predictionImpactZero)});
  if(Math.abs(Number(metrics.maxObservedResearchScoreAdjustment||0))>Number(applicationRun.maxResearchScoreAdjustment)+1e-12)unresolvedIssues.push({type:"RESEARCH_SCORE_ADJUSTMENT_CAP_EXCEEDED",observed:Number(metrics.maxObservedResearchScoreAdjustment||0),cap:Number(applicationRun.maxResearchScoreAdjustment)});
  if(metrics.productionWriteAttempted===true)unresolvedIssues.push({type:"PRODUCTION_WRITE_ATTEMPTED"});
  const ready=counterEvidence.length>0&&unresolvedIssues.length===0&&rollbackConditionNonTriggerEvidence.length===requiredRollbacks.length;
  const base={version:"RESULT-ONLY-POST-LIMITED-RESEARCH-APPLICATION-REVIEW-1.0",sourceApplicationMonitorSeal:applicationMonitor.applicationMonitorSeal,sourceApplicationRunSeal:applicationRun.applicationRunSeal,sourceApplicationPlanSeal:applicationPlan.applicationPlanSeal,sourcePostTrialDecisionSeal:postTrialDecision.postTrialDecisionSeal,sourcePostTrialReviewSeal:postTrialReview.postTrialReviewSeal,hypothesisId:applicationMonitor.hypothesisId,generatedAt,targetCohort:applicationRun.targetCohort,observedRaces:applicationMonitor.observedRaces,maximumAffectedRaces:applicationMonitor.maximumAffectedRaces,metrics,supportingEvidence,counterEvidence,unresolvedIssues,rollbackConditionNonTriggerEvidence,status:ready?"POST_LIMITED_RESEARCH_APPLICATION_REVIEW_PACKAGE_READY":"POST_LIMITED_RESEARCH_APPLICATION_REVIEW_EVIDENCE_PENDING",decision:ready?"MANUAL_POST_LIMITED_RESEARCH_APPLICATION_DECISION_ONLY":"HOLD_FOR_MORE_RESEARCH_EVIDENCE",manualDecisionRequired:ready,eligibleForPrediction:false,userFacingPredictionMutationAllowed:false,eligibleForProbabilityCalibration:false,productionWriteAllowed:false,autoPromoteToProduction:false};
  const payload=postLimitedResearchApplicationReviewPayload(base),postLimitedApplicationReviewSeal=simpleReviewSealHash(JSON.stringify(payload)),sealed={...base,payload,postLimitedApplicationReviewSeal};storage.setItem(POST_LIMITED_APPLICATION_REVIEW_KEY,JSON.stringify(sealed));return sealed;
}
export function loadPostResultOnlyLimitedResearchApplicationReviewPackage(storage){try{const v=JSON.parse(storage.getItem(POST_LIMITED_APPLICATION_REVIEW_KEY)||"null");return v&&typeof v==="object"?v:null}catch{return null}}
export function verifyPostResultOnlyLimitedResearchApplicationReviewPackage(pkg,applicationMonitor,applicationRun,activationReview,applicationPlan,postTrialDecision,postTrialReview,trialMonitor,trialRun,trialActivationReview,trialPlan,decision,reviewPkg){
  if(!pkg?.postLimitedApplicationReviewSeal||!pkg?.payload)return{status:"MISSING_SEAL",valid:false};
  const mv=verifyResultOnlyLimitedResearchApplicationMonitor(applicationMonitor,applicationRun,activationReview,applicationPlan,postTrialDecision,postTrialReview,trialMonitor,trialRun,trialActivationReview,trialPlan,decision,reviewPkg);if(!mv.valid)return{status:"POST_LIMITED_APPLICATION_MONITOR_INVALID",valid:false};
  if(pkg.sourceApplicationMonitorSeal!==applicationMonitor.applicationMonitorSeal||pkg.sourceApplicationRunSeal!==applicationRun.applicationRunSeal||pkg.sourceApplicationPlanSeal!==applicationPlan.applicationPlanSeal||pkg.sourcePostTrialDecisionSeal!==postTrialDecision.postTrialDecisionSeal||pkg.sourcePostTrialReviewSeal!==postTrialReview.postTrialReviewSeal||pkg.hypothesisId!==applicationMonitor.hypothesisId)return{status:"SOURCE_LIMITED_APPLICATION_MONITOR_SEAL_MISMATCH",valid:false};
  const actual=simpleReviewSealHash(JSON.stringify(postLimitedResearchApplicationReviewPayload(pkg))),valid=actual===pkg.postLimitedApplicationReviewSeal&&JSON.stringify(postLimitedResearchApplicationReviewPayload(pkg))===JSON.stringify(stableReviewValue(pkg.payload));
  return{status:valid?"RESULT_ONLY_POST_LIMITED_RESEARCH_APPLICATION_REVIEW_VERIFIED":"SEAL_MISMATCH",valid,expectedSeal:pkg.postLimitedApplicationReviewSeal,actualSeal:actual};
}



function postLimitedResearchApplicationDecisionPayload(r){return stableReviewValue({
  version:r?.version||null,sourcePostLimitedApplicationReviewSeal:r?.sourcePostLimitedApplicationReviewSeal||null,sourceApplicationMonitorSeal:r?.sourceApplicationMonitorSeal||null,hypothesisId:r?.hypothesisId||null,
  reviewerId:r?.reviewerId||null,reviewedAt:r?.reviewedAt||null,verdict:r?.verdict||null,rationale:r?.rationale||null,acknowledgements:r?.acknowledgements||{},status:r?.status||null,decision:r?.decision||null,
  safeguards:{researchOnly:true,sandboxOnly:true,nextResearchEvaluationPlanningAllowed:!!r?.nextResearchEvaluationPlanningAllowed,nextResearchEvaluationExecutionAllowed:false,predictionUseAllowed:false,userFacingPredictionMutationAllowed:false,probabilityCalibrationAllowed:false,productionWriteAllowed:false,autoPromoteToProduction:false}
})}
export function finalizePostResultOnlyLimitedResearchApplicationDecision(storage,postLimitedReview,applicationMonitor,applicationRun,applicationActivationReview,applicationPlan,postTrialDecision,postTrialReview,trialMonitor,trialRun,trialActivationReview,trialPlan,initialDecision,reviewPkg,input={}){
  const rv=verifyPostResultOnlyLimitedResearchApplicationReviewPackage(postLimitedReview,applicationMonitor,applicationRun,applicationActivationReview,applicationPlan,postTrialDecision,postTrialReview,trialMonitor,trialRun,trialActivationReview,trialPlan,initialDecision,reviewPkg);if(!rv.valid)return{status:"POST_LIMITED_APPLICATION_REVIEW_INVALID",valid:false,reason:rv.status};
  if(postLimitedReview.status!=="POST_LIMITED_RESEARCH_APPLICATION_REVIEW_PACKAGE_READY"||postLimitedReview.decision!=="MANUAL_POST_LIMITED_RESEARCH_APPLICATION_DECISION_ONLY"||postLimitedReview.manualDecisionRequired!==true)return{status:"POST_LIMITED_APPLICATION_MANUAL_DECISION_NOT_ALLOWED",valid:false};
  if((postLimitedReview.counterEvidence||[]).length===0)return{status:"POST_LIMITED_APPLICATION_COUNTEREVIDENCE_REQUIRED",valid:false};
  if((postLimitedReview.unresolvedIssues||[]).length!==0)return{status:"POST_LIMITED_APPLICATION_UNRESOLVED_ISSUES_PRESENT",valid:false};
  const requiredRollbacks=[...(applicationRun.rollbackConditions||[])].sort(),nonTriggers=postLimitedReview.rollbackConditionNonTriggerEvidence||[];
  if(requiredRollbacks.some(type=>!nonTriggers.some(x=>x?.type===type&&x?.triggered===false)))return{status:"POST_LIMITED_APPLICATION_ROLLBACK_NON_TRIGGER_EVIDENCE_INCOMPLETE",valid:false};
  if(Number(postLimitedReview.metrics?.predictionImpactZero)!==1)return{status:"POST_LIMITED_APPLICATION_ZERO_PREDICTION_IMPACT_REQUIRED",valid:false};
  if(Math.abs(Number(postLimitedReview.metrics?.maxObservedResearchScoreAdjustment||0))>Number(applicationRun.maxResearchScoreAdjustment)+1e-12)return{status:"POST_LIMITED_APPLICATION_SCORE_CAP_COMPLIANCE_REQUIRED",valid:false};
  const reviewerId=String(input?.reviewerId||"").trim();if(!reviewerId)return{status:"POST_LIMITED_APPLICATION_DECISION_REVIEWER_REQUIRED",valid:false};
  const excluded=new Set([applicationRun?.executorId,applicationActivationReview?.reviewerId,applicationPlan?.createdBy,postTrialDecision?.reviewerId,trialRun?.executorId,trialActivationReview?.reviewerId,trialPlan?.createdBy,initialDecision?.reviewerId].map(x=>String(x||"")).filter(Boolean));
  if(excluded.has(reviewerId))return{status:"POST_LIMITED_APPLICATION_DECISION_INDEPENDENT_REVIEWER_REQUIRED",valid:false};
  const reviewedAt=String(input?.reviewedAt||"").trim();if(!reviewedAt)return{status:"POST_LIMITED_APPLICATION_DECISION_REVIEWED_AT_REQUIRED",valid:false};
  const verdict=String(input?.verdict||"");if(!["APPROVE_INDEPENDENT_RESEARCH_EVALUATION","HOLD","REJECT"].includes(verdict))return{status:"POST_LIMITED_APPLICATION_DECISION_VERDICT_INVALID",valid:false};
  const rationale=String(input?.rationale||"").trim();if(!rationale)return{status:"POST_LIMITED_APPLICATION_DECISION_RATIONALE_REQUIRED",valid:false};
  const ack=input?.acknowledgements||{};
  if(verdict==="APPROVE_INDEPENDENT_RESEARCH_EVALUATION"&&(!ack.supportingEvidenceReviewed||!ack.counterEvidenceReviewed||!ack.rollbackEvidenceReviewed||!ack.scoreCapComplianceConfirmed||!ack.zeroPredictionImpactConfirmed||!ack.researchOnlyConfirmed))return{status:"POST_LIMITED_APPLICATION_DECISION_ACKNOWLEDGEMENTS_REQUIRED",valid:false};
  const approved=verdict==="APPROVE_INDEPENDENT_RESEARCH_EVALUATION";
  const base={version:"RESULT-ONLY-POST-LIMITED-RESEARCH-APPLICATION-DECISION-1.0",sourcePostLimitedApplicationReviewSeal:postLimitedReview.postLimitedApplicationReviewSeal,sourceApplicationMonitorSeal:applicationMonitor.applicationMonitorSeal,hypothesisId:postLimitedReview.hypothesisId,reviewerId,reviewedAt,verdict,rationale,acknowledgements:{supportingEvidenceReviewed:!!ack.supportingEvidenceReviewed,counterEvidenceReviewed:!!ack.counterEvidenceReviewed,rollbackEvidenceReviewed:!!ack.rollbackEvidenceReviewed,scoreCapComplianceConfirmed:!!ack.scoreCapComplianceConfirmed,zeroPredictionImpactConfirmed:!!ack.zeroPredictionImpactConfirmed,researchOnlyConfirmed:!!ack.researchOnlyConfirmed},status:approved?"POST_LIMITED_RESEARCH_APPLICATION_DECISION_APPROVED":verdict==="HOLD"?"POST_LIMITED_RESEARCH_APPLICATION_DECISION_HELD":"POST_LIMITED_RESEARCH_APPLICATION_DECISION_REJECTED",decision:approved?"INDEPENDENT_RESEARCH_EVALUATION_CANDIDATE_ONLY":verdict==="HOLD"?"HOLD_FOR_MORE_RESEARCH_EVIDENCE":"RESEARCH_HYPOTHESIS_REJECTED",nextResearchEvaluationPlanningAllowed:approved,nextResearchEvaluationExecutionAllowed:false,eligibleForPrediction:false,userFacingPredictionMutationAllowed:false,eligibleForProbabilityCalibration:false,productionWriteAllowed:false,autoPromoteToProduction:false};
  const payload=postLimitedResearchApplicationDecisionPayload(base),postLimitedApplicationDecisionSeal=simpleReviewSealHash(JSON.stringify(payload)),sealed={...base,payload,postLimitedApplicationDecisionSeal};storage.setItem(POST_LIMITED_APPLICATION_DECISION_KEY,JSON.stringify(sealed));return sealed;
}
export function loadPostResultOnlyLimitedResearchApplicationDecision(storage){try{const v=JSON.parse(storage.getItem(POST_LIMITED_APPLICATION_DECISION_KEY)||"null");return v&&typeof v==="object"?v:null}catch{return null}}
export function verifyPostResultOnlyLimitedResearchApplicationDecision(record,postLimitedReview,applicationMonitor,applicationRun,applicationActivationReview,applicationPlan,postTrialDecision,postTrialReview,trialMonitor,trialRun,trialActivationReview,trialPlan,initialDecision,reviewPkg){
  if(!record?.postLimitedApplicationDecisionSeal||!record?.payload)return{status:"MISSING_SEAL",valid:false};
  const rv=verifyPostResultOnlyLimitedResearchApplicationReviewPackage(postLimitedReview,applicationMonitor,applicationRun,applicationActivationReview,applicationPlan,postTrialDecision,postTrialReview,trialMonitor,trialRun,trialActivationReview,trialPlan,initialDecision,reviewPkg);if(!rv.valid)return{status:"POST_LIMITED_APPLICATION_REVIEW_INVALID",valid:false};
  if(record.sourcePostLimitedApplicationReviewSeal!==postLimitedReview.postLimitedApplicationReviewSeal||record.sourceApplicationMonitorSeal!==applicationMonitor.applicationMonitorSeal||record.hypothesisId!==postLimitedReview.hypothesisId)return{status:"SOURCE_POST_LIMITED_APPLICATION_REVIEW_SEAL_MISMATCH",valid:false};
  const actual=simpleReviewSealHash(JSON.stringify(postLimitedResearchApplicationDecisionPayload(record))),valid=actual===record.postLimitedApplicationDecisionSeal&&JSON.stringify(postLimitedResearchApplicationDecisionPayload(record))===JSON.stringify(stableReviewValue(record.payload));
  return{status:valid?"RESULT_ONLY_POST_LIMITED_RESEARCH_APPLICATION_DECISION_VERIFIED":"SEAL_MISMATCH",valid,expectedSeal:record.postLimitedApplicationDecisionSeal,actualSeal:actual};
}


function independentResearchEvaluationPlanPayload(r){return stableReviewValue({
  version:r?.version||null,sourcePostLimitedApplicationDecisionSeal:r?.sourcePostLimitedApplicationDecisionSeal||null,sourcePostLimitedApplicationReviewSeal:r?.sourcePostLimitedApplicationReviewSeal||null,hypothesisId:r?.hypothesisId||null,
  createdBy:r?.createdBy||null,createdAt:r?.createdAt||null,evaluationMode:r?.evaluationMode||null,targetCohort:r?.targetCohort||null,minimumFutureRaces:Number(r?.minimumFutureRaces||0),maximumFutureRaces:Number(r?.maximumFutureRaces||0),
  eligibilityRules:r?.eligibilityRules||[],exclusionRules:r?.exclusionRules||[],evaluationMetrics:r?.evaluationMetrics||[],successCriteria:r?.successCriteria||{},failureCriteria:r?.failureCriteria||{},leakageGuards:r?.leakageGuards||[],sourceDataCutoff:r?.sourceDataCutoff||null,
  status:r?.status||null,decision:r?.decision||null,
  safeguards:{researchOnly:true,futureHoldoutOnly:true,priorLimitedApplicationRowsReusable:false,evaluationExecutionAllowed:false,predictionUseAllowed:false,userFacingPredictionMutationAllowed:false,probabilityCalibrationAllowed:false,productionWriteAllowed:false,autoPromoteToProduction:false}
})}
export function createResultOnlyIndependentResearchEvaluationPlan(storage,postLimitedDecision,postLimitedReview,applicationMonitor,applicationRun,applicationActivationReview,applicationPlan,postTrialDecision,postTrialReview,trialMonitor,trialRun,trialActivationReview,trialPlan,initialDecision,reviewPkg,input={}){
  const dv=verifyPostResultOnlyLimitedResearchApplicationDecision(postLimitedDecision,postLimitedReview,applicationMonitor,applicationRun,applicationActivationReview,applicationPlan,postTrialDecision,postTrialReview,trialMonitor,trialRun,trialActivationReview,trialPlan,initialDecision,reviewPkg);if(!dv.valid)return{status:"INDEPENDENT_EVALUATION_SOURCE_DECISION_INVALID",valid:false,reason:dv.status};
  if(postLimitedDecision.status!=="POST_LIMITED_RESEARCH_APPLICATION_DECISION_APPROVED"||postLimitedDecision.decision!=="INDEPENDENT_RESEARCH_EVALUATION_CANDIDATE_ONLY"||postLimitedDecision.nextResearchEvaluationPlanningAllowed!==true)return{status:"INDEPENDENT_EVALUATION_PLANNING_NOT_ALLOWED",valid:false};
  const createdBy=String(input?.createdBy||"").trim();if(!createdBy)return{status:"INDEPENDENT_EVALUATION_PLAN_CREATOR_REQUIRED",valid:false};
  const excluded=new Set([postLimitedDecision?.reviewerId,applicationRun?.executorId,applicationActivationReview?.reviewerId,applicationPlan?.createdBy,postTrialDecision?.reviewerId,trialRun?.executorId,trialActivationReview?.reviewerId,trialPlan?.createdBy,initialDecision?.reviewerId].map(x=>String(x||"")).filter(Boolean));
  if(excluded.has(createdBy))return{status:"INDEPENDENT_EVALUATION_PLAN_INDEPENDENT_CREATOR_REQUIRED",valid:false};
  const createdAt=String(input?.createdAt||"").trim();if(!createdAt)return{status:"INDEPENDENT_EVALUATION_PLAN_CREATED_AT_REQUIRED",valid:false};
  const evaluationMode=String(input?.evaluationMode||"INDEPENDENT_FUTURE_HOLDOUT_SHADOW_ONLY");if(evaluationMode!=="INDEPENDENT_FUTURE_HOLDOUT_SHADOW_ONLY")return{status:"INDEPENDENT_EVALUATION_MODE_INVALID",valid:false};
  const sourceDataCutoff=String(input?.sourceDataCutoff||"").trim();if(!sourceDataCutoff)return{status:"INDEPENDENT_EVALUATION_SOURCE_DATA_CUTOFF_REQUIRED",valid:false};
  const minimumFutureRaces=Number(input?.minimumFutureRaces??50),maximumFutureRaces=Number(input?.maximumFutureRaces??100);
  if(!Number.isInteger(minimumFutureRaces)||minimumFutureRaces<50)return{status:"INDEPENDENT_EVALUATION_MINIMUM_FUTURE_RACES_TOO_SMALL",valid:false};
  if(!Number.isInteger(maximumFutureRaces)||maximumFutureRaces<minimumFutureRaces||maximumFutureRaces>200)return{status:"INDEPENDENT_EVALUATION_MAXIMUM_FUTURE_RACES_INVALID",valid:false};
  const targetCohort=stableReviewValue(input?.targetCohort||applicationRun?.targetCohort||{});
  if(JSON.stringify(targetCohort)!==JSON.stringify(stableReviewValue(applicationRun?.targetCohort||{})))return{status:"INDEPENDENT_EVALUATION_TARGET_COHORT_MISMATCH",valid:false};
  const eligibilityRules=[...(input?.eligibilityRules||["RACE_TIME_AFTER_SOURCE_DATA_CUTOFF","TARGET_COHORT_MATCH","PRE_RESULT_SNAPSHOT_REQUIRED","OFFICIAL_RESULT_CONFIRMED"])];
  const exclusionRules=[...(input?.exclusionRules||["PRIOR_RESEARCH_TRIAL_RACE","PRIOR_LIMITED_APPLICATION_RACE","REFUND_OR_CANCELLED","POST_RESULT_GENERATED_PREDICTION"])];
  const evaluationMetrics=[...(input?.evaluationMetrics||["directionalAgreement","top3ProbabilityDelta","top2ProbabilityDelta","predictionImpactZero","holdoutReplicationRate"])];
  const leakageGuards=[...(input?.leakageGuards||["NO_PRIOR_TRIAL_ROW_REUSE","NO_PRIOR_LIMITED_APPLICATION_ROW_REUSE","NO_POST_RESULT_FEATURES","NO_THRESHOLD_EDIT_AFTER_FIRST_HOLDOUT_RACE","NO_COHORT_EDIT_AFTER_SEAL"])];
  const requiredMetrics=["directionalAgreement","top3ProbabilityDelta","top2ProbabilityDelta","predictionImpactZero","holdoutReplicationRate"];
  const requiredLeakage=["NO_PRIOR_TRIAL_ROW_REUSE","NO_PRIOR_LIMITED_APPLICATION_ROW_REUSE","NO_POST_RESULT_FEATURES","NO_THRESHOLD_EDIT_AFTER_FIRST_HOLDOUT_RACE","NO_COHORT_EDIT_AFTER_SEAL"];
  if(requiredMetrics.some(x=>!evaluationMetrics.includes(x)))return{status:"INDEPENDENT_EVALUATION_METRICS_INCOMPLETE",valid:false};
  if(requiredLeakage.some(x=>!leakageGuards.includes(x)))return{status:"INDEPENDENT_EVALUATION_LEAKAGE_GUARDS_INCOMPLETE",valid:false};
  const successCriteria=stableReviewValue(input?.successCriteria||{minimumDirectionalAgreement:0.6,minimumTop3ProbabilityDelta:0,minimumTop2ProbabilityDelta:0,minimumHoldoutReplicationRate:0.6,predictionImpactZeroRequired:1});
  const failureCriteria=stableReviewValue(input?.failureCriteria||{predictionImpactZeroBelow:1,negativeTop3ProbabilityDelta:true,negativeTop2ProbabilityDelta:true,holdoutReplicationRateBelow:0.5,dataLeakageDetected:true});
  if(Number(successCriteria?.minimumDirectionalAgreement)<0.6||Number(successCriteria?.minimumHoldoutReplicationRate)<0.6||Number(successCriteria?.predictionImpactZeroRequired)!==1)return{status:"INDEPENDENT_EVALUATION_SUCCESS_CRITERIA_TOO_WEAK",valid:false};
  if(failureCriteria?.dataLeakageDetected!==true||Number(failureCriteria?.predictionImpactZeroBelow)!==1)return{status:"INDEPENDENT_EVALUATION_FAILURE_CRITERIA_INCOMPLETE",valid:false};
  const base={version:"RESULT-ONLY-INDEPENDENT-RESEARCH-EVALUATION-PLAN-1.0",sourcePostLimitedApplicationDecisionSeal:postLimitedDecision.postLimitedApplicationDecisionSeal,sourcePostLimitedApplicationReviewSeal:postLimitedReview.postLimitedApplicationReviewSeal,hypothesisId:postLimitedDecision.hypothesisId,createdBy,createdAt,evaluationMode,targetCohort,minimumFutureRaces,maximumFutureRaces,eligibilityRules,exclusionRules,evaluationMetrics,successCriteria,failureCriteria,leakageGuards,sourceDataCutoff,status:"INDEPENDENT_RESEARCH_EVALUATION_PLAN_READY",decision:"MANUAL_INDEPENDENT_RESEARCH_EVALUATION_ACTIVATION_REVIEW_ONLY",manualActivationReviewRequired:true,evaluationExecutionAllowed:false,priorLimitedApplicationRowsReusable:false,eligibleForPrediction:false,userFacingPredictionMutationAllowed:false,eligibleForProbabilityCalibration:false,productionWriteAllowed:false,autoPromoteToProduction:false};
  const payload=independentResearchEvaluationPlanPayload(base),independentEvaluationPlanSeal=simpleReviewSealHash(JSON.stringify(payload)),sealed={...base,payload,independentEvaluationPlanSeal};storage.setItem(INDEPENDENT_RESEARCH_EVALUATION_PLAN_KEY,JSON.stringify(sealed));return sealed;
}
export function loadResultOnlyIndependentResearchEvaluationPlan(storage){try{const v=JSON.parse(storage.getItem(INDEPENDENT_RESEARCH_EVALUATION_PLAN_KEY)||"null");return v&&typeof v==="object"?v:null}catch{return null}}
export function verifyResultOnlyIndependentResearchEvaluationPlan(plan,postLimitedDecision,postLimitedReview,applicationMonitor,applicationRun,applicationActivationReview,applicationPlan,postTrialDecision,postTrialReview,trialMonitor,trialRun,trialActivationReview,trialPlan,initialDecision,reviewPkg){
  if(!plan?.independentEvaluationPlanSeal||!plan?.payload)return{status:"MISSING_SEAL",valid:false};
  const dv=verifyPostResultOnlyLimitedResearchApplicationDecision(postLimitedDecision,postLimitedReview,applicationMonitor,applicationRun,applicationActivationReview,applicationPlan,postTrialDecision,postTrialReview,trialMonitor,trialRun,trialActivationReview,trialPlan,initialDecision,reviewPkg);if(!dv.valid)return{status:"INDEPENDENT_EVALUATION_SOURCE_DECISION_INVALID",valid:false};
  if(plan.sourcePostLimitedApplicationDecisionSeal!==postLimitedDecision.postLimitedApplicationDecisionSeal||plan.sourcePostLimitedApplicationReviewSeal!==postLimitedReview.postLimitedApplicationReviewSeal||plan.hypothesisId!==postLimitedDecision.hypothesisId)return{status:"SOURCE_POST_LIMITED_APPLICATION_DECISION_SEAL_MISMATCH",valid:false};
  const actual=simpleReviewSealHash(JSON.stringify(independentResearchEvaluationPlanPayload(plan))),valid=actual===plan.independentEvaluationPlanSeal&&JSON.stringify(independentResearchEvaluationPlanPayload(plan))===JSON.stringify(stableReviewValue(plan.payload));
  return{status:valid?"RESULT_ONLY_INDEPENDENT_RESEARCH_EVALUATION_PLAN_VERIFIED":"SEAL_MISMATCH",valid,expectedSeal:plan.independentEvaluationPlanSeal,actualSeal:actual};
}


function independentResearchEvaluationActivationReviewPayload(r){return stableReviewValue({
  version:r?.version||null,sourceIndependentEvaluationPlanSeal:r?.sourceIndependentEvaluationPlanSeal||null,sourcePostLimitedApplicationDecisionSeal:r?.sourcePostLimitedApplicationDecisionSeal||null,hypothesisId:r?.hypothesisId||null,reviewerId:r?.reviewerId||null,reviewedAt:r?.reviewedAt||null,verdict:r?.verdict||null,rationale:r?.rationale||null,acknowledgements:r?.acknowledgements||{},status:r?.status||null,decision:r?.decision||null,
  safeguards:{researchOnly:true,futureHoldoutOnly:true,minimumFutureRaces:Number(r?.minimumFutureRaces||0),priorLimitedApplicationRowsReusable:false,thresholdsFrozenBeforeStart:true,cohortFrozenBeforeStart:true,dataLeakageForbidden:true,evaluationStartAllowed:!!r?.evaluationStartAllowed,evaluationExecutionAllowed:false,predictionUseAllowed:false,userFacingPredictionMutationAllowed:false,probabilityCalibrationAllowed:false,productionWriteAllowed:false,autoPromoteToProduction:false}
})}
export function finalizeResultOnlyIndependentResearchEvaluationActivationReview(storage,plan,postLimitedDecision,postLimitedReview,applicationMonitor,applicationRun,applicationActivationReview,applicationPlan,postTrialDecision,postTrialReview,trialMonitor,trialRun,trialActivationReview,trialPlan,initialDecision,reviewPkg,input={}){
  const pv=verifyResultOnlyIndependentResearchEvaluationPlan(plan,postLimitedDecision,postLimitedReview,applicationMonitor,applicationRun,applicationActivationReview,applicationPlan,postTrialDecision,postTrialReview,trialMonitor,trialRun,trialActivationReview,trialPlan,initialDecision,reviewPkg);if(!pv.valid)return{status:"INDEPENDENT_EVALUATION_ACTIVATION_PLAN_INVALID",valid:false,reason:pv.status};
  if(plan.status!=="INDEPENDENT_RESEARCH_EVALUATION_PLAN_READY"||plan.decision!=="MANUAL_INDEPENDENT_RESEARCH_EVALUATION_ACTIVATION_REVIEW_ONLY")return{status:"INDEPENDENT_EVALUATION_ACTIVATION_REVIEW_NOT_ALLOWED",valid:false};
  if(plan.evaluationMode!=="INDEPENDENT_FUTURE_HOLDOUT_SHADOW_ONLY")return{status:"INDEPENDENT_EVALUATION_ACTIVATION_FUTURE_HOLDOUT_ONLY_REQUIRED",valid:false};
  if(!Number.isInteger(Number(plan.minimumFutureRaces))||Number(plan.minimumFutureRaces)<50)return{status:"INDEPENDENT_EVALUATION_ACTIVATION_MINIMUM_RACES_INVALID",valid:false};
  if(plan.priorLimitedApplicationRowsReusable!==false)return{status:"INDEPENDENT_EVALUATION_ACTIVATION_PRIOR_ROW_REUSE_FORBIDDEN",valid:false};
  const requiredLeakage=["NO_PRIOR_TRIAL_ROW_REUSE","NO_PRIOR_LIMITED_APPLICATION_ROW_REUSE","NO_POST_RESULT_FEATURES","NO_THRESHOLD_EDIT_AFTER_FIRST_HOLDOUT_RACE","NO_COHORT_EDIT_AFTER_SEAL"];if(requiredLeakage.some(x=>!(plan.leakageGuards||[]).includes(x)))return{status:"INDEPENDENT_EVALUATION_ACTIVATION_LEAKAGE_GUARDS_INCOMPLETE",valid:false};
  const reviewerId=String(input?.reviewerId||"").trim();if(!reviewerId)return{status:"INDEPENDENT_EVALUATION_ACTIVATION_REVIEWER_REQUIRED",valid:false};
  const excluded=new Set([plan?.createdBy,postLimitedDecision?.reviewerId,applicationRun?.executorId,applicationActivationReview?.reviewerId,applicationPlan?.createdBy,postTrialDecision?.reviewerId,trialRun?.executorId,trialActivationReview?.reviewerId,trialPlan?.createdBy,initialDecision?.reviewerId].map(x=>String(x||"")).filter(Boolean));if(excluded.has(reviewerId))return{status:"INDEPENDENT_EVALUATION_ACTIVATION_INDEPENDENT_REVIEWER_REQUIRED",valid:false};
  const reviewedAt=String(input?.reviewedAt||"").trim();if(!reviewedAt)return{status:"INDEPENDENT_EVALUATION_ACTIVATION_REVIEWED_AT_REQUIRED",valid:false};
  const verdict=String(input?.verdict||"");if(!["APPROVE_INDEPENDENT_EVALUATION_ACTIVATION","HOLD","REJECT"].includes(verdict))return{status:"INDEPENDENT_EVALUATION_ACTIVATION_VERDICT_INVALID",valid:false};
  const ack=input?.acknowledgements||{};if(verdict==="APPROVE_INDEPENDENT_EVALUATION_ACTIVATION"&&(!ack.futureOnlyConfirmed||!ack.minimumSampleConfirmed||!ack.priorRowsExcludedConfirmed||!ack.thresholdsFrozenConfirmed||!ack.cohortFrozenConfirmed||!ack.leakageGuardsReviewed||!ack.zeroPredictionImpactConfirmed))return{status:"INDEPENDENT_EVALUATION_ACTIVATION_ACKNOWLEDGEMENTS_REQUIRED",valid:false};
  const rationale=String(input?.rationale||"").trim();if(!rationale)return{status:"INDEPENDENT_EVALUATION_ACTIVATION_RATIONALE_REQUIRED",valid:false};
  const approved=verdict==="APPROVE_INDEPENDENT_EVALUATION_ACTIVATION";
  const base={version:"RESULT-ONLY-INDEPENDENT-RESEARCH-EVALUATION-ACTIVATION-REVIEW-1.0",sourceIndependentEvaluationPlanSeal:plan.independentEvaluationPlanSeal,sourcePostLimitedApplicationDecisionSeal:postLimitedDecision.postLimitedApplicationDecisionSeal,hypothesisId:plan.hypothesisId,reviewerId,reviewedAt,verdict,rationale,minimumFutureRaces:Number(plan.minimumFutureRaces),acknowledgements:{futureOnlyConfirmed:!!ack.futureOnlyConfirmed,minimumSampleConfirmed:!!ack.minimumSampleConfirmed,priorRowsExcludedConfirmed:!!ack.priorRowsExcludedConfirmed,thresholdsFrozenConfirmed:!!ack.thresholdsFrozenConfirmed,cohortFrozenConfirmed:!!ack.cohortFrozenConfirmed,leakageGuardsReviewed:!!ack.leakageGuardsReviewed,zeroPredictionImpactConfirmed:!!ack.zeroPredictionImpactConfirmed},status:approved?"INDEPENDENT_RESEARCH_EVALUATION_ACTIVATION_REVIEW_APPROVED":verdict==="HOLD"?"INDEPENDENT_RESEARCH_EVALUATION_ACTIVATION_REVIEW_HELD":"INDEPENDENT_RESEARCH_EVALUATION_ACTIVATION_REVIEW_REJECTED",decision:approved?"AUTHORIZED_INDEPENDENT_RESEARCH_EVALUATION_START_ONLY":verdict==="HOLD"?"INDEPENDENT_RESEARCH_EVALUATION_ACTIVATION_HELD":"INDEPENDENT_RESEARCH_EVALUATION_ACTIVATION_REJECTED",evaluationStartAllowed:approved,evaluationExecutionAllowed:false,priorLimitedApplicationRowsReusable:false,eligibleForPrediction:false,userFacingPredictionMutationAllowed:false,eligibleForProbabilityCalibration:false,productionWriteAllowed:false,autoPromoteToProduction:false};
  const payload=independentResearchEvaluationActivationReviewPayload(base),independentEvaluationActivationReviewSeal=simpleReviewSealHash(JSON.stringify(payload)),sealed={...base,payload,independentEvaluationActivationReviewSeal};storage.setItem(INDEPENDENT_RESEARCH_EVALUATION_ACTIVATION_REVIEW_KEY,JSON.stringify(sealed));return sealed;
}
export function loadResultOnlyIndependentResearchEvaluationActivationReview(storage){try{const v=JSON.parse(storage.getItem(INDEPENDENT_RESEARCH_EVALUATION_ACTIVATION_REVIEW_KEY)||"null");return v&&typeof v==="object"?v:null}catch{return null}}
export function verifyResultOnlyIndependentResearchEvaluationActivationReview(review,plan,postLimitedDecision,postLimitedReview,applicationMonitor,applicationRun,applicationActivationReview,applicationPlan,postTrialDecision,postTrialReview,trialMonitor,trialRun,trialActivationReview,trialPlan,initialDecision,reviewPkg){
  if(!review?.independentEvaluationActivationReviewSeal||!review?.payload)return{status:"MISSING_SEAL",valid:false};
  const pv=verifyResultOnlyIndependentResearchEvaluationPlan(plan,postLimitedDecision,postLimitedReview,applicationMonitor,applicationRun,applicationActivationReview,applicationPlan,postTrialDecision,postTrialReview,trialMonitor,trialRun,trialActivationReview,trialPlan,initialDecision,reviewPkg);if(!pv.valid)return{status:"INDEPENDENT_EVALUATION_ACTIVATION_PLAN_INVALID",valid:false};
  if(review.sourceIndependentEvaluationPlanSeal!==plan.independentEvaluationPlanSeal||review.sourcePostLimitedApplicationDecisionSeal!==postLimitedDecision.postLimitedApplicationDecisionSeal||review.hypothesisId!==plan.hypothesisId)return{status:"SOURCE_INDEPENDENT_EVALUATION_PLAN_SEAL_MISMATCH",valid:false};
  const actual=simpleReviewSealHash(JSON.stringify(independentResearchEvaluationActivationReviewPayload(review))),valid=actual===review.independentEvaluationActivationReviewSeal&&JSON.stringify(independentResearchEvaluationActivationReviewPayload(review))===JSON.stringify(stableReviewValue(review.payload));
  return{status:valid?"RESULT_ONLY_INDEPENDENT_RESEARCH_EVALUATION_ACTIVATION_REVIEW_VERIFIED":"SEAL_MISMATCH",valid,expectedSeal:review.independentEvaluationActivationReviewSeal,actualSeal:actual};
}


function independentResearchEvaluationRunPayload(r){return stableReviewValue({
  version:r?.version||null,sourceActivationReviewSeal:r?.sourceActivationReviewSeal||null,sourceIndependentEvaluationPlanSeal:r?.sourceIndependentEvaluationPlanSeal||null,sourcePostLimitedApplicationDecisionSeal:r?.sourcePostLimitedApplicationDecisionSeal||null,hypothesisId:r?.hypothesisId||null,executorId:r?.executorId||null,startedAt:r?.startedAt||null,evaluationMode:r?.evaluationMode||null,targetCohort:r?.targetCohort||null,minimumFutureRaces:Number(r?.minimumFutureRaces||0),maximumFutureRaces:Number(r?.maximumFutureRaces||0),sourceDataCutoff:r?.sourceDataCutoff||null,eligibilityRules:r?.eligibilityRules||[],exclusionRules:r?.exclusionRules||[],evaluationMetrics:r?.evaluationMetrics||[],successCriteria:r?.successCriteria||{},failureCriteria:r?.failureCriteria||{},leakageGuards:r?.leakageGuards||[],status:r?.status||null,decision:r?.decision||null,
  safeguards:{researchOnly:true,futureHoldoutOnly:true,priorLimitedApplicationRowsReusable:false,independentEvaluationActive:!!r?.independentEvaluationActive,predictionUseAllowed:false,userFacingPredictionMutationAllowed:false,probabilityCalibrationAllowed:false,productionWriteAllowed:false,autoPromoteToProduction:false}
})}
export function startResultOnlyIndependentResearchEvaluation(storage,activationReview,plan,postLimitedDecision,postLimitedReview,applicationMonitor,applicationRun,applicationActivationReview,applicationPlan,postTrialDecision,postTrialReview,trialMonitor,trialRun,trialActivationReview,trialPlan,initialDecision,reviewPkg,input={}){
  const av=verifyResultOnlyIndependentResearchEvaluationActivationReview(activationReview,plan,postLimitedDecision,postLimitedReview,applicationMonitor,applicationRun,applicationActivationReview,applicationPlan,postTrialDecision,postTrialReview,trialMonitor,trialRun,trialActivationReview,trialPlan,initialDecision,reviewPkg);if(!av.valid)return{status:"INDEPENDENT_EVALUATION_RUN_ACTIVATION_REVIEW_INVALID",valid:false,reason:av.status};
  if(activationReview.status!=="INDEPENDENT_RESEARCH_EVALUATION_ACTIVATION_REVIEW_APPROVED"||activationReview.decision!=="AUTHORIZED_INDEPENDENT_RESEARCH_EVALUATION_START_ONLY"||activationReview.evaluationStartAllowed!==true)return{status:"INDEPENDENT_EVALUATION_RUN_START_NOT_AUTHORIZED",valid:false};
  if(plan.evaluationMode!=="INDEPENDENT_FUTURE_HOLDOUT_SHADOW_ONLY")return{status:"INDEPENDENT_EVALUATION_RUN_FUTURE_HOLDOUT_ONLY_REQUIRED",valid:false};
  const executorId=String(input?.executorId||"").trim();if(!executorId)return{status:"INDEPENDENT_EVALUATION_RUN_EXECUTOR_REQUIRED",valid:false};
  const excluded=new Set([activationReview?.reviewerId,plan?.createdBy,postLimitedDecision?.reviewerId,applicationRun?.executorId,applicationActivationReview?.reviewerId,applicationPlan?.createdBy,postTrialDecision?.reviewerId,trialRun?.executorId,trialActivationReview?.reviewerId,trialPlan?.createdBy,initialDecision?.reviewerId].map(x=>String(x||"")).filter(Boolean));if(excluded.has(executorId))return{status:"INDEPENDENT_EVALUATION_RUN_INDEPENDENT_EXECUTOR_REQUIRED",valid:false};
  const startedAt=String(input?.startedAt||"").trim();if(!startedAt)return{status:"INDEPENDENT_EVALUATION_RUN_STARTED_AT_REQUIRED",valid:false};
  if(Date.parse(startedAt)<=Date.parse(plan.sourceDataCutoff))return{status:"INDEPENDENT_EVALUATION_RUN_START_AFTER_SOURCE_CUTOFF_REQUIRED",valid:false};
  const evaluationMode=String(input?.evaluationMode||plan.evaluationMode);if(evaluationMode!==plan.evaluationMode)return{status:"INDEPENDENT_EVALUATION_RUN_MODE_MISMATCH",valid:false};
  const targetCohort=stableReviewValue(input?.targetCohort||plan.targetCohort||{});if(JSON.stringify(targetCohort)!==JSON.stringify(stableReviewValue(plan.targetCohort||{})))return{status:"INDEPENDENT_EVALUATION_RUN_COHORT_MISMATCH",valid:false};
  const minimumFutureRaces=Number(input?.minimumFutureRaces??plan.minimumFutureRaces),maximumFutureRaces=Number(input?.maximumFutureRaces??plan.maximumFutureRaces);if(minimumFutureRaces!==Number(plan.minimumFutureRaces)||maximumFutureRaces!==Number(plan.maximumFutureRaces))return{status:"INDEPENDENT_EVALUATION_RUN_SAMPLE_WINDOW_MISMATCH",valid:false};
  const evaluationMetrics=[...(input?.evaluationMetrics||plan.evaluationMetrics||[])],leakageGuards=[...(input?.leakageGuards||plan.leakageGuards||[])];if(JSON.stringify([...evaluationMetrics].sort())!==JSON.stringify([...(plan.evaluationMetrics||[])].sort()))return{status:"INDEPENDENT_EVALUATION_RUN_METRICS_MISMATCH",valid:false};if(JSON.stringify([...leakageGuards].sort())!==JSON.stringify([...(plan.leakageGuards||[])].sort()))return{status:"INDEPENDENT_EVALUATION_RUN_LEAKAGE_GUARDS_MISMATCH",valid:false};
  const base={version:"RESULT-ONLY-INDEPENDENT-RESEARCH-EVALUATION-RUN-1.0",sourceActivationReviewSeal:activationReview.independentEvaluationActivationReviewSeal,sourceIndependentEvaluationPlanSeal:plan.independentEvaluationPlanSeal,sourcePostLimitedApplicationDecisionSeal:postLimitedDecision.postLimitedApplicationDecisionSeal,hypothesisId:plan.hypothesisId,executorId,startedAt,evaluationMode,targetCohort,minimumFutureRaces,maximumFutureRaces,sourceDataCutoff:plan.sourceDataCutoff,eligibilityRules:[...(plan.eligibilityRules||[])],exclusionRules:[...(plan.exclusionRules||[])],evaluationMetrics,successCriteria:stableReviewValue(plan.successCriteria||{}),failureCriteria:stableReviewValue(plan.failureCriteria||{}),leakageGuards,status:"INDEPENDENT_RESEARCH_EVALUATION_FUTURE_HOLDOUT_MONITORING_ACTIVE",decision:"MONITOR_INDEPENDENT_RESEARCH_EVALUATION_ONLY",independentEvaluationActive:true,evaluationExecutionAllowed:true,priorLimitedApplicationRowsReusable:false,eligibleForPrediction:false,userFacingPredictionMutationAllowed:false,eligibleForProbabilityCalibration:false,productionWriteAllowed:false,autoPromoteToProduction:false};
  const payload=independentResearchEvaluationRunPayload(base),independentEvaluationRunSeal=simpleReviewSealHash(JSON.stringify(payload)),sealed={...base,payload,independentEvaluationRunSeal,independentEvaluationRunId:`RESULT-ONLY-INDEPENDENT-RESEARCH-EVALUATION-RUN-${independentEvaluationRunSeal}`};storage.setItem(INDEPENDENT_RESEARCH_EVALUATION_RUN_KEY,JSON.stringify(sealed));return sealed;
}
export function loadResultOnlyIndependentResearchEvaluationRun(storage){try{const v=JSON.parse(storage.getItem(INDEPENDENT_RESEARCH_EVALUATION_RUN_KEY)||"null");return v&&typeof v==="object"?v:null}catch{return null}}
export function verifyResultOnlyIndependentResearchEvaluationRun(run,activationReview,plan,postLimitedDecision,postLimitedReview,applicationMonitor,applicationRun,applicationActivationReview,applicationPlan,postTrialDecision,postTrialReview,trialMonitor,trialRun,trialActivationReview,trialPlan,initialDecision,reviewPkg){
  if(!run?.independentEvaluationRunSeal||!run?.payload)return{status:"MISSING_SEAL",valid:false};
  const av=verifyResultOnlyIndependentResearchEvaluationActivationReview(activationReview,plan,postLimitedDecision,postLimitedReview,applicationMonitor,applicationRun,applicationActivationReview,applicationPlan,postTrialDecision,postTrialReview,trialMonitor,trialRun,trialActivationReview,trialPlan,initialDecision,reviewPkg);if(!av.valid)return{status:"INDEPENDENT_EVALUATION_RUN_ACTIVATION_REVIEW_INVALID",valid:false};
  if(run.sourceActivationReviewSeal!==activationReview.independentEvaluationActivationReviewSeal||run.sourceIndependentEvaluationPlanSeal!==plan.independentEvaluationPlanSeal||run.sourcePostLimitedApplicationDecisionSeal!==postLimitedDecision.postLimitedApplicationDecisionSeal||run.hypothesisId!==plan.hypothesisId)return{status:"SOURCE_INDEPENDENT_EVALUATION_ACTIVATION_SEAL_MISMATCH",valid:false};
  const actual=simpleReviewSealHash(JSON.stringify(independentResearchEvaluationRunPayload(run))),valid=actual===run.independentEvaluationRunSeal&&JSON.stringify(independentResearchEvaluationRunPayload(run))===JSON.stringify(stableReviewValue(run.payload));
  return{status:valid?"RESULT_ONLY_INDEPENDENT_RESEARCH_EVALUATION_RUN_VERIFIED":"SEAL_MISMATCH",valid,expectedSeal:run.independentEvaluationRunSeal,actualSeal:actual};
}


function independentResearchEvaluationMonitorPayload(m){return stableReviewValue({
  version:m?.version||null,sourceIndependentEvaluationRunSeal:m?.sourceIndependentEvaluationRunSeal||null,sourceActivationReviewSeal:m?.sourceActivationReviewSeal||null,sourceIndependentEvaluationPlanSeal:m?.sourceIndependentEvaluationPlanSeal||null,hypothesisId:m?.hypothesisId||null,monitoredAt:m?.monitoredAt||null,observedFutureRaces:Number(m?.observedFutureRaces||0),minimumFutureRaces:Number(m?.minimumFutureRaces||0),maximumFutureRaces:Number(m?.maximumFutureRaces||0),metrics:m?.metrics||{},triggeredFailureConditions:Array.isArray(m?.triggeredFailureConditions)?[...m.triggeredFailureConditions].sort():[],status:m?.status||null,decision:m?.decision||null,
  safeguards:{researchOnly:true,futureHoldoutOnly:true,priorLimitedApplicationRowsReusable:false,predictionUseAllowed:false,userFacingPredictionMutationAllowed:false,probabilityCalibrationAllowed:false,productionWriteAllowed:false,autoPromoteToProduction:false,manualPostEvaluationReviewRequired:!!m?.manualPostEvaluationReviewRequired}
})}
export function monitorResultOnlyIndependentResearchEvaluation(storage,run,activationReview,plan,postLimitedDecision,postLimitedReview,applicationMonitor,applicationRun,applicationActivationReview,applicationPlan,postTrialDecision,postTrialReview,trialMonitor,trialRun,trialActivationReview,trialPlan,initialDecision,reviewPkg,input={}){
  const rv=verifyResultOnlyIndependentResearchEvaluationRun(run,activationReview,plan,postLimitedDecision,postLimitedReview,applicationMonitor,applicationRun,applicationActivationReview,applicationPlan,postTrialDecision,postTrialReview,trialMonitor,trialRun,trialActivationReview,trialPlan,initialDecision,reviewPkg);if(!rv.valid)return{status:"INDEPENDENT_EVALUATION_MONITOR_SOURCE_RUN_INVALID",valid:false,reason:rv.status};
  if(run.status!=="INDEPENDENT_RESEARCH_EVALUATION_FUTURE_HOLDOUT_MONITORING_ACTIVE"||run.decision!=="MONITOR_INDEPENDENT_RESEARCH_EVALUATION_ONLY")return{status:"INDEPENDENT_EVALUATION_MONITOR_NOT_ACTIVE",valid:false};
  const monitoredAt=String(input?.monitoredAt||"").trim();if(!monitoredAt)return{status:"INDEPENDENT_EVALUATION_MONITORED_AT_REQUIRED",valid:false};
  const observedFutureRaces=Number(input?.observedFutureRaces);if(!Number.isInteger(observedFutureRaces)||observedFutureRaces<0)return{status:"INDEPENDENT_EVALUATION_MONITOR_RACE_COUNT_INVALID",valid:false};
  const minimumFutureRaces=Number(run.minimumFutureRaces),maximumFutureRaces=Number(run.maximumFutureRaces);if(observedFutureRaces>maximumFutureRaces)return{status:"INDEPENDENT_EVALUATION_MONITOR_MAXIMUM_SAMPLE_EXCEEDED",valid:false};
  const required=[...(run.evaluationMetrics||[])].sort(),raw=input?.metrics||{},metrics={};for(const k of required){if(!Object.prototype.hasOwnProperty.call(raw,k))return{status:"INDEPENDENT_EVALUATION_MONITOR_METRICS_INCOMPLETE",valid:false,metric:k};const n=Number(raw[k]);if(!Number.isFinite(n))return{status:"INDEPENDENT_EVALUATION_MONITOR_METRIC_INVALID",valid:false,metric:k};metrics[k]=n}
  let triggered=[...new Set((input?.triggeredFailureConditions||[]).map(String).filter(Boolean))].sort();const known=["DATA_LEAKAGE_DETECTED","PREDICTION_MUTATION_DETECTED","NEGATIVE_TOP3_PROBABILITY_DELTA","NEGATIVE_TOP2_PROBABILITY_DELTA","HOLDOUT_REPLICATION_FAILURE","SOURCE_SEAL_MISMATCH"];if(triggered.some(x=>!known.includes(x)))return{status:"INDEPENDENT_EVALUATION_MONITOR_UNKNOWN_FAILURE_CONDITION",valid:false};
  if(metrics.predictionImpactZero!==1&&!triggered.includes("PREDICTION_MUTATION_DETECTED"))triggered.push("PREDICTION_MUTATION_DETECTED");if(metrics.top3ProbabilityDelta<0&&!triggered.includes("NEGATIVE_TOP3_PROBABILITY_DELTA"))triggered.push("NEGATIVE_TOP3_PROBABILITY_DELTA");if(metrics.top2ProbabilityDelta<0&&!triggered.includes("NEGATIVE_TOP2_PROBABILITY_DELTA"))triggered.push("NEGATIVE_TOP2_PROBABILITY_DELTA");if(observedFutureRaces>=minimumFutureRaces&&metrics.holdoutReplicationRate<Number(run.failureCriteria?.holdoutReplicationRateBelow??0.5)&&!triggered.includes("HOLDOUT_REPLICATION_FAILURE"))triggered.push("HOLDOUT_REPLICATION_FAILURE");triggered=[...new Set(triggered)].sort();
  const failed=triggered.length>0,minimumReached=observedFutureRaces>=minimumFutureRaces,success=minimumReached&&!failed&&metrics.directionalAgreement>=Number(run.successCriteria?.minimumDirectionalAgreement??0.6)&&metrics.top3ProbabilityDelta>=Number(run.successCriteria?.minimumTop3ProbabilityDelta??0)&&metrics.top2ProbabilityDelta>=Number(run.successCriteria?.minimumTop2ProbabilityDelta??0)&&metrics.holdoutReplicationRate>=Number(run.successCriteria?.minimumHoldoutReplicationRate??0.6)&&metrics.predictionImpactZero===1;
  const complete=observedFutureRaces>=maximumFutureRaces||success;const status=failed?"INDEPENDENT_RESEARCH_EVALUATION_FAILED":complete?"INDEPENDENT_RESEARCH_EVALUATION_HOLDOUT_COMPLETE":"INDEPENDENT_RESEARCH_EVALUATION_FUTURE_HOLDOUT_MONITORING_ACTIVE";const decision=failed?"STOP_INDEPENDENT_RESEARCH_EVALUATION":complete?"POST_INDEPENDENT_RESEARCH_EVALUATION_REVIEW_REQUIRED":"CONTINUE_INDEPENDENT_RESEARCH_EVALUATION_MONITORING";
  const base={version:"RESULT-ONLY-INDEPENDENT-RESEARCH-EVALUATION-MONITOR-1.0",sourceIndependentEvaluationRunSeal:run.independentEvaluationRunSeal,sourceActivationReviewSeal:activationReview.independentEvaluationActivationReviewSeal,sourceIndependentEvaluationPlanSeal:plan.independentEvaluationPlanSeal,hypothesisId:run.hypothesisId,monitoredAt,observedFutureRaces,minimumFutureRaces,maximumFutureRaces,metrics,triggeredFailureConditions:triggered,status,decision,independentEvaluationMonitoringActive:!failed&&!complete,manualPostEvaluationReviewRequired:true,postEvaluationReviewAllowed:complete&&!failed,eligibleForPrediction:false,userFacingPredictionMutationAllowed:false,eligibleForProbabilityCalibration:false,productionWriteAllowed:false,autoPromoteToProduction:false};const payload=independentResearchEvaluationMonitorPayload(base),independentEvaluationMonitorSeal=simpleReviewSealHash(JSON.stringify(payload)),sealed={...base,payload,independentEvaluationMonitorSeal};storage.setItem(INDEPENDENT_RESEARCH_EVALUATION_MONITOR_KEY,JSON.stringify(sealed));return sealed;
}
export function loadResultOnlyIndependentResearchEvaluationMonitor(storage){try{const v=JSON.parse(storage.getItem(INDEPENDENT_RESEARCH_EVALUATION_MONITOR_KEY)||"null");return v&&typeof v==="object"?v:null}catch{return null}}
export function verifyResultOnlyIndependentResearchEvaluationMonitor(monitor,run,activationReview,plan,postLimitedDecision,postLimitedReview,applicationMonitor,applicationRun,applicationActivationReview,applicationPlan,postTrialDecision,postTrialReview,trialMonitor,trialRun,trialActivationReview,trialPlan,initialDecision,reviewPkg){if(!monitor?.independentEvaluationMonitorSeal||!monitor?.payload)return{status:"MISSING_SEAL",valid:false};const rv=verifyResultOnlyIndependentResearchEvaluationRun(run,activationReview,plan,postLimitedDecision,postLimitedReview,applicationMonitor,applicationRun,applicationActivationReview,applicationPlan,postTrialDecision,postTrialReview,trialMonitor,trialRun,trialActivationReview,trialPlan,initialDecision,reviewPkg);if(!rv.valid)return{status:"INDEPENDENT_EVALUATION_MONITOR_SOURCE_RUN_INVALID",valid:false};if(monitor.sourceIndependentEvaluationRunSeal!==run.independentEvaluationRunSeal||monitor.sourceActivationReviewSeal!==activationReview.independentEvaluationActivationReviewSeal||monitor.sourceIndependentEvaluationPlanSeal!==plan.independentEvaluationPlanSeal||monitor.hypothesisId!==run.hypothesisId)return{status:"SOURCE_INDEPENDENT_EVALUATION_RUN_SEAL_MISMATCH",valid:false};const actual=simpleReviewSealHash(JSON.stringify(independentResearchEvaluationMonitorPayload(monitor))),valid=actual===monitor.independentEvaluationMonitorSeal&&JSON.stringify(independentResearchEvaluationMonitorPayload(monitor))===JSON.stringify(stableReviewValue(monitor.payload));return{status:valid?"RESULT_ONLY_INDEPENDENT_RESEARCH_EVALUATION_MONITOR_VERIFIED":"SEAL_MISMATCH",valid,expectedSeal:monitor.independentEvaluationMonitorSeal,actualSeal:actual}}


function postIndependentResearchEvaluationReviewPayload(r){return stableReviewValue({
  version:r?.version||null,sourceIndependentEvaluationMonitorSeal:r?.sourceIndependentEvaluationMonitorSeal||null,sourceIndependentEvaluationRunSeal:r?.sourceIndependentEvaluationRunSeal||null,sourceIndependentEvaluationPlanSeal:r?.sourceIndependentEvaluationPlanSeal||null,sourcePostLimitedApplicationDecisionSeal:r?.sourcePostLimitedApplicationDecisionSeal||null,hypothesisId:r?.hypothesisId||null,
  generatedAt:r?.generatedAt||null,targetCohort:r?.targetCohort||null,observedFutureRaces:Number(r?.observedFutureRaces||0),minimumFutureRaces:Number(r?.minimumFutureRaces||0),maximumFutureRaces:Number(r?.maximumFutureRaces||0),metrics:r?.metrics||{},supportingEvidence:r?.supportingEvidence||[],counterEvidence:r?.counterEvidence||[],unresolvedIssues:r?.unresolvedIssues||[],failureConditionNonTriggerEvidence:r?.failureConditionNonTriggerEvidence||[],leakageGuardNonTriggerEvidence:r?.leakageGuardNonTriggerEvidence||[],status:r?.status||null,decision:r?.decision||null,
  safeguards:{researchOnly:true,futureHoldoutOnly:true,priorLimitedApplicationRowsReusable:false,predictionUseAllowed:false,userFacingPredictionMutationAllowed:false,probabilityCalibrationAllowed:false,productionWriteAllowed:false,autoPromoteToProduction:false,manualDecisionRequired:true}
})}
export function buildPostResultOnlyIndependentResearchEvaluationReviewPackage(storage,monitor,run,activationReview,plan,postLimitedDecision,postLimitedReview,applicationMonitor,applicationRun,applicationActivationReview,applicationPlan,postTrialDecision,postTrialReview,trialMonitor,trialRun,trialActivationReview,trialPlan,initialDecision,reviewPkg,input={}){
  const mv=verifyResultOnlyIndependentResearchEvaluationMonitor(monitor,run,activationReview,plan,postLimitedDecision,postLimitedReview,applicationMonitor,applicationRun,applicationActivationReview,applicationPlan,postTrialDecision,postTrialReview,trialMonitor,trialRun,trialActivationReview,trialPlan,initialDecision,reviewPkg);if(!mv.valid)return{status:"POST_INDEPENDENT_EVALUATION_MONITOR_INVALID",valid:false,reason:mv.status};
  if(monitor.status!=="INDEPENDENT_RESEARCH_EVALUATION_HOLDOUT_COMPLETE"||monitor.decision!=="POST_INDEPENDENT_RESEARCH_EVALUATION_REVIEW_REQUIRED"||monitor.postEvaluationReviewAllowed!==true)return{status:"POST_INDEPENDENT_EVALUATION_REVIEW_NOT_ALLOWED",valid:false};
  if((monitor.triggeredFailureConditions||[]).length)return{status:"POST_INDEPENDENT_EVALUATION_FAILURE_PRESENT",valid:false};
  const generatedAt=String(input?.generatedAt||"").trim();if(!generatedAt)return{status:"POST_INDEPENDENT_EVALUATION_REVIEW_GENERATED_AT_REQUIRED",valid:false};
  const metrics=stableReviewValue(monitor.metrics||{}),knownFailures=["DATA_LEAKAGE_DETECTED","PREDICTION_MUTATION_DETECTED","NEGATIVE_TOP3_PROBABILITY_DELTA","NEGATIVE_TOP2_PROBABILITY_DELTA","HOLDOUT_REPLICATION_FAILURE","SOURCE_SEAL_MISMATCH"].sort();
  const failureConditionNonTriggerEvidence=knownFailures.map(type=>({type,triggered:false,sourceIndependentEvaluationMonitorSeal:monitor.independentEvaluationMonitorSeal}));
  const leakageGuards=[...(run.leakageGuards||[])].sort();const leakageGuardNonTriggerEvidence=leakageGuards.map(type=>({type,triggered:false,sourceIndependentEvaluationMonitorSeal:monitor.independentEvaluationMonitorSeal}));
  const supportingEvidence=[
    {type:"FUTURE_HOLDOUT_MINIMUM_SAMPLE_REACHED",observedFutureRaces:Number(monitor.observedFutureRaces),minimumFutureRaces:Number(monitor.minimumFutureRaces)},
    {type:"INDEPENDENT_HOLDOUT_EVALUATION_METRICS",metrics},
    {type:"ZERO_USER_FACING_PREDICTION_IMPACT_CONFIRMED",value:Number(metrics.predictionImpactZero)},
    {type:"FUTURE_HOLDOUT_ONLY_CONFIRMED",sourceDataCutoff:run.sourceDataCutoff,priorLimitedApplicationRowsReusable:false},
    {type:"NO_FAILURE_CONDITION_TRIGGERED",count:0}
  ];
  const counterEvidence=(postLimitedReview?.counterEvidence||postTrialReview?.counterEvidence||[]).map(x=>stableReviewValue(x));
  const unresolvedIssues=[];
  if(counterEvidence.length===0)unresolvedIssues.push({type:"COUNTEREVIDENCE_NOT_AVAILABLE",reason:"独立評価前から保持していた反証証拠が空"});
  if(Number(monitor.observedFutureRaces)<Number(monitor.minimumFutureRaces))unresolvedIssues.push({type:"FUTURE_HOLDOUT_MINIMUM_SAMPLE_NOT_REACHED",observedFutureRaces:Number(monitor.observedFutureRaces),minimumFutureRaces:Number(monitor.minimumFutureRaces)});
  if(Number(metrics.directionalAgreement)<Number(run.successCriteria?.minimumDirectionalAgreement??0.6))unresolvedIssues.push({type:"DIRECTIONAL_AGREEMENT_BELOW_SUCCESS_CRITERION",value:Number(metrics.directionalAgreement),required:Number(run.successCriteria?.minimumDirectionalAgreement??0.6)});
  if(Number(metrics.top3ProbabilityDelta)<Number(run.successCriteria?.minimumTop3ProbabilityDelta??0))unresolvedIssues.push({type:"TOP3_DELTA_BELOW_SUCCESS_CRITERION",value:Number(metrics.top3ProbabilityDelta),required:Number(run.successCriteria?.minimumTop3ProbabilityDelta??0)});
  if(Number(metrics.top2ProbabilityDelta)<Number(run.successCriteria?.minimumTop2ProbabilityDelta??0))unresolvedIssues.push({type:"TOP2_DELTA_BELOW_SUCCESS_CRITERION",value:Number(metrics.top2ProbabilityDelta),required:Number(run.successCriteria?.minimumTop2ProbabilityDelta??0)});
  if(Number(metrics.holdoutReplicationRate)<Number(run.successCriteria?.minimumHoldoutReplicationRate??0.6))unresolvedIssues.push({type:"HOLDOUT_REPLICATION_BELOW_SUCCESS_CRITERION",value:Number(metrics.holdoutReplicationRate),required:Number(run.successCriteria?.minimumHoldoutReplicationRate??0.6)});
  if(Number(metrics.predictionImpactZero)!==1)unresolvedIssues.push({type:"PREDICTION_IMPACT_NOT_ZERO",value:Number(metrics.predictionImpactZero)});
  const ready=counterEvidence.length>0&&unresolvedIssues.length===0&&failureConditionNonTriggerEvidence.length===knownFailures.length&&leakageGuardNonTriggerEvidence.length===leakageGuards.length;
  const base={version:"RESULT-ONLY-POST-INDEPENDENT-RESEARCH-EVALUATION-REVIEW-1.0",sourceIndependentEvaluationMonitorSeal:monitor.independentEvaluationMonitorSeal,sourceIndependentEvaluationRunSeal:run.independentEvaluationRunSeal,sourceIndependentEvaluationPlanSeal:plan.independentEvaluationPlanSeal,sourcePostLimitedApplicationDecisionSeal:postLimitedDecision.postLimitedApplicationDecisionSeal,hypothesisId:monitor.hypothesisId,generatedAt,targetCohort:run.targetCohort,observedFutureRaces:monitor.observedFutureRaces,minimumFutureRaces:monitor.minimumFutureRaces,maximumFutureRaces:monitor.maximumFutureRaces,metrics,supportingEvidence,counterEvidence,unresolvedIssues,failureConditionNonTriggerEvidence,leakageGuardNonTriggerEvidence,status:ready?"POST_INDEPENDENT_RESEARCH_EVALUATION_REVIEW_PACKAGE_READY":"POST_INDEPENDENT_RESEARCH_EVALUATION_REVIEW_EVIDENCE_PENDING",decision:ready?"MANUAL_POST_INDEPENDENT_RESEARCH_EVALUATION_DECISION_ONLY":"HOLD_FOR_MORE_INDEPENDENT_RESEARCH_EVIDENCE",manualDecisionRequired:ready,eligibleForPrediction:false,userFacingPredictionMutationAllowed:false,eligibleForProbabilityCalibration:false,productionWriteAllowed:false,autoPromoteToProduction:false};
  const payload=postIndependentResearchEvaluationReviewPayload(base),postIndependentEvaluationReviewSeal=simpleReviewSealHash(JSON.stringify(payload)),sealed={...base,payload,postIndependentEvaluationReviewSeal};storage.setItem(POST_INDEPENDENT_RESEARCH_EVALUATION_REVIEW_KEY,JSON.stringify(sealed));return sealed;
}
export function loadPostResultOnlyIndependentResearchEvaluationReviewPackage(storage){try{const v=JSON.parse(storage.getItem(POST_INDEPENDENT_RESEARCH_EVALUATION_REVIEW_KEY)||"null");return v&&typeof v==="object"?v:null}catch{return null}}
export function verifyPostResultOnlyIndependentResearchEvaluationReviewPackage(pkg,monitor,run,activationReview,plan,postLimitedDecision,postLimitedReview,applicationMonitor,applicationRun,applicationActivationReview,applicationPlan,postTrialDecision,postTrialReview,trialMonitor,trialRun,trialActivationReview,trialPlan,initialDecision,reviewPkg){
  if(!pkg?.postIndependentEvaluationReviewSeal||!pkg?.payload)return{status:"MISSING_SEAL",valid:false};
  const mv=verifyResultOnlyIndependentResearchEvaluationMonitor(monitor,run,activationReview,plan,postLimitedDecision,postLimitedReview,applicationMonitor,applicationRun,applicationActivationReview,applicationPlan,postTrialDecision,postTrialReview,trialMonitor,trialRun,trialActivationReview,trialPlan,initialDecision,reviewPkg);if(!mv.valid)return{status:"POST_INDEPENDENT_EVALUATION_MONITOR_INVALID",valid:false};
  if(pkg.sourceIndependentEvaluationMonitorSeal!==monitor.independentEvaluationMonitorSeal||pkg.sourceIndependentEvaluationRunSeal!==run.independentEvaluationRunSeal||pkg.sourceIndependentEvaluationPlanSeal!==plan.independentEvaluationPlanSeal||pkg.sourcePostLimitedApplicationDecisionSeal!==postLimitedDecision.postLimitedApplicationDecisionSeal||pkg.hypothesisId!==monitor.hypothesisId)return{status:"SOURCE_INDEPENDENT_EVALUATION_MONITOR_SEAL_MISMATCH",valid:false};
  const actual=simpleReviewSealHash(JSON.stringify(postIndependentResearchEvaluationReviewPayload(pkg))),valid=actual===pkg.postIndependentEvaluationReviewSeal&&JSON.stringify(postIndependentResearchEvaluationReviewPayload(pkg))===JSON.stringify(stableReviewValue(pkg.payload));
  return{status:valid?"RESULT_ONLY_POST_INDEPENDENT_RESEARCH_EVALUATION_REVIEW_VERIFIED":"SEAL_MISMATCH",valid,expectedSeal:pkg.postIndependentEvaluationReviewSeal,actualSeal:actual};
}
