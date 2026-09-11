const n=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value):null;
const order=value=>(Array.isArray(value)?value:String(value||'').match(/\d+/g)||[]).map(Number);
const key=value=>order(value).join('-');
const pair=value=>order(value).slice(0,2).join('-');
const uniq=(rows,selector)=>[...new Map(rows.map(row=>[selector(row),row])).values()];
const ratio=(a,b)=>b?a/b:null;

function officialPayout(result,type){
  const payouts=result?.officialResult?.payouts||result?.payouts||{};
  const aliases=type==='2tan'?['exacta','twoTan','2tan','二車単']:['trifecta','3tan','三連単'];
  for(const name of aliases){
    const rows=Array.isArray(payouts[name])?payouts[name]:[];
    const hit=rows.find(x=>key(x.combination||x.order)===key(result.officialResult?.finishOrder||result.finishOrder).split('-').slice(0,type==='2tan'?2:3).join('-'))||rows[0];
    const value=n(hit?.payout);if(value!==null)return value;
  }
  return type==='3tan'?n(result?.officialResult?.payout??result?.payout):null;
}

function terminalRows(prediction){
  const p=prediction?.predictionPayload?.prediction||prediction?.prediction||prediction||{};
  const saved=p.canonicalPurchasePlan?.standardTickets||p.standardPurchasePlan||p.purchase?.standardPurchasePlan||[];
  const lifecycle=p.purchase?.audit?.terminalLifecycleAudit?.rows||p.audit?.purchaseAudit?.terminalLifecycleAudit?.rows||p.terminals||[];
  return{p,standard:Array.isArray(saved)?saved:[],lifecycle:Array.isArray(lifecycle)?lifecycle:[]};
}

function raceRow(input){
  const {p,standard,lifecycle}=terminalRows(input.prediction),official=input.result?.officialResult||input.result||{},finish=order(official.finishOrder),correct=finish.slice(0,3).join('-'),correctPair=finish.slice(0,2).join('-');
  const allPairs=uniq(lifecycle.filter(x=>order(x.order||x.combination).length===3),x=>pair(x.order||x.combination));
  const natural=lifecycle.filter(x=>['ADOPTED','THIRD_VARIANT_AMBIGUITY','THIRD_VARIANT_BOUNDARY'].includes(x.purchaseRejectCode)||x.naturalBoundarySurvivor===true);
  const standardPairs=uniq(standard.filter(x=>order(x.order||x.combination).length===3),x=>pair(x.order||x.combination));
  const correctTerminals=lifecycle.filter(x=>pair(x.order||x.combination)===correctPair).sort((a,b)=>(n(a.globalRank)??999)-(n(b.globalRank)??999));
  const resultStatus=String(official.status||'').toLowerCase(),abnormal=Boolean(input.abnormal||input.result?.abnormal||['cancelled','canceled','refund','refunded'].includes(resultStatus));
  return{raceKey:input.raceKey,date:String(input.raceKey||'').slice(0,8),venueCode:String(input.raceKey||'').split('-')[1]||'',raceClass:input.raceClass||'UNKNOWN',canPurchase:p.purchaseEligibility?.canPurchase===true&&!p.noBet,resultComplete:resultStatus==='confirmed'&&finish.length===3,abnormal,abnormalAuditKnown:input.abnormalAuditKnown===true||input.abnormal!==undefined||input.result?.abnormal!==undefined||['cancelled','canceled','refund','refunded'].includes(resultStatus),finish:correct,correctPair,
    exactaPayout:officialPayout(input.result,'2tan'),trifectaPayout:officialPayout(input.result,'3tan'),standard,standardPairs,allPairs,natural,correctTerminals,
    pairGenerated:allPairs.some(x=>pair(x.order||x.combination)===correctPair),pairNatural:natural.some(x=>pair(x.order||x.combination)===correctPair),pairMain:standard.some(x=>pair(x.order||x.combination)===correctPair&&String(x.betClass||x.category).toUpperCase()==='MAIN'),pairCover:standard.some(x=>pair(x.order||x.combination)===correctPair&&String(x.betClass||x.category).toUpperCase()==='COVER'),pairPurchased:standardPairs.some(x=>pair(x.order||x.combination)===correctPair),pairRank:Math.min(...correctTerminals.map(x=>n(x.derivedPairMassRank??x.pairMassRank??x.pairRank)).filter(Number.isFinite),Infinity)||null,
    trifectaHit:standard.some(x=>key(x.order||x.combination)===correct),pairHit:standardPairs.some(x=>pair(x.order||x.combination)===correctPair)};
}

