import fs from 'node:fs';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';

export const UNKNOWN='UNKNOWN';
export const FEATURES=['terminalModelScore','normalizedTerminalMass','mainRank','mainQualificationGap','mainModelGap','scenarioFamily','scenarioMass','scenarioRank','scenarioSupport','concentration','firstRank','derivedFirstMassRank','firstSupport','pairRank','pairMassRank','pairSupport','branchSupport','branchSupportCount','branchFit','naturalBoundaryRank','naturalConvergence','thirdVariantStatus','ambiguityRescue','quality','display','mainTicketCount','raceTicketCount'];
const num=v=>typeof v==='number'&&Number.isFinite(v)?v:UNKNOWN;
const median=a=>quantile(a,.5);
function quantile(a,p){if(!a.length)return null;const s=[...a].sort((x,y)=>x-y),i=(s.length-1)*p;return s[Math.floor(i)]+(s[Math.ceil(i)]-s[Math.floor(i)])*(i%1);}
const counts=a=>a.reduce((o,k)=>(o[String(k)]=(o[String(k)]||0)+1,o),{});
const ticketId=t=>`${t.raceKey}/${t.order}`;
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');

// Membership is checked BEFORE reading any ticket feature or outcome.
// No date-based approximation and no use of the aggregate prior 114R results.
export function allowedRows(source,cohort){
  if(cohort.sourceIndexRange!=='303-402'||!Array.isArray(cohort.raceKeys)||cohort.raceKeys.length!==100)throw Error('Explicit pre-final-test cohort metadata required');
  const allow=new Set(cohort.raceKeys),seen=new Set();
  const safe=source.ticketDiagnostics.filter(r=>allow.has(r.raceKey)).filter(r=>r.inConfirmedCohort);
  const outcomes=new Map();
  for(const category of ['thickPerformance','nonThickMainPerformance']){
    for(const hit of source[category].hits){
      if(!allow.has(hit.raceKey))continue;
      if(!Number.isFinite(hit.payout))throw Error('Missing allowed payout');
      outcomes.set(`${hit.raceKey}/${hit.order}`,hit.payout);
    }
  }
  return safe.map(r=>{
    if(seen.has(r.raceKey))throw Error('Duplicate race');seen.add(r.raceKey);
    const main=r.mainTickets,qScores=main.map(t=>t.replayedScore).filter(Number.isFinite).sort((a,b)=>b-a),models=main.map(t=>t.terminalModelWeight).filter(Number.isFinite).sort((a,b)=>b-a);
    const tickets=main.map(t=>{
      const id=`${r.raceKey}/${t.order}`,hit=outcomes.has(id),branches=Array.isArray(t.branchSupport)?[...new Set(t.branchSupport)]:null;
      return{raceKey:r.raceKey,order:t.order,control:t.thick===true,hit,payout:hit?outcomes.get(id):0,features:{
        terminalModelScore:num(t.terminalModelWeight),normalizedTerminalMass:UNKNOWN,mainRank:num(t.mainScoreRank),
        mainQualificationGap:qScores.length>=2?qScores[0]-qScores[1]:UNKNOWN,mainModelGap:models.length>=2?models[0]-models[1]:UNKNOWN,
        scenarioFamily:UNKNOWN,scenarioMass:UNKNOWN,scenarioRank:UNKNOWN,scenarioSupport:num(t.scenarioSupport),concentration:r.concentration||UNKNOWN,
        firstRank:num(t.firstRank),derivedFirstMassRank:num(t.derivedFirstMassRank),firstSupport:UNKNOWN,pairRank:num(t.pairRank),pairMassRank:num(t.derivedPairMassRank),pairSupport:UNKNOWN,
        branchSupport:branches?branches.join('|'):UNKNOWN,branchSupportCount:branches?branches.length:UNKNOWN,branchFit:num(t.branchFit),
        naturalBoundaryRank:num(t.naturalBoundaryPosition),naturalConvergence:num(t.naturalConvergenceScore),thirdVariantStatus:UNKNOWN,ambiguityRescue:UNKNOWN,
        quality:r.quality||UNKNOWN,display:r.display||UNKNOWN,mainTicketCount:main.length,raceTicketCount:UNKNOWN}};
    });
    if(new Set(tickets.map(t=>t.order)).size!==tickets.length)throw Error('Duplicate ticket');
    if(tickets.filter(t=>t.hit).length>1)throw Error('Multiple winners in one race');
    return{raceKey:r.raceKey,canPurchase:r.canPurchase===true,quality:r.quality,display:r.display,concentration:r.concentration,tickets};
  });
}

