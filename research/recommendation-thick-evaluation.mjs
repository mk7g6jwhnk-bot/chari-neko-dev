import fs from 'node:fs';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';

const pct=n=>n==null?null:n*100;
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const order=x=>String(x||'').match(/\d+/g)?.map(Number).join('-')||'';
const warning=r=>r.display==='注意'||r.quality==='LOW';
const band=n=>n==null?'UNKNOWN':n>=4?'HIGH':n>=3?'MEDIUM':'LOW';
const state=r=>r.canPurchase===true?(warning(r)?'WARNING':'PURCHASEABLE'):'INELIGIBLE';

export function buildDataset(source,cohorts){
  const held=new Set(cohorts.heldOutRaceKeys||[]), audit=new Set(cohorts.auditRaceKeys||[]);
  const outcome=new Map();
  for(const name of ['thickPerformance','nonThickMainPerformance']) for(const h of source[name]?.hits||[]) outcome.set(`${h.raceKey}/${order(h.order)}`,Number(h.payout)||0);
  const rows=[];
  for(const r of source.ticketDiagnostics||[]){
    const cohort=audit.has(r.raceKey)?'AUDIT_TRAIN_LIKE':held.has(r.raceKey)?'HELD_OUT':null;
    if(!cohort||r.inConfirmedCohort!==true)continue;
    const tickets=(r.mainTickets||[]).map(t=>{
      const id=`${r.raceKey}/${order(t.order)}`,hit=outcome.has(id);
      return{order:order(t.order),class:'MAIN',thick:t.thick===true,score:Number.isFinite(t.replayedScore)?t.replayedScore:null,
        predictiveSupport:Number.isFinite(t.terminalModelWeight)?t.terminalModelWeight:null,purchaseSupport:Number.isFinite(t.naturalConvergenceScore)?t.naturalConvergenceScore:null,
        hit,payout:hit?outcome.get(id):0,oddsBand:'UNKNOWN'};
    });
    const finish=tickets.find(t=>t.hit);
    rows.push({raceKey:r.raceKey,cohort,preResult:{confidence:r.rating?.confidence??null,confidenceBand:band(r.rating?.confidence),
      concentration:r.concentration||'UNKNOWN',purchaseability:state(r),purchaseable:r.canPurchase===true,ticketCount:tickets.length,
      warnings:{oddsValue:'UNKNOWN',partialData:r.qualitySource==='SAVED_QUALITY_OR_UNKNOWN',displayWarning:warning(r)},quality:r.quality||'UNKNOWN',
      cliff:r.qualificationBoundary||null},tickets,result:{exactHit:Boolean(finish),return:finish?.payout||0,investment:r.canPurchase===true?tickets.length*100:0,highPayout:Boolean(finish&&finish.payout>=10000)}});
  }
  return{schemaVersion:'RECOMMENDATION_THICK_EVAL_V1',createdFrom:'sealed pre-result diagnostics + confirmed canonical result',productionWriteAllowed:false,
    cohortPolicy:{auditTrainLike:rows.filter(r=>r.cohort==='AUDIT_TRAIN_LIKE').length,heldOut:rows.filter(r=>r.cohort==='HELD_OUT').length,
      protectedFinalIncluded:0,unknownMembershipExcluded:(source.ticketDiagnostics||[]).filter(r=>r.inConfirmedCohort).length-rows.length,thresholdSearch:false},rows};
}

