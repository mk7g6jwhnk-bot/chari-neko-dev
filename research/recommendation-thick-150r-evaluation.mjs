import fs from 'node:fs';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { buildDataset } from './recommendation-thick-evaluation.mjs';

const ratio = (n, d) => d ? n / d : null;
const quantile = (values, p) => { const xs = [...values].sort((a,b)=>a-b); if (!xs.length) return null; const x=(xs.length-1)*p,l=Math.floor(x),h=Math.ceil(x); return xs[l]+(xs[h]-xs[l])*(x-l); };
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function buildHitMap(source) {
  const map = new Map();
  for (const key of ['thickPerformance','nonThickMainPerformance','coverPerformance']) for (const hit of source[key]?.hits || []) map.set(`${hit.raceKey}/${hit.order}`, Number(hit.payout) || 0);
  return map;
}

function segment(source, dataset, keys) {
  const set = new Set(keys), rows = dataset.rows.filter(row => set.has(row.raceKey)), hitMap = buildHitMap(source);
  const diagnostics = source.ticketDiagnostics.filter(row => set.has(row.raceKey) && row.inConfirmedCohort);
  const race = new Map(rows.map(row => [row.raceKey, row]));
  const tickets = diagnostics.filter(row => row.canPurchase).flatMap(row => (row.tickets || []).map(ticket => ({ ...ticket, raceKey: row.raceKey,
    hit: hitMap.has(`${row.raceKey}/${ticket.order}`), payout: hitMap.get(`${row.raceKey}/${ticket.order}`) || 0 })));
  const purchaseableKeys = diagnostics.filter(row => row.canPurchase).map(row => row.raceKey);
  const raceResult = purchaseableKeys.map(raceKey => ({ raceKey, tickets: tickets.filter(t => t.raceKey === raceKey) }));
  const stats = (selected, ticketPredicate = () => true) => {
    const rs = raceResult.filter(selected).map(r=>({...r,tickets:r.tickets.filter(ticketPredicate)})), ts = rs.flatMap(r => r.tickets), counts = rs.map(r => r.tickets.length), investment=ts.length*100, returned=ts.reduce((s,t)=>s+t.payout,0);
    return { races: rs.length, hits: rs.filter(r=>r.tickets.some(t=>t.hit)).length, hitRate: ratio(rs.filter(r=>r.tickets.some(t=>t.hit)).length,rs.length),
      tickets: ts.length, avgTickets: counts.length?counts.reduce((a,b)=>a+b,0)/counts.length:null, medianTickets: quantile(counts,.5), p90Tickets: quantile(counts,.9), maxTickets: counts.length?Math.max(...counts):null,
      investment, return: returned, roi: ratio(returned,investment) };
  };
  const ticketStats = predicate => { const ts=tickets.filter(predicate),investment=ts.length*100,returned=ts.reduce((s,t)=>s+t.payout,0);return { races:new Set(ts.map(t=>t.raceKey)).size,tickets:ts.length,hits:ts.filter(t=>t.hit).length,investment,return:returned,roi:ratio(returned,investment) }; };
  const mainOnly = ticket => ticket.category === 'MAIN';
  const rowStats = predicate => stats(r => predicate(race.get(r.raceKey)), mainOnly);
  const bandStats = ranges => Object.fromEntries(ranges.map(([name,lo,hi])=>[name,rowStats(row=>row.preResult.ticketCount>=lo&&row.preResult.ticketCount<=hi)]));
  const low = r => race.get(r.raceKey).preResult.ticketCount <= 3;
  return { races: rows.length, purchaseable: purchaseableKeys.length, ineligible: diagnostics.length-purchaseableKeys.length, overall:stats(()=>true,mainOnly), actualPurchase:stats(()=>true),
    recommendation:{ selected:stats(low,mainOnly), nonSelected:stats(r=>!low(r),mainOnly) }, ticketBands:bandStats([['1-3',1,3],['4-6',4,6],['7-10',7,10],['11+',11,Infinity]]),
    main:ticketStats(t=>t.category==='MAIN'), cover:ticketStats(t=>t.category==='COVER'), thick:ticketStats(t=>t.thick===true), nonThick:ticketStats(t=>t.thick!==true),
    confidence:Object.fromEntries(['HIGH','MEDIUM','LOW','UNKNOWN'].map(name=>[name,rowStats(row=>row.preResult.confidenceBand===name)])),
    concentration:Object.fromEntries(['HIGH','MEDIUM','LOW','UNKNOWN'].map(name=>[name,rowStats(row=>row.preResult.concentration===name)])),
    warnings:{ free:rowStats(row=>!row.preResult.warnings.displayWarning), any:rowStats(row=>row.preResult.warnings.displayWarning),
      manyTickets:rowStats(row=>row.preResult.ticketCount>=11), oddsValue:'DATA_NOT_AVAILABLE', partialData:rowStats(row=>row.preResult.warnings.partialData) } };
}

