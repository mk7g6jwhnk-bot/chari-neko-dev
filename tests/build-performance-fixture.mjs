// Regenerate using the unmodified Priority 1 backend, not a frontend KPI replica.
// node tests/build-performance-fixture.mjs /path/to/browser-service
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const backend=process.argv[2];if(!backend)throw new Error('Pass the Priority 1 browser-service directory');
const load=file=>import(pathToFileURL(path.resolve(backend,'src',file)));
const {buildPurchasePerformanceReport,buildPurchasePerformanceReportStreaming}=await load('purchase-performance.mjs');
const {buildPredictionSummaryList,buildSealedResultRead}=await load('sealed-result-read.mjs');
const {buildReusableSealedPrediction}=await load('sealed-prediction-read.mjs');
const {predictionHash}=await load('auto-research-store.mjs');
const records=[];
function record(day,raceNo,{allowed=true,hit=true,cover=false,legacy=false}={}){
  const date=day.replaceAll('-',''),raceKey=`${date}-12-${raceNo}`,standard=[{order:[1,2,3],betClass:'MAIN',thickQualified:true},{order:[1,3,2],betClass:'MAIN'},{order:[2,1,3],betClass:'COVER'}];
  const prediction={engineVersion:'KEIRIN-0.5.20-girls-evidence-gate',performanceSchemaVersion:'PURCHASE_PERFORMANCE_V2',purchaseSchemaVersion:'PURCHASE_SCHEMA_V2',purchaseEligibility:legacy?{}:{canPurchase:allowed},noBet:!allowed,standardPurchasePlan:standard,canonicalPurchasePlan:{standardTickets:standard},terminals:[{order:[7,6,5],probability:0.2}],branches:[],scored:[]};
  return {raceKey,state:'VERIFIED',preSeal:{scheduledStartAt:`${day}T10:00:00+09:00`},sealed:{scheduledStartAt:`${day}T10:00:00+09:00`,predictionSealedAt:`${day}T09:00:00+09:00`,researchPrediction:prediction,predictionHash:predictionHash(prediction),participants:[],officialData:{basic:{date,venueName:'青森',startTime:'10:00',deadline:'09:57'},lines:[]}},result:{resultObservedAt:`${day}T10:10:00+09:00`,result:{status:'confirmed',finishOrder:hit?(cover?[2,1,3]:[1,2,3]):[7,6,5],payout:cover?89490:1250}},verification:{state:'VERIFIED',mutationDetected:false},temporalAudit:{passed:true}};
}
records.push(record('2026-09-12',1),record('2026-09-12',2,{cover:true}),record('2026-09-12',3,{allowed:false}),record('2026-09-12',4,{hit:false}),record('2026-09-12',5,{legacy:true}),record('2026-09-11',1),record('2026-09-06',1,{hit:false}),record('2026-08-14',1),record('2026-08-01',1));
for(const [i,state] of ['RESULT_PENDING','RESULT_RETRYING','RESULT_FETCH_FAILED'].entries()){const r=record('2026-09-12',6+i);delete r.result;r.state=state;records.push(r)}
const future=record('2026-09-12',9);delete future.result;future.state='PREDICTION_SEALED';future.sealed.scheduledStartAt='2026-09-12T14:00:00+09:00';records.push(future);
const report=buildPurchasePerformanceReport(records,'20260912'),streaming=await buildPurchasePerformanceReportStreaming(async visit=>records.forEach(visit),'20260912');
if(JSON.stringify(report.periods)!==JSON.stringify(streaming.periods))throw new Error('canonical streaming mismatch');
report.generatedAt='2026-09-12T03:00:00.000Z';
const histories=Object.fromEntries([...new Set(records.map(r=>r.raceKey.slice(0,8)))].map(date=>[date,buildPredictionSummaryList({lifecycleRecords:records,date})]));
const status={ok:true,schemaVersion:'COLLECTOR_STATUS_V2',dailyDate:'20260912',autoStatusAvailable:true,researchStatusAvailable:true,autoCurrent:true,researchCurrent:true,autoSource:'auto_lifecycle_snapshot',researchSource:'research_shadow_snapshot',autoObservedAt:report.generatedAt,researchObservedAt:report.generatedAt,checkedAt:report.generatedAt,collectorHealthy:true,collectorOperational:true,storageWritable:true,browserConnected:true,todayRaceCount:9,meetingCount:1,prefetchedRaceCount:9,sealedPredictionCount:9,resultLoadedCount:5,verifiedCount:5,pendingResultCount:1,retryingCount:1,failureCount:1,preRaceSealSucceeded:9,preRaceSealFailed:0,purchasePerformance:report,researchProgress:{comparableTotal:200,progress50:50,progress100:100,cohort:'production-existing-cohort',reportStatus:'GENERATED'},races:records.filter(r=>r.raceKey.startsWith('20260912')).map(r=>({raceKey:r.raceKey,venueName:'青森',venueCode:'12',raceNumber:Number(r.raceKey.split('-')[2]),date:'20260912',scheduledStartTime:r.sealed.scheduledStartAt,state:r.state,predictionHash:r.sealed.predictionHash,predictionSealedAt:r.sealed.predictionSealedAt,resultObservedAt:r.result?.resultObservedAt,resultLifecycleState:r.result?'RESULT_CONFIRMED':r.state}))};
const details=Object.fromEntries(records.map(r=>[r.raceKey,buildReusableSealedPrediction({lifecycleRecords:records,date:r.raceKey.slice(0,8),venueCode:'12',raceNo:Number(r.raceKey.split('-')[2])}).body]));
const results=Object.fromEntries(records.filter(r=>r.result).map(r=>[r.raceKey,buildSealedResultRead({lifecycleRecords:records,raceKey:r.raceKey}).body]));
const sourceHashes=Object.fromEntries(['purchase-performance.mjs','canonical-purchase-eligibility.mjs','sealed-result-read.mjs'].map(file=>[file,createHash('sha256').update(fs.readFileSync(path.resolve(backend,'src',file))).digest('hex')]));
fs.mkdirSync('tests/fixtures',{recursive:true});fs.writeFileSync('tests/fixtures/performance-canonical.json',JSON.stringify({sourceHashes,now:'2026-09-12T03:00:00Z',status,histories,details,results},null,2)+'\n');
console.log('PASS generated fixture through unchanged Priority 1 aggregation, summary, sealed-read; streaming parity');