function performance(rows,type){
  let races=0,tickets=0,hits=0,returned=0,payoutKnown=0;
  for(const r of rows){const ts=type==='2tan'?r.standardPairs:r.standard;if(!r.canPurchase||!ts.length)continue;races++;tickets+=ts.length;const hit=type==='2tan'?r.pairHit:r.trifectaHit;if(hit)hits++;const payout=type==='2tan'?r.exactaPayout:r.trifectaPayout;if(payout!==null){payoutKnown++;if(hit)returned+=payout;}}
  const monetaryComplete=payoutKnown===races;
  return{targetRaces:rows.length,purchaseCandidateRaces:races,tickets,averageTicketsPerRace:ratio(tickets,races),hitRaces:hits,hitRate:ratio(hits,races),ticketHitRate:ratio(hits,tickets),investment:monetaryComplete?tickets*100:null,return:monetaryComplete?returned:null,roi:monetaryComplete?ratio(returned,tickets*100):null,payoutKnownRaces:payoutKnown,monetaryComplete};
}

function periods(rows,asOf){const end=new Date(`${asOf.slice(0,4)}-${asOf.slice(4,6)}-${asOf.slice(6,8)}T23:59:59Z`),start=days=>{const x=new Date(end);x.setUTCDate(x.getUTCDate()-days+1);return x.toISOString().slice(0,10).replaceAll('-','')};return{recent7:rows.filter(x=>x.date>=start(7)),recent30:rows.filter(x=>x.date>=start(30)),cumulative:rows};}