export function checkCondition(features,[feature,operator,threshold]){
  const value=features[feature]??UNKNOWN;
  const known=value!==UNKNOWN&&value!==null;
  return{feature,operator,threshold,value,known,passed:known&&(operator==='>='?value>=threshold:operator==='<='?value<=threshold:value===threshold)};
}
export function explainCandidate(ticket,rule){
  const checks=(rule.all||rule.of||[]).map(c=>checkCondition(ticket.features,c));
  const absolutePassed=rule.of?checks.filter(x=>x.passed).length>=rule.atLeast:checks.every(x=>x.passed);
  const relativePassed=!rule.requireControl||ticket.control;
  return{qualified:absolutePassed&&relativePassed,absoluteSupport:{checks,requiredCount:rule.atLeast??checks.length,passed:absolutePassed},
    relativeSupport:{required:Boolean(rule.requireControl),savedControl:ticket.control,passed:relativePassed},
    role:{mainRelativeStrength:ticket.control?'SAVED_RELATIVE_TOP_CLUSTER':'OTHER_MAIN',allocationCandidate:absolutePassed&&relativePassed?'SHADOW_ONLY':'NOT_QUALIFIED'},
    reason:!relativePassed?'NOT_IN_SAVED_CONTROL':!absolutePassed?checks.some(x=>!x.known)?'INSUFFICIENT_ABSOLUTE_EVIDENCE':'ABSOLUTE_SUPPORT_FAILED':'ABSOLUTE_SUPPORT_PASSED_UNCALIBRATED',productionWriteAllowed:false};
}
function statistics(tickets,feature){
  const known=tickets.map(t=>t.features[feature]).filter(x=>x!==UNKNOWN&&x!==undefined&&x!==null),numeric=known.filter(x=>typeof x==='number');
  return{n:tickets.length,known:known.length,missing:tickets.length-known.length,missingRate:tickets.length?(tickets.length-known.length)/tickets.length:null,
    median:median(numeric),q25:quantile(numeric,.25),q75:quantile(numeric,.75),min:numeric.length?Math.min(...numeric):null,max:numeric.length?Math.max(...numeric):null,
    categories:known.some(x=>typeof x!=='number')?counts(known):null};
}
function univariate(tickets,definition){
  const hits=tickets.filter(t=>t.hit),miss=tickets.filter(t=>!t.hit);
  return Object.fromEntries(FEATURES.map(f=>{
    const h=statistics(hits,f),m=statistics(miss,f),cut=definition.univariateThresholds[f];
    const hn=hits.map(t=>t.features[f]).filter(x=>typeof x==='number'),mn=miss.map(t=>t.features[f]).filter(x=>typeof x==='number');
    const auc=hn.length&&mn.length?hn.reduce((s,h)=>s+mn.reduce((v,m)=>v+(h>m?1:h===m?.5:0),0),0)/(hn.length*mn.length):null;
    const checks=cut?tickets.map(t=>({t,c:checkCondition(t.features,[f,...cut])})):null;
    return[f,{hit:h,miss:m,effectDirection:h.median===null||m.median===null?'UNDETERMINED':h.median>m.median?'HIGHER_IN_HITS':h.median<m.median?'LOWER_IN_HITS':'EQUAL_MEDIAN',
      pairwiseHigherAUC:auc,interpretation:'DESCRIPTIVE_ONLY_RACE_CLUSTERED_SMALL_SAMPLE',threshold:cut||null,
      thresholdEffect:checks?{retainedHit:checks.filter(x=>x.t.hit&&x.c.passed).length,totalHit:hits.length,removedMiss:checks.filter(x=>!x.t.hit&&!x.c.passed).length,totalMiss:miss.length,
        removedMissKnownFailure:checks.filter(x=>!x.t.hit&&x.c.known&&!x.c.passed).length,removedMissUnknown:checks.filter(x=>!x.t.hit&&!x.c.known).length,removedHitUnknown:checks.filter(x=>x.t.hit&&!x.c.known).length}:null}];
  }));
}
function performance(races,selector){
  const eligible=races.filter(r=>r.canPurchase),selected=eligible.flatMap(r=>r.tickets.filter(t=>selector(t,r))),hits=selected.filter(t=>t.hit),betRaces=new Set(selected.map(t=>t.raceKey)).size,investment=selected.length*100,returned=hits.reduce((s,t)=>s+t.payout,0);
  return{eligibleRaces:eligible.length,thickRaces:betRaces,thickTickets:selected.length,thickRaceRate:eligible.length?betRaces/eligible.length:null,hitRaces:new Set(hits.map(t=>t.raceKey)).size,hitTickets:hits.length,
    raceHitRate:betRaces?new Set(hits.map(t=>t.raceKey)).size/betRaces:null,ticketHitRate:selected.length?hits.length/selected.length:null,investment,return:returned,roi:investment?returned/investment:null,
    lowThickTickets:selected.filter(t=>t.features.quality==='LOW').length,lowThickRaces:new Set(selected.filter(t=>t.features.quality==='LOW').map(t=>t.raceKey)).size,
    attentionThickTickets:selected.filter(t=>t.features.display==='注意').length,attentionThickRaces:new Set(selected.filter(t=>t.features.display==='注意').map(t=>t.raceKey)).size,
    hitTicketsDetail:hits.map(t=>({raceKey:t.raceKey,order:t.order,payout:t.payout}))};
}
export function evaluateThickV2(races,definition){
  const tickets=races.filter(r=>r.canPurchase).flatMap(r=>r.tickets),thick=tickets.filter(t=>t.control);
  const groups={THICK_HIT:thick.filter(t=>t.hit),THICK_MISS:thick.filter(t=>!t.hit),MAIN_NON_THICK_HIT:tickets.filter(t=>!t.control&&t.hit),MAIN_NON_THICK_MISS:tickets.filter(t=>!t.control&&!t.hit)};
  const qualityGroups=Object.fromEntries(['LOW','HIGH'].flatMap(q=>[true,false].map(hit=>[`${q}_THICK_${hit?'HIT':'MISS'}`,thick.filter(t=>t.features.quality===q&&t.hit===hit)])));
  const selectors={CONTROL:t=>t.control,...Object.fromEntries(Object.entries(definition.candidates).map(([id,rule])=>[id,t=>explainCandidate(t,rule).qualified]))};
  const controlHits=thick.filter(t=>t.hit),control=performance(races,selectors.CONTROL),comparisons={};
  for(const [id,select] of Object.entries(selectors)){
    const result=performance(races,select),lost=controlHits.filter(t=>!select(t)),retained=controlHits.filter(select),payout=controlHits.reduce((s,t)=>s+t.payout,0),retainedPayout=retained.reduce((s,t)=>s+t.payout,0);
    const retainedFraction=controlHits.length?retained.length/controlHits.length:null,retainedReturn=payout?retainedPayout/payout:null;
    const gates={retainedHits:retainedFraction!==null&&retainedFraction>=definition.acceptance.minimumRetainedControlHitFraction,retainedPayout:retainedReturn!==null&&retainedReturn>=definition.acceptance.minimumRetainedControlPayoutFraction,
      roi:result.roi!==null&&control.roi!==null&&result.roi>=control.roi,noHighPayoutLoss:!lost.some(t=>t.payout>=definition.highPayoutYen)};
    comparisons[id]={...result,removedHitTickets:lost.map(t=>({raceKey:t.raceKey,order:t.order,payout:t.payout})),removedHighPayoutTickets:lost.filter(t=>t.payout>=definition.highPayoutYen).map(t=>({raceKey:t.raceKey,order:t.order,payout:t.payout})),
      retainedControlHitFraction:retainedFraction,retainedControlPayoutFraction:retainedReturn,addedNonControlHits:tickets.filter(t=>!t.control&&t.hit&&select(t)).map(t=>({raceKey:t.raceKey,order:t.order,payout:t.payout})),
      concentration:Object.fromEntries(['HIGH','MEDIUM','LOW','UNKNOWN'].map(c=>[c,performance(races.filter(r=>r.concentration===c),select)])),gates,passesDescriptiveGuardrails:Object.values(gates).every(Boolean)};
  }
  const any=Object.entries(comparisons).some(([k,v])=>k!=='CONTROL'&&v.thickTickets>0&&v.passesDescriptiveGuardrails);
  return{version:definition.id,definitionHash:hash(definition),decision:any?'PROMISING_BUT_MORE_DATA':'NO_THICK_V2_CANDIDATE',
    decisionReason:any?'Descriptive guardrails only; no untouched validation or calibrated probability evidence.':'No candidate passes prespecified hit retention, payout retention and ROI guards; missing support is not negative evidence.',
    productionWriteAllowed:false,autoPromotion:false,eligibleRaces:races.filter(r=>r.canPurchase).length,races:races.length,
    groupCounts:Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,v.length])),groupStatistics:Object.fromEntries(Object.entries({...groups,...qualityGroups}).map(([k,v])=>[k,Object.fromEntries(FEATURES.map(f=>[f,statistics(v,f)]))])),
    univariateThick:univariate(thick,definition),univariateAllMain:univariate(tickets,definition),comparisons,mainNonThick:performance(races,t=>!t.control),
    tickets:tickets.map(t=>({...t,candidateAudit:Object.fromEntries(Object.entries(definition.candidates).map(([id,rule])=>[id,explainCandidate(t,rule)]))}))};
}
export function runOffline(source,cohort,definition){
  const rows=allowedRows(source,cohort),result=evaluateThickV2(rows,definition);
  result.cohort={availableConfirmedMetadataCount:source.ticketDiagnostics.filter(r=>r.inConfirmedCohort).length,used:rows.length,excludedUnprovenMembership:source.ticketDiagnostics.filter(r=>r.inConfirmedCohort).length-rows.length,
    allowedRaceKeys:rows.map(r=>r.raceKey),membershipSourceHash:cohort.sourceCohortHash,protected403To502Used:false,notFreshProductionExport:true};
  return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const dir=new URL('./',import.meta.url),source=JSON.parse(fs.readFileSync(new URL('thick-readonly-audit-results.json',dir))),cohort=JSON.parse(fs.readFileSync(new URL('thick-v2-shadow-cohort.json',dir))),definition=JSON.parse(fs.readFileSync(new URL('thick-v2-shadow-definition.json',dir)));
  console.log(JSON.stringify(runOffline(source,cohort,definition),null,2));
}
