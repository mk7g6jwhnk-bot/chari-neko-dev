// Offline only: reads an existing lifecycle JSON export. No network or store writes.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {predictionQualificationScore,qualifyThickPredictionBets} from '../public/purchase-funding.mjs';
import {scenarioConcentration} from './scenario-purchase-shadow-v1.mjs';
import {derivePredictionRatings} from '../public/prediction-ratings.mjs';
import {createSnapshot} from '../public/prediction-store.mjs';

const key=x=>(Array.isArray(x)?x:String(x||'').match(/\d+/g)||[]).map(Number).join('-');
const thick=x=>x.thickQualified===true||x.qualification==='THICK_PREDICTION_QUALIFIED';
const cls=x=>x.betClass||x.category;
const finite=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
const counts=a=>a.reduce((o,x)=>(o[x]=(o[x]||0)+1,o),{});
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
function distribution(a){const s=[...a].sort((a,b)=>a-b),q=p=>{if(!s.length)return null;const i=(s.length-1)*p;return s[Math.floor(i)]+(s[Math.ceil(i)]-s[Math.floor(i)])*(i%1)};return{n:a.length,mean:mean(a),median:q(.5),p75:q(.75),p90:q(.9),max:s.at(-1)??null};}
function prediction(r){const p=r?.sealed?.researchPrediction;return p?.performanceSchemaVersion?p:p?.prediction||p||{};}
function quality(p){const explicit=p.predictionQuality||p.quality;const map={高:'HIGH',中:'MEDIUM',低:'LOW',HIGH:'HIGH',MEDIUM:'MEDIUM',LOW:'LOW'};if(map[explicit])return map[explicit];const rating=p.predictionRatings||p.ratings;const c=finite(rating?.confidence),d=finite(rating?.concentration);return c===null||d===null?'UNKNOWN':c>=4&&d>=4?'HIGH':c<=2||d<=2?'LOW':'MEDIUM';}
function plan(p){for(const a of [p.canonicalPurchasePlan?.standardTickets,p.standardPurchasePlan,p.purchase?.standardPurchasePlan,p.betSelections])if(Array.isArray(a))return a.filter(x=>['MAIN','COVER'].includes(cls(x)));return[];}
function race(r){
  const p=prediction(r),rows=plan(p),e=p.purchaseEligibility||p.audit?.purchaseEligibility||p.purchase?.eligibility,canPurchase=p.noBet===true?false:typeof e?.canPurchase==='boolean'?e.canPurchase:null;
  const hasRatingInputs=Boolean(p.displayRatingInputs||p.audit?.branchSelectionAudit?.rows?.length||p.branches?.length);
  const rating=p.displayRatings||p.predictionRatings||(hasRatingInputs?derivePredictionRatings({noBet:p.noBet,purchaseEligibility:e,betSelections:rows.map(x=>({...x,category:cls(x)})),abilitiesUsed:p.scored||[],branches:p.branches||[],targetRace:r.ratingRace||{},predictionOutput:{audit:p.audit||{},displayRatingInputs:p.displayRatingInputs,lineConfidence:p.lineConfidence,lineMode:r.ratingRace?.lineMode||p.lineMode}}):null);
  const q=quality({...p,predictionRatings:rating});
  const lifecycle=p.purchase?.audit?.terminalLifecycleAudit||p.audit?.purchaseAudit?.terminalLifecycleAudit;
  const natural=Array.isArray(lifecycle)?lifecycle:lifecycle?.rows;
  const concentration=natural?.length?scenarioConcentration(r).level.replace('_CONCENTRATION',''):'UNKNOWN';
  const snapshot={betSelections:rows.map(x=>({...x,category:cls(x)})),purchaseEligibility:e,noBet:p.noBet};
  const replay=new Set(qualifyThickPredictionBets(snapshot).map(x=>key(x.order)));
  const [date,venueCode,raceNo]=String(r.raceKey).split('-');
  const uiSnapshot=createSnapshot({prediction:{...p,standardPurchasePlan:rows},race:{...r.ratingRace,date,venueCode,raceNo,lineMode:r.ratingRace?.lineMode||'official_line'}},new Date(0));
  const uiReplay=qualifyThickPredictionBets(uiSnapshot).map(x=>key(x.order));
  const main=rows.filter(x=>cls(x)==='MAIN').sort((a,b)=>predictionQualificationScore(b)-predictionQualificationScore(a));
  const positive=main.map(predictionQualificationScore).filter(x=>x>0),gaps=positive.slice(0,-1).map((x,i)=>x-positive[i+1]),median=a=>distribution(a).median??0;
  const center=median(gaps),mad=median(gaps.map(x=>Math.abs(x-center))),noise=Math.max(center,1.4826*mad,Number.EPSILON);
  const boundary=gaps.map((gap,index)=>({gap,index,strength:(gap-center)/noise})).sort((a,b)=>b.strength-a.strength||b.gap-a.gap||a.index-b.index)[0];
  const small=positive.length<=4&&boundary?.gap>0&&boundary.gap>([...gaps].sort((a,b)=>b-a)[1]||0)*1.8;
  const naturalSorted=(natural||[]).filter(x=>['ADOPTED','THIRD_VARIANT_AMBIGUITY','THIRD_VARIANT_BOUNDARY'].includes(x.purchaseRejectCode)).sort((a,b)=>(b.probability||0)-(a.probability||0)||key(a.order).localeCompare(key(b.order),'en'));
  const familyRanks=n=>{const m=new Map();for(const t of natural||[]){const k=key(t.order).split('-').slice(0,n).join('-');m.set(k,(m.get(k)||0)+(Number(t.probability)||0));}return new Map([...m].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'en')).map(([k],i)=>[k,i+1]));};
  const firstRanks=familyRanks(1),pairRanks=familyRanks(2);
  const result=r.result?.result||{},finish=key(result.finishOrder),payout=finite(result.payout??result.trifectaPayout);
  return{raceKey:r.raceKey,sealedAt:r.sealed?.predictionSealedAt,engineVersion:p.engineVersion,quality:q,rating:rating?{confidence:rating.confidence,concentration:rating.concentration}:null,qualitySource:p.displayRatings||p.predictionRatings?'SAVED_RATING':hasRatingInputs?'RECONSTRUCTED_FROM_SEALED_INPUTS':'SAVED_QUALITY_OR_UNKNOWN',concentration,canPurchase,display:canPurchase===false?'見送り':canPurchase===null||q==='UNKNOWN'?'UNKNOWN':q==='HIGH'?'通常':'注意',
    uiThickOrders:uiReplay,qualificationBoundary:{mainCount:main.length,positiveCount:positive.length,medianGap:center,madGap:mad,threshold:center+2.5*1.4826*mad,boundary:boundary||null,smallSampleSeparation:Boolean(small),rule:small?'SMALL_SAMPLE_1.8_GAP':'MEDIAN_PLUS_2.5_SCALED_MAD'},
    confirmed:result.status==='confirmed',temporalValid:r.temporalAudit?.passed===true,verificationValid:Boolean(r.verification&&!r.verification.mutationDetected),finish,payout,
    tickets:rows.map(x=>({order:key(x.order||x.combination),category:cls(x),thick:thick(x),replayed:replay.has(key(x.order)),savedScore:finite(x.predictionQualificationScore),replayedScore:predictionQualificationScore(x),mainScoreRank:main.indexOf(x)<0?null:main.indexOf(x)+1,terminalModelWeight:finite(x.probability),naturalConvergenceScore:finite(x.naturalConvergenceScore),familyRank:x.familyRank??null,nodeConditionalProbability:x.nodeConditionalProbability??null,scenarioCoherence:x.scenarioCoherence??null,globalRank:x.globalRank??null,pairRank:x.pairRank??null,firstRank:x.firstRank??x.firstFamilyRank??null,derivedFirstMassRank:firstRanks.get(key(x.order).split('-')[0])??null,derivedPairMassRank:pairRanks.get(key(x.order).split('-').slice(0,2).join('-'))??null,scenarioSupport:x.scenarioFamilySupport??null,branchSupport:x.supportingBranches??null,branchFit:x.branchFit??null,naturalSeparation:x.naturalSeparation??null,naturalBoundaryPosition:naturalSorted.findIndex(y=>key(y.order)===key(x.order))>=0?naturalSorted.findIndex(y=>key(y.order)===key(x.order))+1:null}))};
}
const rules={T0:r=>true,T1:r=>['HIGH','MEDIUM'].includes(r.quality),T2:r=>['HIGH','MEDIUM'].includes(r.quality)&&['HIGH','MEDIUM'].includes(r.concentration)};
function performance(races,select){let betRaces=0,tickets=0,hitRaces=0,ticketHits=0,returned=0;const hits=[];for(const r of races){const ts=r.canPurchase===true?r.tickets.filter(t=>select(r,t)):[];tickets+=ts.length;if(ts.length)betRaces++;const n=ts.filter(t=>t.order===r.finish).length;if(n){hitRaces++;ticketHits+=n;returned+=r.payout*n;hits.push({raceKey:r.raceKey,order:r.finish,payout:r.payout});}}return{eligibleRaces:races.filter(r=>r.canPurchase===true).length,betRaces,tickets,hitRaces,ticketHits,hitRate:betRaces?hitRaces/betRaces:null,ticketHitRate:tickets?ticketHits/tickets:null,investment:tickets*100,return:returned,roi:tickets?returned/(tickets*100):null,hits};}
export function auditThick(records,{sourceTotalV2=null}={}){
  if(!Array.isArray(records))throw Error('Expected complete lifecycle record array');
  const ids=new Set();for(const r of records){if(!r.raceKey||ids.has(r.raceKey))throw Error('Missing or duplicate raceKey; resolve overlay before evaluation');ids.add(r.raceKey);}
  const all=records.filter(r=>prediction(r).performanceSchemaVersion==='PURCHASE_PERFORMANCE_V2').map(race).sort((a,b)=>String(b.sealedAt).localeCompare(String(a.sealedAt))),sample=all.slice(0,100);
  for(const r of all)if(new Set(r.tickets.map(t=>t.order)).size!==r.tickets.length)throw Error('Duplicate tickets: '+r.raceKey);
  const confirmed=all.filter(r=>r.confirmed),eligible=confirmed.filter(r=>r.temporalValid&&r.verificationValid&&/^\d+-\d+-\d+$/.test(r.finish)&&r.payout!==null);
  const thickRaces=sample.filter(r=>r.tickets.some(t=>t.thick)),allowed=sample.filter(r=>r.canPurchase===true);
  const shadows=Object.fromEntries(Object.entries(rules).map(([id,rule])=>[id,performance(eligible,(r,t)=>t.thick&&rule(r))]));
  for(const v of Object.values(shadows))v.lostControlHits=shadows.T0.hits.filter(h=>!v.hits.some(x=>x.raceKey===h.raceKey));
  return{status:'READ_ONLY_AUDIT_NOT_PROMOTABLE',productionWriteAllowed:false,autoPromotion:false,totalV2:sourceTotalV2??all.length,extractedV2:all.length,confirmed:confirmed.length,performanceEligible:eligible.length,excludedConfirmed:confirmed.filter(r=>!eligible.includes(r)).map(r=>({raceKey:r.raceKey,temporalValid:r.temporalValid,verificationValid:r.verificationValid,payout:r.payout})),
    distribution:{sample:sample.length,purchaseAllowed:allowed.length,thickRaces:thickRaces.length,noThickRaces:sample.length-thickRaces.length,thickTickets:sample.reduce((s,r)=>s+r.tickets.filter(t=>t.thick).length,0),allowedThickRate:allowed.length?allowed.filter(r=>r.tickets.some(t=>t.thick)).length/allowed.length:null,all:distribution(sample.map(r=>r.tickets.filter(t=>t.thick).length)),allowed:distribution(allowed.map(r=>r.tickets.filter(t=>t.thick).length)),thickOnly:distribution(thickRaces.map(r=>r.tickets.filter(t=>t.thick).length))},
    crossTabs:Object.fromEntries(['quality','display','concentration','canPurchase'].map(k=>[k,counts(thickRaces.map(r=>String(r[k])))])),jointCrossTab:counts(thickRaces.map(r=>[r.quality,r.display,r.concentration,r.canPurchase].join('|'))),
    invariants:{blockedWithSavedThick:all.filter(r=>r.canPurchase===false&&r.tickets.some(t=>t.thick)).map(r=>r.raceKey),nonMainThick:all.filter(r=>r.tickets.some(t=>t.thick&&t.category!=='MAIN')).map(r=>r.raceKey),replayMismatch:all.filter(r=>r.tickets.some(t=>t.thick!==t.replayed)).map(r=>r.raceKey)},
    thickPerformance:shadows.T0,nonThickMainPerformance:performance(eligible,(r,t)=>t.category==='MAIN'&&!t.thick),
    qualityPerformance:Object.fromEntries(['HIGH','MEDIUM','LOW','UNKNOWN'].map(q=>[q,performance(eligible.filter(r=>r.quality===q),(r,t)=>t.thick)])),
    concentrationPerformance:Object.fromEntries(['HIGH','MEDIUM','LOW','UNKNOWN'].map(q=>[q,performance(eligible.filter(r=>r.concentration===q),(r,t)=>t.thick)])),shadows,races:all,
    limitations:['Quality uses saved ratings or production display code replay on sealed structural inputs; absent evidence is UNKNOWN.','Concentration uses existing scenario shadow definition, not display rating concentration. Missing lifecycle evidence is UNKNOWN.','T1/T2 suppress UNKNOWN; candidate endorsement requires evidence completeness.','Saved thick flags define CONTROL; replay mismatches are not silently substituted.','naturalBoundaryPosition is weight rank among existing natural survivors; derivedFirstMassRank/derivedPairMassRank aggregate saved lifecycle weights, not calibrated confidence.','Fixed T1/T2 only; no result-optimized thresholds or T3 without calibrated confidence evidence.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const input=process.argv[2];if(!input)throw Error('Usage: node research/thick-readonly-audit.mjs lifecycle-export.json > audit-output.json');const bytes=await fs.readFile(input),before=crypto.createHash('sha256').update(bytes).digest('hex'),parsed=JSON.parse(bytes);const report=auditThick(Array.isArray(parsed)?parsed:parsed.records,{sourceTotalV2:parsed.totalV2??null});const after=crypto.createHash('sha256').update(await fs.readFile(input)).digest('hex');if(before!==after)throw Error('Input changed during audit');console.log(JSON.stringify({...report,inputSha256:before,inputUnchanged:true},null,2));}