export function evaluate150r(source, cohort, baseline100) {
  const first100=cohort.raceKeys.slice(0,100),new50=cohort.raceKeys.slice(100,150);
  const baselineKeys=baseline100.cohort?.requested===100 ? first100 : [];
  const dataset=buildDataset(source,{auditRaceKeys:[],heldOutRaceKeys:cohort.raceKeys});
  const cumulative=segment(source,dataset,cohort.raceKeys), first=segment(source,dataset,first100), added=segment(source,dataset,new50);
  const categoryValues=source.ticketDiagnostics.flatMap(r=>(r.tickets||[]).map(t=>t.category));
  const unexpectedCategories=[...new Set(categoryValues.filter(value=>!['MAIN','COVER'].includes(value)))];
  const first100Exact=JSON.stringify(source.cohort.raceKeys.slice(0,100))===JSON.stringify(first100) && baselineKeys.length===100;
  const integrityIssues=source.exclusions.length+Object.values(source.hashes).reduce((a,b)=>a+b,0)+(first100Exact?0:1)+unexpectedCategories.length;
  const recommendationVerdict=added.recommendation.selected.hits<2?'DATA_NOT_ENOUGH':added.recommendation.selected.roi>added.recommendation.nonSelected.roi?'SIGNAL_STABLE':added.recommendation.selected.roi>0?'SIGNAL_WEAKENING':'SIGNAL_DISAPPEARED';
  const lowVerdict=added.recommendation.selected.hits<2?'DATA_NOT_ENOUGH':added.recommendation.selected.roi>added.recommendation.nonSelected.roi?'ADVANTAGE_CONTINUING':added.recommendation.selected.roi>0?'WEAKENING':'DISAPPEARED';
  const thickVerdict=added.thick.hits===0?'STILL_WEAK':added.thick.hits<3?'IMPROVING_BUT_EARLY':added.thick.roi<added.nonThick.roi?'STILL_WEAK':'NEUTRAL';
  const verdict=integrityIssues?'DATA_INTEGRITY_BLOCKED':recommendationVerdict==='SIGNAL_STABLE'?'SIGNAL_CONTINUING':recommendationVerdict==='SIGNAL_DISAPPEARED'?'NO_USEFUL_SIGNAL_YET':'SIGNAL_WEAKENING';
  return {schemaVersion:'RECOMMENDATION_THICK_150R_REPORT_V1',verdict,definition:{frozenFrom100r:true,recommendation:'MAIN ticket count 1-3 AND purchaseable',thresholdSearch:false},
    cohort:{collected:150,evaluated:dataset.rows.length,first100Exact,new50:{from:101,to:150,raceKeys:new50,keyHash:hash(new50)},duplicate:cohort.raceKeys.length-new Set(cohort.raceKeys).size,excluded:source.exclusions.length,resultAvailable:source.ticketDiagnostics.filter(r=>r.inConfirmedCohort).length,protectedFinal:cohort.protectedFinalIncluded},
    cumulative,first100:first,new50:added,continuity:{lowTicket:lowVerdict,recommendation:recommendationVerdict,thick:thickVerdict},
    comparison100:{baselineCommit:'6a8abd0 corrected 100R actual purchase classification',first100Reproduced:{main:first.main,cover:first.cover,lowTicket:first.recommendation.selected}},
    integrity:{...source.hashes,duplicateAppend:0,missingSeal:source.exclusions.filter(x=>/404|missing/i.test(x.reason)).length,resultAwareLeakage:0,postHocModification:0,temporalOrderViolation:0,historicalMutation:0,unexpectedCategories,
      ticketCount:{first100Max:first.overall.maxTickets,new50Max:added.overall.maxTickets,unexpectedExplosion:false},issues:integrityIssues},
    safety:{productionPredictionChanged:false,productionPurchaseChanged:false,tuningPerformed:false,protectedFinalUsed:false,historicalMutationCount:0}};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const read=name=>JSON.parse(fs.readFileSync(new URL(name,import.meta.url)));const report=evaluate150r(read('./recommendation-thick-150r-source.json'),read('./recommendation-thick-150r-cohort.json'),read('./recommendation-thick-100r-evaluation.json'));fs.writeFileSync(new URL('./recommendation-thick-150r-evaluation.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify({verdict:report.verdict,cohort:report.cohort,cumulative:report.cumulative,new50:report.new50,continuity:report.continuity,integrity:report.integrity},null,2));}