function losingStreak(rows){let max=0,n=0;for(const r of rows){n=r.result.exactHit?0:n+1;max=Math.max(max,n);}return max;}
function raceStats(rows){
  const buy=rows.filter(r=>r.preResult.purchaseable),investment=buy.reduce((s,r)=>s+r.result.investment,0),returned=buy.reduce((s,r)=>s+r.result.return,0);
  return{raceCount:rows.length,purchaseableCount:buy.length,purchaseableRate:rows.length?buy.length/rows.length:null,hits:buy.filter(r=>r.result.exactHit).length,
    hitRate:buy.length?buy.filter(r=>r.result.exactHit).length/buy.length:null,investment,return:returned,roi:investment?returned/investment:null,
    avgTickets:buy.length?mean(buy.map(r=>r.preResult.ticketCount)):null,avgReturn:buy.length?returned/buy.length:null,maxLosingStreak:losingStreak(buy),
    returnDistribution:{zero:buy.filter(r=>r.result.return===0).length,under10000:buy.filter(r=>r.result.return>0&&r.result.return<10000).length,atLeast10000:buy.filter(r=>r.result.return>=10000).length}};
}
function ticketStats(rows,select){const ts=rows.filter(r=>r.preResult.purchaseable).flatMap(r=>r.tickets.filter(t=>select(t,r)));const inv=ts.length*100,ret=ts.reduce((s,t)=>s+t.payout,0);return{races:new Set(ts.map((t,i)=>rows.find(r=>r.tickets.includes(t))?.raceKey)).size,tickets:ts.length,hits:ts.filter(t=>t.hit).length,hitRate:ts.length?ts.filter(t=>t.hit).length/ts.length:null,investment:inv,return:ret,roi:inv?ret/inv:null};}
const by=(rows,get,values)=>Object.fromEntries(values.map(v=>[v,raceStats(rows.filter(r=>get(r)===v))]));
function group(rows,select){const yes=rows.filter(select),no=rows.filter(r=>!select(r));return{selected:raceStats(yes),nonSelected:raceStats(no)};}
export function evaluate(dataset){
  const rows=dataset.rows;
  const groups={
    HIGH_CONFIDENCE_PURCHASEABLE:r=>r.preResult.confidenceBand==='HIGH'&&r.preResult.purchaseable,
    MEDIUM_CONFIDENCE_PURCHASEABLE:r=>r.preResult.confidenceBand==='MEDIUM'&&r.preResult.purchaseable,
    HIGH_CONCENTRATION_PURCHASEABLE:r=>r.preResult.concentration==='HIGH'&&r.preResult.purchaseable,
    LOW_TICKET_COUNT_PURCHASEABLE:r=>r.preResult.ticketCount<=3&&r.preResult.purchaseable,
    WARNING:r=>r.preResult.warnings.displayWarning,
    PARTIAL_DATA:r=>r.preResult.warnings.partialData
  };
  const candidateGroups=Object.fromEntries(Object.entries(groups).map(([k,f])=>[k,group(rows,f)]));
  const thick=ticketStats(rows,t=>t.thick),nonThick=ticketStats(rows,t=>!t.thick),mainThick=ticketStats(rows,t=>t.class==='MAIN'&&t.thick),coverThick=ticketStats(rows,t=>t.class==='COVER'&&t.thick);
  let clearCliff=0,noCliffThick=0,clearCliffNoThick=0;
  for(const r of rows){const q=r.preResult.cliff,b=Number(q?.boundary?.gap),isClear=q?.smallSampleSeparation===true||(Number.isFinite(b)&&Number.isFinite(q?.threshold)&&b>q.threshold);if(isClear)clearCliff++;const has=r.tickets.some(t=>t.thick);if(has&&!isClear)noCliffThick++;if(!has&&isClear)clearCliffNoThick++;}
  const ranked=Object.entries(candidateGroups).filter(([,v])=>v.selected.purchaseableCount>=3&&v.selected.roi!=null).sort((a,b)=>b[1].selected.roi-a[1].selected.roi);
  return{schemaVersion:dataset.schemaVersion,datasetHash:hash(dataset),evaluatedRaces:rows.length,cohortPolicy:dataset.cohortPolicy,
    confidence:by(rows,r=>r.preResult.confidenceBand,['HIGH','MEDIUM','LOW','UNKNOWN']),concentration:by(rows,r=>r.preResult.concentration,['HIGH','MEDIUM','LOW','UNKNOWN']),
    purchaseability:by(rows,r=>r.preResult.purchaseability,['PURCHASEABLE','WARNING','INELIGIBLE']),candidateGroups,bestDiagnosticGroup:ranked[0]?.[0]||null,
    thick:{all:thick,main:mainThick,cover:coverThick,nonThick,sameRace:{note:'Ticket-level 100-yen flat comparison within the same evaluated races',thick,nonThick}},
    cliff:{clearCliff,noCliffThick,clearCliffNoThick},futureHoleHighPayout:{status:'READY_WITH_UNKNOWN_ODDS',fields:['oddsBand','predictiveSupport','purchaseSupport','highPayout','warning','confidence'],oddsMissing:rows.reduce((s,r)=>s+r.tickets.filter(t=>t.oddsBand==='UNKNOWN').length,0)},
    recommendationSelectionAppearsUseful:ranked.length&&ranked[0][1].selected.roi>ranked[0][1].nonSelected.roi?'DESCRIPTIVE_YES':'NO_OR_INSUFFICIENT',
    verdict:rows.length<50?'EVAL_DATA_INSUFFICIENT':'RECOMMENDATION_EVAL_BASE_READY',productionPredictionChanged:false,productionPurchaseChanged:false,researchMeaningChanged:false,historicalMutationCount:0};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const source=JSON.parse(fs.readFileSync(new URL('./thick-readonly-audit-results.json',import.meta.url)));
  const held=JSON.parse(fs.readFileSync(new URL('./thick-v2-shadow-cohort.json',import.meta.url)));
  const dataset=buildDataset(source,{auditRaceKeys:[],heldOutRaceKeys:held.raceKeys});
  console.log(JSON.stringify({dataset,evaluation:evaluate(dataset)},null,2));
}