export function audit2Tan(inputs,{asOf=null}={}){
  const races=inputs.map(raceRow),complete=races.filter(x=>x.resultComplete),statusClean=complete.filter(x=>!x.abnormal&&x.canPurchase&&x.trifectaPayout!==null),formal=statusClean.filter(x=>x.abnormalAuditKnown&&x.exactaPayout!==null),latest=asOf||statusClean.map(x=>x.date).sort().at(-1)||'19700101';
  const periodMetrics=Object.fromEntries(Object.entries(periods(statusClean,latest)).map(([name,rows])=>[name,{races:rows.length,trifecta:performance(rows,'3tan'),exacta:performance(rows,'2tan')}])) , both=statusClean.filter(x=>x.trifectaHit&&x.pairHit),pairOnly=statusClean.filter(x=>!x.trifectaHit&&x.pairHit),trifectaOnly=statusClean.filter(x=>x.trifectaHit&&!x.pairHit),neither=statusClean.filter(x=>!x.trifectaHit&&!x.pairHit);
  const thirdDrops=pairOnly.map(r=>{const terminals=r.correctTerminals,correctThird=Number(r.finish.split('-')[2]),thirds=uniq(terminals,x=>String(order(x.order||x.combination)[2]));const idx=thirds.findIndex(x=>order(x.order||x.combination)[2]===correctThird);return{raceKey:r.raceKey,correctPair:r.correctPair,correctTerminal:r.finish,generated:terminals.some(x=>key(x.order||x.combination)===r.finish),minimumFixedThirdSpread:idx<0?null:idx+1,dropStage:!terminals.length?'TERMINAL_NOT_GENERATED':!r.pairNatural?'NATURAL_BOUNDARY':terminals.some(x=>x.purchaseRejectCode==='THIRD_VARIANT_BOUNDARY'||x.purchaseRejectCode==='THIRD_VARIANT_AMBIGUITY')?'THIRD_VARIANT':!r.trifectaHit?'STANDARD_PURCHASE':'NONE'};});
  const pairTracking={generated:statusClean.filter(x=>x.pairGenerated).length,natural:statusClean.filter(x=>x.pairNatural).length,main:statusClean.filter(x=>x.pairMain).length,cover:statusClean.filter(x=>x.pairCover).length,purchased:statusClean.filter(x=>x.pairPurchased).length,rankKnown:statusClean.filter(x=>Number.isFinite(x.pairRank)).length,meanRank:null};const ranks=statusClean.map(x=>x.pairRank).filter(Number.isFinite);pairTracking.meanRank=ranks.length?ranks.reduce((a,b)=>a+b,0)/ranks.length:null;
  const spread={};for(let k=1;k<=5;k++){const eligible=pairOnly.filter(x=>x.correctTerminals.length),hits=thirdDrops.filter(x=>x.minimumFixedThirdSpread!==null&&x.minimumFixedThirdSpread<=k).length;spread[`top${k}`]={eligiblePairHitRaces:eligible.length,hitRaces:hits,additionalTickets:eligible.length*k,investment:eligible.length*k*100,return:null,roi:null,reason:'No canonical exacta/conditional-third payout is stored; result-derived monetary claims are prohibited.'};}
  const byVenue=Object.fromEntries([...new Set(statusClean.map(x=>x.venueCode))].sort().map(code=>{const rows=statusClean.filter(x=>x.venueCode===code);return[code,{races:rows.length,trifecta:performance(rows,'3tan'),exacta:performance(rows,'2tan'),smallSample:rows.length<20}]}));
  return{schemaVersion:'2TAN_READ_ONLY_AUDIT_V1',decision:'MORE_DATA_REQUIRED',inputs:inputs.length,resultComplete:complete.length,formalCohort:formal.length,statusCleanDescriptiveCohort:statusClean.length,formalBlockers:['Canonical 2車単 payout is absent from every sealed result.','Independent incident/失格 metadata is not exposed by the sealed-result read API; confirmed status alone cannot prove a race normal.'],excluded:{abnormal:complete.filter(x=>x.abnormal).map(x=>x.raceKey),abnormalAuditUnknown:statusClean.filter(x=>!x.abnormalAuditKnown).length,notPurchaseEligible:complete.filter(x=>!x.canPurchase).length,missingTrifectaPayout:complete.filter(x=>x.trifectaPayout===null).length,missingCanonicalExactaPayout:statusClean.filter(x=>x.exactaPayout===null).length},descriptivePeriods:periodMetrics,headToHeadDescriptive:{both:both.length,pairOnly:pairOnly.length,trifectaOnly:trifectaOnly.length,neither:neither.length,pairRightThirdWrong:pairOnly.length},pairTrackingDescriptive:pairTracking,thirdDropsDescriptive:thirdDrops,thirdSpreadDescriptive:spread,venueDescriptive:byVenue,classBreakdown:{UNKNOWN:{races:statusClean.length,reason:'Race class was not retained by the sealed read projection.'}},highPayout:{formalStatus:'NOT_EVALUABLE_WITHOUT_SAVED_PRE_RESULT_EXACTA_ODDS_AND_CANONICAL_EXACTA_PAYOUT',caseStudies:[]},strategies:{P1:{name:'2車単単独',status:'HIT_RATE_ONLY'},P2:{name:'Hybrid',status:'NOT_EVALUABLE_NO_CALIBRATED_PAIR_CONFIDENCE'},P3:{name:'Pair + fixed third spread',status:'HIT_COVERAGE_ONLY',fixed:[1,2,3,4,5]}},safety:{predictionRankingChanged:false,productionPurchaseChanged:false,researchBaselineChanged:false,historicalMutation:0,abnormalRaceIncludedInFormalKpi:false,finalTest403To502TuningUse:false,productionWrite:0}};
}
