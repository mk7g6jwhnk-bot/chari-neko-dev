import{backfillResearchLearningLedger,loadResearchLearningRecords,loadSnapshots}from"./prediction-store.mjs";
import{deriveResearchThickSubset}from"./research-outcome-diagnostics.mjs";

const STATE_KEY="chari-neko:keirin-operational-learning-pipeline:v1";
const REVIEW_KEY="chari-neko:keirin-operational-v182-review-draft:v1";
const REQUIRED_METRICS=["returnRate","thickHitRate","mainHitRate","supportHitRate","betCount"];
const ROLLBACK_TYPES=["RETURN_RATE_DROP","THICK_HIT_REGRESSION","MAIN_HIT_REGRESSION","SUPPORT_HIT_REGRESSION","BET_COUNT_INFLATION"];
const key=o=>(o||[]).map(Number).join("-");
const finite=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v));
const ratio=(a,b)=>b>0?a/b:null;
const avg=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;
const stable=value=>JSON.stringify(value,Object.keys(value||{}).sort());
function hashText(text){let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)}return(h>>>0).toString(16).padStart(8,"0")}
function storageSet(storage,k,v){try{storage.setItem(k,JSON.stringify(v));return true}catch{return false}}
function snapshotFallbackMap(storage){return new Map(loadSnapshots(storage).filter(s=>s?.predictionSnapshotId).map(s=>[s.predictionSnapshotId,s]))}
function metricFromResearchRecord(record,fallback){
  if(record?.operationalMetrics)return{raceKey:record.raceKey,checkedAt:record.checkedAt,...record.operationalMetrics};
  if(fallback)return raceMetrics(fallback);
  const d=record?.outcomeDiagnostics||{};
  return{raceKey:record?.raceKey||null,checkedAt:record?.checkedAt||null,totalStake:finite(d.totalStake)?Number(d.totalStake):0,grossReturn:finite(d.grossReturn)?Number(d.grossReturn):0,betCount:null,thickEligible:Number(d.thickBetCount)>0,thickHit:Boolean(d.thickHit),mainHit:null,supportHit:null,degraded:true};
}
function eligibleOperationalRows(storage){
  const fallbacks=snapshotFallbackMap(storage);
  return loadResearchLearningRecords(storage).filter(r=>r?.learningMode==="NORMAL"&&Array.isArray(r?.officialFinishOrder)&&r.officialFinishOrder.length>=3).sort((a,b)=>String(a?.checkedAt||"").localeCompare(String(b?.checkedAt||""))).map(r=>metricFromResearchRecord(r,fallbacks.get(r.predictionSnapshotId)));
}
function raceMetrics(snapshot){
  const result=snapshot?.result||{},bets=Array.isArray(snapshot?.betSelections)?snapshot.betSelections:[],officialKey=key(result.officialFinishOrder),payout=finite(result.officialPayout)?Number(result.officialPayout):null;
  const totalStake=bets.reduce((s,b)=>s+(finite(b.stake)?Number(b.stake):0),0),matched=bets.find(b=>key(b.order)===officialKey)||null,hitStake=matched&&finite(matched.stake)?Number(matched.stake):0;
  const grossReturn=matched&&payout!==null&&hitStake>0?payout/100*hitStake:0;
  const thick=deriveResearchThickSubset(snapshot),thickEligible=thick.length>0,thickHit=thickEligible&&thick.some(b=>key(b.order)===officialKey);
  const mainHit=bets.some(b=>b.category==="MAIN"&&key(b.order)===officialKey);
  const supportHit=bets.some(b=>["COVER","BUYABLE_HIGH"].includes(b.category)&&key(b.order)===officialKey);
  return{raceKey:`${snapshot?.targetRace?.date||""}-${snapshot?.targetRace?.venueCode||snapshot?.targetRace?.venueName||""}-${snapshot?.targetRace?.raceNo||""}`,checkedAt:result.checkedAt||snapshot.createdAt||null,totalStake,grossReturn,betCount:bets.length,thickEligible,thickHit,mainHit,supportHit,degraded:false};
}
export function aggregateOperationalMetrics(rowsInput){
  const rows=(rowsInput||[]).map(x=>x&&Object.prototype.hasOwnProperty.call(x,"totalStake")?x:raceMetrics(x)),stake=rows.reduce((s,r)=>s+r.totalStake,0),gross=rows.reduce((s,r)=>s+r.grossReturn,0),thickRows=rows.filter(r=>r.thickEligible);
  return{races:rows.length,returnRate:ratio(gross,stake),thickHitRate:ratio(thickRows.filter(r=>r.thickHit).length,thickRows.length),mainHitRate:ratio(rows.filter(r=>r.mainHit===true).length,rows.filter(r=>typeof r.mainHit==="boolean").length),supportHitRate:ratio(rows.filter(r=>r.supportHit===true).length,rows.filter(r=>typeof r.supportHit==="boolean").length),betCount:avg(rows.map(r=>Number(r.betCount)).filter(Number.isFinite)),totalStake:stake,grossReturn:gross,thickEvaluatedRaces:thickRows.length,degradedRaceCount:rows.filter(r=>r.degraded).length};
}
function rollbackEvaluations(current,baseline){
  const out=[];const c=k=>Number(current?.[k]),b=k=>Number(baseline?.[k]);
  const known=k=>Number.isFinite(c(k))&&Number.isFinite(b(k));
  out.push({type:"RETURN_RATE_DROP",breached:known("returnRate")&&c("returnRate")<b("returnRate"),current:current.returnRate,baseline:baseline.returnRate,limit:0});
  out.push({type:"THICK_HIT_REGRESSION",breached:known("thickHitRate")&&c("thickHitRate")<b("thickHitRate"),current:current.thickHitRate,baseline:baseline.thickHitRate,limit:0});
  out.push({type:"MAIN_HIT_REGRESSION",breached:known("mainHitRate")&&(b("mainHitRate")-c("mainHitRate"))>.01,current:current.mainHitRate,baseline:baseline.mainHitRate,limit:.01});
  out.push({type:"SUPPORT_HIT_REGRESSION",breached:known("supportHitRate")&&(b("supportHitRate")-c("supportHitRate"))>.02,current:current.supportHitRate,baseline:baseline.supportHitRate,limit:.02});
  const inflation=known("betCount")&&b("betCount")>0?(c("betCount")-b("betCount"))/b("betCount"):null;
  out.push({type:"BET_COUNT_INFLATION",breached:Number.isFinite(inflation)&&inflation>.10,current:current.betCount,baseline:baseline.betCount,relativeDelta:inflation,limit:.10});
  return out.map(x=>({...x,evidence:{source:"actual_saved_prediction_results",computedAutomatically:true}}));
}
export function loadOperationalLearningState(storage){try{return JSON.parse(storage.getItem(STATE_KEY)||"null")}catch{return null}}
export function loadOperationalV182ReviewDraft(storage){try{return JSON.parse(storage.getItem(REVIEW_KEY)||"null")}catch{return null}}
export function runOperationalLearningPipeline(storage,{minimumRaces=100,baselineMinimumRaces=30,windowRaces=100,now=new Date()}={}){
  const backfill=backfillResearchLearningLedger(storage,{now}),eligible=eligibleOperationalRows(storage),currentRows=eligible.slice(-windowRaces),before=eligible.slice(0,Math.max(0,eligible.length-currentRows.length)),baselineRows=before.slice(-windowRaces),current=aggregateOperationalMetrics(currentRows),baseline=aggregateOperationalMetrics(baselineRows),baselineReady=baseline.races>=baselineMinimumRaces,currentReady=current.races>=minimumRaces;
  const evaluations=baselineReady?rollbackEvaluations(current,baseline):ROLLBACK_TYPES.map(type=>({type,breached:false,evidence:{source:"baseline_not_ready",computedAutomatically:true}}));
  const breached=evaluations.filter(x=>x.breached),status=!currentReady?"OPERATIONAL_SAMPLE_BUILDING":!baselineReady?"OPERATIONAL_BASELINE_BUILDING":breached.length?"OPERATIONAL_ROLLBACK_REVIEW_REQUIRED":"OPERATIONAL_V182_REVIEW_DRAFT_READY";
  const state={version:"OPERATIONAL-LEARNING-PIPELINE-1.0",status,updatedAt:now.toISOString(),eligibleNormalRaces:eligible.length,currentWindowRaces:current.races,baselineWindowRaces:baseline.races,minimumRaces,baselineMinimumRaces,windowRaces,currentMetrics:current,baselineMetrics:baseline,monitoringMetrics:REQUIRED_METRICS,rollbackEvaluations:evaluations,rollbackBreaches:breached.map(x=>x.type),backfill,productionWriteAllowed:false,autoPromotionAllowed:false,automaticCollectionConnected:true,automaticAggregationConnected:true,automaticReviewDraftConnected:true};
  state.stateSeal=hashText(JSON.stringify(state));storageSet(storage,STATE_KEY,state);
  let reviewDraft=null;
  if(currentReady&&baselineReady){
    const deltas=Object.fromEntries(REQUIRED_METRICS.map(k=>[k,Number.isFinite(Number(current[k]))&&Number.isFinite(Number(baseline[k]))?Number(current[k])-Number(baseline[k]):null]));
    reviewDraft={version:"OPERATIONAL-V182-REVIEW-DRAFT-1.0",status:breached.length?"ROLLBACK_EVIDENCE_PRESENT":"READY_FOR_MANUAL_POST_PRODUCTION_FINALIZATION_REVIEW",generatedAt:now.toISOString(),sample:{currentRaces:current.races,baselineRaces:baseline.races},summaryMetrics:Object.fromEntries(REQUIRED_METRICS.map(k=>[k,current[k]])),baselineMetrics:Object.fromEntries(REQUIRED_METRICS.map(k=>[k,baseline[k]])),deltas,counterEvidence:[{type:"ROLLING_WINDOW_LIMITATION",note:"実運用の直近ウィンドウのみ。長期・季節・会場偏りは別途確認が必要"},...breached.map(x=>({type:x.type,current:x.current,baseline:x.baseline,limit:x.limit??x.relativeDelta??null}))],unresolvedIssues:[{type:"MANUAL_FINALIZATION_REVIEW_REQUIRED",note:"自動集計後も永続本番確定は手動判断"}],rollbackNonTriggerEvidence:evaluations.filter(x=>!x.breached).map(x=>({type:x.type,evidence:x.evidence,current:x.current,baseline:x.baseline,limit:x.limit??null})),rollbackBreaches:breached,sourceStateSeal:state.stateSeal,productionWriteAllowed:false,persistentProductionMutationAllowed:false,autoPromotionAllowed:false};
    reviewDraft.reviewDraftSeal=hashText(JSON.stringify(reviewDraft));storageSet(storage,REVIEW_KEY,reviewDraft);
  }
  return{state,reviewDraft};
}
