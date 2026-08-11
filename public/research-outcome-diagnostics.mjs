const key=o=>(o||[]).map(Number).join("-");
const finite=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v));

export function deriveResearchThickSubset(snapshot){
  const bets=(snapshot?.betSelections||[]).filter(b=>["MAIN","COVER","BUYABLE_HIGH"].includes(b?.category));
  if(bets.length<2)return[];
  const scored=bets.map(b=>{
    const p=Math.max(0,Number(b.probability)||0),n=Math.max(0,Number(b.naturalConvergenceScore)||0),main=b.category==="MAIN"?1:.82,odds=Number(b.odds);
    const oddsQuality=Number.isFinite(odds)&&odds>1?Math.min(1.15,Math.max(.8,Math.log10(odds+1)/1.5)):1;
    return{b,score:p*(.55+.45*n)*main*oddsQuality};
  }).sort((a,b)=>b.score-a.score);
  const positive=scored.filter(x=>x.score>0);if(positive.length<2)return[];
  const gaps=[];for(let i=0;i<positive.length-1;i++)gaps.push((positive[i].score-positive[i+1].score)/Math.max(1e-9,positive[i].score));
  const medianGap=[...gaps].sort((a,b)=>a-b)[Math.floor(gaps.length/2)]||0,clearIndex=gaps.findIndex(g=>g>=Math.max(.18,medianGap*1.8));
  if(clearIndex<0)return[];const cluster=positive.slice(0,clearIndex+1);if(cluster.length>Math.ceil(bets.length/2))return[];
  return cluster.map(x=>x.b);
}

function classifyThickMiss(snapshot,official,thick,matched,exactTerminal){
  const officialKey=key(official),ledger=snapshot?.terminalLedger||[];
  if(!officialKey||!thick.length)return{status:"NOT_EVALUATED",tags:[]};
  if(thick.some(b=>key(b.order)===officialKey))return{status:"HIT",tags:["THICK_CLUSTER_HIT"]};
  const head=Number(official[0]),second=Number(official[1]);
  const thickHead=thick.some(b=>Number(b?.order?.[0])===head);
  const thickPair=thick.some(b=>Number(b?.order?.[0])===head&&Number(b?.order?.[1])===second);
  const headGenerated=ledger.some(t=>Number(t?.order?.[0])===head);
  const pairGenerated=ledger.some(t=>Number(t?.order?.[0])===head&&Number(t?.order?.[1])===second);
  const exactGenerated=Boolean(exactTerminal);
  const branchId=exactTerminal?.dominantBranchId||null;
  const branchLabel=exactTerminal?.dominantBranchLabel||null;
  const sameBranchInThick=branchId?thick.some(b=>(b?.dominantBranchId||null)===branchId):false;
  let stage="THICK_CLUSTER_SELECTION_MISS";
  if(!thickHead)stage="THICK_HEAD_MISS";
  else if(!thickPair)stage="THICK_SECOND_MISS";
  else stage="THICK_THIRD_MISS";
  const tags=["THICK_CLUSTER_MISS",stage];
  let upstream="NONE";
  if(!headGenerated)upstream="FIRST_FAMILY_GENERATION_MISS";
  else if(!pairGenerated)upstream="SECOND_BRANCH_GENERATION_MISS";
  else if(!exactGenerated)upstream="THIRD_TERMINAL_GENERATION_MISS";
  else if(!matched)upstream="PURCHASE_SELECTION_MISS";
  else upstream="THICK_CLUSTER_SELECTION_MISS";
  if(upstream!=="NONE")tags.push(`THICK_UPSTREAM_${upstream}`);
  if(exactGenerated&&branchId&&!sameBranchInThick){tags.push("THICK_SCENARIO_BRANCH_MISS");}
  return{status:stage,upstreamFailure:upstream,headRepresented:thickHead,pairRepresented:thickPair,exactRepresented:false,headGenerated,pairGenerated,exactGenerated,correctBranchId:branchId,correctBranchLabel:branchLabel,correctBranchRepresentedInThick:sameBranchInThick,tags};
}

export function buildOutcomeDiagnostics(snapshot,result){
  const official=(result?.officialFinishOrder||[]).map(Number).slice(0,3),officialKey=key(official),bets=snapshot?.betSelections||[],matched=bets.find(b=>key(b.order)===officialKey)||null;
  const thick=deriveResearchThickSubset(snapshot),thickKeys=new Set(thick.map(x=>key(x.order)));
  const payout=finite(result?.officialPayout)?Number(result.officialPayout):null,totalStake=bets.reduce((s,b)=>s+(finite(b.stake)?Number(b.stake):0),0),hitStake=matched&&finite(matched.stake)?Number(matched.stake):0;
  const grossReturn=matched&&payout!==null&&hitStake>0?payout/100*hitStake:null;
  const netReturn=grossReturn!==null&&totalStake>0?grossReturn-totalStake:null;
  const exactTerminal=(snapshot?.terminalLedger||[]).find(t=>key(t.order)===officialKey)||null;
  const exactGenerated=Boolean(exactTerminal);
  const thickMiss=classifyThickMiss(snapshot,official,thick,matched,exactTerminal);
  const highPayoutRace=payout!==null&&payout>=10000;
  const tags=[];
  tags.push(...thickMiss.tags);
  if(matched&&netReturn!==null&&netReturn<0)tags.push("HIT_BUT_NEGATIVE_RETURN");
  if(highPayoutRace&&!matched)tags.push("HIGH_PAYOUT_OPPORTUNITY_MISSED");
  if(highPayoutRace&&matched)tags.push("HIGH_PAYOUT_CAPTURED");
  if(highPayoutRace&&!exactGenerated)tags.push("HIGH_PAYOUT_TERMINAL_GENERATION_MISS");
  return{
    version:"RESEARCH-OUTCOME-DIAGNOSTICS-1.4",researchOnly:true,productionWriteAllowed:false,
    raceDate:String(snapshot?.raceDate||snapshot?.targetRace?.date||result?.raceDate||result?.date||"").slice(0,10)||null,venue:String(snapshot?.venue||snapshot?.targetRace?.venue||result?.venue||"")||null,session:String(snapshot?.session||snapshot?.timeBand||snapshot?.targetRace?.session||result?.session||"")||null,raceGrade:String(snapshot?.raceGrade||snapshot?.grade||snapshot?.targetRace?.grade||result?.raceGrade||result?.grade||"")||null,
    officialOrder:official,payout,totalStake,hitStake,grossReturn,netReturn,
    thickBetCount:thick.length,thickOrders:thick.map(x=>x.order),thickHit:Boolean(officialKey&&thickKeys.has(officialKey)),thickMiss,
    highPayoutRace,exactTerminalGenerated:exactGenerated,exactTerminalPurchased:Boolean(matched),
    markPurchaseAudit:{status:"RETIRED",warningCount:0,warnings:[],reason:"MARK_LAYER_RETIRED_USE_DIRECT_LINKAGE_AUDIT"},tags
  };
}

export function summarizeOutcomeDiagnostics(rows){
  const ds=(rows||[]).map(r=>r?.outcomeDiagnostics||r).filter(d=>["RESEARCH-OUTCOME-DIAGNOSTICS-1.0","RESEARCH-OUTCOME-DIAGNOSTICS-1.1","RESEARCH-OUTCOME-DIAGNOSTICS-1.2","RESEARCH-OUTCOME-DIAGNOSTICS-1.3","RESEARCH-OUTCOME-DIAGNOSTICS-1.4"].includes(d?.version));
  const count=t=>ds.filter(d=>d.tags?.includes(t)).length;
  const thickEvaluatedCount=ds.filter(d=>d.thickBetCount>0).length,thickMissCount=count("THICK_CLUSTER_MISS");
  const rate=(n,d)=>d>0?n/d:null;
  const summary={recordCount:ds.length,thickEvaluatedCount,thickMissCount,thickHeadMissCount:count("THICK_HEAD_MISS"),thickSecondMissCount:count("THICK_SECOND_MISS"),thickThirdMissCount:count("THICK_THIRD_MISS"),thickScenarioBranchMissCount:count("THICK_SCENARIO_BRANCH_MISS"),thickPurchaseSelectionMissCount:count("THICK_UPSTREAM_PURCHASE_SELECTION_MISS"),negativeReturnHitCount:count("HIT_BUT_NEGATIVE_RETURN"),highPayoutRaceCount:ds.filter(d=>d.highPayoutRace).length,highPayoutMissCount:count("HIGH_PAYOUT_OPPORTUNITY_MISSED"),highPayoutGenerationMissCount:count("HIGH_PAYOUT_TERMINAL_GENERATION_MISS"),markAlignmentReviewCount:count("MARK_PURCHASE_ALIGNMENT_REVIEW")};
  return{...summary,rates:{thickMissRate:rate(summary.thickMissCount,thickEvaluatedCount),headMissRate:rate(summary.thickHeadMissCount,thickEvaluatedCount),secondMissRate:rate(summary.thickSecondMissCount,thickEvaluatedCount),thirdMissRate:rate(summary.thickThirdMissCount,thickEvaluatedCount),scenarioBranchMissRate:rate(summary.thickScenarioBranchMissCount,thickEvaluatedCount),purchaseSelectionMissRate:rate(summary.thickPurchaseSelectionMissCount,thickEvaluatedCount),headShareOfThickMisses:rate(summary.thickHeadMissCount,thickMissCount),secondShareOfThickMisses:rate(summary.thickSecondMissCount,thickMissCount),thirdShareOfThickMisses:rate(summary.thickThirdMissCount,thickMissCount)}};
}

export function assessThickLearningSignals(rows,{minimumEvaluated=30,minimumMisses=10,dominanceShare=.35}={}){
  const summary=summarizeOutcomeDiagnostics(rows),evaluated=summary.thickEvaluatedCount,misses=summary.thickMissCount;
  const cfg={minimumEvaluated:Number(minimumEvaluated),minimumMisses:Number(minimumMisses),dominanceShare:Number(dominanceShare)};
  if(evaluated<cfg.minimumEvaluated||misses<cfg.minimumMisses)return{version:"THICK-LEARNING-SIGNAL-1.0",researchOnly:true,productionWriteAllowed:false,status:"INSUFFICIENT_SAMPLE",eligible:false,config:cfg,summary,candidates:[]};
  const candidates=[
    ["THICK_HEAD_REPRESENTATION_REVIEW",summary.rates.headShareOfThickMisses,summary.thickHeadMissCount],
    ["THICK_SECOND_REPRESENTATION_REVIEW",summary.rates.secondShareOfThickMisses,summary.thickSecondMissCount],
    ["THICK_THIRD_REPRESENTATION_REVIEW",summary.rates.thirdShareOfThickMisses,summary.thickThirdMissCount]
  ].filter(([,share])=>share!==null&&share>=cfg.dominanceShare).map(([type,share,count])=>({type,share,count,status:"RESEARCH_REVIEW_CANDIDATE"}));
  return{version:"THICK-LEARNING-SIGNAL-1.0",researchOnly:true,productionWriteAllowed:false,status:candidates.length?"REVIEW_CANDIDATE":"NO_DOMINANT_FAILURE_STAGE",eligible:candidates.length>0,config:cfg,summary,candidates};
}

const diagnosticDate=d=>String(d?.raceDate||d?.date||d?.targetRace?.date||d?.observedDate||"").slice(0,10);

export function assessThickLearningRobustness(rows,{minimumEvaluated=30,minimumMisses=10,dominanceShare=.35,minimumDistinctDates=3,minimumWindowEvaluated=10}={}){
  const base=assessThickLearningSignals(rows,{minimumEvaluated,minimumMisses,dominanceShare});
  const cfg={minimumEvaluated:Number(minimumEvaluated),minimumMisses:Number(minimumMisses),dominanceShare:Number(dominanceShare),minimumDistinctDates:Number(minimumDistinctDates),minimumWindowEvaluated:Number(minimumWindowEvaluated)};
  const ds=(rows||[]).map(r=>r?.outcomeDiagnostics||r).filter(d=>["RESEARCH-OUTCOME-DIAGNOSTICS-1.0","RESEARCH-OUTCOME-DIAGNOSTICS-1.1","RESEARCH-OUTCOME-DIAGNOSTICS-1.2","RESEARCH-OUTCOME-DIAGNOSTICS-1.3","RESEARCH-OUTCOME-DIAGNOSTICS-1.4"].includes(d?.version));
  const dated=ds.filter(d=>diagnosticDate(d));
  const dates=[...new Set(dated.map(diagnosticDate))].sort();
  const common={version:"THICK-LEARNING-ROBUSTNESS-1.0",researchOnly:true,productionWriteAllowed:false,config:cfg,baseSignal:base,distinctDateCount:dates.length,dates};
  if(!base.eligible)return{...common,status:base.status,eligible:false,validatedCandidates:[],counterEvidence:[{type:"BASE_SIGNAL_NOT_ELIGIBLE",status:base.status}]};
  if(dates.length<cfg.minimumDistinctDates)return{...common,status:"INSUFFICIENT_PERIOD_EVIDENCE",eligible:false,validatedCandidates:[],counterEvidence:[{type:"DISTINCT_DATE_SHORTAGE",required:cfg.minimumDistinctDates,actual:dates.length}]};
  const splitIndex=Math.ceil(dates.length/2),earlyDates=new Set(dates.slice(0,splitIndex)),lateDates=new Set(dates.slice(splitIndex));
  const early=dated.filter(d=>earlyDates.has(diagnosticDate(d))),late=dated.filter(d=>lateDates.has(diagnosticDate(d)));
  const earlySummary=summarizeOutcomeDiagnostics(early),lateSummary=summarizeOutcomeDiagnostics(late);
  if(earlySummary.thickEvaluatedCount<cfg.minimumWindowEvaluated||lateSummary.thickEvaluatedCount<cfg.minimumWindowEvaluated)return{...common,status:"INSUFFICIENT_WINDOW_EVIDENCE",eligible:false,earlySummary,lateSummary,validatedCandidates:[],counterEvidence:[{type:"WINDOW_SAMPLE_SHORTAGE",earlyEvaluated:earlySummary.thickEvaluatedCount,lateEvaluated:lateSummary.thickEvaluatedCount,requiredEach:cfg.minimumWindowEvaluated}]};
  const shareFor=(summary,type)=>type==="THICK_HEAD_REPRESENTATION_REVIEW"?summary.rates.headShareOfThickMisses:type==="THICK_SECOND_REPRESENTATION_REVIEW"?summary.rates.secondShareOfThickMisses:type==="THICK_THIRD_REPRESENTATION_REVIEW"?summary.rates.thirdShareOfThickMisses:null;
  const validatedCandidates=[],counterEvidence=[];
  for(const candidate of base.candidates){
    const earlyShare=shareFor(earlySummary,candidate.type),lateShare=shareFor(lateSummary,candidate.type);
    const stable=earlyShare!==null&&lateShare!==null&&earlyShare>=cfg.dominanceShare&&lateShare>=cfg.dominanceShare;
    if(stable)validatedCandidates.push({...candidate,status:"TEMPORALLY_REPLICATED_RESEARCH_CANDIDATE",earlyShare,lateShare,replicatedAcrossWindows:true});
    else counterEvidence.push({type:"TEMPORAL_NON_REPLICATION",candidateType:candidate.type,earlyShare,lateShare,requiredShare:cfg.dominanceShare});
  }
  return{...common,status:validatedCandidates.length?"ROBUST_REVIEW_CANDIDATE":"TEMPORAL_INSTABILITY",eligible:validatedCandidates.length>0,earlyDates:[...earlyDates],lateDates:[...lateDates],earlySummary,lateSummary,validatedCandidates,counterEvidence};
}


const contextValue=(d,dimension)=>{
  if(dimension==="venue")return String(d?.venue||d?.targetRace?.venue||"").trim();
  if(dimension==="session")return String(d?.session||d?.timeBand||d?.targetRace?.session||"").trim();
  if(dimension==="raceGrade")return String(d?.raceGrade||d?.grade||d?.targetRace?.grade||"").trim();
  return"";
};
const candidateTag=type=>type==="THICK_HEAD_REPRESENTATION_REVIEW"?"THICK_HEAD_MISS":type==="THICK_SECOND_REPRESENTATION_REVIEW"?"THICK_SECOND_MISS":type==="THICK_THIRD_REPRESENTATION_REVIEW"?"THICK_THIRD_MISS":null;

export function assessThickLearningContextRobustness(rows,{minimumEvaluated=30,minimumMisses=10,dominanceShare=.35,minimumDistinctDates=3,minimumWindowEvaluated=10,minimumContextEvaluated=8,minimumAuditedDimensions=1,localizationShare=.8,dimensions=["venue","session","raceGrade"]}={}){
  const temporal=assessThickLearningRobustness(rows,{minimumEvaluated,minimumMisses,dominanceShare,minimumDistinctDates,minimumWindowEvaluated});
  const cfg={minimumContextEvaluated:Number(minimumContextEvaluated),minimumAuditedDimensions:Math.max(1,Number(minimumAuditedDimensions)||1),localizationShare:Number(localizationShare),dimensions:[...dimensions]};
  const ds=(rows||[]).map(r=>r?.outcomeDiagnostics||r).filter(d=>["RESEARCH-OUTCOME-DIAGNOSTICS-1.0","RESEARCH-OUTCOME-DIAGNOSTICS-1.1","RESEARCH-OUTCOME-DIAGNOSTICS-1.2","RESEARCH-OUTCOME-DIAGNOSTICS-1.3","RESEARCH-OUTCOME-DIAGNOSTICS-1.4"].includes(d?.version));
  const common={version:"THICK-LEARNING-CONTEXT-ROBUSTNESS-1.1",researchOnly:true,productionWriteAllowed:false,config:cfg,temporalRobustness:temporal};
  if(!temporal.eligible)return{...common,status:temporal.status,eligible:false,globalCandidates:[],contextualCandidates:[],counterEvidence:[{type:"TEMPORAL_ROBUSTNESS_NOT_ELIGIBLE",status:temporal.status}]};
  const globalCandidates=[],contextualCandidates=[],counterEvidence=[];
  for(const candidate of temporal.validatedCandidates){
    const tag=candidateTag(candidate.type);if(!tag)continue;
    const dimensionAudits=[];let localizedDimensions=0,distributedDimensions=0,auditedDimensions=0;
    for(const dimension of cfg.dimensions){
      const known=ds.filter(d=>contextValue(d,dimension));
      const groups=[...new Set(known.map(d=>contextValue(d,dimension)))];
      if(groups.length<2){dimensionAudits.push({dimension,status:"INSUFFICIENT",reason:"INSUFFICIENT_CONTEXT_VARIATION",groupCount:groups.length,qualifyingGroupCount:0});continue;}
      const allStats=groups.map(value=>{
        const g=known.filter(d=>contextValue(d,dimension)===value),evaluated=g.filter(d=>d.thickBetCount>0).length,misses=g.filter(d=>d.tags?.includes(tag)).length;
        return{value,evaluated,stageMisses:misses,stageMissRate:evaluated?misses/evaluated:null};
      });
      const stats=allStats.filter(x=>x.evaluated>=cfg.minimumContextEvaluated);
      if(stats.length<2){dimensionAudits.push({dimension,status:"INSUFFICIENT",reason:"INSUFFICIENT_CONTEXT_SAMPLE",groupCount:groups.length,qualifyingGroupCount:stats.length,groups:stats});continue;}
      auditedDimensions++;
      const totalStage=stats.reduce((s,x)=>s+x.stageMisses,0),top=[...stats].sort((a,b)=>b.stageMisses-a.stageMisses)[0],concentration=totalStage>0?top.stageMisses/totalStage:0;
      const status=concentration>=cfg.localizationShare?"LOCALIZED":"DISTRIBUTED";
      dimensionAudits.push({dimension,status,concentration,topGroup:top,groups:stats});
      if(status==="LOCALIZED"){
        localizedDimensions++;
        contextualCandidates.push({...candidate,status:"CONTEXT_LOCALIZED_RESEARCH_CANDIDATE",dimension,contextValue:top.value,concentration});
        counterEvidence.push({type:"CONTEXT_LOCALIZATION",candidateType:candidate.type,dimension,contextValue:top.value,concentration,threshold:cfg.localizationShare});
      }else distributedDimensions++;
    }
    if(localizedDimensions===0&&distributedDimensions>=cfg.minimumAuditedDimensions){
      globalCandidates.push({...candidate,status:"CONTEXT_ROBUST_GLOBAL_RESEARCH_CANDIDATE",contextAudits:dimensionAudits,contextCoverage:{auditedDimensions,distributedDimensions,localizedDimensions,required:cfg.minimumAuditedDimensions}});
    }else if(localizedDimensions===0){
      counterEvidence.push({type:"CONTEXT_AUDIT_COVERAGE_SHORTAGE",candidateType:candidate.type,auditedDimensions,distributedDimensions,localizedDimensions,required:cfg.minimumAuditedDimensions});
    }
  }
  return{...common,status:globalCandidates.length?"CONTEXT_ROBUST_REVIEW_CANDIDATE":contextualCandidates.length?"CONTEXT_LOCALIZED":"INSUFFICIENT_CONTEXT_EVIDENCE",eligible:globalCandidates.length>0,globalCandidates,contextualCandidates,counterEvidence};
}


export function buildThickContextResearchLedger(rows,options={}){
  const audit=assessThickLearningContextRobustness(rows,options);
  const localized=(audit.contextualCandidates||[]).map((c,index)=>({
    ledgerId:`THICK-CONTEXT-${String(index+1).padStart(3,"0")}`,
    scope:"LOCAL_CONTEXT_ONLY",
    candidateType:c.type,
    dimension:c.dimension,
    contextValue:c.contextValue,
    concentration:c.concentration,
    status:"CONTEXT_RESEARCH_LEDGER_ONLY",
    researchOnly:true,
    productionWriteAllowed:false,
    globalRuleEligible:false,
    localProductionAdjustmentEligible:false,
    requiredNextEvidence:["INDEPENDENT_CONTEXT_REPLICATION","OUT_OF_SAMPLE_CONTEXT_VALIDATION","MANUAL_REVIEW"],
    sourceStatus:audit.status
  }));
  const global=(audit.globalCandidates||[]).map((c,index)=>({
    ledgerId:`THICK-GLOBAL-${String(index+1).padStart(3,"0")}`,
    scope:"GLOBAL_RESEARCH",
    candidateType:c.type,
    status:"GLOBAL_RESEARCH_LEDGER_ONLY",
    researchOnly:true,
    productionWriteAllowed:false,
    globalRuleEligible:false,
    localProductionAdjustmentEligible:false,
    requiredNextEvidence:["OUT_OF_SAMPLE_VALIDATION","SHADOW_COMPARISON","MANUAL_REVIEW"],
    sourceStatus:audit.status
  }));
  return{
    version:"THICK-CONTEXT-RESEARCH-LEDGER-1.0",researchOnly:true,productionWriteAllowed:false,
    status:localized.length?"LOCAL_CONTEXT_CANDIDATES_RECORDED":global.length?"GLOBAL_CANDIDATES_RECORDED":"NO_LEDGER_CANDIDATES",
    sourceAudit:audit,
    globalLedger:global,
    contextualLedger:localized,
    safeguards:{globalAndLocalSeparated:true,autoPromotionAllowed:false,productionAdjustmentAllowed:false}
  };
}

const stableSealValue=value=>{
  if(Array.isArray(value))return value.map(stableSealValue);
  if(value&&typeof value==="object")return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stableSealValue(value[k])]));
  return value;
};
const simpleSealHash=text=>{
  let h=2166136261;
  for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}
  return (h>>>0).toString(16).padStart(8,"0");
};
const sealPayload=entry=>({
  ledgerId:entry?.ledgerId||null,
  scope:entry?.scope||null,
  candidateType:entry?.candidateType||null,
  dimension:entry?.dimension||null,
  contextValue:entry?.contextValue||null,
  requiredNextEvidence:[...(entry?.requiredNextEvidence||[])].sort(),
  researchOnly:true,
  productionWriteAllowed:false
});

export function sealThickResearchLedgerCandidate(entry,{sealedAt=null}={}){
  if(!entry?.ledgerId||!entry?.candidateType)return{version:"THICK-OOS-SEAL-1.0",status:"INVALID_LEDGER_ENTRY",eligible:false,researchOnly:true,productionWriteAllowed:false};
  const payload=stableSealValue(sealPayload(entry)),serialized=JSON.stringify(payload),seal=simpleSealHash(serialized);
  return{version:"THICK-OOS-SEAL-1.0",status:"SEALED_FOR_OUT_OF_SAMPLE_VALIDATION",eligible:true,researchOnly:true,productionWriteAllowed:false,ledgerId:entry.ledgerId,scope:entry.scope,candidateType:entry.candidateType,sealedAt:sealedAt||null,payload,seal,safeguards:{candidateFrozenBeforeValidation:true,outcomeDrivenMutationAllowed:false,productionWriteAllowed:false}};
}

export function validateThickResearchLedgerSeal(entry,sealed){
  if(!sealed?.seal||!sealed?.payload)return{version:"THICK-OOS-SEAL-CHECK-1.0",status:"MISSING_SEAL",valid:false,researchOnly:true,productionWriteAllowed:false};
  const payload=stableSealValue(sealPayload(entry)),seal=simpleSealHash(JSON.stringify(payload)),valid=seal===sealed.seal&&JSON.stringify(payload)===JSON.stringify(stableSealValue(sealed.payload));
  return{version:"THICK-OOS-SEAL-CHECK-1.0",status:valid?"SEAL_VALID":"SEAL_MISMATCH",valid,researchOnly:true,productionWriteAllowed:false,expectedSeal:sealed.seal,actualSeal:seal,counterEvidence:valid?[]:[{type:"POST_SEAL_CANDIDATE_MUTATION_OR_MISMATCH",ledgerId:entry?.ledgerId||null}]};
}

export function prepareThickOutOfSampleValidation(ledger,{sealedAt=null}={}){
  const entries=[...(ledger?.globalLedger||[]),...(ledger?.contextualLedger||[])];
  const seals=entries.map(entry=>sealThickResearchLedgerCandidate(entry,{sealedAt})).filter(x=>x.eligible);
  return{version:"THICK-OOS-VALIDATION-PACKAGE-1.0",status:seals.length?"READY_FOR_OOS_VALIDATION":"NO_ELIGIBLE_LEDGER_CANDIDATES",researchOnly:true,productionWriteAllowed:false,sourceLedgerVersion:ledger?.version||null,seals,validationRules:{mustUseFutureOrHeldOutData:true,selectionCriteriaFrozen:true,minimumResultRequirement:"MANUAL_OR_PREDECLARED",autoPromotionAllowed:false},safeguards:{sealedBeforeOutcomeAccess:true,postOutcomeCriterionEditingForbidden:true,productionWriteAllowed:false}};
}

const oosCandidateTypeToTag=type=>type==="THICK_HEAD_REPRESENTATION_REVIEW"?"THICK_HEAD_MISS":type==="THICK_SECOND_REPRESENTATION_REVIEW"?"THICK_SECOND_MISS":type==="THICK_THIRD_REPRESENTATION_REVIEW"?"THICK_THIRD_MISS":null;

export function evaluateSealedThickOutOfSampleCandidate(entry,sealed,rows,{minimumEvaluated=20,minimumStageMisses=5,minimumReplicationShare=.35}={}){
  const sealCheck=validateThickResearchLedgerSeal(entry,sealed);
  const cfg={minimumEvaluated:Number(minimumEvaluated),minimumStageMisses:Number(minimumStageMisses),minimumReplicationShare:Number(minimumReplicationShare)};
  const common={version:"THICK-OOS-EVALUATION-1.0",researchOnly:true,productionWriteAllowed:false,ledgerId:entry?.ledgerId||sealed?.ledgerId||null,candidateType:entry?.candidateType||sealed?.candidateType||null,config:cfg,sealCheck};
  if(!sealCheck.valid)return{...common,status:"SEAL_MISMATCH",eligible:false,decision:"INVALIDATE",counterEvidence:sealCheck.counterEvidence||[]};
  const ds=(rows||[]).map(r=>r?.outcomeDiagnostics||r).filter(d=>["RESEARCH-OUTCOME-DIAGNOSTICS-1.0","RESEARCH-OUTCOME-DIAGNOSTICS-1.1","RESEARCH-OUTCOME-DIAGNOSTICS-1.2","RESEARCH-OUTCOME-DIAGNOSTICS-1.3","RESEARCH-OUTCOME-DIAGNOSTICS-1.4"].includes(d?.version));
  const contextFiltered=entry?.scope==="LOCAL_CONTEXT_ONLY"&&entry?.dimension&&entry?.contextValue?ds.filter(d=>contextValue(d,entry.dimension)===String(entry.contextValue)):ds;
  const evaluated=contextFiltered.filter(d=>d.thickBetCount>0),tag=oosCandidateTypeToTag(entry?.candidateType),stageMisses=tag?evaluated.filter(d=>d.tags?.includes(tag)).length:0,allThickMisses=evaluated.filter(d=>d.tags?.includes("THICK_CLUSTER_MISS")).length;
  const replicationShare=allThickMisses>0?stageMisses/allThickMisses:null;
  const summary={inputRecordCount:ds.length,contextRecordCount:contextFiltered.length,evaluatedCount:evaluated.length,thickMissCount:allThickMisses,stageMissCount:stageMisses,replicationShare};
  if(evaluated.length<cfg.minimumEvaluated||stageMisses<cfg.minimumStageMisses)return{...common,status:"INSUFFICIENT_OOS_SAMPLE",eligible:false,decision:"HOLD",summary,counterEvidence:[{type:"OOS_SAMPLE_SHORTAGE",requiredEvaluated:cfg.minimumEvaluated,actualEvaluated:evaluated.length,requiredStageMisses:cfg.minimumStageMisses,actualStageMisses:stageMisses}]};
  if(replicationShare!==null&&replicationShare>=cfg.minimumReplicationShare)return{...common,status:"OOS_REPLICATED",eligible:true,decision:"RETAIN_RESEARCH_CANDIDATE",summary,supportingEvidence:[{type:"OOS_STAGE_REPLICATION",share:replicationShare,threshold:cfg.minimumReplicationShare}],counterEvidence:[]};
  return{...common,status:"OOS_NOT_REPLICATED",eligible:false,decision:"REJECT_RESEARCH_CANDIDATE",summary,supportingEvidence:[],counterEvidence:[{type:"OOS_NON_REPLICATION",share:replicationShare,threshold:cfg.minimumReplicationShare}]};
}

export function evaluateThickOutOfSampleValidationPackage(ledger,validationPackage,rowsByLedgerId={},options={}){
  const entries=[...(ledger?.globalLedger||[]),...(ledger?.contextualLedger||[])],byId=new Map(entries.map(e=>[e.ledgerId,e]));
  const evaluations=(validationPackage?.seals||[]).map(sealed=>{
    const entry=byId.get(sealed.ledgerId),rows=rowsByLedgerId?.[sealed.ledgerId]||[];
    if(!entry)return{version:"THICK-OOS-EVALUATION-1.0",ledgerId:sealed.ledgerId,status:"LEDGER_ENTRY_MISSING",eligible:false,decision:"INVALIDATE",researchOnly:true,productionWriteAllowed:false};
    return evaluateSealedThickOutOfSampleCandidate(entry,sealed,rows,options);
  });
  const retained=evaluations.filter(x=>x.decision==="RETAIN_RESEARCH_CANDIDATE"),rejected=evaluations.filter(x=>x.decision==="REJECT_RESEARCH_CANDIDATE"||x.decision==="INVALIDATE"),held=evaluations.filter(x=>x.decision==="HOLD");
  return{version:"THICK-OOS-EVALUATION-BATCH-1.0",status:retained.length?"OOS_RESEARCH_CANDIDATES_RETAINED":held.length?"OOS_EVIDENCE_INCOMPLETE":"NO_OOS_REPLICATION",researchOnly:true,productionWriteAllowed:false,autoPromotionAllowed:false,evaluations,retainedCount:retained.length,rejectedCount:rejected.length,heldCount:held.length,safeguards:{sealedCandidateRequired:true,failedCandidateAutoRejected:true,insufficientEvidenceNeverPromoted:true,productionWriteAllowed:false}};
}

const finiteMetric=(value,fallback=null)=>Number.isFinite(Number(value))?Number(value):fallback;
const relativeDelta=(before,after)=>{
  const b=finiteMetric(before),a=finiteMetric(after);
  if(b===null||a===null)return null;
  if(Math.abs(b)<1e-12)return a-b;
  return (a-b)/Math.abs(b);
};

export function assessThickResearchCandidateImpact(oosEvaluation,baseline={},proposal={},options={}){
  const cfg={
    maxMainHitRateDrop:finiteMetric(options.maxMainHitRateDrop,.03),
    maxSupportHitRateDrop:finiteMetric(options.maxSupportHitRateDrop,.05),
    maxReturnRateDrop:finiteMetric(options.maxReturnRateDrop,.03),
    maxBetCountIncrease:finiteMetric(options.maxBetCountIncrease,.20),
    maxThickShareIncrease:finiteMetric(options.maxThickShareIncrease,.20)
  };
  const common={version:"THICK-IMPACT-PRESCREEN-1.0",researchOnly:true,productionWriteAllowed:false,autoPromotionAllowed:false,ledgerId:oosEvaluation?.ledgerId||null,candidateType:oosEvaluation?.candidateType||null,config:cfg};
  if(oosEvaluation?.status!=="OOS_REPLICATED"||oosEvaluation?.decision!=="RETAIN_RESEARCH_CANDIDATE")return{...common,status:"OOS_REPLICATION_REQUIRED",eligible:false,decision:"BLOCK",supportingEvidence:[],counterEvidence:[{type:"OOS_CANDIDATE_NOT_RETAINED",status:oosEvaluation?.status||null,decision:oosEvaluation?.decision||null}]};
  const required=["mainHitRate","supportHitRate","returnRate","betCount","thickShare"];
  const missing=required.filter(k=>finiteMetric(baseline?.[k])===null||finiteMetric(proposal?.[k])===null);
  if(missing.length)return{...common,status:"IMPACT_EVIDENCE_INCOMPLETE",eligible:false,decision:"HOLD",missingMetrics:missing,supportingEvidence:[],counterEvidence:[{type:"IMPACT_METRICS_MISSING",metrics:missing}]};
  const deltas={
    mainHitRate:finiteMetric(proposal.mainHitRate)-finiteMetric(baseline.mainHitRate),
    supportHitRate:finiteMetric(proposal.supportHitRate)-finiteMetric(baseline.supportHitRate),
    returnRate:finiteMetric(proposal.returnRate)-finiteMetric(baseline.returnRate),
    betCountRelative:relativeDelta(baseline.betCount,proposal.betCount),
    thickShareRelative:relativeDelta(baseline.thickShare,proposal.thickShare)
  };
  const risks=[];
  if(deltas.mainHitRate < -cfg.maxMainHitRateDrop)risks.push({type:"MAIN_HIT_RATE_REGRESSION",delta:deltas.mainHitRate,limit:-cfg.maxMainHitRateDrop});
  if(deltas.supportHitRate < -cfg.maxSupportHitRateDrop)risks.push({type:"SUPPORT_HIT_RATE_REGRESSION",delta:deltas.supportHitRate,limit:-cfg.maxSupportHitRateDrop});
  if(deltas.returnRate < -cfg.maxReturnRateDrop)risks.push({type:"RETURN_RATE_REGRESSION",delta:deltas.returnRate,limit:-cfg.maxReturnRateDrop});
  if(deltas.betCountRelative > cfg.maxBetCountIncrease)risks.push({type:"BET_COUNT_INFLATION",delta:deltas.betCountRelative,limit:cfg.maxBetCountIncrease});
  if(deltas.thickShareRelative > cfg.maxThickShareIncrease)risks.push({type:"THICK_ALLOCATION_INFLATION",delta:deltas.thickShareRelative,limit:cfg.maxThickShareIncrease});
  const supporting=[];
  if(deltas.returnRate>=0)supporting.push({type:"RETURN_RATE_NON_REGRESSION",delta:deltas.returnRate});
  if(deltas.mainHitRate>=0)supporting.push({type:"MAIN_HIT_RATE_NON_REGRESSION",delta:deltas.mainHitRate});
  return{...common,status:risks.length?"SIDE_EFFECT_RISK_DETECTED":"IMPACT_PRESCREEN_PASSED",eligible:!risks.length,decision:risks.length?"BLOCK_RESEARCH_PROPOSAL":"ALLOW_SHADOW_PROPOSAL_ONLY",baseline:{...baseline},proposal:{...proposal},deltas,supportingEvidence:supporting,counterEvidence:risks,safeguards:{thickOnlyOptimizationForbidden:true,productionWriteAllowed:false,shadowOnlyNextStep:true,manualReviewRequired:true}};
}

export function assessThickResearchImpactBatch(oosBatch,metricsByLedgerId={},options={}){
  const evaluations=oosBatch?.evaluations||[];
  const assessments=evaluations.filter(x=>x?.decision==="RETAIN_RESEARCH_CANDIDATE").map(ev=>{
    const metrics=metricsByLedgerId?.[ev.ledgerId]||{};
    return assessThickResearchCandidateImpact(ev,metrics.baseline||{},metrics.proposal||{},options);
  });
  const passed=assessments.filter(x=>x.decision==="ALLOW_SHADOW_PROPOSAL_ONLY").length,blocked=assessments.filter(x=>x.decision==="BLOCK_RESEARCH_PROPOSAL").length,held=assessments.filter(x=>x.decision==="HOLD").length;
  return{version:"THICK-IMPACT-PRESCREEN-BATCH-1.0",status:passed?"SHADOW_PROPOSALS_ELIGIBLE":held?"IMPACT_EVIDENCE_INCOMPLETE":blocked?"ALL_PROPOSALS_BLOCKED":"NO_RETAINED_OOS_CANDIDATES",researchOnly:true,productionWriteAllowed:false,autoPromotionAllowed:false,assessments,passedCount:passed,blockedCount:blocked,heldCount:held,safeguards:{productionWriteAllowed:false,shadowOnly:true,manualReviewRequired:true}};
}

const stableStringify=(value)=>{
  if(value===null||typeof value!=="object")return JSON.stringify(value);
  if(Array.isArray(value))return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
};
const simpleHash=(text)=>{
  let h=2166136261;
  for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}
  return (h>>>0).toString(16).padStart(8,"0");
};

export function createThickShadowProposal(impactAssessment,proposalSpec={},options={}){
  const common={version:"THICK-SHADOW-PROPOSAL-1.0",researchOnly:true,productionWriteAllowed:false,autoPromotionAllowed:false,ledgerId:impactAssessment?.ledgerId||null,candidateType:impactAssessment?.candidateType||null};
  if(impactAssessment?.status!=="IMPACT_PRESCREEN_PASSED"||impactAssessment?.decision!=="ALLOW_SHADOW_PROPOSAL_ONLY")return{...common,status:"IMPACT_PRESCREEN_REQUIRED",eligible:false,decision:"BLOCK",counterEvidence:[{type:"IMPACT_PRESCREEN_NOT_PASSED",status:impactAssessment?.status||null,decision:impactAssessment?.decision||null}]};
  const allowedScopes=new Set(["THICK_CLASSIFICATION","THICK_ALLOCATION","THICK_PURCHASE_PRIORITY"]);
  const scope=String(proposalSpec?.scope||"");
  if(!allowedScopes.has(scope))return{...common,status:"SHADOW_SCOPE_INVALID",eligible:false,decision:"BLOCK",counterEvidence:[{type:"UNAPPROVED_SHADOW_SCOPE",scope}]};
  const payload={ledgerId:common.ledgerId,candidateType:common.candidateType,scope,change:proposalSpec?.change||null,context:proposalSpec?.context||null,createdFromImpactVersion:impactAssessment?.version||null};
  if(!payload.change||typeof payload.change!=="object")return{...common,status:"SHADOW_CHANGE_MISSING",eligible:false,decision:"HOLD",counterEvidence:[{type:"SHADOW_CHANGE_DEFINITION_MISSING"}]};
  const proposalId=`THICK-SHADOW-${simpleHash(stableStringify(payload))}`;
  return{...common,status:"SHADOW_PROPOSAL_SEALED",eligible:true,decision:"ALLOW_SHADOW_PARALLEL_ONLY",proposalId,scope,change:payload.change,context:payload.context,seal:simpleHash(stableStringify(payload)),baselineImmutable:true,safeguards:{productionWriteAllowed:false,autoApplyAllowed:false,shadowParallelOnly:true,manualReviewRequired:true,baselineMutationForbidden:true}};
}

export function compareThickShadowParallel(shadowProposal,baselineMetrics={},shadowMetrics={},options={}){
  const cfg={minimumRaces:finiteMetric(options.minimumRaces,30),minimumReturnDelta:finiteMetric(options.minimumReturnDelta,0),minimumThickHitDelta:finiteMetric(options.minimumThickHitDelta,0),maxMainHitDrop:finiteMetric(options.maxMainHitDrop,.02),maxSupportHitDrop:finiteMetric(options.maxSupportHitDrop,.03),maxBetCountIncrease:finiteMetric(options.maxBetCountIncrease,.15)};
  const common={version:"THICK-SHADOW-PARALLEL-1.0",researchOnly:true,productionWriteAllowed:false,autoPromotionAllowed:false,proposalId:shadowProposal?.proposalId||null,ledgerId:shadowProposal?.ledgerId||null,config:cfg};
  if(shadowProposal?.status!=="SHADOW_PROPOSAL_SEALED"||shadowProposal?.decision!=="ALLOW_SHADOW_PARALLEL_ONLY")return{...common,status:"SEALED_SHADOW_PROPOSAL_REQUIRED",eligible:false,decision:"BLOCK"};
  const fields=["races","returnRate","thickHitRate","mainHitRate","supportHitRate","betCount"];
  const missing=fields.filter(k=>finiteMetric(baselineMetrics?.[k])===null||finiteMetric(shadowMetrics?.[k])===null);
  if(missing.length)return{...common,status:"SHADOW_EVIDENCE_INCOMPLETE",eligible:false,decision:"HOLD",missingMetrics:missing};
  const races=Math.min(finiteMetric(baselineMetrics.races,0),finiteMetric(shadowMetrics.races,0));
  if(races<cfg.minimumRaces)return{...common,status:"INSUFFICIENT_SHADOW_SAMPLE",eligible:false,decision:"HOLD",races};
  const deltas={
    returnRate:finiteMetric(shadowMetrics.returnRate)-finiteMetric(baselineMetrics.returnRate),
    thickHitRate:finiteMetric(shadowMetrics.thickHitRate)-finiteMetric(baselineMetrics.thickHitRate),
    mainHitRate:finiteMetric(shadowMetrics.mainHitRate)-finiteMetric(baselineMetrics.mainHitRate),
    supportHitRate:finiteMetric(shadowMetrics.supportHitRate)-finiteMetric(baselineMetrics.supportHitRate),
    betCountRelative:relativeDelta(baselineMetrics.betCount,shadowMetrics.betCount)
  };
  const counterEvidence=[];
  if(deltas.mainHitRate < -cfg.maxMainHitDrop)counterEvidence.push({type:"SHADOW_MAIN_HIT_REGRESSION",delta:deltas.mainHitRate});
  if(deltas.supportHitRate < -cfg.maxSupportHitDrop)counterEvidence.push({type:"SHADOW_SUPPORT_HIT_REGRESSION",delta:deltas.supportHitRate});
  if(deltas.betCountRelative > cfg.maxBetCountIncrease)counterEvidence.push({type:"SHADOW_BET_COUNT_INFLATION",delta:deltas.betCountRelative});
  const benefit=deltas.returnRate>=cfg.minimumReturnDelta&&deltas.thickHitRate>=cfg.minimumThickHitDelta;
  const passed=benefit&&!counterEvidence.length;
  return{...common,status:passed?"SHADOW_PARALLEL_PASSED":"SHADOW_PARALLEL_NOT_QUALIFIED",eligible:passed,decision:passed?"RETAIN_FOR_INDEPENDENT_REVIEW":"REJECT_OR_REVISE_RESEARCH_PROPOSAL",baseline:{...baselineMetrics},shadow:{...shadowMetrics},deltas,supportingEvidence:passed?[{type:"THICK_SHADOW_BENEFIT_WITHOUT_GUARDRAIL_REGRESSION",deltas}]:[],counterEvidence,safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,independentReviewRequired:true,shadowOnly:true}};
}

export function buildThickIndependentReviewPackage(shadowComparison,shadowProposal,oosEvaluation={},impactAssessment={},options={}){
  const common={version:"THICK-INDEPENDENT-REVIEW-PACKAGE-1.0",researchOnly:true,productionWriteAllowed:false,autoPromotionAllowed:false,proposalId:shadowProposal?.proposalId||shadowComparison?.proposalId||null,ledgerId:shadowProposal?.ledgerId||shadowComparison?.ledgerId||null,candidateType:shadowProposal?.candidateType||impactAssessment?.candidateType||null};
  if(shadowComparison?.status!=="SHADOW_PARALLEL_PASSED"||shadowComparison?.decision!=="RETAIN_FOR_INDEPENDENT_REVIEW")return{...common,status:"SHADOW_PARALLEL_PASS_REQUIRED",eligible:false,decision:"BLOCK",counterEvidence:[{type:"SHADOW_COMPARISON_NOT_PASSED",status:shadowComparison?.status||null,decision:shadowComparison?.decision||null}]};
  if(shadowProposal?.status!=="SHADOW_PROPOSAL_SEALED")return{...common,status:"SEALED_SHADOW_PROPOSAL_REQUIRED",eligible:false,decision:"BLOCK",counterEvidence:[{type:"SHADOW_PROPOSAL_NOT_SEALED"}]};
  if(oosEvaluation?.status!=="OOS_REPLICATED"||oosEvaluation?.decision!=="RETAIN_RESEARCH_CANDIDATE")return{...common,status:"OOS_REPLICATION_REQUIRED",eligible:false,decision:"BLOCK",counterEvidence:[{type:"OOS_REPLICATION_NOT_RETAINED",status:oosEvaluation?.status||null}]};
  if(impactAssessment?.status!=="IMPACT_PRESCREEN_PASSED")return{...common,status:"IMPACT_PRESCREEN_REQUIRED",eligible:false,decision:"BLOCK",counterEvidence:[{type:"IMPACT_PRESCREEN_NOT_PASSED",status:impactAssessment?.status||null}]};
  const unresolved=Array.isArray(options.unresolvedQuestions)?options.unresolvedQuestions.filter(Boolean):[];
  const explicitCounter=Array.isArray(options.counterEvidence)?options.counterEvidence.filter(Boolean):[];
  const inheritedCounter=[...(shadowComparison?.counterEvidence||[]),...(impactAssessment?.counterEvidence||[]),...(oosEvaluation?.counterEvidence||[])];
  const counterEvidence=[...explicitCounter,...inheritedCounter];
  if(!counterEvidence.length)return{...common,status:"COUNTER_EVIDENCE_REQUIRED",eligible:false,decision:"HOLD",supportingEvidence:shadowComparison?.supportingEvidence||[],counterEvidence:[],unresolvedQuestions:unresolved,safeguards:{independentReviewRequired:true,productionWriteAllowed:false,manualDecisionOnly:true}};
  const packagePayload={proposalId:common.proposalId,ledgerId:common.ledgerId,candidateType:common.candidateType,scope:shadowProposal?.scope||null,seal:shadowProposal?.seal||null,oosStatus:oosEvaluation?.status||null,impactStatus:impactAssessment?.status||null,shadowStatus:shadowComparison?.status||null,deltas:shadowComparison?.deltas||null,unresolvedQuestions:unresolved,counterEvidence};
  const reviewPackageId=`THICK-REVIEW-${simpleHash(stableStringify(packagePayload))}`;
  return{...common,status:"INDEPENDENT_REVIEW_PACKAGE_READY",eligible:true,decision:"MANUAL_INDEPENDENT_REVIEW_ONLY",reviewPackageId,proposalSeal:shadowProposal.seal,scope:shadowProposal.scope,change:shadowProposal.change,context:shadowProposal.context||null,baseline:shadowComparison.baseline||{},shadow:shadowComparison.shadow||{},deltas:shadowComparison.deltas||{},supportingEvidence:shadowComparison.supportingEvidence||[],counterEvidence,unresolvedQuestions:unresolved,sourceChain:{oosVersion:oosEvaluation?.version||null,impactVersion:impactAssessment?.version||null,shadowProposalVersion:shadowProposal?.version||null,shadowComparisonVersion:shadowComparison?.version||null},safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,manualDecisionOnly:true,independentReviewerRequired:true,proposalMutationForbidden:true,negativeEvidenceMustBeReviewed:true}};
}

export function reviewThickIndependentPackageStageOne(reviewPackage,review={}){
  const common={version:"THICK-DUAL-REVIEW-1.0",stage:"PRIMARY",researchOnly:true,productionWriteAllowed:false,autoPromotionAllowed:false,reviewPackageId:reviewPackage?.reviewPackageId||null,proposalId:reviewPackage?.proposalId||null};
  if(reviewPackage?.status!=="INDEPENDENT_REVIEW_PACKAGE_READY"||reviewPackage?.decision!=="MANUAL_INDEPENDENT_REVIEW_ONLY")return{...common,status:"REVIEW_PACKAGE_READY_REQUIRED",eligible:false,decision:"BLOCK"};
  const reviewerId=String(review?.reviewerId||"").trim();
  if(!reviewerId)return{...common,status:"PRIMARY_REVIEWER_REQUIRED",eligible:false,decision:"HOLD"};
  const verdict=String(review?.verdict||"").toUpperCase();
  if(!["APPROVE","REJECT","HOLD"].includes(verdict))return{...common,status:"PRIMARY_VERDICT_REQUIRED",eligible:false,decision:"HOLD",reviewerId};
  const counterReviewed=review?.counterEvidenceReviewed===true;
  const unresolvedReviewed=review?.unresolvedQuestionsReviewed===true;
  if(!counterReviewed||!unresolvedReviewed)return{...common,status:"PRIMARY_EVIDENCE_REVIEW_INCOMPLETE",eligible:false,decision:"HOLD",reviewerId,verdict,counterEvidenceReviewed:counterReviewed,unresolvedQuestionsReviewed:unresolvedReviewed};
  if(verdict==="REJECT")return{...common,status:"PRIMARY_REVIEW_REJECTED",eligible:false,decision:"REJECT_RESEARCH_CANDIDATE",reviewerId,verdict};
  if(verdict==="HOLD")return{...common,status:"PRIMARY_REVIEW_HELD",eligible:false,decision:"HOLD",reviewerId,verdict};
  const primaryReviewSeal=simpleHash(stableStringify({reviewPackageId:common.reviewPackageId,proposalId:common.proposalId,reviewerId,verdict,counterReviewed,unresolvedReviewed}));
  return{...common,status:"PRIMARY_REVIEW_APPROVED",eligible:true,decision:"SECOND_REVIEW_REQUIRED",reviewerId,verdict,primaryReviewSeal,safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,secondReviewerRequired:true,sameReviewerForbidden:true}};
}

export function reviewThickIndependentPackageStageTwo(reviewPackage,primaryReview,review={}){
  const common={version:"THICK-DUAL-REVIEW-1.0",stage:"FINAL",researchOnly:true,productionWriteAllowed:false,autoPromotionAllowed:false,reviewPackageId:reviewPackage?.reviewPackageId||null,proposalId:reviewPackage?.proposalId||null,primaryReviewerId:primaryReview?.reviewerId||null};
  if(reviewPackage?.status!=="INDEPENDENT_REVIEW_PACKAGE_READY")return{...common,status:"REVIEW_PACKAGE_READY_REQUIRED",eligible:false,decision:"BLOCK"};
  if(primaryReview?.status!=="PRIMARY_REVIEW_APPROVED"||primaryReview?.decision!=="SECOND_REVIEW_REQUIRED")return{...common,status:"PRIMARY_APPROVAL_REQUIRED",eligible:false,decision:"BLOCK"};
  const reviewerId=String(review?.reviewerId||"").trim();
  if(!reviewerId)return{...common,status:"SECOND_REVIEWER_REQUIRED",eligible:false,decision:"HOLD"};
  if(reviewerId===primaryReview.reviewerId)return{...common,status:"INDEPENDENT_REVIEWER_REQUIRED",eligible:false,decision:"BLOCK",reviewerId};
  const verdict=String(review?.verdict||"").toUpperCase();
  if(!["APPROVE","REJECT","HOLD"].includes(verdict))return{...common,status:"FINAL_VERDICT_REQUIRED",eligible:false,decision:"HOLD",reviewerId};
  const chainReviewed=review?.sourceChainReviewed===true;
  const counterReviewed=review?.counterEvidenceReviewed===true;
  if(!chainReviewed||!counterReviewed)return{...common,status:"FINAL_EVIDENCE_REVIEW_INCOMPLETE",eligible:false,decision:"HOLD",reviewerId,verdict,sourceChainReviewed:chainReviewed,counterEvidenceReviewed:counterReviewed};
  if(verdict==="REJECT")return{...common,status:"FINAL_REVIEW_REJECTED",eligible:false,decision:"REJECT_RESEARCH_CANDIDATE",reviewerId,verdict};
  if(verdict==="HOLD")return{...common,status:"FINAL_REVIEW_HELD",eligible:false,decision:"HOLD",reviewerId,verdict};
  const finalReviewSeal=simpleHash(stableStringify({reviewPackageId:common.reviewPackageId,proposalId:common.proposalId,primaryReviewSeal:primaryReview.primaryReviewSeal,primaryReviewerId:primaryReview.reviewerId,reviewerId,verdict,chainReviewed,counterReviewed}));
  return{...common,status:"DUAL_INDEPENDENT_REVIEW_APPROVED",eligible:true,decision:"ALLOW_SEALED_VALIDATION_ONLY",reviewerId,verdict,primaryReviewSeal:primaryReview.primaryReviewSeal,finalReviewSeal,safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,sealedValidationOnly:true,manualProductionApprovalStillRequired:true}};
}


export function createThickSealedValidationPackage(reviewPackage,primaryReview,finalReview,validationSpec={}){
  const common={version:"THICK-SEALED-VALIDATION-PACKAGE-1.0",researchOnly:true,productionWriteAllowed:false,autoPromotionAllowed:false,reviewPackageId:reviewPackage?.reviewPackageId||null,proposalId:reviewPackage?.proposalId||null};
  if(reviewPackage?.status!=="INDEPENDENT_REVIEW_PACKAGE_READY")return{...common,status:"REVIEW_PACKAGE_READY_REQUIRED",eligible:false,decision:"BLOCK"};
  if(primaryReview?.status!=="PRIMARY_REVIEW_APPROVED")return{...common,status:"PRIMARY_APPROVAL_REQUIRED",eligible:false,decision:"BLOCK"};
  if(finalReview?.status!=="DUAL_INDEPENDENT_REVIEW_APPROVED"||finalReview?.decision!=="ALLOW_SEALED_VALIDATION_ONLY")return{...common,status:"DUAL_REVIEW_APPROVAL_REQUIRED",eligible:false,decision:"BLOCK"};
  if(finalReview?.primaryReviewSeal!==primaryReview?.primaryReviewSeal)return{...common,status:"REVIEW_CHAIN_MISMATCH",eligible:false,decision:"BLOCK"};
  const requiredMetrics=Array.isArray(validationSpec?.requiredMetrics)?validationSpec.requiredMetrics.filter(Boolean):[];
  const validationCohort=validationSpec?.validationCohort||null;
  const validationCriteria={
    minimumRaces:finiteMetric(validationSpec?.validationCriteria?.minimumRaces,30),
    minimumReturnDelta:finiteMetric(validationSpec?.validationCriteria?.minimumReturnDelta,0),
    minimumThickHitDelta:finiteMetric(validationSpec?.validationCriteria?.minimumThickHitDelta,0),
    maxMainHitDrop:finiteMetric(validationSpec?.validationCriteria?.maxMainHitDrop,.01),
    maxSupportHitDrop:finiteMetric(validationSpec?.validationCriteria?.maxSupportHitDrop,.02),
    maxBetCountIncrease:finiteMetric(validationSpec?.validationCriteria?.maxBetCountIncrease,.10)
  };
  if(!requiredMetrics.length||!validationCohort)return{...common,status:"VALIDATION_SPEC_INCOMPLETE",eligible:false,decision:"HOLD"};
  const payload={reviewPackageId:common.reviewPackageId,proposalId:common.proposalId,proposalSeal:reviewPackage?.proposalSeal||null,scope:reviewPackage?.scope||null,change:reviewPackage?.change||null,context:reviewPackage?.context||null,sourceChain:reviewPackage?.sourceChain||null,primaryReviewSeal:primaryReview?.primaryReviewSeal||null,finalReviewSeal:finalReview?.finalReviewSeal||null,primaryReviewerId:primaryReview?.reviewerId||null,finalReviewerId:finalReview?.reviewerId||null,requiredMetrics:[...requiredMetrics],validationCohort,validationCriteria};
  const validationPackageId=`THICK-SEALED-VALIDATION-${simpleHash(stableStringify(payload))}`;
  return{...common,status:"SEALED_VALIDATION_PACKAGE_READY",eligible:true,decision:"RUN_SEALED_VALIDATION_ONLY",validationPackageId,proposalSeal:reviewPackage?.proposalSeal||null,scope:reviewPackage?.scope||null,change:reviewPackage?.change||null,context:reviewPackage?.context||null,sourceChain:reviewPackage?.sourceChain||null,requiredMetrics:[...requiredMetrics],validationCohort,validationCriteria,primaryReviewSeal:primaryReview.primaryReviewSeal,finalReviewSeal:finalReview.finalReviewSeal,primaryReviewerId:primaryReview.reviewerId,finalReviewerId:finalReview.reviewerId,seal:simpleHash(stableStringify(payload)),safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,packageMutationForbidden:true,metricMutationForbidden:true,cohortMutationForbidden:true,criteriaMutationForbidden:true,manualProductionApprovalStillRequired:true}};
}

export function verifyThickSealedValidationPackage(pkg,candidate={}){
  if(pkg?.status!=="SEALED_VALIDATION_PACKAGE_READY")return{status:"SEALED_VALIDATION_PACKAGE_REQUIRED",valid:false};
  const payload={reviewPackageId:pkg.reviewPackageId||null,proposalId:pkg.proposalId||null,proposalSeal:pkg.proposalSeal||null,scope:pkg.scope||null,change:pkg.change||null,context:pkg.context||null,sourceChain:pkg.sourceChain||null,primaryReviewSeal:pkg.primaryReviewSeal||null,finalReviewSeal:pkg.finalReviewSeal||null,primaryReviewerId:pkg.primaryReviewerId||null,finalReviewerId:pkg.finalReviewerId||null,requiredMetrics:[...(pkg.requiredMetrics||[])],validationCohort:pkg.validationCohort||null,validationCriteria:pkg.validationCriteria||null};
  const expected=pkg.seal;
  const actual=simpleHash(stableStringify(payload));
  return{status:expected===actual?"SEALED_VALIDATION_PACKAGE_VERIFIED":"SEAL_MISMATCH",valid:expected===actual,expectedSeal:expected,actualSeal:actual};
}

export function runThickSealedValidation(pkg,baselineMetrics={},candidateMetrics={},evidence={},options={}){
  const cfg={...(pkg?.validationCriteria||{})};
  const optionKeys=["minimumRaces","minimumReturnDelta","minimumThickHitDelta","maxMainHitDrop","maxSupportHitDrop","maxBetCountIncrease"];
  const supplied=optionKeys.filter(k=>Object.prototype.hasOwnProperty.call(options||{},k));
  const mismatched=supplied.filter(k=>finiteMetric(options?.[k])!==finiteMetric(cfg?.[k]));
  const common={version:"THICK-SEALED-VALIDATION-RUN-1.0",researchOnly:true,productionWriteAllowed:false,autoPromotionAllowed:false,validationPackageId:pkg?.validationPackageId||null,proposalId:pkg?.proposalId||null,config:cfg};
  const verification=verifyThickSealedValidationPackage(pkg);
  if(!verification.valid)return{...common,status:verification.status||"SEAL_MISMATCH",eligible:false,decision:"BLOCK",verification};
  if(mismatched.length)return{...common,status:"SEALED_VALIDATION_CRITERIA_MISMATCH",eligible:false,decision:"BLOCK",mismatchedCriteria:mismatched,sealedCriteria:{...cfg}};
  if(pkg?.decision!=="RUN_SEALED_VALIDATION_ONLY")return{...common,status:"SEALED_VALIDATION_DECISION_REQUIRED",eligible:false,decision:"BLOCK"};
  const cohortId=String(pkg?.validationCohort?.id||"");
  const evidenceCohortId=String(evidence?.cohortId||"");
  if(!cohortId||pkg?.validationCohort?.frozen!==true||evidenceCohortId!==cohortId)return{...common,status:"VALIDATION_EVIDENCE_INVALID",eligible:false,decision:"BLOCK",counterEvidence:[{type:"SEALED_COHORT_MISMATCH_OR_NOT_FROZEN",sealedCohortId:cohortId||null,evidenceCohortId:evidenceCohortId||null,frozen:pkg?.validationCohort?.frozen===true}]};
  const mandatory=["races","returnRate","thickHitRate","mainHitRate","supportHitRate","betCount"];
  const sealedRequired=new Set(Array.isArray(pkg?.requiredMetrics)?pkg.requiredMetrics:[]);
  const unsealedMandatory=mandatory.filter(k=>!sealedRequired.has(k));
  if(unsealedMandatory.length)return{...common,status:"SEALED_METRIC_SET_INCOMPLETE",eligible:false,decision:"HOLD",missingSealedMetrics:unsealedMandatory};
  const missing=mandatory.filter(k=>finiteMetric(baselineMetrics?.[k])===null||finiteMetric(candidateMetrics?.[k])===null);
  if(missing.length)return{...common,status:"VALIDATION_EVIDENCE_INCOMPLETE",eligible:false,decision:"HOLD",missingMetrics:missing};
  const races=Math.min(finiteMetric(baselineMetrics.races,0),finiteMetric(candidateMetrics.races,0));
  if(races<cfg.minimumRaces)return{...common,status:"INSUFFICIENT_SEALED_VALIDATION_SAMPLE",eligible:false,decision:"HOLD",races,minimumRaces:cfg.minimumRaces};
  const deltas={
    returnRate:finiteMetric(candidateMetrics.returnRate)-finiteMetric(baselineMetrics.returnRate),
    thickHitRate:finiteMetric(candidateMetrics.thickHitRate)-finiteMetric(baselineMetrics.thickHitRate),
    mainHitRate:finiteMetric(candidateMetrics.mainHitRate)-finiteMetric(baselineMetrics.mainHitRate),
    supportHitRate:finiteMetric(candidateMetrics.supportHitRate)-finiteMetric(baselineMetrics.supportHitRate),
    betCountRelative:relativeDelta(baselineMetrics.betCount,candidateMetrics.betCount)
  };
  const counterEvidence=[];
  if(deltas.returnRate<cfg.minimumReturnDelta)counterEvidence.push({type:"SEALED_RETURN_REGRESSION",delta:deltas.returnRate,minimum:cfg.minimumReturnDelta});
  if(deltas.thickHitRate<cfg.minimumThickHitDelta)counterEvidence.push({type:"SEALED_THICK_HIT_NOT_REPLICATED",delta:deltas.thickHitRate,minimum:cfg.minimumThickHitDelta});
  if(deltas.mainHitRate < -cfg.maxMainHitDrop)counterEvidence.push({type:"SEALED_MAIN_HIT_REGRESSION",delta:deltas.mainHitRate,limit:-cfg.maxMainHitDrop});
  if(deltas.supportHitRate < -cfg.maxSupportHitDrop)counterEvidence.push({type:"SEALED_SUPPORT_HIT_REGRESSION",delta:deltas.supportHitRate,limit:-cfg.maxSupportHitDrop});
  if(deltas.betCountRelative > cfg.maxBetCountIncrease)counterEvidence.push({type:"SEALED_BET_COUNT_INFLATION",delta:deltas.betCountRelative,limit:cfg.maxBetCountIncrease});
  const passed=!counterEvidence.length;
  const resultPayload={validationPackageId:common.validationPackageId,proposalId:common.proposalId,packageSeal:pkg.seal,cohortId,races,baseline:baselineMetrics,candidate:candidateMetrics,deltas,cfg,passed};
  const validationRunId=`THICK-SEALED-RUN-${simpleHash(stableStringify(resultPayload))}`;
  return{...common,status:passed?"SEALED_VALIDATION_PASSED":"SEALED_VALIDATION_FAILED",eligible:passed,decision:passed?"RETAIN_FOR_FINAL_PROMOTION_REVIEW":"REJECT_RESEARCH_CANDIDATE",validationRunId,cohortId,races,baseline:{...baselineMetrics},candidate:{...candidateMetrics},deltas,supportingEvidence:passed?[{type:"SEALED_FINAL_VALIDATION_PASSED_WITH_GUARDRAILS",deltas,races}]:[],counterEvidence,safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,finalPromotionReviewRequired:true,manualProductionApprovalStillRequired:true,validationPackageMutationForbidden:true}};
}


export function buildThickFinalPromotionReviewPackage(validationRun,validationPackage,reviewOptions={}){
  const common={version:"THICK-FINAL-PROMOTION-REVIEW-PACKAGE-1.0",researchOnly:true,productionWriteAllowed:false,autoPromotionAllowed:false,validationRunId:validationRun?.validationRunId||null,validationPackageId:validationPackage?.validationPackageId||validationRun?.validationPackageId||null,proposalId:validationRun?.proposalId||validationPackage?.proposalId||null};
  if(validationRun?.status!=="SEALED_VALIDATION_PASSED"||validationRun?.decision!=="RETAIN_FOR_FINAL_PROMOTION_REVIEW")return{...common,status:"SEALED_VALIDATION_PASS_REQUIRED",eligible:false,decision:"BLOCK",counterEvidence:[{type:"SEALED_VALIDATION_NOT_PASSED",status:validationRun?.status||null,decision:validationRun?.decision||null}]};
  const verification=verifyThickSealedValidationPackage(validationPackage);
  if(!verification.valid)return{...common,status:verification.status||"SEAL_MISMATCH",eligible:false,decision:"BLOCK",verification};
  if(validationRun?.validationPackageId!==validationPackage?.validationPackageId)return{...common,status:"VALIDATION_CHAIN_MISMATCH",eligible:false,decision:"BLOCK",counterEvidence:[{type:"VALIDATION_PACKAGE_ID_MISMATCH"}]};
  const explicitCounter=Array.isArray(reviewOptions.counterEvidence)?reviewOptions.counterEvidence.filter(Boolean):[];
  const inheritedCounter=Array.isArray(validationRun?.counterEvidence)?validationRun.counterEvidence.filter(Boolean):[];
  const counterEvidence=[...explicitCounter,...inheritedCounter];
  const unresolvedQuestions=Array.isArray(reviewOptions.unresolvedQuestions)?reviewOptions.unresolvedQuestions.filter(Boolean):[];
  const rollbackConditions=Array.isArray(reviewOptions.rollbackConditions)?reviewOptions.rollbackConditions.filter(Boolean):[];
  const requiredRollbackTypes=new Set(rollbackConditions.map(x=>typeof x==="string"?x:x?.type).filter(Boolean));
  const required=["RETURN_RATE_DROP","THICK_HIT_REGRESSION","MAIN_HIT_REGRESSION","SUPPORT_HIT_REGRESSION","BET_COUNT_INFLATION"];
  const missingRollback=required.filter(x=>!requiredRollbackTypes.has(x));
  if(missingRollback.length)return{...common,status:"ROLLBACK_CONDITIONS_INCOMPLETE",eligible:false,decision:"HOLD",missingRollbackConditions:missingRollback,counterEvidence,unresolvedQuestions};
  if(!counterEvidence.length)return{...common,status:"FINAL_REVIEW_COUNTER_EVIDENCE_REQUIRED",eligible:false,decision:"HOLD",counterEvidence:[],unresolvedQuestions,rollbackConditions};
  const payload={validationRunId:common.validationRunId,validationPackageId:common.validationPackageId,proposalId:common.proposalId,packageSeal:validationPackage?.seal||null,validationRunStatus:validationRun?.status||null,cohortId:validationRun?.cohortId||null,deltas:validationRun?.deltas||null,counterEvidence,unresolvedQuestions,rollbackConditions,scope:validationPackage?.scope||null,change:validationPackage?.change||null,context:validationPackage?.context||null,primaryReviewerId:validationPackage?.primaryReviewerId||null,finalReviewerId:validationPackage?.finalReviewerId||null};
  const finalReviewPackageId=`THICK-FINAL-PROMOTION-REVIEW-${simpleHash(stableStringify(payload))}`;
  return{...common,status:"FINAL_PROMOTION_REVIEW_PACKAGE_READY",eligible:true,decision:"MANUAL_FINAL_PROMOTION_REVIEW_ONLY",finalReviewPackageId,packageSeal:validationPackage.seal,scope:validationPackage.scope||null,change:validationPackage.change||null,context:validationPackage.context||null,cohortId:validationRun.cohortId||null,validationDeltas:validationRun.deltas||{},supportingEvidence:validationRun.supportingEvidence||[],counterEvidence,unresolvedQuestions,rollbackConditions,sourceChain:{validationPackageVersion:validationPackage.version||null,validationRunVersion:validationRun.version||null,primaryReviewerId:validationPackage.primaryReviewerId||null,finalReviewerId:validationPackage.finalReviewerId||null},seal:simpleHash(stableStringify(payload)),safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,manualFinalReviewOnly:true,manualProductionApprovalStillRequired:true,rollbackConditionsMandatory:true,packageMutationForbidden:true}};
}

export function verifyThickFinalPromotionReviewPackage(pkg){
  if(pkg?.status!=="FINAL_PROMOTION_REVIEW_PACKAGE_READY")return{status:"FINAL_PROMOTION_REVIEW_PACKAGE_REQUIRED",valid:false};
  const payload={validationRunId:pkg.validationRunId||null,validationPackageId:pkg.validationPackageId||null,proposalId:pkg.proposalId||null,packageSeal:pkg.packageSeal||null,validationRunStatus:"SEALED_VALIDATION_PASSED",cohortId:pkg.cohortId||null,deltas:pkg.validationDeltas||null,counterEvidence:pkg.counterEvidence||[],unresolvedQuestions:pkg.unresolvedQuestions||[],rollbackConditions:pkg.rollbackConditions||[],scope:pkg.scope||null,change:pkg.change||null,context:pkg.context||null,primaryReviewerId:pkg.sourceChain?.primaryReviewerId||null,finalReviewerId:pkg.sourceChain?.finalReviewerId||null};
  const actual=simpleHash(stableStringify(payload));
  return{status:actual===pkg.seal?"FINAL_PROMOTION_REVIEW_PACKAGE_VERIFIED":"SEAL_MISMATCH",valid:actual===pkg.seal,expectedSeal:pkg.seal,actualSeal:actual};
}

export function finalizeThickFinalPromotionReview(pkg,review={}){
  const common={version:"THICK-FINAL-PROMOTION-REVIEW-DECISION-1.0",researchOnly:true,productionWriteAllowed:false,autoPromotionAllowed:false,finalReviewPackageId:pkg?.finalReviewPackageId||null,validationRunId:pkg?.validationRunId||null,proposalId:pkg?.proposalId||null};
  const verification=verifyThickFinalPromotionReviewPackage(pkg);
  if(!verification.valid)return{...common,status:verification.status||"SEAL_MISMATCH",eligible:false,decision:"BLOCK",verification};
  if(pkg?.decision!=="MANUAL_FINAL_PROMOTION_REVIEW_ONLY")return{...common,status:"MANUAL_FINAL_PROMOTION_REVIEW_REQUIRED",eligible:false,decision:"BLOCK"};
  const reviewerId=String(review?.reviewerId||"").trim();
  if(!reviewerId)return{...common,status:"FINAL_PROMOTION_REVIEWER_REQUIRED",eligible:false,decision:"HOLD"};
  const priorReviewers=new Set([pkg?.sourceChain?.primaryReviewerId,pkg?.sourceChain?.finalReviewerId].filter(Boolean).map(String));
  if(priorReviewers.has(reviewerId))return{...common,status:"INDEPENDENT_FINAL_PROMOTION_REVIEWER_REQUIRED",eligible:false,decision:"HOLD",reviewerId,priorReviewerIds:[...priorReviewers]};
  const verdict=String(review?.verdict||"").trim().toUpperCase();
  const allowed=new Set(["APPROVE_LIMITED_CANARY","HOLD","REJECT"]);
  if(!allowed.has(verdict))return{...common,status:"FINAL_PROMOTION_VERDICT_REQUIRED",eligible:false,decision:"HOLD",reviewerId};
  const acknowledgedCounterEvidence=review?.acknowledgedCounterEvidence===true;
  const acknowledgedRollbackTypes=new Set((Array.isArray(review?.acknowledgedRollbackTypes)?review.acknowledgedRollbackTypes:[]).map(x=>String(x||"").trim()).filter(Boolean));
  const requiredRollbackTypes=(Array.isArray(pkg?.rollbackConditions)?pkg.rollbackConditions:[]).map(x=>typeof x==="string"?x:x?.type).filter(Boolean);
  const missingRollbackAcknowledgements=requiredRollbackTypes.filter(x=>!acknowledgedRollbackTypes.has(x));
  if(verdict==="APPROVE_LIMITED_CANARY"&&!acknowledgedCounterEvidence)return{...common,status:"COUNTER_EVIDENCE_ACKNOWLEDGEMENT_REQUIRED",eligible:false,decision:"HOLD",reviewerId,verdict};
  if(verdict==="APPROVE_LIMITED_CANARY"&&missingRollbackAcknowledgements.length)return{...common,status:"ROLLBACK_ACKNOWLEDGEMENT_INCOMPLETE",eligible:false,decision:"HOLD",reviewerId,verdict,missingRollbackAcknowledgements};
  const note=String(review?.note||"").trim();
  const payload={finalReviewPackageId:pkg.finalReviewPackageId,packageSeal:pkg.seal,validationRunId:pkg.validationRunId||null,proposalId:pkg.proposalId||null,reviewerId,verdict,note,acknowledgedCounterEvidence,acknowledgedRollbackTypes:[...acknowledgedRollbackTypes].sort(),requiredRollbackTypes:[...requiredRollbackTypes].sort(),scope:pkg.scope||null,change:pkg.change||null,context:pkg.context||null,cohortId:pkg.cohortId||null,validationDeltas:pkg.validationDeltas||{},rollbackConditions:pkg.rollbackConditions||[],counterEvidence:pkg.counterEvidence||[],unresolvedQuestions:pkg.unresolvedQuestions||[]};
  const approvalSeal=simpleHash(stableStringify(payload));
  if(verdict==="REJECT")return{...common,status:"FINAL_PROMOTION_REJECTED",eligible:false,decision:"REJECT_RESEARCH_CANDIDATE",reviewerId,verdict,note,approvalSeal,packageSeal:pkg.seal,safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,limitedCanaryPlanningAllowed:false,approvalMutationForbidden:true}};
  if(verdict==="HOLD")return{...common,status:"FINAL_PROMOTION_HELD",eligible:false,decision:"HOLD",reviewerId,verdict,note,approvalSeal,packageSeal:pkg.seal,safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,limitedCanaryPlanningAllowed:false,approvalMutationForbidden:true}};
  return{...common,status:"FINAL_PROMOTION_REVIEW_APPROVED",eligible:true,decision:"LIMITED_CANARY_CANDIDATE_ONLY",reviewerId,verdict,note,packageSeal:pkg.seal,approvalSeal,acknowledgedCounterEvidence,acknowledgedRollbackTypes:[...acknowledgedRollbackTypes].sort(),rollbackConditions:pkg.rollbackConditions||[],counterEvidence:pkg.counterEvidence||[],unresolvedQuestions:pkg.unresolvedQuestions||[],scope:pkg.scope||null,change:pkg.change||null,context:pkg.context||null,cohortId:pkg.cohortId||null,validationDeltas:pkg.validationDeltas||{},safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,limitedCanaryPlanningAllowed:true,canaryActivationAllowed:false,manualCanaryPlanRequired:true,rollbackConditionsLocked:true,approvalMutationForbidden:true}};
}

export function verifyThickFinalPromotionReviewDecision(decision,pkg){
  if(decision?.status!=="FINAL_PROMOTION_REVIEW_APPROVED")return{status:"FINAL_PROMOTION_APPROVAL_REQUIRED",valid:false};
  const pkgVerification=verifyThickFinalPromotionReviewPackage(pkg);
  if(!pkgVerification.valid)return{status:pkgVerification.status||"SEAL_MISMATCH",valid:false};
  if(decision?.finalReviewPackageId!==pkg?.finalReviewPackageId||decision?.packageSeal!==pkg?.seal)return{status:"FINAL_REVIEW_CHAIN_MISMATCH",valid:false};
  const requiredRollbackTypes=(Array.isArray(pkg?.rollbackConditions)?pkg.rollbackConditions:[]).map(x=>typeof x==="string"?x:x?.type).filter(Boolean).sort();
  const payload={finalReviewPackageId:pkg.finalReviewPackageId,packageSeal:pkg.seal,validationRunId:pkg.validationRunId||null,proposalId:pkg.proposalId||null,reviewerId:decision.reviewerId||"",verdict:decision.verdict||"",note:decision.note||"",acknowledgedCounterEvidence:decision.acknowledgedCounterEvidence===true,acknowledgedRollbackTypes:[...(decision.acknowledgedRollbackTypes||[])].sort(),requiredRollbackTypes,scope:pkg.scope||null,change:pkg.change||null,context:pkg.context||null,cohortId:pkg.cohortId||null,validationDeltas:pkg.validationDeltas||{},rollbackConditions:pkg.rollbackConditions||[],counterEvidence:pkg.counterEvidence||[],unresolvedQuestions:pkg.unresolvedQuestions||[]};
  const actual=simpleHash(stableStringify(payload));
  return{status:actual===decision.approvalSeal?"FINAL_PROMOTION_REVIEW_DECISION_VERIFIED":"SEAL_MISMATCH",valid:actual===decision.approvalSeal,expectedSeal:decision.approvalSeal,actualSeal:actual};
}


export function createThickLimitedCanaryPlan(finalDecision,pkg,plan={}){
  const common={version:"THICK-LIMITED-CANARY-PLAN-1.0",researchOnly:true,productionWriteAllowed:false,autoPromotionAllowed:false,finalReviewPackageId:pkg?.finalReviewPackageId||null,approvalSeal:finalDecision?.approvalSeal||null,proposalId:pkg?.proposalId||null};
  const decisionVerification=verifyThickFinalPromotionReviewDecision(finalDecision,pkg);
  if(!decisionVerification.valid)return{...common,status:decisionVerification.status||"FINAL_PROMOTION_APPROVAL_REQUIRED",eligible:false,decision:"BLOCK",verification:decisionVerification};
  if(finalDecision?.decision!=="LIMITED_CANARY_CANDIDATE_ONLY")return{...common,status:"LIMITED_CANARY_CANDIDATE_REQUIRED",eligible:false,decision:"BLOCK"};
  const exposureShare=Number(plan?.exposureShare);
  if(!Number.isFinite(exposureShare)||exposureShare<=0||exposureShare>.10)return{...common,status:"CANARY_EXPOSURE_OUT_OF_RANGE",eligible:false,decision:"HOLD",allowedRange:{minExclusive:0,maxInclusive:.10},exposureShare:Number.isFinite(exposureShare)?exposureShare:null};
  const targetCohortId=String(plan?.targetCohortId||pkg?.cohortId||"").trim();
  if(!targetCohortId)return{...common,status:"CANARY_TARGET_COHORT_REQUIRED",eligible:false,decision:"HOLD"};
  if(pkg?.cohortId&&targetCohortId!==String(pkg.cohortId))return{...common,status:"CANARY_COHORT_MISMATCH",eligible:false,decision:"BLOCK",expectedCohortId:pkg.cohortId,targetCohortId};
  const monitoringMetrics=[...(Array.isArray(plan?.monitoringMetrics)?plan.monitoringMetrics:["returnRate","thickHitRate","mainHitRate","supportHitRate","betCount"])].map(x=>String(x||"").trim()).filter(Boolean);
  const requiredMetrics=["returnRate","thickHitRate","mainHitRate","supportHitRate","betCount"];
  const missingMetrics=requiredMetrics.filter(x=>!monitoringMetrics.includes(x));
  if(missingMetrics.length)return{...common,status:"CANARY_MONITORING_METRICS_INCOMPLETE",eligible:false,decision:"HOLD",missingMetrics};
  const rollbackConditions=Array.isArray(pkg?.rollbackConditions)?pkg.rollbackConditions:[];
  const requiredRollbackTypes=rollbackConditions.map(x=>typeof x==="string"?x:x?.type).filter(Boolean).sort();
  const plannedRollbackTypes=(Array.isArray(plan?.rollbackTypes)?plan.rollbackTypes:requiredRollbackTypes).map(x=>String(x||"").trim()).filter(Boolean).sort();
  const missingRollbackTypes=requiredRollbackTypes.filter(x=>!plannedRollbackTypes.includes(x));
  const extraRollbackTypes=plannedRollbackTypes.filter(x=>!requiredRollbackTypes.includes(x));
  if(missingRollbackTypes.length||extraRollbackTypes.length)return{...common,status:"CANARY_ROLLBACK_CONDITIONS_MISMATCH",eligible:false,decision:"BLOCK",missingRollbackTypes,extraRollbackTypes,requiredRollbackTypes};
  const minimumRaces=Math.trunc(Number(plan?.minimumRaces??30));
  if(!Number.isFinite(minimumRaces)||minimumRaces<30)return{...common,status:"CANARY_MINIMUM_SAMPLE_TOO_SMALL",eligible:false,decision:"HOLD",minimumRequired:30,minimumRaces:Number.isFinite(minimumRaces)?minimumRaces:null};
  const stopOnAnyRollbackBreach=plan?.stopOnAnyRollbackBreach!==false;
  if(!stopOnAnyRollbackBreach)return{...common,status:"CANARY_IMMEDIATE_STOP_REQUIRED",eligible:false,decision:"HOLD"};
  const payload={finalReviewPackageId:pkg.finalReviewPackageId,packageSeal:pkg.seal,approvalSeal:finalDecision.approvalSeal,reviewerId:finalDecision.reviewerId||null,proposalId:pkg.proposalId||null,scope:pkg.scope||null,change:pkg.change||null,context:pkg.context||null,targetCohortId,exposureShare,minimumRaces,monitoringMetrics:[...monitoringMetrics].sort(),rollbackConditions,rollbackTypes:plannedRollbackTypes,stopOnAnyRollbackBreach:true};
  const canaryPlanId=`THICK-LIMITED-CANARY-${simpleHash(stableStringify(payload))}`;
  return{...common,status:"LIMITED_CANARY_PLAN_READY",eligible:true,decision:"MANUAL_CANARY_ACTIVATION_REVIEW_ONLY",canaryPlanId,packageSeal:pkg.seal,reviewerId:finalDecision.reviewerId||null,targetCohortId,exposureShare,minimumRaces,monitoringMetrics:[...monitoringMetrics].sort(),rollbackConditions,rollbackTypes:plannedRollbackTypes,stopOnAnyRollbackBreach:true,scope:pkg.scope||null,change:pkg.change||null,context:pkg.context||null,seal:simpleHash(stableStringify(payload)),safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,canaryActivationAllowed:false,manualCanaryActivationReviewRequired:true,maxExposureShare:.10,rollbackConditionsLocked:true,immediateStopOnRollbackBreach:true,planMutationForbidden:true}};
}

export function verifyThickLimitedCanaryPlan(canaryPlan,finalDecision,pkg){
  if(canaryPlan?.status!=="LIMITED_CANARY_PLAN_READY")return{status:"LIMITED_CANARY_PLAN_REQUIRED",valid:false};
  const decisionVerification=verifyThickFinalPromotionReviewDecision(finalDecision,pkg);
  if(!decisionVerification.valid)return{status:decisionVerification.status||"FINAL_PROMOTION_APPROVAL_REQUIRED",valid:false};
  if(canaryPlan?.approvalSeal!==finalDecision?.approvalSeal||canaryPlan?.packageSeal!==pkg?.seal)return{status:"CANARY_PLAN_CHAIN_MISMATCH",valid:false};
  const payload={finalReviewPackageId:pkg.finalReviewPackageId,packageSeal:pkg.seal,approvalSeal:finalDecision.approvalSeal,reviewerId:finalDecision.reviewerId||null,proposalId:pkg.proposalId||null,scope:pkg.scope||null,change:pkg.change||null,context:pkg.context||null,targetCohortId:canaryPlan.targetCohortId||null,exposureShare:canaryPlan.exposureShare,minimumRaces:canaryPlan.minimumRaces,monitoringMetrics:[...(canaryPlan.monitoringMetrics||[])].sort(),rollbackConditions:pkg.rollbackConditions||[],rollbackTypes:[...(canaryPlan.rollbackTypes||[])].sort(),stopOnAnyRollbackBreach:canaryPlan.stopOnAnyRollbackBreach===true};
  const actual=simpleHash(stableStringify(payload));
  return{status:actual===canaryPlan.seal?"LIMITED_CANARY_PLAN_VERIFIED":"SEAL_MISMATCH",valid:actual===canaryPlan.seal,expectedSeal:canaryPlan.seal,actualSeal:actual};
}

export function finalizeThickLimitedCanaryActivationReview(canaryPlan,finalDecision,pkg,review={}){
  const common={version:"THICK-LIMITED-CANARY-ACTIVATION-REVIEW-1.0",researchOnly:true,productionWriteAllowed:false,autoPromotionAllowed:false,canaryPlanId:canaryPlan?.canaryPlanId||null,proposalId:pkg?.proposalId||null};
  const planVerification=verifyThickLimitedCanaryPlan(canaryPlan,finalDecision,pkg);
  if(!planVerification.valid)return{...common,status:planVerification.status||"LIMITED_CANARY_PLAN_REQUIRED",eligible:false,decision:"BLOCK",verification:planVerification};
  if(canaryPlan?.decision!=="MANUAL_CANARY_ACTIVATION_REVIEW_ONLY")return{...common,status:"MANUAL_CANARY_ACTIVATION_REVIEW_REQUIRED",eligible:false,decision:"BLOCK"};
  const reviewerId=String(review?.reviewerId||"").trim();
  if(!reviewerId)return{...common,status:"CANARY_ACTIVATION_REVIEWER_REQUIRED",eligible:false,decision:"HOLD"};
  const excludedReviewers=new Set([
    finalDecision?.reviewerId,
    pkg?.sourceChain?.primaryReviewerId,
    pkg?.sourceChain?.finalReviewerId
  ].filter(Boolean).map(String));
  if(excludedReviewers.has(reviewerId))return{...common,status:"INDEPENDENT_CANARY_ACTIVATION_REVIEWER_REQUIRED",eligible:false,decision:"HOLD",reviewerId,excludedReviewerIds:[...excludedReviewers]};
  const verdict=String(review?.verdict||"").trim().toUpperCase();
  const allowed=new Set(["APPROVE_CANARY_ACTIVATION","HOLD","REJECT"]);
  if(!allowed.has(verdict))return{...common,status:"CANARY_ACTIVATION_VERDICT_REQUIRED",eligible:false,decision:"HOLD",reviewerId};
  const acknowledgedPlanSeal=review?.acknowledgedPlanSeal===true;
  const acknowledgedImmediateStop=review?.acknowledgedImmediateStop===true;
  const acknowledgedMonitoringMetrics=new Set((Array.isArray(review?.acknowledgedMonitoringMetrics)?review.acknowledgedMonitoringMetrics:[]).map(x=>String(x||"").trim()).filter(Boolean));
  const requiredMetrics=[...(canaryPlan?.monitoringMetrics||[])].sort();
  const missingMetricAcknowledgements=requiredMetrics.filter(x=>!acknowledgedMonitoringMetrics.has(x));
  const acknowledgedRollbackTypes=new Set((Array.isArray(review?.acknowledgedRollbackTypes)?review.acknowledgedRollbackTypes:[]).map(x=>String(x||"").trim()).filter(Boolean));
  const requiredRollbackTypes=[...(canaryPlan?.rollbackTypes||[])].sort();
  const missingRollbackAcknowledgements=requiredRollbackTypes.filter(x=>!acknowledgedRollbackTypes.has(x));
  if(verdict==="APPROVE_CANARY_ACTIVATION"&&!acknowledgedPlanSeal)return{...common,status:"CANARY_PLAN_SEAL_ACKNOWLEDGEMENT_REQUIRED",eligible:false,decision:"HOLD",reviewerId,verdict};
  if(verdict==="APPROVE_CANARY_ACTIVATION"&&!acknowledgedImmediateStop)return{...common,status:"CANARY_IMMEDIATE_STOP_ACKNOWLEDGEMENT_REQUIRED",eligible:false,decision:"HOLD",reviewerId,verdict};
  if(verdict==="APPROVE_CANARY_ACTIVATION"&&missingMetricAcknowledgements.length)return{...common,status:"CANARY_MONITORING_ACKNOWLEDGEMENT_INCOMPLETE",eligible:false,decision:"HOLD",reviewerId,verdict,missingMetricAcknowledgements};
  if(verdict==="APPROVE_CANARY_ACTIVATION"&&missingRollbackAcknowledgements.length)return{...common,status:"CANARY_ROLLBACK_ACKNOWLEDGEMENT_INCOMPLETE",eligible:false,decision:"HOLD",reviewerId,verdict,missingRollbackAcknowledgements};
  const note=String(review?.note||"").trim();
  const payload={canaryPlanId:canaryPlan.canaryPlanId,planSeal:canaryPlan.seal,approvalSeal:finalDecision.approvalSeal,packageSeal:pkg.seal,proposalId:pkg.proposalId||null,reviewerId,verdict,note,acknowledgedPlanSeal,acknowledgedImmediateStop,acknowledgedMonitoringMetrics:[...acknowledgedMonitoringMetrics].sort(),requiredMetrics,acknowledgedRollbackTypes:[...acknowledgedRollbackTypes].sort(),requiredRollbackTypes,targetCohortId:canaryPlan.targetCohortId||null,exposureShare:canaryPlan.exposureShare,minimumRaces:canaryPlan.minimumRaces,monitoringMetrics:requiredMetrics,rollbackConditions:canaryPlan.rollbackConditions||[],rollbackTypes:requiredRollbackTypes,stopOnAnyRollbackBreach:canaryPlan.stopOnAnyRollbackBreach===true};
  const activationApprovalSeal=simpleHash(stableStringify(payload));
  if(verdict==="REJECT")return{...common,status:"CANARY_ACTIVATION_REJECTED",eligible:false,decision:"REJECT_CANARY_ACTIVATION",reviewerId,verdict,note,planSeal:canaryPlan.seal,activationApprovalSeal,safeguards:{productionWriteAllowed:false,canaryActivationAllowed:false,activationMutationForbidden:true}};
  if(verdict==="HOLD")return{...common,status:"CANARY_ACTIVATION_HELD",eligible:false,decision:"HOLD",reviewerId,verdict,note,planSeal:canaryPlan.seal,activationApprovalSeal,safeguards:{productionWriteAllowed:false,canaryActivationAllowed:false,activationMutationForbidden:true}};
  return{...common,status:"CANARY_ACTIVATION_REVIEW_APPROVED",eligible:true,decision:"AUTHORIZED_CANARY_START_ONLY",reviewerId,verdict,note,planSeal:canaryPlan.seal,packageSeal:pkg.seal,finalPromotionApprovalSeal:finalDecision.approvalSeal,activationApprovalSeal,acknowledgedPlanSeal,acknowledgedImmediateStop,acknowledgedMonitoringMetrics:[...acknowledgedMonitoringMetrics].sort(),acknowledgedRollbackTypes:[...acknowledgedRollbackTypes].sort(),targetCohortId:canaryPlan.targetCohortId||null,exposureShare:canaryPlan.exposureShare,minimumRaces:canaryPlan.minimumRaces,monitoringMetrics:requiredMetrics,rollbackConditions:canaryPlan.rollbackConditions||[],rollbackTypes:requiredRollbackTypes,stopOnAnyRollbackBreach:true,safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,canaryActivationAllowed:false,activationExecutionAllowed:false,manualCanaryStartExecutionRequired:true,maxExposureShare:.10,rollbackConditionsLocked:true,immediateStopOnRollbackBreach:true,activationMutationForbidden:true}};
}

export function verifyThickLimitedCanaryActivationReview(activationDecision,canaryPlan,finalDecision,pkg){
  if(activationDecision?.status!=="CANARY_ACTIVATION_REVIEW_APPROVED")return{status:"CANARY_ACTIVATION_APPROVAL_REQUIRED",valid:false};
  const planVerification=verifyThickLimitedCanaryPlan(canaryPlan,finalDecision,pkg);
  if(!planVerification.valid)return{status:planVerification.status||"LIMITED_CANARY_PLAN_REQUIRED",valid:false};
  if(activationDecision?.canaryPlanId!==canaryPlan?.canaryPlanId||activationDecision?.planSeal!==canaryPlan?.seal||activationDecision?.finalPromotionApprovalSeal!==finalDecision?.approvalSeal)return{status:"CANARY_ACTIVATION_CHAIN_MISMATCH",valid:false};
  const requiredMetrics=[...(canaryPlan?.monitoringMetrics||[])].sort();
  const requiredRollbackTypes=[...(canaryPlan?.rollbackTypes||[])].sort();
  const payload={canaryPlanId:canaryPlan.canaryPlanId,planSeal:canaryPlan.seal,approvalSeal:finalDecision.approvalSeal,packageSeal:pkg.seal,proposalId:pkg.proposalId||null,reviewerId:activationDecision.reviewerId||"",verdict:activationDecision.verdict||"",note:activationDecision.note||"",acknowledgedPlanSeal:activationDecision.acknowledgedPlanSeal===true,acknowledgedImmediateStop:activationDecision.acknowledgedImmediateStop===true,acknowledgedMonitoringMetrics:[...(activationDecision.acknowledgedMonitoringMetrics||[])].sort(),requiredMetrics,acknowledgedRollbackTypes:[...(activationDecision.acknowledgedRollbackTypes||[])].sort(),requiredRollbackTypes,targetCohortId:activationDecision.targetCohortId||null,exposureShare:activationDecision.exposureShare,minimumRaces:activationDecision.minimumRaces,monitoringMetrics:[...(activationDecision.monitoringMetrics||[])].sort(),rollbackConditions:activationDecision.rollbackConditions||[],rollbackTypes:[...(activationDecision.rollbackTypes||[])].sort(),stopOnAnyRollbackBreach:activationDecision.stopOnAnyRollbackBreach===true};
  const actual=simpleHash(stableStringify(payload));
  return{status:actual===activationDecision.activationApprovalSeal?"CANARY_ACTIVATION_REVIEW_VERIFIED":"SEAL_MISMATCH",valid:actual===activationDecision.activationApprovalSeal,expectedSeal:activationDecision.activationApprovalSeal,actualSeal:actual};
}


export function startThickLimitedCanaryRun(activationDecision,canaryPlan,finalDecision,pkg,start={}){
  const common={version:"THICK-LIMITED-CANARY-RUN-1.0",researchOnly:true,productionWriteAllowed:false,autoPromotionAllowed:false,canaryPlanId:canaryPlan?.canaryPlanId||null,proposalId:pkg?.proposalId||null};
  const activationVerification=verifyThickLimitedCanaryActivationReview(activationDecision,canaryPlan,finalDecision,pkg);
  if(!activationVerification.valid)return{...common,status:activationVerification.status||"CANARY_ACTIVATION_APPROVAL_REQUIRED",active:false,decision:"BLOCK",verification:activationVerification};
  if(activationDecision?.decision!=="AUTHORIZED_CANARY_START_ONLY")return{...common,status:"AUTHORIZED_CANARY_START_REQUIRED",active:false,decision:"BLOCK"};
  const targetCohortId=String(start?.targetCohortId||canaryPlan?.targetCohortId||"").trim();
  if(!targetCohortId||targetCohortId!==String(canaryPlan?.targetCohortId||""))return{...common,status:"CANARY_START_COHORT_MISMATCH",active:false,decision:"BLOCK",expectedCohortId:canaryPlan?.targetCohortId||null,targetCohortId:targetCohortId||null};
  const exposureShare=Number(start?.exposureShare??canaryPlan?.exposureShare);
  if(!Number.isFinite(exposureShare)||exposureShare!==Number(canaryPlan?.exposureShare)||exposureShare<=0||exposureShare>.10)return{...common,status:"CANARY_START_EXPOSURE_MISMATCH",active:false,decision:"BLOCK",expectedExposureShare:canaryPlan?.exposureShare??null,exposureShare:Number.isFinite(exposureShare)?exposureShare:null};
  const monitoringMetrics=[...(Array.isArray(start?.monitoringMetrics)?start.monitoringMetrics:canaryPlan?.monitoringMetrics||[])].map(String).sort();
  const requiredMetrics=[...(canaryPlan?.monitoringMetrics||[])].map(String).sort();
  if(stableStringify(monitoringMetrics)!==stableStringify(requiredMetrics))return{...common,status:"CANARY_START_MONITORING_MISMATCH",active:false,decision:"BLOCK",requiredMetrics,monitoringMetrics};
  const rollbackTypes=[...(Array.isArray(start?.rollbackTypes)?start.rollbackTypes:canaryPlan?.rollbackTypes||[])].map(String).sort();
  const requiredRollbackTypes=[...(canaryPlan?.rollbackTypes||[])].map(String).sort();
  if(stableStringify(rollbackTypes)!==stableStringify(requiredRollbackTypes))return{...common,status:"CANARY_START_ROLLBACK_MISMATCH",active:false,decision:"BLOCK",requiredRollbackTypes,rollbackTypes};
  if(start?.stopOnAnyRollbackBreach===false||canaryPlan?.stopOnAnyRollbackBreach!==true)return{...common,status:"CANARY_START_IMMEDIATE_STOP_REQUIRED",active:false,decision:"HOLD"};
  const startedAt=String(start?.startedAt||new Date().toISOString());
  const executorId=String(start?.executorId||"").trim();
  if(!executorId)return{...common,status:"CANARY_START_EXECUTOR_REQUIRED",active:false,decision:"HOLD"};
  const payload={canaryPlanId:canaryPlan.canaryPlanId,planSeal:canaryPlan.seal,activationApprovalSeal:activationDecision.activationApprovalSeal,finalPromotionApprovalSeal:finalDecision.approvalSeal,packageSeal:pkg.seal,proposalId:pkg.proposalId||null,targetCohortId,exposureShare,minimumRaces:canaryPlan.minimumRaces,monitoringMetrics:requiredMetrics,rollbackConditions:canaryPlan.rollbackConditions||[],rollbackTypes:requiredRollbackTypes,stopOnAnyRollbackBreach:true,executorId,startedAt};
  const runId=`THICK-LIMITED-CANARY-RUN-${simpleHash(stableStringify(payload))}`;
  const runSeal=simpleHash(stableStringify(payload));
  return{...common,status:"CANARY_MONITORING_ACTIVE",active:true,decision:"MONITOR_CANARY_ONLY",runId,runSeal,executorId,startedAt,planSeal:canaryPlan.seal,activationApprovalSeal:activationDecision.activationApprovalSeal,finalPromotionApprovalSeal:finalDecision.approvalSeal,packageSeal:pkg.seal,targetCohortId,exposureShare,minimumRaces:canaryPlan.minimumRaces,monitoringMetrics:requiredMetrics,rollbackConditions:canaryPlan.rollbackConditions||[],rollbackTypes:requiredRollbackTypes,stopOnAnyRollbackBreach:true,safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,fullRolloutAllowed:false,canaryExpansionAllowed:false,maxExposureShare:.10,rollbackConditionsLocked:true,immediateStopOnRollbackBreach:true,runMutationForbidden:true,monitoringOnly:true}};
}

export function verifyThickLimitedCanaryRun(run,activationDecision,canaryPlan,finalDecision,pkg){
  if(run?.status!=="CANARY_MONITORING_ACTIVE")return{status:"ACTIVE_CANARY_RUN_REQUIRED",valid:false};
  const activationVerification=verifyThickLimitedCanaryActivationReview(activationDecision,canaryPlan,finalDecision,pkg);
  if(!activationVerification.valid)return{status:activationVerification.status||"CANARY_ACTIVATION_APPROVAL_REQUIRED",valid:false};
  if(run?.canaryPlanId!==canaryPlan?.canaryPlanId||run?.planSeal!==canaryPlan?.seal||run?.activationApprovalSeal!==activationDecision?.activationApprovalSeal)return{status:"CANARY_RUN_CHAIN_MISMATCH",valid:false};
  const payload={canaryPlanId:canaryPlan.canaryPlanId,planSeal:canaryPlan.seal,activationApprovalSeal:activationDecision.activationApprovalSeal,finalPromotionApprovalSeal:finalDecision.approvalSeal,packageSeal:pkg.seal,proposalId:pkg.proposalId||null,targetCohortId:run.targetCohortId||null,exposureShare:run.exposureShare,minimumRaces:run.minimumRaces,monitoringMetrics:[...(run.monitoringMetrics||[])].sort(),rollbackConditions:run.rollbackConditions||[],rollbackTypes:[...(run.rollbackTypes||[])].sort(),stopOnAnyRollbackBreach:run.stopOnAnyRollbackBreach===true,executorId:run.executorId||"",startedAt:run.startedAt||""};
  const actual=simpleHash(stableStringify(payload));
  return{status:actual===run.runSeal?"CANARY_RUN_VERIFIED":"SEAL_MISMATCH",valid:actual===run.runSeal,expectedSeal:run.runSeal,actualSeal:actual};
}

export function evaluateThickLimitedCanaryMonitoring(run,activationDecision,canaryPlan,finalDecision,pkg,observation={}){
  const common={version:"THICK-LIMITED-CANARY-MONITOR-1.0",researchOnly:true,productionWriteAllowed:false,autoPromotionAllowed:false,runId:run?.runId||null,canaryPlanId:run?.canaryPlanId||null,proposalId:run?.proposalId||null};
  const runVerification=verifyThickLimitedCanaryRun(run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!runVerification.valid)return{...common,status:runVerification.status||"ACTIVE_CANARY_RUN_REQUIRED",active:false,decision:"BLOCK",verification:runVerification};
  if(run?.status!=="CANARY_MONITORING_ACTIVE"||run?.active!==true)return{...common,status:"ACTIVE_CANARY_RUN_REQUIRED",active:false,decision:"BLOCK"};
  const cohortId=String(observation?.cohortId||"").trim();
  if(!cohortId||cohortId!==String(run?.targetCohortId||""))return{...common,status:"CANARY_MONITOR_COHORT_MISMATCH",active:false,decision:"BLOCK",expectedCohortId:run?.targetCohortId||null,cohortId:cohortId||null};
  const races=Number(observation?.races);
  if(!Number.isInteger(races)||races<0)return{...common,status:"CANARY_MONITOR_RACE_COUNT_INVALID",active:false,decision:"HOLD"};
  const requiredMetrics=[...(run?.monitoringMetrics||[])].map(String).sort();
  const metrics=observation?.metrics&&typeof observation.metrics==="object"?observation.metrics:{};
  const missingMetrics=requiredMetrics.filter(k=>!Object.prototype.hasOwnProperty.call(metrics,k)||!Number.isFinite(Number(metrics[k])));
  if(missingMetrics.length)return{...common,status:"CANARY_MONITORING_EVIDENCE_INCOMPLETE",active:false,decision:"HOLD",missingMetrics};
  const requiredRollbackTypes=[...(run?.rollbackTypes||[])].map(String).sort();
  const evaluations=Array.isArray(observation?.rollbackEvaluations)?observation.rollbackEvaluations:[];
  const byType=new Map(evaluations.map(x=>[String(x?.type||""),x]));
  const missingRollbackEvaluations=requiredRollbackTypes.filter(t=>!byType.has(t)||typeof byType.get(t)?.breached!=="boolean");
  if(missingRollbackEvaluations.length)return{...common,status:"CANARY_ROLLBACK_EVALUATION_INCOMPLETE",active:false,decision:"HOLD",missingRollbackEvaluations};
  const breaches=requiredRollbackTypes.filter(t=>byType.get(t)?.breached===true).map(t=>({type:t,evidence:byType.get(t)?.evidence??null,note:String(byType.get(t)?.note||"")}));
  const observedAt=String(observation?.observedAt||new Date().toISOString());
  const payload={runId:run.runId,runSeal:run.runSeal,cohortId,races,metrics:Object.fromEntries(requiredMetrics.map(k=>[k,Number(metrics[k])])),rollbackEvaluations:requiredRollbackTypes.map(t=>({type:t,breached:byType.get(t).breached===true,evidence:byType.get(t)?.evidence??null,note:String(byType.get(t)?.note||"")})),observedAt};
  const monitorSeal=simpleHash(stableStringify(payload));
  if(breaches.length){
    return{...common,status:"CANARY_ROLLBACK_REQUIRED",active:false,decision:"STOP_AND_ROLLBACK",monitorSeal,runSeal:run.runSeal,cohortId,races,metrics:payload.metrics,rollbackEvaluations:payload.rollbackEvaluations,breaches,observedAt,safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,fullRolloutAllowed:false,canaryExpansionAllowed:false,continuationAllowed:false,rollbackRequired:true,immediateStop:true,monitorMutationForbidden:true}};
  }
  if(races<Number(run?.minimumRaces||0)){
    return{...common,status:"CANARY_MONITORING_CONTINUES",active:true,decision:"CONTINUE_MONITORING_ONLY",monitorSeal,runSeal:run.runSeal,cohortId,races,minimumRaces:run.minimumRaces,metrics:payload.metrics,rollbackEvaluations:payload.rollbackEvaluations,breaches:[],observedAt,safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,fullRolloutAllowed:false,canaryExpansionAllowed:false,continuationAllowed:true,rollbackRequired:false,monitoringOnly:true,monitorMutationForbidden:true}};
  }
  return{...common,status:"CANARY_MINIMUM_SAMPLE_REACHED_NO_BREACH",active:false,decision:"RETAIN_FOR_POST_CANARY_REVIEW_ONLY",monitorSeal,runSeal:run.runSeal,cohortId,races,minimumRaces:run.minimumRaces,metrics:payload.metrics,rollbackEvaluations:payload.rollbackEvaluations,breaches:[],observedAt,safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,fullRolloutAllowed:false,canaryExpansionAllowed:false,continuationAllowed:false,rollbackRequired:false,manualPostCanaryReviewRequired:true,monitorMutationForbidden:true}};
}

export function verifyThickLimitedCanaryMonitoring(monitor,run,activationDecision,canaryPlan,finalDecision,pkg){
  if(!["CANARY_ROLLBACK_REQUIRED","CANARY_MONITORING_CONTINUES","CANARY_MINIMUM_SAMPLE_REACHED_NO_BREACH"].includes(monitor?.status))return{status:"CANARY_MONITOR_RECORD_REQUIRED",valid:false};
  const runVerification=verifyThickLimitedCanaryRun(run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!runVerification.valid)return{status:runVerification.status||"ACTIVE_CANARY_RUN_REQUIRED",valid:false};
  if(monitor?.runId!==run?.runId||monitor?.runSeal!==run?.runSeal)return{status:"CANARY_MONITOR_CHAIN_MISMATCH",valid:false};
  const requiredMetrics=[...(run?.monitoringMetrics||[])].map(String).sort();
  const rollbackTypes=[...(run?.rollbackTypes||[])].map(String).sort();
  const evalByType=new Map((monitor?.rollbackEvaluations||[]).map(x=>[String(x?.type||""),x]));
  const payload={runId:run.runId,runSeal:run.runSeal,cohortId:monitor.cohortId||null,races:monitor.races,metrics:Object.fromEntries(requiredMetrics.map(k=>[k,Number(monitor?.metrics?.[k])])),rollbackEvaluations:rollbackTypes.map(t=>({type:t,breached:evalByType.get(t)?.breached===true,evidence:evalByType.get(t)?.evidence??null,note:String(evalByType.get(t)?.note||"")})),observedAt:monitor.observedAt||""};
  const actual=simpleHash(stableStringify(payload));
  return{status:actual===monitor.monitorSeal?"CANARY_MONITOR_VERIFIED":"SEAL_MISMATCH",valid:actual===monitor.monitorSeal,expectedSeal:monitor.monitorSeal,actualSeal:actual};
}

export function buildThickPostCanaryReviewPackage(monitor,run,activationDecision,canaryPlan,finalDecision,pkg,review={}){
  const common={version:"THICK-POST-CANARY-REVIEW-1.0",researchOnly:true,productionWriteAllowed:false,autoPromotionAllowed:false,runId:run?.runId||null,canaryPlanId:run?.canaryPlanId||null,proposalId:run?.proposalId||null};
  const verified=verifyThickLimitedCanaryMonitoring(monitor,run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!verified.valid)return{...common,status:"POST_CANARY_SOURCE_INVALID",decision:"BLOCK",sourceVerification:verified};
  if(monitor?.status!=="CANARY_MINIMUM_SAMPLE_REACHED_NO_BREACH"||monitor?.decision!=="RETAIN_FOR_POST_CANARY_REVIEW_ONLY")return{...common,status:"POST_CANARY_COMPLETED_MONITOR_REQUIRED",decision:"BLOCK"};
  const requiredMetrics=[...(run?.monitoringMetrics||[])].map(String).sort();
  const summaryMetrics=review?.summaryMetrics&&typeof review.summaryMetrics==="object"?review.summaryMetrics:{};
  const baselineMetrics=review?.baselineMetrics&&typeof review.baselineMetrics==="object"?review.baselineMetrics:{};
  const missingSummary=requiredMetrics.filter(k=>!Number.isFinite(Number(summaryMetrics[k])));
  const missingBaseline=requiredMetrics.filter(k=>!Number.isFinite(Number(baselineMetrics[k])));
  if(missingSummary.length||missingBaseline.length)return{...common,status:"POST_CANARY_REVIEW_INCOMPLETE",decision:"HOLD",missingSummaryMetrics:missingSummary,missingBaselineMetrics:missingBaseline};
  const counterEvidence=Array.isArray(review?.counterEvidence)?review.counterEvidence.filter(Boolean):[];
  if(!counterEvidence.length)return{...common,status:"POST_CANARY_COUNTER_EVIDENCE_REQUIRED",decision:"HOLD"};
  const unresolvedIssues=Array.isArray(review?.unresolvedIssues)?review.unresolvedIssues.filter(Boolean):[];
  const rollbackNonTriggerEvidence=Array.isArray(review?.rollbackNonTriggerEvidence)?review.rollbackNonTriggerEvidence.filter(Boolean):[];
  const requiredRollbackTypes=[...(run?.rollbackTypes||[])].map(String).sort();
  const coveredRollbackTypes=new Set(rollbackNonTriggerEvidence.map(x=>String(x?.type||"")));
  const missingRollbackEvidence=requiredRollbackTypes.filter(t=>!coveredRollbackTypes.has(t));
  if(missingRollbackEvidence.length)return{...common,status:"POST_CANARY_ROLLBACK_EVIDENCE_INCOMPLETE",decision:"HOLD",missingRollbackEvidence};
  const deltas={};
  for(const k of requiredMetrics)deltas[k]=Number(summaryMetrics[k])-Number(baselineMetrics[k]);
  const reviewerId=String(review?.reviewerId||"").trim();
  if(!reviewerId)return{...common,status:"POST_CANARY_REVIEWER_REQUIRED",decision:"HOLD"};
  const reviewedAt=String(review?.reviewedAt||"").trim();
  const payload={runId:run.runId,runSeal:run.runSeal,monitorSeal:monitor.monitorSeal,canaryPlanId:run.canaryPlanId,planSeal:run.planSeal,proposalId:run.proposalId||null,targetCohortId:run.targetCohortId,exposureShare:run.exposureShare,races:monitor.races,minimumRaces:run.minimumRaces,requiredMetrics,summaryMetrics:Object.fromEntries(requiredMetrics.map(k=>[k,Number(summaryMetrics[k])])),baselineMetrics:Object.fromEntries(requiredMetrics.map(k=>[k,Number(baselineMetrics[k])])),deltas,counterEvidence,unresolvedIssues,rollbackNonTriggerEvidence,requiredRollbackTypes,reviewerId,reviewedAt};
  const reviewSeal=simpleSealHash(JSON.stringify(stableSealValue(payload)));
  const reviewId=`THICK-POST-CANARY-${reviewSeal}`;
  return{...common,status:"POST_CANARY_REVIEW_PACKAGE_READY",decision:"MANUAL_POST_CANARY_DECISION_ONLY",reviewId,reviewSeal,reviewerId,reviewedAt,runSeal:run.runSeal,monitorSeal:monitor.monitorSeal,targetCohortId:run.targetCohortId,exposureShare:run.exposureShare,races:monitor.races,minimumRaces:run.minimumRaces,requiredMetrics,summaryMetrics:payload.summaryMetrics,baselineMetrics:payload.baselineMetrics,deltas,counterEvidence,unresolvedIssues,rollbackNonTriggerEvidence,requiredRollbackTypes,safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,fullRolloutAllowed:false,canaryExpansionAllowed:false,manualDecisionRequired:true,counterEvidenceRequired:true,rollbackEvidenceRequired:true,postCanaryMutationForbidden:true}};
}

export function verifyThickPostCanaryReviewPackage(reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg){
  if(reviewPackage?.status!=="POST_CANARY_REVIEW_PACKAGE_READY")return{status:"POST_CANARY_REVIEW_PACKAGE_REQUIRED",valid:false};
  const source=verifyThickLimitedCanaryMonitoring(monitor,run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!source.valid)return{status:"POST_CANARY_SOURCE_INVALID",valid:false,sourceVerification:source};
  if(reviewPackage?.runId!==run?.runId||reviewPackage?.runSeal!==run?.runSeal||reviewPackage?.monitorSeal!==monitor?.monitorSeal)return{status:"POST_CANARY_CHAIN_MISMATCH",valid:false};
  const requiredMetrics=[...(reviewPackage.requiredMetrics||[])].sort();
  const payload={runId:run.runId,runSeal:run.runSeal,monitorSeal:monitor.monitorSeal,canaryPlanId:run.canaryPlanId,planSeal:run.planSeal,proposalId:run.proposalId||null,targetCohortId:run.targetCohortId,exposureShare:run.exposureShare,races:reviewPackage.races,minimumRaces:run.minimumRaces,requiredMetrics,summaryMetrics:reviewPackage.summaryMetrics||{},baselineMetrics:reviewPackage.baselineMetrics||{},deltas:reviewPackage.deltas||{},counterEvidence:reviewPackage.counterEvidence||[],unresolvedIssues:reviewPackage.unresolvedIssues||[],rollbackNonTriggerEvidence:reviewPackage.rollbackNonTriggerEvidence||[],requiredRollbackTypes:[...(reviewPackage.requiredRollbackTypes||[])].sort(),reviewerId:reviewPackage.reviewerId||"",reviewedAt:reviewPackage.reviewedAt||""};
  const actual=simpleSealHash(JSON.stringify(stableSealValue(payload)));
  return{status:actual===reviewPackage.reviewSeal?"POST_CANARY_REVIEW_VERIFIED":"SEAL_MISMATCH",valid:actual===reviewPackage.reviewSeal,expectedSeal:reviewPackage.reviewSeal,actualSeal:actual};
}

export function finalizeThickPostCanaryDecision(reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg,decisionReview={}){
  const common={version:"THICK-POST-CANARY-DECISION-1.0",researchOnly:true,productionWriteAllowed:false,autoPromotionAllowed:false,runId:run?.runId||null,reviewId:reviewPackage?.reviewId||null,proposalId:run?.proposalId||null};
  const verification=verifyThickPostCanaryReviewPackage(reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!verification.valid)return{...common,status:verification.status||"POST_CANARY_REVIEW_REQUIRED",eligible:false,decision:"BLOCK",verification};
  if(reviewPackage?.decision!=="MANUAL_POST_CANARY_DECISION_ONLY")return{...common,status:"MANUAL_POST_CANARY_DECISION_REQUIRED",eligible:false,decision:"BLOCK"};
  const reviewerId=String(decisionReview?.reviewerId||"").trim();
  if(!reviewerId)return{...common,status:"POST_CANARY_DECISION_REVIEWER_REQUIRED",eligible:false,decision:"HOLD"};
  const priorReviewerIds=new Set([
    reviewPackage?.reviewerId,
    pkg?.sourceChain?.primaryReviewerId,
    pkg?.sourceChain?.finalReviewerId,
    finalDecision?.reviewerId,
    activationDecision?.reviewerId
  ].filter(Boolean).map(String));
  if(priorReviewerIds.has(reviewerId))return{...common,status:"INDEPENDENT_POST_CANARY_DECISION_REVIEWER_REQUIRED",eligible:false,decision:"HOLD",reviewerId,priorReviewerIds:[...priorReviewerIds]};
  const verdict=String(decisionReview?.verdict||"").trim().toUpperCase();
  const allowed=new Set(["APPROVE_STAGED_EXPANSION","HOLD","REJECT"]);
  if(!allowed.has(verdict))return{...common,status:"POST_CANARY_DECISION_VERDICT_REQUIRED",eligible:false,decision:"HOLD",reviewerId};
  const acknowledgedCounterEvidence=decisionReview?.acknowledgedCounterEvidence===true;
  const acknowledgedUnresolvedIssues=decisionReview?.acknowledgedUnresolvedIssues===true;
  const acknowledgedRollbackTypes=new Set((Array.isArray(decisionReview?.acknowledgedRollbackTypes)?decisionReview.acknowledgedRollbackTypes:[]).map(x=>String(x||"").trim()).filter(Boolean));
  const requiredRollbackTypes=[...(reviewPackage?.requiredRollbackTypes||[])].map(String).sort();
  const missingRollbackAcknowledgements=requiredRollbackTypes.filter(x=>!acknowledgedRollbackTypes.has(x));
  if(verdict==="APPROVE_STAGED_EXPANSION"&&!acknowledgedCounterEvidence)return{...common,status:"POST_CANARY_COUNTER_EVIDENCE_ACK_REQUIRED",eligible:false,decision:"HOLD",reviewerId,verdict};
  if(verdict==="APPROVE_STAGED_EXPANSION"&&!acknowledgedUnresolvedIssues)return{...common,status:"POST_CANARY_UNRESOLVED_ISSUES_ACK_REQUIRED",eligible:false,decision:"HOLD",reviewerId,verdict};
  if(verdict==="APPROVE_STAGED_EXPANSION"&&missingRollbackAcknowledgements.length)return{...common,status:"POST_CANARY_ROLLBACK_ACK_INCOMPLETE",eligible:false,decision:"HOLD",reviewerId,verdict,missingRollbackAcknowledgements};
  const note=String(decisionReview?.note||"").trim();
  const decidedAt=String(decisionReview?.decidedAt||"").trim();
  const payload={reviewId:reviewPackage.reviewId,reviewSeal:reviewPackage.reviewSeal,runId:run.runId,runSeal:run.runSeal,monitorSeal:monitor.monitorSeal,proposalId:run.proposalId||null,reviewerId,verdict,note,decidedAt,acknowledgedCounterEvidence,acknowledgedUnresolvedIssues,acknowledgedRollbackTypes:[...acknowledgedRollbackTypes].sort(),requiredRollbackTypes,targetCohortId:reviewPackage.targetCohortId||null,exposureShare:reviewPackage.exposureShare,summaryMetrics:reviewPackage.summaryMetrics||{},baselineMetrics:reviewPackage.baselineMetrics||{},deltas:reviewPackage.deltas||{},counterEvidence:reviewPackage.counterEvidence||[],unresolvedIssues:reviewPackage.unresolvedIssues||[],rollbackNonTriggerEvidence:reviewPackage.rollbackNonTriggerEvidence||[]};
  const decisionSeal=simpleSealHash(JSON.stringify(stableSealValue(payload)));
  const decisionId=`THICK-POST-CANARY-DECISION-${decisionSeal}`;
  if(verdict==="REJECT")return{...common,status:"POST_CANARY_REJECTED",eligible:false,decision:"REJECT_RESEARCH_CANDIDATE",decisionId,decisionSeal,reviewerId,verdict,note,decidedAt,reviewSeal:reviewPackage.reviewSeal,safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,fullRolloutAllowed:false,stagedExpansionPlanningAllowed:false,decisionMutationForbidden:true}};
  if(verdict==="HOLD")return{...common,status:"POST_CANARY_HELD",eligible:false,decision:"HOLD",decisionId,decisionSeal,reviewerId,verdict,note,decidedAt,reviewSeal:reviewPackage.reviewSeal,safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,fullRolloutAllowed:false,stagedExpansionPlanningAllowed:false,decisionMutationForbidden:true}};
  return{...common,status:"POST_CANARY_DECISION_APPROVED",eligible:true,decision:"STAGED_EXPANSION_CANDIDATE_ONLY",decisionId,decisionSeal,reviewerId,verdict,note,decidedAt,reviewSeal:reviewPackage.reviewSeal,acknowledgedCounterEvidence,acknowledgedUnresolvedIssues,acknowledgedRollbackTypes:[...acknowledgedRollbackTypes].sort(),requiredRollbackTypes,targetCohortId:reviewPackage.targetCohortId||null,priorExposureShare:reviewPackage.exposureShare,summaryMetrics:reviewPackage.summaryMetrics||{},baselineMetrics:reviewPackage.baselineMetrics||{},deltas:reviewPackage.deltas||{},counterEvidence:reviewPackage.counterEvidence||[],unresolvedIssues:reviewPackage.unresolvedIssues||[],rollbackNonTriggerEvidence:reviewPackage.rollbackNonTriggerEvidence||[],safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,fullRolloutAllowed:false,stagedExpansionPlanningAllowed:true,stagedExpansionActivationAllowed:false,manualStagedExpansionPlanRequired:true,rollbackConditionsLocked:true,decisionMutationForbidden:true}};
}

export function verifyThickPostCanaryDecision(decision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg){
  if(decision?.status!=="POST_CANARY_DECISION_APPROVED")return{status:"POST_CANARY_APPROVAL_REQUIRED",valid:false};
  const source=verifyThickPostCanaryReviewPackage(reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!source.valid)return{status:source.status||"POST_CANARY_REVIEW_REQUIRED",valid:false};
  if(decision?.reviewId!==reviewPackage?.reviewId||decision?.reviewSeal!==reviewPackage?.reviewSeal||decision?.runId!==run?.runId)return{status:"POST_CANARY_DECISION_CHAIN_MISMATCH",valid:false};
  const requiredRollbackTypes=[...(reviewPackage?.requiredRollbackTypes||[])].map(String).sort();
  const payload={reviewId:reviewPackage.reviewId,reviewSeal:reviewPackage.reviewSeal,runId:run.runId,runSeal:run.runSeal,monitorSeal:monitor.monitorSeal,proposalId:run.proposalId||null,reviewerId:decision.reviewerId||"",verdict:decision.verdict||"",note:decision.note||"",decidedAt:decision.decidedAt||"",acknowledgedCounterEvidence:decision.acknowledgedCounterEvidence===true,acknowledgedUnresolvedIssues:decision.acknowledgedUnresolvedIssues===true,acknowledgedRollbackTypes:[...(decision.acknowledgedRollbackTypes||[])].sort(),requiredRollbackTypes,targetCohortId:reviewPackage.targetCohortId||null,exposureShare:reviewPackage.exposureShare,summaryMetrics:reviewPackage.summaryMetrics||{},baselineMetrics:reviewPackage.baselineMetrics||{},deltas:reviewPackage.deltas||{},counterEvidence:reviewPackage.counterEvidence||[],unresolvedIssues:reviewPackage.unresolvedIssues||[],rollbackNonTriggerEvidence:reviewPackage.rollbackNonTriggerEvidence||[]};
  const actual=simpleSealHash(JSON.stringify(stableSealValue(payload)));
  return{status:actual===decision.decisionSeal?"POST_CANARY_DECISION_VERIFIED":"SEAL_MISMATCH",valid:actual===decision.decisionSeal,expectedSeal:decision.decisionSeal,actualSeal:actual};
}

export function createThickStagedExpansionPlan(postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg,options={}){
  const common={version:"THICK-STAGED-EXPANSION-PLAN-1.0",researchOnly:true,productionWriteAllowed:false,autoPromotionAllowed:false,proposalId:run?.proposalId||null,sourceDecisionId:postCanaryDecision?.decisionId||null};
  const source=verifyThickPostCanaryDecision(postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!source.valid)return{...common,status:source.status||"POST_CANARY_DECISION_REQUIRED",eligible:false,decision:"BLOCK",sourceVerification:source};
  if(postCanaryDecision?.decision!=="STAGED_EXPANSION_CANDIDATE_ONLY"||postCanaryDecision?.safeguards?.stagedExpansionPlanningAllowed!==true)return{...common,status:"STAGED_EXPANSION_CANDIDATE_REQUIRED",eligible:false,decision:"BLOCK"};
  const priorExposureShare=Number(postCanaryDecision?.priorExposureShare);
  const targetExposureShare=Number(options?.targetExposureShare);
  const maxExposureShare=Number.isFinite(Number(options?.maxExposureShare))?Number(options.maxExposureShare):.25;
  if(!Number.isFinite(targetExposureShare)||targetExposureShare<=priorExposureShare)return{...common,status:"STAGED_EXPANSION_MUST_INCREASE_GRADUALLY",eligible:false,decision:"HOLD",priorExposureShare,targetExposureShare};
  if(targetExposureShare>maxExposureShare||maxExposureShare>.25)return{...common,status:"STAGED_EXPANSION_EXPOSURE_LIMIT_EXCEEDED",eligible:false,decision:"BLOCK",priorExposureShare,targetExposureShare,maxExposureShare:.25};
  const targetCohortId=String(options?.targetCohortId||postCanaryDecision?.targetCohortId||"").trim();
  if(!targetCohortId||targetCohortId!==String(postCanaryDecision?.targetCohortId||""))return{...common,status:"STAGED_EXPANSION_COHORT_MISMATCH",eligible:false,decision:"BLOCK",targetCohortId,expectedCohortId:postCanaryDecision?.targetCohortId||null};
  const minimumRaces=Number(options?.minimumRaces??60);
  if(!Number.isInteger(minimumRaces)||minimumRaces<60)return{...common,status:"STAGED_EXPANSION_MINIMUM_SAMPLE_TOO_SMALL",eligible:false,decision:"HOLD",minimumRaces,requiredMinimumRaces:60};
  const requiredMetrics=["betCount","mainHitRate","returnRate","supportHitRate","thickHitRate"].sort();
  const monitoringMetrics=[...(Array.isArray(options?.monitoringMetrics)?options.monitoringMetrics:requiredMetrics)].map(String).sort();
  const missingMetrics=requiredMetrics.filter(x=>!monitoringMetrics.includes(x));
  if(missingMetrics.length)return{...common,status:"STAGED_EXPANSION_MONITORING_INCOMPLETE",eligible:false,decision:"BLOCK",missingMetrics};
  const requiredRollbackTypes=[...(postCanaryDecision?.requiredRollbackTypes||[])].map(String).sort();
  const rollbackTypes=[...(Array.isArray(options?.rollbackTypes)?options.rollbackTypes:requiredRollbackTypes)].map(String).sort();
  const missingRollbackTypes=requiredRollbackTypes.filter(x=>!rollbackTypes.includes(x));
  if(missingRollbackTypes.length)return{...common,status:"STAGED_EXPANSION_ROLLBACK_CONDITIONS_INCOMPLETE",eligible:false,decision:"BLOCK",missingRollbackTypes};
  const immediateStopOnRollback=options?.immediateStopOnRollback!==false;
  if(!immediateStopOnRollback)return{...common,status:"STAGED_EXPANSION_IMMEDIATE_STOP_REQUIRED",eligible:false,decision:"BLOCK"};
  const createdBy=String(options?.createdBy||"").trim();
  const createdAt=String(options?.createdAt||"").trim();
  const payload={sourceDecisionId:postCanaryDecision.decisionId,sourceDecisionSeal:postCanaryDecision.decisionSeal,reviewId:reviewPackage.reviewId,reviewSeal:reviewPackage.reviewSeal,runId:run.runId,runSeal:run.runSeal,targetCohortId,priorExposureShare,targetExposureShare,maxExposureShare:.25,minimumRaces,monitoringMetrics,rollbackTypes,immediateStopOnRollback,createdBy,createdAt};
  const planSeal=simpleSealHash(JSON.stringify(stableSealValue(payload)));
  const planId=`THICK-STAGED-EXPANSION-PLAN-${planSeal}`;
  return{...common,status:"STAGED_EXPANSION_PLAN_READY",eligible:true,decision:"MANUAL_STAGED_EXPANSION_ACTIVATION_REVIEW_ONLY",planId,planSeal,sourceDecisionSeal:postCanaryDecision.decisionSeal,reviewId:reviewPackage.reviewId,reviewSeal:reviewPackage.reviewSeal,runId:run.runId,runSeal:run.runSeal,targetCohortId,priorExposureShare,targetExposureShare,maxExposureShare:.25,minimumRaces,monitoringMetrics,rollbackTypes,immediateStopOnRollback,createdBy,createdAt,safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,fullRolloutAllowed:false,stagedExpansionActivationAllowed:false,furtherExpansionAllowed:false,manualActivationReviewRequired:true,rollbackConditionsLocked:true,monitoringMetricsLocked:true,cohortLocked:true,planMutationForbidden:true}};
}

export function verifyThickStagedExpansionPlan(plan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg){
  if(plan?.status!=="STAGED_EXPANSION_PLAN_READY")return{status:"STAGED_EXPANSION_PLAN_REQUIRED",valid:false};
  const source=verifyThickPostCanaryDecision(postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!source.valid)return{status:source.status||"POST_CANARY_DECISION_REQUIRED",valid:false};
  if(plan?.sourceDecisionId!==postCanaryDecision?.decisionId||plan?.sourceDecisionSeal!==postCanaryDecision?.decisionSeal||plan?.runId!==run?.runId||plan?.runSeal!==run?.runSeal)return{status:"STAGED_EXPANSION_PLAN_CHAIN_MISMATCH",valid:false};
  const payload={sourceDecisionId:postCanaryDecision.decisionId,sourceDecisionSeal:postCanaryDecision.decisionSeal,reviewId:reviewPackage.reviewId,reviewSeal:reviewPackage.reviewSeal,runId:run.runId,runSeal:run.runSeal,targetCohortId:plan.targetCohortId,priorExposureShare:plan.priorExposureShare,targetExposureShare:plan.targetExposureShare,maxExposureShare:plan.maxExposureShare,minimumRaces:plan.minimumRaces,monitoringMetrics:[...(plan.monitoringMetrics||[])].sort(),rollbackTypes:[...(plan.rollbackTypes||[])].sort(),immediateStopOnRollback:plan.immediateStopOnRollback===true,createdBy:plan.createdBy||"",createdAt:plan.createdAt||""};
  const actual=simpleSealHash(JSON.stringify(stableSealValue(payload)));
  return{status:actual===plan.planSeal?"STAGED_EXPANSION_PLAN_VERIFIED":"SEAL_MISMATCH",valid:actual===plan.planSeal,expectedSeal:plan.planSeal,actualSeal:actual};
}


export function finalizeThickStagedExpansionActivationReview(plan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg,review={}){
  const common={version:"THICK-STAGED-EXPANSION-ACTIVATION-1.0",researchOnly:true,productionWriteAllowed:false,autoPromotionAllowed:false,planId:plan?.planId||null,sourceDecisionId:postCanaryDecision?.decisionId||null,proposalId:run?.proposalId||null};
  const verification=verifyThickStagedExpansionPlan(plan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!verification.valid)return{...common,status:verification.status||"STAGED_EXPANSION_PLAN_REQUIRED",eligible:false,decision:"BLOCK",verification};
  if(plan?.decision!=="MANUAL_STAGED_EXPANSION_ACTIVATION_REVIEW_ONLY"||plan?.safeguards?.manualActivationReviewRequired!==true)return{...common,status:"MANUAL_STAGED_EXPANSION_ACTIVATION_REVIEW_REQUIRED",eligible:false,decision:"BLOCK"};
  const reviewerId=String(review?.reviewerId||"").trim();
  if(!reviewerId)return{...common,status:"STAGED_EXPANSION_ACTIVATION_REVIEWER_REQUIRED",eligible:false,decision:"HOLD"};
  const priorReviewerIds=new Set([
    plan?.createdBy,
    postCanaryDecision?.reviewerId,
    reviewPackage?.reviewerId,
    activationDecision?.reviewerId,
    finalDecision?.reviewerId,
    pkg?.sourceChain?.primaryReviewerId,
    pkg?.sourceChain?.finalReviewerId
  ].filter(Boolean).map(String));
  if(priorReviewerIds.has(reviewerId))return{...common,status:"INDEPENDENT_STAGED_EXPANSION_ACTIVATION_REVIEWER_REQUIRED",eligible:false,decision:"HOLD",reviewerId,priorReviewerIds:[...priorReviewerIds]};
  const verdict=String(review?.verdict||"").trim().toUpperCase();
  const allowed=new Set(["APPROVE_STAGED_EXPANSION_ACTIVATION","HOLD","REJECT"]);
  if(!allowed.has(verdict))return{...common,status:"STAGED_EXPANSION_ACTIVATION_VERDICT_REQUIRED",eligible:false,decision:"HOLD",reviewerId};
  const acknowledgedPlanSeal=review?.acknowledgedPlanSeal===true;
  const acknowledgedImmediateStop=review?.acknowledgedImmediateStop===true;
  const metricAck=new Set((Array.isArray(review?.acknowledgedMonitoringMetrics)?review.acknowledgedMonitoringMetrics:[]).map(String));
  const rollbackAck=new Set((Array.isArray(review?.acknowledgedRollbackTypes)?review.acknowledgedRollbackTypes:[]).map(String));
  const requiredMetrics=[...(plan?.monitoringMetrics||[])].map(String).sort();
  const requiredRollbackTypes=[...(plan?.rollbackTypes||[])].map(String).sort();
  const missingMetrics=requiredMetrics.filter(x=>!metricAck.has(x));
  const missingRollbackTypes=requiredRollbackTypes.filter(x=>!rollbackAck.has(x));
  if(verdict==="APPROVE_STAGED_EXPANSION_ACTIVATION"&&!acknowledgedPlanSeal)return{...common,status:"STAGED_EXPANSION_PLAN_SEAL_ACK_REQUIRED",eligible:false,decision:"HOLD",reviewerId,verdict};
  if(verdict==="APPROVE_STAGED_EXPANSION_ACTIVATION"&&!acknowledgedImmediateStop)return{...common,status:"STAGED_EXPANSION_IMMEDIATE_STOP_ACK_REQUIRED",eligible:false,decision:"HOLD",reviewerId,verdict};
  if(verdict==="APPROVE_STAGED_EXPANSION_ACTIVATION"&&missingMetrics.length)return{...common,status:"STAGED_EXPANSION_MONITORING_ACK_INCOMPLETE",eligible:false,decision:"HOLD",reviewerId,verdict,missingMetrics};
  if(verdict==="APPROVE_STAGED_EXPANSION_ACTIVATION"&&missingRollbackTypes.length)return{...common,status:"STAGED_EXPANSION_ROLLBACK_ACK_INCOMPLETE",eligible:false,decision:"HOLD",reviewerId,verdict,missingRollbackTypes};
  const note=String(review?.note||"").trim();
  const reviewedAt=String(review?.reviewedAt||"").trim();
  const payload={planId:plan.planId,planSeal:plan.planSeal,sourceDecisionId:postCanaryDecision.decisionId,sourceDecisionSeal:postCanaryDecision.decisionSeal,reviewerId,verdict,note,reviewedAt,acknowledgedPlanSeal,acknowledgedImmediateStop,acknowledgedMonitoringMetrics:[...metricAck].sort(),acknowledgedRollbackTypes:[...rollbackAck].sort(),requiredMetrics,requiredRollbackTypes,targetCohortId:plan.targetCohortId,priorExposureShare:plan.priorExposureShare,targetExposureShare:plan.targetExposureShare,minimumRaces:plan.minimumRaces};
  const activationSeal=simpleSealHash(JSON.stringify(stableSealValue(payload)));
  const activationId=`THICK-STAGED-EXPANSION-ACTIVATION-${activationSeal}`;
  if(verdict==="REJECT")return{...common,status:"STAGED_EXPANSION_ACTIVATION_REJECTED",eligible:false,decision:"REJECT_STAGED_EXPANSION",activationId,activationSeal,reviewerId,verdict,note,reviewedAt,planSeal:plan.planSeal,safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,fullRolloutAllowed:false,stagedExpansionStartAllowed:false,activationMutationForbidden:true}};
  if(verdict==="HOLD")return{...common,status:"STAGED_EXPANSION_ACTIVATION_HELD",eligible:false,decision:"HOLD",activationId,activationSeal,reviewerId,verdict,note,reviewedAt,planSeal:plan.planSeal,safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,fullRolloutAllowed:false,stagedExpansionStartAllowed:false,activationMutationForbidden:true}};
  return{...common,status:"STAGED_EXPANSION_ACTIVATION_APPROVED",eligible:true,decision:"AUTHORIZED_STAGED_EXPANSION_START_ONLY",activationId,activationSeal,reviewerId,verdict,note,reviewedAt,planSeal:plan.planSeal,acknowledgedPlanSeal,acknowledgedImmediateStop,acknowledgedMonitoringMetrics:[...metricAck].sort(),acknowledgedRollbackTypes:[...rollbackAck].sort(),requiredMetrics,requiredRollbackTypes,targetCohortId:plan.targetCohortId,priorExposureShare:plan.priorExposureShare,targetExposureShare:plan.targetExposureShare,minimumRaces:plan.minimumRaces,safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,fullRolloutAllowed:false,stagedExpansionStartAllowed:true,startIsSeparateOperation:true,furtherExpansionAllowed:false,rollbackConditionsLocked:true,monitoringMetricsLocked:true,cohortLocked:true,activationMutationForbidden:true}};
}

export function verifyThickStagedExpansionActivationReview(activation,plan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg){
  if(activation?.status!=="STAGED_EXPANSION_ACTIVATION_APPROVED")return{status:"STAGED_EXPANSION_ACTIVATION_APPROVAL_REQUIRED",valid:false};
  const source=verifyThickStagedExpansionPlan(plan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!source.valid)return{status:source.status||"STAGED_EXPANSION_PLAN_REQUIRED",valid:false};
  if(activation?.planId!==plan?.planId||activation?.planSeal!==plan?.planSeal||activation?.sourceDecisionId!==postCanaryDecision?.decisionId)return{status:"STAGED_EXPANSION_ACTIVATION_CHAIN_MISMATCH",valid:false};
  const requiredMetrics=[...(plan?.monitoringMetrics||[])].map(String).sort();
  const requiredRollbackTypes=[...(plan?.rollbackTypes||[])].map(String).sort();
  const payload={planId:plan.planId,planSeal:plan.planSeal,sourceDecisionId:postCanaryDecision.decisionId,sourceDecisionSeal:postCanaryDecision.decisionSeal,reviewerId:activation.reviewerId||"",verdict:activation.verdict||"",note:activation.note||"",reviewedAt:activation.reviewedAt||"",acknowledgedPlanSeal:activation.acknowledgedPlanSeal===true,acknowledgedImmediateStop:activation.acknowledgedImmediateStop===true,acknowledgedMonitoringMetrics:[...(activation.acknowledgedMonitoringMetrics||[])].sort(),acknowledgedRollbackTypes:[...(activation.acknowledgedRollbackTypes||[])].sort(),requiredMetrics,requiredRollbackTypes,targetCohortId:plan.targetCohortId,priorExposureShare:plan.priorExposureShare,targetExposureShare:plan.targetExposureShare,minimumRaces:plan.minimumRaces};
  const actual=simpleSealHash(JSON.stringify(stableSealValue(payload)));
  return{status:actual===activation.activationSeal?"STAGED_EXPANSION_ACTIVATION_VERIFIED":"SEAL_MISMATCH",valid:actual===activation.activationSeal,expectedSeal:activation.activationSeal,actualSeal:actual};
}

export function startThickStagedExpansionRun(activation,plan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg,start={}){
  const common={version:"THICK-STAGED-EXPANSION-RUN-1.0",researchOnly:true,productionWriteAllowed:false,autoPromotionAllowed:false,planId:plan?.planId||null,proposalId:run?.proposalId||null};
  const activationVerification=verifyThickStagedExpansionActivationReview(activation,plan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!activationVerification.valid)return{...common,status:activationVerification.status||"STAGED_EXPANSION_ACTIVATION_APPROVAL_REQUIRED",active:false,decision:"BLOCK",verification:activationVerification};
  if(activation?.decision!=="AUTHORIZED_STAGED_EXPANSION_START_ONLY")return{...common,status:"AUTHORIZED_STAGED_EXPANSION_START_REQUIRED",active:false,decision:"BLOCK"};
  const targetCohortId=String(start?.targetCohortId||plan?.targetCohortId||"").trim();
  if(!targetCohortId||targetCohortId!==String(plan?.targetCohortId||""))return{...common,status:"STAGED_EXPANSION_START_COHORT_MISMATCH",active:false,decision:"BLOCK",expectedCohortId:plan?.targetCohortId||null,targetCohortId:targetCohortId||null};
  const targetExposureShare=Number(start?.targetExposureShare??plan?.targetExposureShare);
  if(!Number.isFinite(targetExposureShare)||targetExposureShare!==Number(plan?.targetExposureShare)||targetExposureShare<=Number(plan?.priorExposureShare)||targetExposureShare>Number(plan?.maxExposureShare)||targetExposureShare>.25)return{...common,status:"STAGED_EXPANSION_START_EXPOSURE_MISMATCH",active:false,decision:"BLOCK",expectedExposureShare:plan?.targetExposureShare??null,targetExposureShare:Number.isFinite(targetExposureShare)?targetExposureShare:null};
  const monitoringMetrics=[...(Array.isArray(start?.monitoringMetrics)?start.monitoringMetrics:plan?.monitoringMetrics||[])].map(String).sort();
  const requiredMetrics=[...(plan?.monitoringMetrics||[])].map(String).sort();
  if(stableStringify(monitoringMetrics)!==stableStringify(requiredMetrics))return{...common,status:"STAGED_EXPANSION_START_MONITORING_MISMATCH",active:false,decision:"BLOCK",requiredMetrics,monitoringMetrics};
  const rollbackTypes=[...(Array.isArray(start?.rollbackTypes)?start.rollbackTypes:plan?.rollbackTypes||[])].map(String).sort();
  const requiredRollbackTypes=[...(plan?.rollbackTypes||[])].map(String).sort();
  if(stableStringify(rollbackTypes)!==stableStringify(requiredRollbackTypes))return{...common,status:"STAGED_EXPANSION_START_ROLLBACK_MISMATCH",active:false,decision:"BLOCK",requiredRollbackTypes,rollbackTypes};
  if(start?.immediateStopOnRollback===false||plan?.immediateStopOnRollback!==true)return{...common,status:"STAGED_EXPANSION_START_IMMEDIATE_STOP_REQUIRED",active:false,decision:"HOLD"};
  const executorId=String(start?.executorId||"").trim();
  if(!executorId)return{...common,status:"STAGED_EXPANSION_START_EXECUTOR_REQUIRED",active:false,decision:"HOLD"};
  const startedAt=String(start?.startedAt||new Date().toISOString());
  const payload={planId:plan.planId,planSeal:plan.planSeal,activationSeal:activation.activationSeal,sourceDecisionId:postCanaryDecision.decisionId,sourceDecisionSeal:postCanaryDecision.decisionSeal,reviewId:reviewPackage.reviewId,reviewSeal:reviewPackage.reviewSeal,priorRunId:run.runId,priorRunSeal:run.runSeal,targetCohortId,priorExposureShare:plan.priorExposureShare,targetExposureShare,maximumExposureShare:plan.maxExposureShare,minimumRaces:plan.minimumRaces,monitoringMetrics:requiredMetrics,rollbackTypes:requiredRollbackTypes,immediateStopOnRollback:true,executorId,startedAt};
  const runSeal=simpleSealHash(JSON.stringify(stableSealValue(payload)));
  const stagedRunId=`THICK-STAGED-EXPANSION-RUN-${runSeal}`;
  return{...common,status:"STAGED_EXPANSION_MONITORING_ACTIVE",active:true,decision:"MONITOR_STAGED_EXPANSION_ONLY",stagedRunId,runSeal,planSeal:plan.planSeal,activationSeal:activation.activationSeal,sourceDecisionId:postCanaryDecision.decisionId,sourceDecisionSeal:postCanaryDecision.decisionSeal,reviewId:reviewPackage.reviewId,reviewSeal:reviewPackage.reviewSeal,priorRunId:run.runId,priorRunSeal:run.runSeal,targetCohortId,priorExposureShare:plan.priorExposureShare,targetExposureShare,maximumExposureShare:plan.maxExposureShare,minimumRaces:plan.minimumRaces,monitoringMetrics:requiredMetrics,rollbackTypes:requiredRollbackTypes,immediateStopOnRollback:true,executorId,startedAt,safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,fullRolloutAllowed:false,furtherExpansionAllowed:false,maxExposureShare:.25,cohortLocked:true,monitoringMetricsLocked:true,rollbackConditionsLocked:true,immediateStopOnRollbackBreach:true,runMutationForbidden:true,monitoringOnly:true}};
}

export function verifyThickStagedExpansionRun(stagedRun,activation,plan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg){
  if(stagedRun?.status!=="STAGED_EXPANSION_MONITORING_ACTIVE")return{status:"ACTIVE_STAGED_EXPANSION_RUN_REQUIRED",valid:false};
  const source=verifyThickStagedExpansionActivationReview(activation,plan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!source.valid)return{status:source.status||"STAGED_EXPANSION_ACTIVATION_APPROVAL_REQUIRED",valid:false};
  if(stagedRun?.planId!==plan?.planId||stagedRun?.planSeal!==plan?.planSeal||stagedRun?.activationSeal!==activation?.activationSeal||stagedRun?.priorRunId!==run?.runId||stagedRun?.priorRunSeal!==run?.runSeal)return{status:"STAGED_EXPANSION_RUN_CHAIN_MISMATCH",valid:false};
  const payload={planId:plan.planId,planSeal:plan.planSeal,activationSeal:activation.activationSeal,sourceDecisionId:postCanaryDecision.decisionId,sourceDecisionSeal:postCanaryDecision.decisionSeal,reviewId:reviewPackage.reviewId,reviewSeal:reviewPackage.reviewSeal,priorRunId:run.runId,priorRunSeal:run.runSeal,targetCohortId:stagedRun.targetCohortId,priorExposureShare:stagedRun.priorExposureShare,targetExposureShare:stagedRun.targetExposureShare,maximumExposureShare:stagedRun.maximumExposureShare,minimumRaces:stagedRun.minimumRaces,monitoringMetrics:[...(stagedRun.monitoringMetrics||[])].sort(),rollbackTypes:[...(stagedRun.rollbackTypes||[])].sort(),immediateStopOnRollback:stagedRun.immediateStopOnRollback===true,executorId:stagedRun.executorId||"",startedAt:stagedRun.startedAt||""};
  const actual=simpleSealHash(JSON.stringify(stableSealValue(payload)));
  return{status:actual===stagedRun.runSeal?"STAGED_EXPANSION_RUN_VERIFIED":"SEAL_MISMATCH",valid:actual===stagedRun.runSeal,expectedSeal:stagedRun.runSeal,actualSeal:actual};
}

export function evaluateThickStagedExpansionMonitoring(stagedRun,activation,plan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg,observation={}){
  const common={version:"THICK-STAGED-EXPANSION-MONITOR-1.0",researchOnly:true,productionWriteAllowed:false,autoPromotionAllowed:false,stagedRunId:stagedRun?.stagedRunId||null,planId:plan?.planId||null,proposalId:run?.proposalId||null};
  const runVerification=verifyThickStagedExpansionRun(stagedRun,activation,plan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!runVerification.valid)return{...common,status:runVerification.status||"ACTIVE_STAGED_EXPANSION_RUN_REQUIRED",active:false,decision:"BLOCK",verification:runVerification};
  if(stagedRun?.status!=="STAGED_EXPANSION_MONITORING_ACTIVE"||stagedRun?.active!==true)return{...common,status:"ACTIVE_STAGED_EXPANSION_RUN_REQUIRED",active:false,decision:"BLOCK"};
  const cohortId=String(observation?.cohortId||"").trim();
  if(!cohortId||cohortId!==String(stagedRun?.targetCohortId||""))return{...common,status:"STAGED_EXPANSION_MONITOR_COHORT_MISMATCH",active:false,decision:"BLOCK",expectedCohortId:stagedRun?.targetCohortId||null,cohortId:cohortId||null};
  const exposureShare=Number(observation?.exposureShare??stagedRun?.targetExposureShare);
  if(!Number.isFinite(exposureShare)||exposureShare!==Number(stagedRun?.targetExposureShare))return{...common,status:"STAGED_EXPANSION_MONITOR_EXPOSURE_MISMATCH",active:false,decision:"BLOCK",expectedExposureShare:stagedRun?.targetExposureShare??null,exposureShare:Number.isFinite(exposureShare)?exposureShare:null};
  const races=Number(observation?.races);
  if(!Number.isInteger(races)||races<0)return{...common,status:"STAGED_EXPANSION_MONITOR_RACE_COUNT_INVALID",active:false,decision:"HOLD"};
  const requiredMetrics=[...(stagedRun?.monitoringMetrics||[])].map(String).sort();
  const metrics=observation?.metrics&&typeof observation.metrics==="object"?observation.metrics:{};
  const missingMetrics=requiredMetrics.filter(k=>!Object.prototype.hasOwnProperty.call(metrics,k)||!Number.isFinite(Number(metrics[k])));
  if(missingMetrics.length)return{...common,status:"STAGED_EXPANSION_MONITORING_EVIDENCE_INCOMPLETE",active:false,decision:"HOLD",missingMetrics};
  const requiredRollbackTypes=[...(stagedRun?.rollbackTypes||[])].map(String).sort();
  const evaluations=Array.isArray(observation?.rollbackEvaluations)?observation.rollbackEvaluations:[];
  const byType=new Map(evaluations.map(x=>[String(x?.type||""),x]));
  const missingRollbackEvaluations=requiredRollbackTypes.filter(t=>!byType.has(t)||typeof byType.get(t)?.breached!=="boolean");
  if(missingRollbackEvaluations.length)return{...common,status:"STAGED_EXPANSION_ROLLBACK_EVALUATION_INCOMPLETE",active:false,decision:"HOLD",missingRollbackEvaluations};
  const breaches=requiredRollbackTypes.filter(t=>byType.get(t)?.breached===true).map(t=>({type:t,evidence:byType.get(t)?.evidence??null,note:String(byType.get(t)?.note||"")}));
  const observedAt=String(observation?.observedAt||new Date().toISOString());
  const payload={stagedRunId:stagedRun.stagedRunId,runSeal:stagedRun.runSeal,cohortId,exposureShare,races,metrics:Object.fromEntries(requiredMetrics.map(k=>[k,Number(metrics[k])])),rollbackEvaluations:requiredRollbackTypes.map(t=>({type:t,breached:byType.get(t).breached===true,evidence:byType.get(t)?.evidence??null,note:String(byType.get(t)?.note||"")})),observedAt};
  const monitorSeal=simpleSealHash(JSON.stringify(stableSealValue(payload)));
  if(breaches.length){
    return{...common,status:"STAGED_EXPANSION_ROLLBACK_REQUIRED",active:false,decision:"STOP_AND_ROLLBACK",monitorSeal,runSeal:stagedRun.runSeal,cohortId,exposureShare,races,minimumRaces:stagedRun.minimumRaces,metrics:payload.metrics,rollbackEvaluations:payload.rollbackEvaluations,breaches,observedAt,safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,fullRolloutAllowed:false,furtherExpansionAllowed:false,continuationAllowed:false,rollbackRequired:true,immediateStop:true,monitorMutationForbidden:true}};
  }
  if(races<Number(stagedRun?.minimumRaces||0)){
    return{...common,status:"STAGED_EXPANSION_MONITORING_CONTINUES",active:true,decision:"CONTINUE_STAGED_EXPANSION_MONITORING_ONLY",monitorSeal,runSeal:stagedRun.runSeal,cohortId,exposureShare,races,minimumRaces:stagedRun.minimumRaces,metrics:payload.metrics,rollbackEvaluations:payload.rollbackEvaluations,breaches:[],observedAt,safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,fullRolloutAllowed:false,furtherExpansionAllowed:false,continuationAllowed:true,rollbackRequired:false,monitoringOnly:true,monitorMutationForbidden:true}};
  }
  return{...common,status:"STAGED_EXPANSION_MINIMUM_SAMPLE_REACHED_NO_BREACH",active:false,decision:"RETAIN_FOR_POST_STAGED_EXPANSION_REVIEW_ONLY",monitorSeal,runSeal:stagedRun.runSeal,cohortId,exposureShare,races,minimumRaces:stagedRun.minimumRaces,metrics:payload.metrics,rollbackEvaluations:payload.rollbackEvaluations,breaches:[],observedAt,safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,fullRolloutAllowed:false,furtherExpansionAllowed:false,continuationAllowed:false,rollbackRequired:false,manualPostStagedExpansionReviewRequired:true,monitorMutationForbidden:true}};
}

export function verifyThickStagedExpansionMonitoring(stagedMonitor,stagedRun,activation,plan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg){
  if(!["STAGED_EXPANSION_ROLLBACK_REQUIRED","STAGED_EXPANSION_MONITORING_CONTINUES","STAGED_EXPANSION_MINIMUM_SAMPLE_REACHED_NO_BREACH"].includes(stagedMonitor?.status))return{status:"STAGED_EXPANSION_MONITOR_RECORD_REQUIRED",valid:false};
  const runVerification=verifyThickStagedExpansionRun(stagedRun,activation,plan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!runVerification.valid)return{status:runVerification.status||"ACTIVE_STAGED_EXPANSION_RUN_REQUIRED",valid:false};
  if(stagedMonitor?.stagedRunId!==stagedRun?.stagedRunId||stagedMonitor?.runSeal!==stagedRun?.runSeal)return{status:"STAGED_EXPANSION_MONITOR_CHAIN_MISMATCH",valid:false};
  const requiredMetrics=[...(stagedRun?.monitoringMetrics||[])].map(String).sort();
  const rollbackTypes=[...(stagedRun?.rollbackTypes||[])].map(String).sort();
  const evalByType=new Map((stagedMonitor?.rollbackEvaluations||[]).map(x=>[String(x?.type||""),x]));
  const payload={stagedRunId:stagedRun.stagedRunId,runSeal:stagedRun.runSeal,cohortId:stagedMonitor.cohortId||null,exposureShare:Number(stagedMonitor.exposureShare),races:stagedMonitor.races,metrics:Object.fromEntries(requiredMetrics.map(k=>[k,Number(stagedMonitor?.metrics?.[k])])),rollbackEvaluations:rollbackTypes.map(t=>({type:t,breached:evalByType.get(t)?.breached===true,evidence:evalByType.get(t)?.evidence??null,note:String(evalByType.get(t)?.note||"")})),observedAt:stagedMonitor.observedAt||""};
  const actual=simpleSealHash(JSON.stringify(stableSealValue(payload)));
  return{status:actual===stagedMonitor.monitorSeal?"STAGED_EXPANSION_MONITOR_VERIFIED":"SEAL_MISMATCH",valid:actual===stagedMonitor.monitorSeal,expectedSeal:stagedMonitor.monitorSeal,actualSeal:actual};
}


export function buildThickPostStagedExpansionReviewPackage(stagedMonitor,stagedRun,activation,plan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg,review={}){
  const common={version:"THICK-POST-STAGED-EXPANSION-REVIEW-1.0",researchOnly:true,productionWriteAllowed:false,autoPromotionAllowed:false,stagedRunId:stagedRun?.stagedRunId||null,planId:plan?.planId||null,proposalId:run?.proposalId||null};
  const verified=verifyThickStagedExpansionMonitoring(stagedMonitor,stagedRun,activation,plan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!verified.valid)return{...common,status:"POST_STAGED_EXPANSION_SOURCE_INVALID",decision:"BLOCK",sourceVerification:verified};
  if(stagedMonitor?.status!=="STAGED_EXPANSION_MINIMUM_SAMPLE_REACHED_NO_BREACH"||stagedMonitor?.decision!=="RETAIN_FOR_POST_STAGED_EXPANSION_REVIEW_ONLY")return{...common,status:"POST_STAGED_EXPANSION_COMPLETED_MONITOR_REQUIRED",decision:"BLOCK"};
  const requiredMetrics=[...(stagedRun?.monitoringMetrics||[])].map(String).sort();
  const summaryMetrics=review?.summaryMetrics&&typeof review.summaryMetrics==="object"?review.summaryMetrics:{};
  const baselineMetrics=review?.baselineMetrics&&typeof review.baselineMetrics==="object"?review.baselineMetrics:{};
  const missingSummary=requiredMetrics.filter(k=>!Number.isFinite(Number(summaryMetrics[k])));
  const missingBaseline=requiredMetrics.filter(k=>!Number.isFinite(Number(baselineMetrics[k])));
  if(missingSummary.length||missingBaseline.length)return{...common,status:"POST_STAGED_EXPANSION_REVIEW_INCOMPLETE",decision:"HOLD",missingSummaryMetrics:missingSummary,missingBaselineMetrics:missingBaseline};
  const counterEvidence=Array.isArray(review?.counterEvidence)?review.counterEvidence.filter(Boolean):[];
  if(!counterEvidence.length)return{...common,status:"POST_STAGED_EXPANSION_COUNTER_EVIDENCE_REQUIRED",decision:"HOLD"};
  const unresolvedIssues=Array.isArray(review?.unresolvedIssues)?review.unresolvedIssues.filter(Boolean):[];
  const rollbackNonTriggerEvidence=Array.isArray(review?.rollbackNonTriggerEvidence)?review.rollbackNonTriggerEvidence.filter(Boolean):[];
  const requiredRollbackTypes=[...(stagedRun?.rollbackTypes||[])].map(String).sort();
  const coveredRollbackTypes=new Set(rollbackNonTriggerEvidence.map(x=>String(x?.type||"")));
  const missingRollbackEvidence=requiredRollbackTypes.filter(t=>!coveredRollbackTypes.has(t));
  if(missingRollbackEvidence.length)return{...common,status:"POST_STAGED_EXPANSION_ROLLBACK_EVIDENCE_INCOMPLETE",decision:"HOLD",missingRollbackEvidence};
  const deltas={};
  for(const k of requiredMetrics)deltas[k]=Number(summaryMetrics[k])-Number(baselineMetrics[k]);
  const reviewerId=String(review?.reviewerId||"").trim();
  if(!reviewerId)return{...common,status:"POST_STAGED_EXPANSION_REVIEWER_REQUIRED",decision:"HOLD"};
  const reviewedAt=String(review?.reviewedAt||"").trim();
  const payload={stagedRunId:stagedRun.stagedRunId,runSeal:stagedRun.runSeal,monitorSeal:stagedMonitor.monitorSeal,planId:plan.planId,planSeal:plan.planSeal,sourceDecisionId:postCanaryDecision.decisionId,sourceDecisionSeal:postCanaryDecision.decisionSeal,targetCohortId:stagedRun.targetCohortId,exposureShare:stagedRun.targetExposureShare,races:stagedMonitor.races,minimumRaces:stagedRun.minimumRaces,requiredMetrics,summaryMetrics:Object.fromEntries(requiredMetrics.map(k=>[k,Number(summaryMetrics[k])])),baselineMetrics:Object.fromEntries(requiredMetrics.map(k=>[k,Number(baselineMetrics[k])])),deltas,counterEvidence,unresolvedIssues,rollbackNonTriggerEvidence,requiredRollbackTypes,reviewerId,reviewedAt};
  const reviewSeal=simpleSealHash(JSON.stringify(stableSealValue(payload)));
  const postStagedReviewId=`THICK-POST-STAGED-EXPANSION-${reviewSeal}`;
  return{...common,status:"POST_STAGED_EXPANSION_REVIEW_PACKAGE_READY",decision:"MANUAL_POST_STAGED_EXPANSION_DECISION_ONLY",postStagedReviewId,reviewSeal,reviewerId,reviewedAt,runSeal:stagedRun.runSeal,monitorSeal:stagedMonitor.monitorSeal,targetCohortId:stagedRun.targetCohortId,exposureShare:stagedRun.targetExposureShare,races:stagedMonitor.races,minimumRaces:stagedRun.minimumRaces,requiredMetrics,summaryMetrics:payload.summaryMetrics,baselineMetrics:payload.baselineMetrics,deltas,counterEvidence,unresolvedIssues,rollbackNonTriggerEvidence,requiredRollbackTypes,safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,fullRolloutAllowed:false,furtherExpansionAllowed:false,manualDecisionRequired:true,counterEvidenceRequired:true,rollbackEvidenceRequired:true,postStagedExpansionMutationForbidden:true}};
}

export function verifyThickPostStagedExpansionReviewPackage(postReview,stagedMonitor,stagedRun,activation,plan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg){
  if(postReview?.status!=="POST_STAGED_EXPANSION_REVIEW_PACKAGE_READY")return{status:"POST_STAGED_EXPANSION_REVIEW_PACKAGE_REQUIRED",valid:false};
  const source=verifyThickStagedExpansionMonitoring(stagedMonitor,stagedRun,activation,plan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!source.valid)return{status:"POST_STAGED_EXPANSION_SOURCE_INVALID",valid:false,sourceVerification:source};
  if(postReview?.stagedRunId!==stagedRun?.stagedRunId||postReview?.runSeal!==stagedRun?.runSeal||postReview?.monitorSeal!==stagedMonitor?.monitorSeal)return{status:"POST_STAGED_EXPANSION_CHAIN_MISMATCH",valid:false};
  const requiredMetrics=[...(postReview.requiredMetrics||[])].sort();
  const payload={stagedRunId:stagedRun.stagedRunId,runSeal:stagedRun.runSeal,monitorSeal:stagedMonitor.monitorSeal,planId:plan.planId,planSeal:plan.planSeal,sourceDecisionId:postCanaryDecision.decisionId,sourceDecisionSeal:postCanaryDecision.decisionSeal,targetCohortId:stagedRun.targetCohortId,exposureShare:stagedRun.targetExposureShare,races:postReview.races,minimumRaces:stagedRun.minimumRaces,requiredMetrics,summaryMetrics:postReview.summaryMetrics||{},baselineMetrics:postReview.baselineMetrics||{},deltas:postReview.deltas||{},counterEvidence:postReview.counterEvidence||[],unresolvedIssues:postReview.unresolvedIssues||[],rollbackNonTriggerEvidence:postReview.rollbackNonTriggerEvidence||[],requiredRollbackTypes:[...(postReview.requiredRollbackTypes||[])].sort(),reviewerId:postReview.reviewerId||"",reviewedAt:postReview.reviewedAt||""};
  const actual=simpleSealHash(JSON.stringify(stableSealValue(payload)));
  return{status:actual===postReview.reviewSeal?"POST_STAGED_EXPANSION_REVIEW_VERIFIED":"SEAL_MISMATCH",valid:actual===postReview.reviewSeal,expectedSeal:postReview.reviewSeal,actualSeal:actual};
}

export function finalizeThickPostStagedExpansionDecision(postReview,stagedMonitor,stagedRun,activation,plan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg,decisionReview={}){
  const common={version:"THICK-POST-STAGED-EXPANSION-DECISION-1.0",researchOnly:true,productionWriteAllowed:false,autoPromotionAllowed:false,postStagedReviewId:postReview?.postStagedReviewId||null,stagedRunId:stagedRun?.stagedRunId||null,proposalId:run?.proposalId||null};
  const source=verifyThickPostStagedExpansionReviewPackage(postReview,stagedMonitor,stagedRun,activation,plan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!source.valid)return{...common,status:source.status||"POST_STAGED_EXPANSION_REVIEW_REQUIRED",eligible:false,decision:"BLOCK",sourceVerification:source};
  if(postReview?.decision!=="MANUAL_POST_STAGED_EXPANSION_DECISION_ONLY")return{...common,status:"MANUAL_POST_STAGED_EXPANSION_DECISION_REQUIRED",eligible:false,decision:"BLOCK"};
  const reviewerId=String(decisionReview?.reviewerId||"").trim();
  if(!reviewerId)return{...common,status:"POST_STAGED_EXPANSION_DECISION_REVIEWER_REQUIRED",eligible:false,decision:"HOLD"};
  const forbiddenReviewerIds=new Set([postReview?.reviewerId,activation?.reviewerId,postCanaryDecision?.reviewerId].map(x=>String(x||"").trim()).filter(Boolean));
  if(forbiddenReviewerIds.has(reviewerId))return{...common,status:"INDEPENDENT_POST_STAGED_EXPANSION_DECISION_REVIEWER_REQUIRED",eligible:false,decision:"HOLD",reviewerId,forbiddenReviewerIds:[...forbiddenReviewerIds].sort()};
  const verdict=String(decisionReview?.verdict||"").trim();
  const allowedVerdicts=new Set(["APPROVE_FINAL_ROLLOUT_CANDIDATE","HOLD","REJECT"]);
  if(!allowedVerdicts.has(verdict))return{...common,status:"POST_STAGED_EXPANSION_VERDICT_REQUIRED",eligible:false,decision:"HOLD",reviewerId};
  const acknowledgedCounterEvidence=decisionReview?.acknowledgedCounterEvidence===true;
  const acknowledgedUnresolvedIssues=decisionReview?.acknowledgedUnresolvedIssues===true;
  const acknowledgedRollbackTypes=new Set((decisionReview?.acknowledgedRollbackTypes||[]).map(String));
  const requiredRollbackTypes=[...(postReview?.requiredRollbackTypes||[])].map(String).sort();
  const missingRollbackAcknowledgements=requiredRollbackTypes.filter(x=>!acknowledgedRollbackTypes.has(x));
  if(verdict==="APPROVE_FINAL_ROLLOUT_CANDIDATE"&&!acknowledgedCounterEvidence)return{...common,status:"POST_STAGED_EXPANSION_COUNTER_EVIDENCE_ACK_REQUIRED",eligible:false,decision:"HOLD",reviewerId,verdict};
  if(verdict==="APPROVE_FINAL_ROLLOUT_CANDIDATE"&&!acknowledgedUnresolvedIssues)return{...common,status:"POST_STAGED_EXPANSION_UNRESOLVED_ISSUES_ACK_REQUIRED",eligible:false,decision:"HOLD",reviewerId,verdict};
  if(verdict==="APPROVE_FINAL_ROLLOUT_CANDIDATE"&&missingRollbackAcknowledgements.length)return{...common,status:"POST_STAGED_EXPANSION_ROLLBACK_ACK_INCOMPLETE",eligible:false,decision:"HOLD",reviewerId,verdict,missingRollbackAcknowledgements};
  const note=String(decisionReview?.note||"").trim();
  const decidedAt=String(decisionReview?.decidedAt||"").trim();
  const payload={postStagedReviewId:postReview.postStagedReviewId,reviewSeal:postReview.reviewSeal,stagedRunId:stagedRun.stagedRunId,runSeal:stagedRun.runSeal,monitorSeal:stagedMonitor.monitorSeal,planId:plan.planId,planSeal:plan.planSeal,sourceDecisionId:postCanaryDecision.decisionId,sourceDecisionSeal:postCanaryDecision.decisionSeal,reviewerId,verdict,note,decidedAt,acknowledgedCounterEvidence,acknowledgedUnresolvedIssues,acknowledgedRollbackTypes:[...acknowledgedRollbackTypes].sort(),requiredRollbackTypes,targetCohortId:postReview.targetCohortId||null,exposureShare:postReview.exposureShare,summaryMetrics:postReview.summaryMetrics||{},baselineMetrics:postReview.baselineMetrics||{},deltas:postReview.deltas||{},counterEvidence:postReview.counterEvidence||[],unresolvedIssues:postReview.unresolvedIssues||[],rollbackNonTriggerEvidence:postReview.rollbackNonTriggerEvidence||[]};
  const decisionSeal=simpleSealHash(JSON.stringify(stableSealValue(payload)));
  const decisionId=`THICK-POST-STAGED-EXPANSION-DECISION-${decisionSeal}`;
  if(verdict==="REJECT")return{...common,status:"POST_STAGED_EXPANSION_REJECTED",eligible:false,decision:"REJECT_RESEARCH_CANDIDATE",decisionId,decisionSeal,reviewerId,verdict,note,decidedAt,reviewSeal:postReview.reviewSeal,safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,fullRolloutAllowed:false,finalRolloutPlanningAllowed:false,decisionMutationForbidden:true}};
  if(verdict==="HOLD")return{...common,status:"POST_STAGED_EXPANSION_HELD",eligible:false,decision:"HOLD",decisionId,decisionSeal,reviewerId,verdict,note,decidedAt,reviewSeal:postReview.reviewSeal,safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,fullRolloutAllowed:false,finalRolloutPlanningAllowed:false,decisionMutationForbidden:true}};
  return{...common,status:"POST_STAGED_EXPANSION_DECISION_APPROVED",eligible:true,decision:"FINAL_ROLLOUT_CANDIDATE_ONLY",decisionId,decisionSeal,reviewerId,verdict,note,decidedAt,reviewSeal:postReview.reviewSeal,acknowledgedCounterEvidence,acknowledgedUnresolvedIssues,acknowledgedRollbackTypes:[...acknowledgedRollbackTypes].sort(),requiredRollbackTypes,targetCohortId:postReview.targetCohortId||null,priorExposureShare:postReview.exposureShare,summaryMetrics:postReview.summaryMetrics||{},baselineMetrics:postReview.baselineMetrics||{},deltas:postReview.deltas||{},counterEvidence:postReview.counterEvidence||[],unresolvedIssues:postReview.unresolvedIssues||[],rollbackNonTriggerEvidence:postReview.rollbackNonTriggerEvidence||[],safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,fullRolloutAllowed:false,finalRolloutPlanningAllowed:true,finalRolloutActivationAllowed:false,manualFinalRolloutPlanRequired:true,rollbackConditionsLocked:true,decisionMutationForbidden:true}};
}

export function verifyThickPostStagedExpansionDecision(decision,postReview,stagedMonitor,stagedRun,activation,plan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg){
  if(decision?.status!=="POST_STAGED_EXPANSION_DECISION_APPROVED")return{status:"POST_STAGED_EXPANSION_APPROVAL_REQUIRED",valid:false};
  const source=verifyThickPostStagedExpansionReviewPackage(postReview,stagedMonitor,stagedRun,activation,plan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!source.valid)return{status:source.status||"POST_STAGED_EXPANSION_REVIEW_REQUIRED",valid:false};
  if(decision?.postStagedReviewId!==postReview?.postStagedReviewId||decision?.reviewSeal!==postReview?.reviewSeal||decision?.stagedRunId!==stagedRun?.stagedRunId)return{status:"POST_STAGED_EXPANSION_DECISION_CHAIN_MISMATCH",valid:false};
  const requiredRollbackTypes=[...(postReview?.requiredRollbackTypes||[])].map(String).sort();
  const payload={postStagedReviewId:postReview.postStagedReviewId,reviewSeal:postReview.reviewSeal,stagedRunId:stagedRun.stagedRunId,runSeal:stagedRun.runSeal,monitorSeal:stagedMonitor.monitorSeal,planId:plan.planId,planSeal:plan.planSeal,sourceDecisionId:postCanaryDecision.decisionId,sourceDecisionSeal:postCanaryDecision.decisionSeal,reviewerId:decision.reviewerId||"",verdict:decision.verdict||"",note:decision.note||"",decidedAt:decision.decidedAt||"",acknowledgedCounterEvidence:decision.acknowledgedCounterEvidence===true,acknowledgedUnresolvedIssues:decision.acknowledgedUnresolvedIssues===true,acknowledgedRollbackTypes:[...(decision.acknowledgedRollbackTypes||[])].sort(),requiredRollbackTypes,targetCohortId:postReview.targetCohortId||null,exposureShare:postReview.exposureShare,summaryMetrics:postReview.summaryMetrics||{},baselineMetrics:postReview.baselineMetrics||{},deltas:postReview.deltas||{},counterEvidence:postReview.counterEvidence||[],unresolvedIssues:postReview.unresolvedIssues||[],rollbackNonTriggerEvidence:postReview.rollbackNonTriggerEvidence||[]};
  const actual=simpleSealHash(JSON.stringify(stableSealValue(payload)));
  return{status:actual===decision.decisionSeal?"POST_STAGED_EXPANSION_DECISION_VERIFIED":"SEAL_MISMATCH",valid:actual===decision.decisionSeal,expectedSeal:decision.decisionSeal,actualSeal:actual};
}

export function createThickFinalRolloutPlan(postStagedDecision,postReview,stagedMonitor,stagedRun,activation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg,options={}){
  const common={version:"THICK-FINAL-ROLLOUT-PLAN-1.0",researchOnly:true,productionWriteAllowed:false,autoPromotionAllowed:false,sourceDecisionId:postStagedDecision?.decisionId||null,proposalId:run?.proposalId||null};
  const source=verifyThickPostStagedExpansionDecision(postStagedDecision,postReview,stagedMonitor,stagedRun,activation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!source.valid)return{...common,status:source.status||"FINAL_ROLLOUT_CANDIDATE_REQUIRED",eligible:false,decision:"BLOCK",sourceVerification:source};
  if(postStagedDecision?.decision!=="FINAL_ROLLOUT_CANDIDATE_ONLY")return{...common,status:"FINAL_ROLLOUT_CANDIDATE_REQUIRED",eligible:false,decision:"BLOCK"};
  const targetCohortId=String(options?.targetCohortId||postStagedDecision?.targetCohortId||"").trim();
  if(!targetCohortId||targetCohortId!==String(postStagedDecision?.targetCohortId||""))return{...common,status:"FINAL_ROLLOUT_COHORT_MISMATCH",eligible:false,decision:"HOLD",targetCohortId:targetCohortId||null};
  const targetExposureShare=Number(options?.targetExposureShare??1);
  if(targetExposureShare!==1)return{...common,status:"FINAL_ROLLOUT_EXPOSURE_MUST_BE_100_PERCENT",eligible:false,decision:"HOLD",targetExposureShare};
  const priorExposureShare=Number(postStagedDecision?.priorExposureShare??postReview?.exposureShare??0);
  if(!Number.isFinite(priorExposureShare)||priorExposureShare<=0||priorExposureShare>=1)return{...common,status:"FINAL_ROLLOUT_PRIOR_EXPOSURE_INVALID",eligible:false,decision:"HOLD",priorExposureShare};
  const minimumRaces=Math.max(100,Number(options?.minimumRaces||100));
  const monitoringMetrics=[...(stagedPlan?.monitoringMetrics||[])].map(String).sort();
  const rollbackTypes=[...(postStagedDecision?.requiredRollbackTypes||stagedPlan?.rollbackTypes||[])].map(String).sort();
  if(monitoringMetrics.length<5)return{...common,status:"FINAL_ROLLOUT_MONITORING_METRICS_INCOMPLETE",eligible:false,decision:"HOLD",monitoringMetrics};
  if(rollbackTypes.length<5)return{...common,status:"FINAL_ROLLOUT_ROLLBACK_TYPES_INCOMPLETE",eligible:false,decision:"HOLD",rollbackTypes};
  const immediateStop=options?.immediateStop!==false;
  if(!immediateStop)return{...common,status:"FINAL_ROLLOUT_IMMEDIATE_STOP_REQUIRED",eligible:false,decision:"HOLD"};
  const postRolloutReviewRequired=options?.postRolloutReviewRequired!==false;
  if(!postRolloutReviewRequired)return{...common,status:"FINAL_ROLLOUT_POST_REVIEW_REQUIRED",eligible:false,decision:"HOLD"};
  const createdBy=String(options?.createdBy||"").trim();
  const createdAt=String(options?.createdAt||"").trim();
  const payload={sourceDecisionId:postStagedDecision.decisionId,sourceDecisionSeal:postStagedDecision.decisionSeal,postStagedReviewId:postReview.postStagedReviewId,reviewSeal:postReview.reviewSeal,stagedRunId:stagedRun.stagedRunId,runSeal:stagedRun.runSeal,monitorSeal:stagedMonitor.monitorSeal,targetCohortId,priorExposureShare,targetExposureShare,minimumRaces,monitoringMetrics,rollbackTypes,immediateStop,postRolloutReviewRequired,createdBy,createdAt};
  const planSeal=simpleSealHash(JSON.stringify(stableSealValue(payload)));
  const planId=`THICK-FINAL-ROLLOUT-PLAN-${planSeal}`;
  return{...common,status:"FINAL_ROLLOUT_PLAN_READY",eligible:true,decision:"MANUAL_FINAL_ROLLOUT_ACTIVATION_REVIEW_ONLY",planId,planSeal,targetCohortId,priorExposureShare,targetExposureShare,minimumRaces,monitoringMetrics,rollbackTypes,immediateStop,postRolloutReviewRequired,createdBy,createdAt,safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,fullRolloutAllowed:false,finalRolloutActivationAllowed:false,manualActivationReviewRequired:true,cohortLocked:true,exposureLocked:true,monitoringMetricsLocked:true,rollbackConditionsLocked:true,immediateStopLocked:true,postRolloutReviewRequired:true,planMutationForbidden:true}};
}

export function verifyThickFinalRolloutPlan(plan,postStagedDecision,postReview,stagedMonitor,stagedRun,activation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg){
  if(plan?.status!=="FINAL_ROLLOUT_PLAN_READY")return{status:"FINAL_ROLLOUT_PLAN_REQUIRED",valid:false};
  const source=verifyThickPostStagedExpansionDecision(postStagedDecision,postReview,stagedMonitor,stagedRun,activation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!source.valid)return{status:source.status||"FINAL_ROLLOUT_CANDIDATE_REQUIRED",valid:false};
  if(plan?.sourceDecisionId!==postStagedDecision?.decisionId)return{status:"FINAL_ROLLOUT_PLAN_CHAIN_MISMATCH",valid:false};
  const payload={sourceDecisionId:postStagedDecision.decisionId,sourceDecisionSeal:postStagedDecision.decisionSeal,postStagedReviewId:postReview.postStagedReviewId,reviewSeal:postReview.reviewSeal,stagedRunId:stagedRun.stagedRunId,runSeal:stagedRun.runSeal,monitorSeal:stagedMonitor.monitorSeal,targetCohortId:plan.targetCohortId,priorExposureShare:plan.priorExposureShare,targetExposureShare:plan.targetExposureShare,minimumRaces:plan.minimumRaces,monitoringMetrics:[...(plan.monitoringMetrics||[])].sort(),rollbackTypes:[...(plan.rollbackTypes||[])].sort(),immediateStop:plan.immediateStop===true,postRolloutReviewRequired:plan.postRolloutReviewRequired===true,createdBy:plan.createdBy||"",createdAt:plan.createdAt||""};
  const actual=simpleSealHash(JSON.stringify(stableSealValue(payload)));
  return{status:actual===plan.planSeal?"FINAL_ROLLOUT_PLAN_VERIFIED":"SEAL_MISMATCH",valid:actual===plan.planSeal,expectedSeal:plan.planSeal,actualSeal:actual};
}

export function finalizeThickFinalRolloutActivationReview(plan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg,review={}){
  const common={version:"THICK-FINAL-ROLLOUT-ACTIVATION-REVIEW-1.0",researchOnly:true,productionWriteAllowed:false,autoPromotionAllowed:false,planId:plan?.planId||null,proposalId:run?.proposalId||null,sourceDecisionId:postStagedDecision?.decisionId||null,sourceDecisionSeal:postStagedDecision?.decisionSeal||null};
  const source=verifyThickFinalRolloutPlan(plan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!source.valid)return{...common,status:source.status||"FINAL_ROLLOUT_PLAN_REQUIRED",eligible:false,decision:"BLOCK",sourceVerification:source};
  if(plan?.decision!=="MANUAL_FINAL_ROLLOUT_ACTIVATION_REVIEW_ONLY")return{...common,status:"FINAL_ROLLOUT_ACTIVATION_REVIEW_REQUIRED",eligible:false,decision:"BLOCK"};
  if(Number(plan?.targetExposureShare)!==1)return{...common,status:"FINAL_ROLLOUT_EXPOSURE_MUST_BE_100_PERCENT",eligible:false,decision:"HOLD"};
  if(plan?.immediateStop!==true)return{...common,status:"FINAL_ROLLOUT_IMMEDIATE_STOP_REQUIRED",eligible:false,decision:"HOLD"};
  if(plan?.postRolloutReviewRequired!==true)return{...common,status:"FINAL_ROLLOUT_POST_REVIEW_REQUIRED",eligible:false,decision:"HOLD"};
  const reviewerId=String(review?.reviewerId||"").trim();
  if(!reviewerId)return{...common,status:"FINAL_ROLLOUT_ACTIVATION_REVIEWER_REQUIRED",eligible:false,decision:"HOLD"};
  const priorReviewerIds=new Set([
    plan?.createdBy,
    postStagedDecision?.reviewerId,
    postReview?.reviewerId,
    stagedActivation?.reviewerId,
    stagedPlan?.createdBy,
    postCanaryDecision?.reviewerId,
    reviewPackage?.reviewerId,
    activationDecision?.reviewerId,
    finalDecision?.reviewerId,
    pkg?.sourceChain?.primaryReviewerId,
    pkg?.sourceChain?.finalReviewerId
  ].filter(Boolean).map(String));
  if(priorReviewerIds.has(reviewerId))return{...common,status:"INDEPENDENT_FINAL_ROLLOUT_ACTIVATION_REVIEWER_REQUIRED",eligible:false,decision:"HOLD",reviewerId,priorReviewerIds:[...priorReviewerIds]};
  const verdict=String(review?.verdict||"").trim().toUpperCase();
  const allowed=new Set(["APPROVE_FINAL_ROLLOUT_ACTIVATION","HOLD","REJECT"]);
  if(!allowed.has(verdict))return{...common,status:"FINAL_ROLLOUT_ACTIVATION_VERDICT_REQUIRED",eligible:false,decision:"HOLD",reviewerId};
  const acknowledgedPlanSeal=review?.acknowledgedPlanSeal===true;
  const acknowledgedFullExposure=review?.acknowledgedFullExposure===true;
  const acknowledgedImmediateStop=review?.acknowledgedImmediateStop===true;
  const acknowledgedPostRolloutReview=review?.acknowledgedPostRolloutReview===true;
  const metricAck=new Set((Array.isArray(review?.acknowledgedMonitoringMetrics)?review.acknowledgedMonitoringMetrics:[]).map(String));
  const rollbackAck=new Set((Array.isArray(review?.acknowledgedRollbackTypes)?review.acknowledgedRollbackTypes:[]).map(String));
  const requiredMetrics=[...(plan?.monitoringMetrics||[])].map(String).sort();
  const requiredRollbackTypes=[...(plan?.rollbackTypes||[])].map(String).sort();
  const missingMetrics=requiredMetrics.filter(x=>!metricAck.has(x));
  const missingRollbackTypes=requiredRollbackTypes.filter(x=>!rollbackAck.has(x));
  if(verdict==="APPROVE_FINAL_ROLLOUT_ACTIVATION"&&!acknowledgedPlanSeal)return{...common,status:"FINAL_ROLLOUT_PLAN_SEAL_ACK_REQUIRED",eligible:false,decision:"HOLD",reviewerId,verdict};
  if(verdict==="APPROVE_FINAL_ROLLOUT_ACTIVATION"&&!acknowledgedFullExposure)return{...common,status:"FINAL_ROLLOUT_FULL_EXPOSURE_ACK_REQUIRED",eligible:false,decision:"HOLD",reviewerId,verdict};
  if(verdict==="APPROVE_FINAL_ROLLOUT_ACTIVATION"&&!acknowledgedImmediateStop)return{...common,status:"FINAL_ROLLOUT_IMMEDIATE_STOP_ACK_REQUIRED",eligible:false,decision:"HOLD",reviewerId,verdict};
  if(verdict==="APPROVE_FINAL_ROLLOUT_ACTIVATION"&&!acknowledgedPostRolloutReview)return{...common,status:"FINAL_ROLLOUT_POST_REVIEW_ACK_REQUIRED",eligible:false,decision:"HOLD",reviewerId,verdict};
  if(verdict==="APPROVE_FINAL_ROLLOUT_ACTIVATION"&&missingMetrics.length)return{...common,status:"FINAL_ROLLOUT_MONITORING_ACK_INCOMPLETE",eligible:false,decision:"HOLD",reviewerId,verdict,missingMetrics};
  if(verdict==="APPROVE_FINAL_ROLLOUT_ACTIVATION"&&missingRollbackTypes.length)return{...common,status:"FINAL_ROLLOUT_ROLLBACK_ACK_INCOMPLETE",eligible:false,decision:"HOLD",reviewerId,verdict,missingRollbackTypes};
  const note=String(review?.note||"").trim();
  const reviewedAt=String(review?.reviewedAt||"").trim();
  const payload={planId:plan.planId,planSeal:plan.planSeal,sourceDecisionId:postStagedDecision.decisionId,sourceDecisionSeal:postStagedDecision.decisionSeal,reviewerId,verdict,note,reviewedAt,acknowledgedPlanSeal,acknowledgedFullExposure,acknowledgedImmediateStop,acknowledgedPostRolloutReview,acknowledgedMonitoringMetrics:[...metricAck].sort(),acknowledgedRollbackTypes:[...rollbackAck].sort(),requiredMetrics,requiredRollbackTypes,targetCohortId:plan.targetCohortId,priorExposureShare:plan.priorExposureShare,targetExposureShare:plan.targetExposureShare,minimumRaces:plan.minimumRaces};
  const activationSeal=simpleSealHash(JSON.stringify(stableSealValue(payload)));
  const activationId=`THICK-FINAL-ROLLOUT-ACTIVATION-${activationSeal}`;
  if(verdict==="REJECT")return{...common,status:"FINAL_ROLLOUT_ACTIVATION_REJECTED",eligible:false,decision:"REJECT_FINAL_ROLLOUT",activationId,activationSeal,reviewerId,verdict,note,reviewedAt,planSeal:plan.planSeal,safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,finalRolloutStartAllowed:false,activationMutationForbidden:true}};
  if(verdict==="HOLD")return{...common,status:"FINAL_ROLLOUT_ACTIVATION_HELD",eligible:false,decision:"HOLD",activationId,activationSeal,reviewerId,verdict,note,reviewedAt,planSeal:plan.planSeal,safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,finalRolloutStartAllowed:false,activationMutationForbidden:true}};
  return{...common,status:"FINAL_ROLLOUT_ACTIVATION_APPROVED",eligible:true,decision:"AUTHORIZED_FINAL_ROLLOUT_START_ONLY",activationId,activationSeal,reviewerId,verdict,note,reviewedAt,planSeal:plan.planSeal,acknowledgedPlanSeal,acknowledgedFullExposure,acknowledgedImmediateStop,acknowledgedPostRolloutReview,acknowledgedMonitoringMetrics:[...metricAck].sort(),acknowledgedRollbackTypes:[...rollbackAck].sort(),requiredMetrics,requiredRollbackTypes,targetCohortId:plan.targetCohortId,priorExposureShare:plan.priorExposureShare,targetExposureShare:plan.targetExposureShare,minimumRaces:plan.minimumRaces,safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,finalRolloutStartAllowed:true,startIsSeparateOperation:true,productionActivationAllowed:false,rollbackConditionsLocked:true,monitoringMetricsLocked:true,cohortLocked:true,fullExposureLocked:true,postRolloutReviewRequired:true,activationMutationForbidden:true}};
}

export function verifyThickFinalRolloutActivationReview(activation,plan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg){
  if(activation?.status!=="FINAL_ROLLOUT_ACTIVATION_APPROVED")return{status:"FINAL_ROLLOUT_ACTIVATION_APPROVAL_REQUIRED",valid:false};
  const source=verifyThickFinalRolloutPlan(plan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!source.valid)return{status:source.status||"FINAL_ROLLOUT_PLAN_REQUIRED",valid:false};
  if(activation?.planId!==plan?.planId||activation?.planSeal!==plan?.planSeal||activation?.sourceDecisionId!==postStagedDecision?.decisionId)return{status:"FINAL_ROLLOUT_ACTIVATION_CHAIN_MISMATCH",valid:false};
  const requiredMetrics=[...(plan?.monitoringMetrics||[])].map(String).sort();
  const requiredRollbackTypes=[...(plan?.rollbackTypes||[])].map(String).sort();
  const payload={planId:plan.planId,planSeal:plan.planSeal,sourceDecisionId:postStagedDecision.decisionId,sourceDecisionSeal:postStagedDecision.decisionSeal,reviewerId:activation.reviewerId||"",verdict:activation.verdict||"",note:activation.note||"",reviewedAt:activation.reviewedAt||"",acknowledgedPlanSeal:activation.acknowledgedPlanSeal===true,acknowledgedFullExposure:activation.acknowledgedFullExposure===true,acknowledgedImmediateStop:activation.acknowledgedImmediateStop===true,acknowledgedPostRolloutReview:activation.acknowledgedPostRolloutReview===true,acknowledgedMonitoringMetrics:[...(activation.acknowledgedMonitoringMetrics||[])].sort(),acknowledgedRollbackTypes:[...(activation.acknowledgedRollbackTypes||[])].sort(),requiredMetrics,requiredRollbackTypes,targetCohortId:plan.targetCohortId,priorExposureShare:plan.priorExposureShare,targetExposureShare:plan.targetExposureShare,minimumRaces:plan.minimumRaces};
  const actual=simpleSealHash(JSON.stringify(stableSealValue(payload)));
  return{status:actual===activation.activationSeal?"FINAL_ROLLOUT_ACTIVATION_VERIFIED":"SEAL_MISMATCH",valid:actual===activation.activationSeal,expectedSeal:activation.activationSeal,actualSeal:actual};
}


export function startThickFinalRolloutRun(finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg,start={}){
  const common={version:"THICK-FINAL-ROLLOUT-RUN-1.0",researchOnly:true,productionWriteAllowed:false,autoPromotionAllowed:false,planId:finalPlan?.planId||null,proposalId:run?.proposalId||null,sourceDecisionId:postStagedDecision?.decisionId||null};
  const approval=verifyThickFinalRolloutActivationReview(finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!approval.valid)return{...common,status:approval.status||"FINAL_ROLLOUT_ACTIVATION_APPROVAL_REQUIRED",active:false,decision:"BLOCK",verification:approval};
  if(finalActivation?.decision!=="AUTHORIZED_FINAL_ROLLOUT_START_ONLY")return{...common,status:"AUTHORIZED_FINAL_ROLLOUT_START_REQUIRED",active:false,decision:"BLOCK"};
  const targetCohortId=String(start?.targetCohortId||finalPlan?.targetCohortId||"").trim();
  if(!targetCohortId||targetCohortId!==String(finalPlan?.targetCohortId||""))return{...common,status:"FINAL_ROLLOUT_START_COHORT_MISMATCH",active:false,decision:"BLOCK",expectedCohortId:finalPlan?.targetCohortId||null,targetCohortId:targetCohortId||null};
  const targetExposureShare=Number(start?.targetExposureShare??finalPlan?.targetExposureShare);
  if(!Number.isFinite(targetExposureShare)||targetExposureShare!==1||targetExposureShare!==Number(finalPlan?.targetExposureShare))return{...common,status:"FINAL_ROLLOUT_START_EXPOSURE_MISMATCH",active:false,decision:"BLOCK",expectedExposureShare:1,targetExposureShare:Number.isFinite(targetExposureShare)?targetExposureShare:null};
  const monitoringMetrics=[...(Array.isArray(start?.monitoringMetrics)?start.monitoringMetrics:finalPlan?.monitoringMetrics||[])].map(String).sort();
  const requiredMetrics=[...(finalPlan?.monitoringMetrics||[])].map(String).sort();
  if(stableStringify(monitoringMetrics)!==stableStringify(requiredMetrics))return{...common,status:"FINAL_ROLLOUT_START_MONITORING_MISMATCH",active:false,decision:"BLOCK",requiredMetrics,monitoringMetrics};
  const rollbackTypes=[...(Array.isArray(start?.rollbackTypes)?start.rollbackTypes:finalPlan?.rollbackTypes||[])].map(String).sort();
  const requiredRollbackTypes=[...(finalPlan?.rollbackTypes||[])].map(String).sort();
  if(stableStringify(rollbackTypes)!==stableStringify(requiredRollbackTypes))return{...common,status:"FINAL_ROLLOUT_START_ROLLBACK_MISMATCH",active:false,decision:"BLOCK",requiredRollbackTypes,rollbackTypes};
  if(start?.immediateStop===false||finalPlan?.immediateStop!==true)return{...common,status:"FINAL_ROLLOUT_START_IMMEDIATE_STOP_REQUIRED",active:false,decision:"HOLD"};
  if(start?.postRolloutReviewRequired===false||finalPlan?.postRolloutReviewRequired!==true)return{...common,status:"FINAL_ROLLOUT_START_POST_REVIEW_REQUIRED",active:false,decision:"HOLD"};
  const executorId=String(start?.executorId||"").trim();
  if(!executorId)return{...common,status:"FINAL_ROLLOUT_START_EXECUTOR_REQUIRED",active:false,decision:"HOLD"};
  const startedAt=String(start?.startedAt||new Date().toISOString());
  const payload={planId:finalPlan.planId,planSeal:finalPlan.planSeal,activationId:finalActivation.activationId,activationSeal:finalActivation.activationSeal,sourceDecisionId:postStagedDecision.decisionId,sourceDecisionSeal:postStagedDecision.decisionSeal,targetCohortId,priorExposureShare:finalPlan.priorExposureShare,targetExposureShare:1,minimumRaces:finalPlan.minimumRaces,monitoringMetrics:requiredMetrics,rollbackTypes:requiredRollbackTypes,immediateStop:true,postRolloutReviewRequired:true,executorId,startedAt};
  const finalRunSeal=simpleSealHash(JSON.stringify(stableSealValue(payload)));
  const finalRunId=`THICK-FINAL-ROLLOUT-RUN-${finalRunSeal}`;
  return{...common,status:"FINAL_ROLLOUT_MONITORING_ACTIVE",active:true,decision:"MONITOR_FINAL_ROLLOUT_ONLY",finalRunId,finalRunSeal,planSeal:finalPlan.planSeal,activationId:finalActivation.activationId,activationSeal:finalActivation.activationSeal,sourceDecisionId:postStagedDecision.decisionId,sourceDecisionSeal:postStagedDecision.decisionSeal,targetCohortId,priorExposureShare:finalPlan.priorExposureShare,targetExposureShare:1,minimumRaces:finalPlan.minimumRaces,monitoringMetrics:requiredMetrics,rollbackTypes:requiredRollbackTypes,immediateStop:true,postRolloutReviewRequired:true,executorId,startedAt,safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,productionActivationAllowed:false,fullExposureLocked:true,cohortLocked:true,monitoringMetricsLocked:true,rollbackConditionsLocked:true,immediateStopOnRollbackBreach:true,postRolloutReviewRequired:true,runMutationForbidden:true,monitoringOnly:true}};
}

export function verifyThickFinalRolloutRun(finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg){
  if(finalRun?.status!=="FINAL_ROLLOUT_MONITORING_ACTIVE")return{status:"ACTIVE_FINAL_ROLLOUT_RUN_REQUIRED",valid:false};
  const approval=verifyThickFinalRolloutActivationReview(finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!approval.valid)return{status:approval.status||"FINAL_ROLLOUT_ACTIVATION_APPROVAL_REQUIRED",valid:false};
  if(finalRun?.planId!==finalPlan?.planId||finalRun?.planSeal!==finalPlan?.planSeal||finalRun?.activationId!==finalActivation?.activationId||finalRun?.activationSeal!==finalActivation?.activationSeal||finalRun?.sourceDecisionId!==postStagedDecision?.decisionId)return{status:"FINAL_ROLLOUT_RUN_CHAIN_MISMATCH",valid:false};
  const payload={planId:finalPlan.planId,planSeal:finalPlan.planSeal,activationId:finalActivation.activationId,activationSeal:finalActivation.activationSeal,sourceDecisionId:postStagedDecision.decisionId,sourceDecisionSeal:postStagedDecision.decisionSeal,targetCohortId:finalRun.targetCohortId,priorExposureShare:finalRun.priorExposureShare,targetExposureShare:finalRun.targetExposureShare,minimumRaces:finalRun.minimumRaces,monitoringMetrics:[...(finalRun.monitoringMetrics||[])].sort(),rollbackTypes:[...(finalRun.rollbackTypes||[])].sort(),immediateStop:finalRun.immediateStop===true,postRolloutReviewRequired:finalRun.postRolloutReviewRequired===true,executorId:finalRun.executorId||"",startedAt:finalRun.startedAt||""};
  const actual=simpleSealHash(JSON.stringify(stableSealValue(payload)));
  return{status:actual===finalRun.finalRunSeal?"FINAL_ROLLOUT_RUN_VERIFIED":"SEAL_MISMATCH",valid:actual===finalRun.finalRunSeal,expectedSeal:finalRun.finalRunSeal,actualSeal:actual};
}

export function evaluateThickFinalRolloutMonitoring(finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg,observation={}){
  const common={version:"THICK-FINAL-ROLLOUT-MONITOR-1.0",researchOnly:true,productionWriteAllowed:false,autoPromotionAllowed:false,finalRunId:finalRun?.finalRunId||null,planId:finalPlan?.planId||null,proposalId:run?.proposalId||null};
  const runVerification=verifyThickFinalRolloutRun(finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!runVerification.valid)return{...common,status:runVerification.status||"ACTIVE_FINAL_ROLLOUT_RUN_REQUIRED",active:false,decision:"BLOCK",verification:runVerification};
  if(finalRun?.status!=="FINAL_ROLLOUT_MONITORING_ACTIVE"||finalRun?.active!==true)return{...common,status:"ACTIVE_FINAL_ROLLOUT_RUN_REQUIRED",active:false,decision:"BLOCK"};
  const cohortId=String(observation?.cohortId||"").trim();
  if(!cohortId||cohortId!==String(finalRun?.targetCohortId||""))return{...common,status:"FINAL_ROLLOUT_MONITOR_COHORT_MISMATCH",active:false,decision:"BLOCK",expectedCohortId:finalRun?.targetCohortId||null,cohortId:cohortId||null};
  const exposureShare=Number(observation?.exposureShare??finalRun?.targetExposureShare);
  if(!Number.isFinite(exposureShare)||exposureShare!==1||exposureShare!==Number(finalRun?.targetExposureShare))return{...common,status:"FINAL_ROLLOUT_MONITOR_EXPOSURE_MISMATCH",active:false,decision:"BLOCK",expectedExposureShare:1,exposureShare:Number.isFinite(exposureShare)?exposureShare:null};
  const races=Number(observation?.races);
  if(!Number.isInteger(races)||races<0)return{...common,status:"FINAL_ROLLOUT_MONITOR_RACE_COUNT_INVALID",active:false,decision:"HOLD"};
  const requiredMetrics=[...(finalRun?.monitoringMetrics||[])].map(String).sort();
  const metrics=observation?.metrics&&typeof observation.metrics==="object"?observation.metrics:{};
  const missingMetrics=requiredMetrics.filter(k=>!Object.prototype.hasOwnProperty.call(metrics,k)||!Number.isFinite(Number(metrics[k])));
  if(missingMetrics.length)return{...common,status:"FINAL_ROLLOUT_MONITORING_EVIDENCE_INCOMPLETE",active:false,decision:"HOLD",missingMetrics};
  const requiredRollbackTypes=[...(finalRun?.rollbackTypes||[])].map(String).sort();
  const evaluations=Array.isArray(observation?.rollbackEvaluations)?observation.rollbackEvaluations:[];
  const byType=new Map(evaluations.map(x=>[String(x?.type||""),x]));
  const missingRollbackEvaluations=requiredRollbackTypes.filter(t=>!byType.has(t)||typeof byType.get(t)?.breached!=="boolean");
  if(missingRollbackEvaluations.length)return{...common,status:"FINAL_ROLLOUT_ROLLBACK_EVALUATION_INCOMPLETE",active:false,decision:"HOLD",missingRollbackEvaluations};
  const breaches=requiredRollbackTypes.filter(t=>byType.get(t)?.breached===true).map(t=>({type:t,evidence:byType.get(t)?.evidence??null,note:String(byType.get(t)?.note||"")}));
  const observedAt=String(observation?.observedAt||new Date().toISOString());
  const payload={finalRunId:finalRun.finalRunId,finalRunSeal:finalRun.finalRunSeal,cohortId,exposureShare,races,metrics:Object.fromEntries(requiredMetrics.map(k=>[k,Number(metrics[k])])),rollbackEvaluations:requiredRollbackTypes.map(t=>({type:t,breached:byType.get(t).breached===true,evidence:byType.get(t)?.evidence??null,note:String(byType.get(t)?.note||"")})),observedAt};
  const monitorSeal=simpleSealHash(JSON.stringify(stableSealValue(payload)));
  if(breaches.length)return{...common,status:"FINAL_ROLLOUT_ROLLBACK_REQUIRED",active:false,decision:"STOP_AND_ROLLBACK",monitorSeal,finalRunSeal:finalRun.finalRunSeal,cohortId,exposureShare,races,minimumRaces:finalRun.minimumRaces,metrics:payload.metrics,rollbackEvaluations:payload.rollbackEvaluations,breaches,observedAt,safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,productionActivationAllowed:false,continuationAllowed:false,rollbackRequired:true,immediateStop:true,postRolloutReviewRequired:true,monitorMutationForbidden:true}};
  if(races<Number(finalRun?.minimumRaces||0))return{...common,status:"FINAL_ROLLOUT_MONITORING_CONTINUES",active:true,decision:"CONTINUE_FINAL_ROLLOUT_MONITORING_ONLY",monitorSeal,finalRunSeal:finalRun.finalRunSeal,cohortId,exposureShare,races,minimumRaces:finalRun.minimumRaces,metrics:payload.metrics,rollbackEvaluations:payload.rollbackEvaluations,breaches:[],observedAt,safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,productionActivationAllowed:false,continuationAllowed:true,rollbackRequired:false,postRolloutReviewRequired:true,monitorMutationForbidden:true}};
  return{...common,status:"FINAL_ROLLOUT_MINIMUM_SAMPLE_REACHED_NO_BREACH",active:false,decision:"RETAIN_FOR_POST_FINAL_ROLLOUT_REVIEW_ONLY",monitorSeal,finalRunSeal:finalRun.finalRunSeal,cohortId,exposureShare,races,minimumRaces:finalRun.minimumRaces,metrics:payload.metrics,rollbackEvaluations:payload.rollbackEvaluations,breaches:[],observedAt,safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,productionActivationAllowed:false,automaticProductionPromotionAllowed:false,postRolloutReviewRequired:true,manualPostRolloutReviewRequired:true,rollbackRequired:false,monitorMutationForbidden:true}};
}

export function verifyThickFinalRolloutMonitoring(finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg){
  const allowed=new Set(["FINAL_ROLLOUT_MONITORING_CONTINUES","FINAL_ROLLOUT_ROLLBACK_REQUIRED","FINAL_ROLLOUT_MINIMUM_SAMPLE_REACHED_NO_BREACH"]);
  if(!allowed.has(finalMonitor?.status))return{status:"FINAL_ROLLOUT_MONITOR_REQUIRED",valid:false};
  const runVerification=verifyThickFinalRolloutRun(finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!runVerification.valid)return{status:runVerification.status||"ACTIVE_FINAL_ROLLOUT_RUN_REQUIRED",valid:false};
  if(finalMonitor?.finalRunId!==finalRun?.finalRunId||finalMonitor?.finalRunSeal!==finalRun?.finalRunSeal)return{status:"FINAL_ROLLOUT_MONITOR_CHAIN_MISMATCH",valid:false};
  const requiredMetrics=[...(finalRun?.monitoringMetrics||[])].map(String).sort();
  const requiredRollbackTypes=[...(finalRun?.rollbackTypes||[])].map(String).sort();
  const metrics=finalMonitor?.metrics&&typeof finalMonitor.metrics==="object"?finalMonitor.metrics:{};
  const evaluations=Array.isArray(finalMonitor?.rollbackEvaluations)?finalMonitor.rollbackEvaluations:[];
  const byType=new Map(evaluations.map(x=>[String(x?.type||""),x]));
  if(requiredMetrics.some(k=>!Object.prototype.hasOwnProperty.call(metrics,k))||requiredRollbackTypes.some(t=>!byType.has(t)))return{status:"FINAL_ROLLOUT_MONITOR_EVIDENCE_INCOMPLETE",valid:false};
  const payload={finalRunId:finalRun.finalRunId,finalRunSeal:finalRun.finalRunSeal,cohortId:finalMonitor.cohortId||"",exposureShare:Number(finalMonitor.exposureShare),races:Number(finalMonitor.races),metrics:Object.fromEntries(requiredMetrics.map(k=>[k,Number(metrics[k])])),rollbackEvaluations:requiredRollbackTypes.map(t=>({type:t,breached:byType.get(t)?.breached===true,evidence:byType.get(t)?.evidence??null,note:String(byType.get(t)?.note||"")})),observedAt:finalMonitor.observedAt||""};
  const actual=simpleSealHash(JSON.stringify(stableSealValue(payload)));
  return{status:actual===finalMonitor.monitorSeal?"FINAL_ROLLOUT_MONITOR_VERIFIED":"SEAL_MISMATCH",valid:actual===finalMonitor.monitorSeal,expectedSeal:finalMonitor.monitorSeal,actualSeal:actual};
}

export function buildThickPostFinalRolloutReviewPackage(finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg,review={}){
  const common={version:"THICK-POST-FINAL-ROLLOUT-REVIEW-1.0",researchOnly:true,productionWriteAllowed:false,autoPromotionAllowed:false,productionActivationAllowed:false,finalRunId:finalRun?.finalRunId||null,planId:finalPlan?.planId||null,proposalId:run?.proposalId||null};
  const verified=verifyThickFinalRolloutMonitoring(finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!verified.valid)return{...common,status:"POST_FINAL_ROLLOUT_SOURCE_INVALID",decision:"BLOCK",sourceVerification:verified};
  if(finalMonitor?.status!=="FINAL_ROLLOUT_MINIMUM_SAMPLE_REACHED_NO_BREACH"||finalMonitor?.decision!=="RETAIN_FOR_POST_FINAL_ROLLOUT_REVIEW_ONLY")return{...common,status:"POST_FINAL_ROLLOUT_COMPLETED_MONITOR_REQUIRED",decision:"BLOCK"};
  const requiredMetrics=[...(finalRun?.monitoringMetrics||[])].map(String).sort();
  const summaryMetrics=review?.summaryMetrics&&typeof review.summaryMetrics==="object"?review.summaryMetrics:{};
  const baselineMetrics=review?.baselineMetrics&&typeof review.baselineMetrics==="object"?review.baselineMetrics:{};
  const missingSummary=requiredMetrics.filter(k=>!Number.isFinite(Number(summaryMetrics[k])));
  const missingBaseline=requiredMetrics.filter(k=>!Number.isFinite(Number(baselineMetrics[k])));
  if(missingSummary.length||missingBaseline.length)return{...common,status:"POST_FINAL_ROLLOUT_REVIEW_INCOMPLETE",decision:"HOLD",missingSummaryMetrics:missingSummary,missingBaselineMetrics:missingBaseline};
  const counterEvidence=Array.isArray(review?.counterEvidence)?review.counterEvidence.filter(Boolean):[];
  if(!counterEvidence.length)return{...common,status:"POST_FINAL_ROLLOUT_COUNTER_EVIDENCE_REQUIRED",decision:"HOLD"};
  if(!Array.isArray(review?.unresolvedIssues))return{...common,status:"POST_FINAL_ROLLOUT_UNRESOLVED_ISSUES_REQUIRED",decision:"HOLD"};
  const unresolvedIssues=review.unresolvedIssues.filter(Boolean);
  const rollbackNonTriggerEvidence=Array.isArray(review?.rollbackNonTriggerEvidence)?review.rollbackNonTriggerEvidence.filter(Boolean):[];
  const requiredRollbackTypes=[...(finalRun?.rollbackTypes||[])].map(String).sort();
  const coveredRollbackTypes=new Set(rollbackNonTriggerEvidence.map(x=>String(x?.type||"")));
  const missingRollbackEvidence=requiredRollbackTypes.filter(t=>!coveredRollbackTypes.has(t));
  if(missingRollbackEvidence.length)return{...common,status:"POST_FINAL_ROLLOUT_ROLLBACK_EVIDENCE_INCOMPLETE",decision:"HOLD",missingRollbackEvidence};
  const deltas={};
  for(const k of requiredMetrics)deltas[k]=Number(summaryMetrics[k])-Number(baselineMetrics[k]);
  const reviewerId=String(review?.reviewerId||"").trim();
  if(!reviewerId)return{...common,status:"POST_FINAL_ROLLOUT_REVIEWER_REQUIRED",decision:"HOLD"};
  const reviewedAt=String(review?.reviewedAt||"").trim();
  const payload={finalRunId:finalRun.finalRunId,finalRunSeal:finalRun.finalRunSeal,monitorSeal:finalMonitor.monitorSeal,activationId:finalActivation.activationId,activationSeal:finalActivation.activationSeal,planId:finalPlan.planId,planSeal:finalPlan.planSeal,sourceDecisionId:postStagedDecision.decisionId,sourceDecisionSeal:postStagedDecision.decisionSeal,targetCohortId:finalRun.targetCohortId,exposureShare:finalRun.targetExposureShare,races:finalMonitor.races,minimumRaces:finalRun.minimumRaces,requiredMetrics,summaryMetrics:Object.fromEntries(requiredMetrics.map(k=>[k,Number(summaryMetrics[k])])),baselineMetrics:Object.fromEntries(requiredMetrics.map(k=>[k,Number(baselineMetrics[k])])),deltas,counterEvidence,unresolvedIssues,rollbackNonTriggerEvidence,requiredRollbackTypes,reviewerId,reviewedAt};
  const reviewSeal=simpleSealHash(JSON.stringify(stableSealValue(payload)));
  const postFinalReviewId=`THICK-POST-FINAL-ROLLOUT-${reviewSeal}`;
  return{...common,status:"POST_FINAL_ROLLOUT_REVIEW_PACKAGE_READY",decision:"MANUAL_POST_FINAL_ROLLOUT_DECISION_ONLY",postFinalReviewId,reviewSeal,reviewerId,reviewedAt,finalRunSeal:finalRun.finalRunSeal,monitorSeal:finalMonitor.monitorSeal,targetCohortId:finalRun.targetCohortId,exposureShare:finalRun.targetExposureShare,races:finalMonitor.races,minimumRaces:finalRun.minimumRaces,requiredMetrics,summaryMetrics:payload.summaryMetrics,baselineMetrics:payload.baselineMetrics,deltas,counterEvidence,unresolvedIssues,rollbackNonTriggerEvidence,requiredRollbackTypes,safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,productionActivationAllowed:false,manualDecisionRequired:true,counterEvidenceRequired:true,unresolvedIssuesRequired:true,rollbackEvidenceRequired:true,postFinalRolloutMutationForbidden:true}};
}

export function verifyThickPostFinalRolloutReviewPackage(postFinalReview,finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg){
  if(postFinalReview?.status!=="POST_FINAL_ROLLOUT_REVIEW_PACKAGE_READY")return{status:"POST_FINAL_ROLLOUT_REVIEW_PACKAGE_REQUIRED",valid:false};
  const source=verifyThickFinalRolloutMonitoring(finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!source.valid)return{status:"POST_FINAL_ROLLOUT_SOURCE_INVALID",valid:false,sourceVerification:source};
  if(postFinalReview?.finalRunId!==finalRun?.finalRunId||postFinalReview?.finalRunSeal!==finalRun?.finalRunSeal||postFinalReview?.monitorSeal!==finalMonitor?.monitorSeal)return{status:"POST_FINAL_ROLLOUT_CHAIN_MISMATCH",valid:false};
  const requiredMetrics=[...(postFinalReview.requiredMetrics||[])].map(String).sort();
  const requiredRollbackTypes=[...(postFinalReview.requiredRollbackTypes||[])].map(String).sort();
  const payload={finalRunId:finalRun.finalRunId,finalRunSeal:finalRun.finalRunSeal,monitorSeal:finalMonitor.monitorSeal,activationId:finalActivation.activationId,activationSeal:finalActivation.activationSeal,planId:finalPlan.planId,planSeal:finalPlan.planSeal,sourceDecisionId:postStagedDecision.decisionId,sourceDecisionSeal:postStagedDecision.decisionSeal,targetCohortId:finalRun.targetCohortId,exposureShare:finalRun.targetExposureShare,races:postFinalReview.races,minimumRaces:finalRun.minimumRaces,requiredMetrics,summaryMetrics:postFinalReview.summaryMetrics||{},baselineMetrics:postFinalReview.baselineMetrics||{},deltas:postFinalReview.deltas||{},counterEvidence:postFinalReview.counterEvidence||[],unresolvedIssues:postFinalReview.unresolvedIssues||[],rollbackNonTriggerEvidence:postFinalReview.rollbackNonTriggerEvidence||[],requiredRollbackTypes,reviewerId:postFinalReview.reviewerId||"",reviewedAt:postFinalReview.reviewedAt||""};
  const actual=simpleSealHash(JSON.stringify(stableSealValue(payload)));
  return{status:actual===postFinalReview.reviewSeal?"POST_FINAL_ROLLOUT_REVIEW_VERIFIED":"SEAL_MISMATCH",valid:actual===postFinalReview.reviewSeal,expectedSeal:postFinalReview.reviewSeal,actualSeal:actual};
}


export function finalizeThickPostFinalRolloutDecision(postFinalReview,finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg,decisionReview={}){
  const common={version:"THICK-POST-FINAL-ROLLOUT-DECISION-1.0",researchOnly:true,productionWriteAllowed:false,autoPromotionAllowed:false,productionActivationAllowed:false,postFinalReviewId:postFinalReview?.postFinalReviewId||null,finalRunId:finalRun?.finalRunId||null,proposalId:run?.proposalId||null};
  const source=verifyThickPostFinalRolloutReviewPackage(postFinalReview,finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!source.valid)return{...common,status:source.status||"POST_FINAL_ROLLOUT_REVIEW_REQUIRED",eligible:false,decision:"BLOCK",sourceVerification:source};
  if(postFinalReview?.decision!=="MANUAL_POST_FINAL_ROLLOUT_DECISION_ONLY")return{...common,status:"MANUAL_POST_FINAL_ROLLOUT_DECISION_REQUIRED",eligible:false,decision:"BLOCK"};
  const reviewerId=String(decisionReview?.reviewerId||"").trim();
  if(!reviewerId)return{...common,status:"POST_FINAL_ROLLOUT_DECISION_REVIEWER_REQUIRED",eligible:false,decision:"HOLD"};
  const forbiddenReviewerIds=new Set([
    postFinalReview?.reviewerId,
    finalActivation?.reviewerId,
    postStagedDecision?.reviewerId,
    postCanaryDecision?.reviewerId,
    finalDecision?.reviewerId,
    reviewPackage?.reviewerId,
    activationDecision?.reviewerId
  ].map(x=>String(x||"").trim()).filter(Boolean));
  if(forbiddenReviewerIds.has(reviewerId))return{...common,status:"INDEPENDENT_POST_FINAL_ROLLOUT_DECISION_REVIEWER_REQUIRED",eligible:false,decision:"HOLD",reviewerId,forbiddenReviewerIds:[...forbiddenReviewerIds].sort()};
  const verdict=String(decisionReview?.verdict||"").trim();
  const allowedVerdicts=new Set(["APPROVE_PRODUCTION_ACTIVATION_CANDIDATE","HOLD","REJECT"]);
  if(!allowedVerdicts.has(verdict))return{...common,status:"POST_FINAL_ROLLOUT_VERDICT_REQUIRED",eligible:false,decision:"HOLD",reviewerId};
  const acknowledgedCounterEvidence=decisionReview?.acknowledgedCounterEvidence===true;
  const acknowledgedUnresolvedIssues=decisionReview?.acknowledgedUnresolvedIssues===true;
  const acknowledgedRollbackTypes=new Set((decisionReview?.acknowledgedRollbackTypes||[]).map(String));
  const requiredRollbackTypes=[...(postFinalReview?.requiredRollbackTypes||[])].map(String).sort();
  const missingRollbackAcknowledgements=requiredRollbackTypes.filter(x=>!acknowledgedRollbackTypes.has(x));
  if(verdict==="APPROVE_PRODUCTION_ACTIVATION_CANDIDATE"&&!acknowledgedCounterEvidence)return{...common,status:"POST_FINAL_ROLLOUT_COUNTER_EVIDENCE_ACK_REQUIRED",eligible:false,decision:"HOLD",reviewerId,verdict};
  if(verdict==="APPROVE_PRODUCTION_ACTIVATION_CANDIDATE"&&!acknowledgedUnresolvedIssues)return{...common,status:"POST_FINAL_ROLLOUT_UNRESOLVED_ISSUES_ACK_REQUIRED",eligible:false,decision:"HOLD",reviewerId,verdict};
  if(verdict==="APPROVE_PRODUCTION_ACTIVATION_CANDIDATE"&&missingRollbackAcknowledgements.length)return{...common,status:"POST_FINAL_ROLLOUT_ROLLBACK_ACK_INCOMPLETE",eligible:false,decision:"HOLD",reviewerId,verdict,missingRollbackAcknowledgements};
  const note=String(decisionReview?.note||"").trim();
  const decidedAt=String(decisionReview?.decidedAt||"").trim();
  const payload={postFinalReviewId:postFinalReview.postFinalReviewId,reviewSeal:postFinalReview.reviewSeal,finalRunId:finalRun.finalRunId,finalRunSeal:finalRun.finalRunSeal,monitorSeal:finalMonitor.monitorSeal,activationId:finalActivation.activationId,activationSeal:finalActivation.activationSeal,planId:finalPlan.planId,planSeal:finalPlan.planSeal,sourceDecisionId:postStagedDecision.decisionId,sourceDecisionSeal:postStagedDecision.decisionSeal,reviewerId,verdict,note,decidedAt,acknowledgedCounterEvidence,acknowledgedUnresolvedIssues,acknowledgedRollbackTypes:[...acknowledgedRollbackTypes].sort(),requiredRollbackTypes,targetCohortId:postFinalReview.targetCohortId||null,exposureShare:postFinalReview.exposureShare,summaryMetrics:postFinalReview.summaryMetrics||{},baselineMetrics:postFinalReview.baselineMetrics||{},deltas:postFinalReview.deltas||{},counterEvidence:postFinalReview.counterEvidence||[],unresolvedIssues:postFinalReview.unresolvedIssues||[],rollbackNonTriggerEvidence:postFinalReview.rollbackNonTriggerEvidence||[]};
  const decisionSeal=simpleSealHash(JSON.stringify(stableSealValue(payload)));
  const decisionId=`THICK-POST-FINAL-ROLLOUT-DECISION-${decisionSeal}`;
  if(verdict==="REJECT")return{...common,status:"POST_FINAL_ROLLOUT_REJECTED",eligible:false,decision:"REJECT_PRODUCTION_ACTIVATION",decisionId,decisionSeal,reviewerId,verdict,note,decidedAt,reviewSeal:postFinalReview.reviewSeal,safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,productionActivationAllowed:false,productionActivationPlanningAllowed:false,decisionMutationForbidden:true}};
  if(verdict==="HOLD")return{...common,status:"POST_FINAL_ROLLOUT_HELD",eligible:false,decision:"HOLD",decisionId,decisionSeal,reviewerId,verdict,note,decidedAt,reviewSeal:postFinalReview.reviewSeal,safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,productionActivationAllowed:false,productionActivationPlanningAllowed:false,decisionMutationForbidden:true}};
  return{...common,status:"POST_FINAL_ROLLOUT_DECISION_APPROVED",eligible:true,decision:"PRODUCTION_ACTIVATION_CANDIDATE_ONLY",decisionId,decisionSeal,reviewerId,verdict,note,decidedAt,reviewSeal:postFinalReview.reviewSeal,acknowledgedCounterEvidence,acknowledgedUnresolvedIssues,acknowledgedRollbackTypes:[...acknowledgedRollbackTypes].sort(),requiredRollbackTypes,targetCohortId:postFinalReview.targetCohortId||null,exposureShare:postFinalReview.exposureShare,summaryMetrics:postFinalReview.summaryMetrics||{},baselineMetrics:postFinalReview.baselineMetrics||{},deltas:postFinalReview.deltas||{},counterEvidence:postFinalReview.counterEvidence||[],unresolvedIssues:postFinalReview.unresolvedIssues||[],rollbackNonTriggerEvidence:postFinalReview.rollbackNonTriggerEvidence||[],safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,productionActivationAllowed:false,productionActivationPlanningAllowed:true,manualProductionActivationPlanRequired:true,rollbackConditionsLocked:true,decisionMutationForbidden:true}};
}

export function verifyThickPostFinalRolloutDecision(postFinalDecision,postFinalReview,finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg){
  if(!postFinalDecision?.decisionSeal||!postFinalDecision?.decisionId)return{status:"POST_FINAL_ROLLOUT_DECISION_REQUIRED",valid:false};
  const source=verifyThickPostFinalRolloutReviewPackage(postFinalReview,finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!source.valid)return{status:"POST_FINAL_ROLLOUT_REVIEW_INVALID",valid:false,sourceVerification:source};
  if(postFinalDecision?.postFinalReviewId!==postFinalReview?.postFinalReviewId||postFinalDecision?.reviewSeal!==postFinalReview?.reviewSeal||postFinalDecision?.finalRunId!==finalRun?.finalRunId)return{status:"POST_FINAL_ROLLOUT_DECISION_CHAIN_MISMATCH",valid:false};
  const payload={postFinalReviewId:postFinalReview.postFinalReviewId,reviewSeal:postFinalReview.reviewSeal,finalRunId:finalRun.finalRunId,finalRunSeal:finalRun.finalRunSeal,monitorSeal:finalMonitor.monitorSeal,activationId:finalActivation.activationId,activationSeal:finalActivation.activationSeal,planId:finalPlan.planId,planSeal:finalPlan.planSeal,sourceDecisionId:postStagedDecision.decisionId,sourceDecisionSeal:postStagedDecision.decisionSeal,reviewerId:postFinalDecision.reviewerId||"",verdict:postFinalDecision.verdict||"",note:postFinalDecision.note||"",decidedAt:postFinalDecision.decidedAt||"",acknowledgedCounterEvidence:postFinalDecision.acknowledgedCounterEvidence===true,acknowledgedUnresolvedIssues:postFinalDecision.acknowledgedUnresolvedIssues===true,acknowledgedRollbackTypes:[...(postFinalDecision.acknowledgedRollbackTypes||[])].map(String).sort(),requiredRollbackTypes:[...(postFinalDecision.requiredRollbackTypes||[])].map(String).sort(),targetCohortId:postFinalReview.targetCohortId||null,exposureShare:postFinalReview.exposureShare,summaryMetrics:postFinalReview.summaryMetrics||{},baselineMetrics:postFinalReview.baselineMetrics||{},deltas:postFinalReview.deltas||{},counterEvidence:postFinalReview.counterEvidence||[],unresolvedIssues:postFinalReview.unresolvedIssues||[],rollbackNonTriggerEvidence:postFinalReview.rollbackNonTriggerEvidence||[]};
  const actual=simpleSealHash(JSON.stringify(stableSealValue(payload)));
  return{status:actual===postFinalDecision.decisionSeal?"POST_FINAL_ROLLOUT_DECISION_VERIFIED":"SEAL_MISMATCH",valid:actual===postFinalDecision.decisionSeal,expectedSeal:postFinalDecision.decisionSeal,actualSeal:actual};
}


export function createThickProductionActivationPlan(postFinalDecision,postFinalReview,finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg,options={}){
  const common={version:"THICK-PRODUCTION-ACTIVATION-PLAN-1.0",researchOnly:true,productionWriteAllowed:false,autoPromotionAllowed:false,productionActivationAllowed:false,sourceDecisionId:postFinalDecision?.decisionId||null,postFinalReviewId:postFinalReview?.postFinalReviewId||null,finalRunId:finalRun?.finalRunId||null,proposalId:run?.proposalId||null};
  const source=verifyThickPostFinalRolloutDecision(postFinalDecision,postFinalReview,finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!source.valid)return{...common,status:source.status||"PRODUCTION_ACTIVATION_CANDIDATE_REQUIRED",eligible:false,decision:"BLOCK",sourceVerification:source};
  if(postFinalDecision?.decision!=="PRODUCTION_ACTIVATION_CANDIDATE_ONLY"||postFinalDecision?.safeguards?.productionActivationPlanningAllowed!==true)return{...common,status:"PRODUCTION_ACTIVATION_CANDIDATE_REQUIRED",eligible:false,decision:"BLOCK"};
  const targetCohortId=String(options?.targetCohortId||postFinalDecision?.targetCohortId||"").trim();
  if(!targetCohortId||targetCohortId!==String(postFinalDecision?.targetCohortId||""))return{...common,status:"PRODUCTION_ACTIVATION_PLAN_COHORT_MISMATCH",eligible:false,decision:"HOLD",expectedCohortId:postFinalDecision?.targetCohortId||null,targetCohortId:targetCohortId||null};
  const targetExposureShare=Number(options?.targetExposureShare??postFinalDecision?.exposureShare??1);
  if(!Number.isFinite(targetExposureShare)||targetExposureShare!==1)return{...common,status:"PRODUCTION_ACTIVATION_EXPOSURE_MUST_BE_100_PERCENT",eligible:false,decision:"HOLD",targetExposureShare:Number.isFinite(targetExposureShare)?targetExposureShare:null};
  const minimumRaces=Number(options?.minimumRaces??100);
  if(!Number.isInteger(minimumRaces)||minimumRaces<100)return{...common,status:"PRODUCTION_ACTIVATION_MINIMUM_RACES_TOO_LOW",eligible:false,decision:"HOLD",minimumRaces:Number.isFinite(minimumRaces)?minimumRaces:null,requiredMinimumRaces:100};
  const requiredMetrics=["betCount","mainHitRate","returnRate","supportHitRate","thickHitRate"].sort();
  const monitoringMetrics=[...(options?.monitoringMetrics||requiredMetrics)].map(String).sort();
  if(stableStringify(monitoringMetrics)!==stableStringify(requiredMetrics))return{...common,status:"PRODUCTION_ACTIVATION_MONITORING_METRICS_INCOMPLETE",eligible:false,decision:"HOLD",requiredMetrics,monitoringMetrics};
  const requiredRollbackTypes=[...(postFinalDecision?.requiredRollbackTypes||[])].map(String).sort();
  const rollbackTypes=[...(options?.rollbackTypes||requiredRollbackTypes)].map(String).sort();
  if(!requiredRollbackTypes.length||stableStringify(rollbackTypes)!==stableStringify(requiredRollbackTypes))return{...common,status:"PRODUCTION_ACTIVATION_ROLLBACK_TYPES_INCOMPLETE",eligible:false,decision:"HOLD",requiredRollbackTypes,rollbackTypes};
  const immediateStop=options?.immediateStop!==false;
  if(!immediateStop)return{...common,status:"PRODUCTION_ACTIVATION_IMMEDIATE_STOP_REQUIRED",eligible:false,decision:"HOLD"};
  const postActivationReviewRequired=options?.postActivationReviewRequired!==false;
  if(!postActivationReviewRequired)return{...common,status:"PRODUCTION_ACTIVATION_POST_REVIEW_REQUIRED",eligible:false,decision:"HOLD"};
  const createdBy=String(options?.createdBy||"").trim();
  const createdAt=String(options?.createdAt||"").trim();
  const payload={sourceDecisionId:postFinalDecision.decisionId,sourceDecisionSeal:postFinalDecision.decisionSeal,postFinalReviewId:postFinalReview.postFinalReviewId,reviewSeal:postFinalReview.reviewSeal,finalRunId:finalRun.finalRunId,finalRunSeal:finalRun.finalRunSeal,finalMonitorSeal:finalMonitor.monitorSeal,finalActivationSeal:finalActivation.activationSeal,finalPlanSeal:finalPlan.planSeal,targetCohortId,targetExposureShare,minimumRaces,monitoringMetrics,rollbackTypes,immediateStop,postActivationReviewRequired,createdBy,createdAt};
  const planSeal=simpleSealHash(JSON.stringify(stableSealValue(payload)));
  const planId=`THICK-PRODUCTION-ACTIVATION-PLAN-${planSeal}`;
  return{...common,status:"PRODUCTION_ACTIVATION_PLAN_READY",eligible:true,decision:"MANUAL_PRODUCTION_ACTIVATION_REVIEW_ONLY",planId,planSeal,targetCohortId,targetExposureShare,minimumRaces,monitoringMetrics,rollbackTypes,immediateStop,postActivationReviewRequired,createdBy,createdAt,safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,productionActivationAllowed:false,manualProductionActivationReviewRequired:true,activationExecutionAllowed:false,cohortLocked:true,exposureLocked:true,monitoringMetricsLocked:true,rollbackConditionsLocked:true,immediateStopLocked:true,postActivationReviewRequired:true,planMutationForbidden:true}};
}

export function verifyThickProductionActivationPlan(plan,postFinalDecision,postFinalReview,finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg){
  if(plan?.status!=="PRODUCTION_ACTIVATION_PLAN_READY")return{status:"PRODUCTION_ACTIVATION_PLAN_REQUIRED",valid:false};
  const source=verifyThickPostFinalRolloutDecision(postFinalDecision,postFinalReview,finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!source.valid)return{status:source.status||"PRODUCTION_ACTIVATION_CANDIDATE_REQUIRED",valid:false};
  if(plan?.sourceDecisionId!==postFinalDecision?.decisionId||plan?.postFinalReviewId!==postFinalReview?.postFinalReviewId||plan?.finalRunId!==finalRun?.finalRunId)return{status:"PRODUCTION_ACTIVATION_PLAN_CHAIN_MISMATCH",valid:false};
  const payload={sourceDecisionId:postFinalDecision.decisionId,sourceDecisionSeal:postFinalDecision.decisionSeal,postFinalReviewId:postFinalReview.postFinalReviewId,reviewSeal:postFinalReview.reviewSeal,finalRunId:finalRun.finalRunId,finalRunSeal:finalRun.finalRunSeal,finalMonitorSeal:finalMonitor.monitorSeal,finalActivationSeal:finalActivation.activationSeal,finalPlanSeal:finalPlan.planSeal,targetCohortId:plan.targetCohortId,targetExposureShare:plan.targetExposureShare,minimumRaces:plan.minimumRaces,monitoringMetrics:[...(plan.monitoringMetrics||[])].map(String).sort(),rollbackTypes:[...(plan.rollbackTypes||[])].map(String).sort(),immediateStop:plan.immediateStop===true,postActivationReviewRequired:plan.postActivationReviewRequired===true,createdBy:plan.createdBy||"",createdAt:plan.createdAt||""};
  const actual=simpleSealHash(JSON.stringify(stableSealValue(payload)));
  return{status:actual===plan.planSeal?"PRODUCTION_ACTIVATION_PLAN_VERIFIED":"SEAL_MISMATCH",valid:actual===plan.planSeal,expectedSeal:plan.planSeal,actualSeal:actual};
}

export function finalizeThickProductionActivationReview(plan,postFinalDecision,postFinalReview,finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg,review={}){
  const common={version:"THICK-PRODUCTION-ACTIVATION-REVIEW-1.0",researchOnly:true,productionWriteAllowed:false,autoPromotionAllowed:false,planId:plan?.planId||null,sourceDecisionId:postFinalDecision?.decisionId||null,sourceDecisionSeal:postFinalDecision?.decisionSeal||null};
  const source=verifyThickProductionActivationPlan(plan,postFinalDecision,postFinalReview,finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!source.valid)return{...common,status:source.status||"PRODUCTION_ACTIVATION_PLAN_REQUIRED",eligible:false,decision:"BLOCK",sourceVerification:source};
  if(plan?.decision!=="MANUAL_PRODUCTION_ACTIVATION_REVIEW_ONLY")return{...common,status:"PRODUCTION_ACTIVATION_REVIEW_REQUIRED",eligible:false,decision:"BLOCK"};
  if(Number(plan?.targetExposureShare)!==1)return{...common,status:"PRODUCTION_ACTIVATION_EXPOSURE_MUST_BE_100_PERCENT",eligible:false,decision:"HOLD"};
  if(plan?.immediateStop!==true)return{...common,status:"PRODUCTION_ACTIVATION_IMMEDIATE_STOP_REQUIRED",eligible:false,decision:"HOLD"};
  if(plan?.postActivationReviewRequired!==true)return{...common,status:"PRODUCTION_ACTIVATION_POST_REVIEW_REQUIRED",eligible:false,decision:"HOLD"};
  const reviewerId=String(review?.reviewerId||"").trim();
  if(!reviewerId)return{...common,status:"PRODUCTION_ACTIVATION_REVIEWER_REQUIRED",eligible:false,decision:"HOLD"};
  const priorReviewerIds=new Set([
    plan?.createdBy,
    postFinalDecision?.reviewerId,
    postFinalReview?.reviewerId,
    finalActivation?.reviewerId,
    finalPlan?.createdBy,
    postStagedDecision?.reviewerId,
    postReview?.reviewerId,
    stagedActivation?.reviewerId,
    stagedPlan?.createdBy,
    postCanaryDecision?.reviewerId,
    reviewPackage?.reviewerId,
    activationDecision?.reviewerId,
    finalDecision?.reviewerId,
    pkg?.sourceChain?.primaryReviewerId,
    pkg?.sourceChain?.finalReviewerId
  ].filter(Boolean).map(String));
  if(priorReviewerIds.has(reviewerId))return{...common,status:"INDEPENDENT_PRODUCTION_ACTIVATION_REVIEWER_REQUIRED",eligible:false,decision:"HOLD",reviewerId,priorReviewerIds:[...priorReviewerIds]};
  const verdict=String(review?.verdict||"").trim().toUpperCase();
  const allowed=new Set(["APPROVE_PRODUCTION_ACTIVATION","HOLD","REJECT"]);
  if(!allowed.has(verdict))return{...common,status:"PRODUCTION_ACTIVATION_VERDICT_REQUIRED",eligible:false,decision:"HOLD",reviewerId};
  const acknowledgedPlanSeal=review?.acknowledgedPlanSeal===true;
  const acknowledgedFullExposure=review?.acknowledgedFullExposure===true;
  const acknowledgedImmediateStop=review?.acknowledgedImmediateStop===true;
  const acknowledgedPostActivationReview=review?.acknowledgedPostActivationReview===true;
  const metricAck=new Set((Array.isArray(review?.acknowledgedMonitoringMetrics)?review.acknowledgedMonitoringMetrics:[]).map(String));
  const rollbackAck=new Set((Array.isArray(review?.acknowledgedRollbackTypes)?review.acknowledgedRollbackTypes:[]).map(String));
  const requiredMetrics=[...(plan?.monitoringMetrics||[])].map(String).sort();
  const requiredRollbackTypes=[...(plan?.rollbackTypes||[])].map(String).sort();
  const missingMetrics=requiredMetrics.filter(x=>!metricAck.has(x));
  const missingRollbackTypes=requiredRollbackTypes.filter(x=>!rollbackAck.has(x));
  if(verdict==="APPROVE_PRODUCTION_ACTIVATION"&&!acknowledgedPlanSeal)return{...common,status:"PRODUCTION_ACTIVATION_PLAN_SEAL_ACK_REQUIRED",eligible:false,decision:"HOLD",reviewerId,verdict};
  if(verdict==="APPROVE_PRODUCTION_ACTIVATION"&&!acknowledgedFullExposure)return{...common,status:"PRODUCTION_ACTIVATION_FULL_EXPOSURE_ACK_REQUIRED",eligible:false,decision:"HOLD",reviewerId,verdict};
  if(verdict==="APPROVE_PRODUCTION_ACTIVATION"&&!acknowledgedImmediateStop)return{...common,status:"PRODUCTION_ACTIVATION_IMMEDIATE_STOP_ACK_REQUIRED",eligible:false,decision:"HOLD",reviewerId,verdict};
  if(verdict==="APPROVE_PRODUCTION_ACTIVATION"&&!acknowledgedPostActivationReview)return{...common,status:"PRODUCTION_ACTIVATION_POST_REVIEW_ACK_REQUIRED",eligible:false,decision:"HOLD",reviewerId,verdict};
  if(verdict==="APPROVE_PRODUCTION_ACTIVATION"&&missingMetrics.length)return{...common,status:"PRODUCTION_ACTIVATION_MONITORING_ACK_INCOMPLETE",eligible:false,decision:"HOLD",reviewerId,verdict,missingMetrics};
  if(verdict==="APPROVE_PRODUCTION_ACTIVATION"&&missingRollbackTypes.length)return{...common,status:"PRODUCTION_ACTIVATION_ROLLBACK_ACK_INCOMPLETE",eligible:false,decision:"HOLD",reviewerId,verdict,missingRollbackTypes};
  const note=String(review?.note||"").trim();
  const reviewedAt=String(review?.reviewedAt||"").trim();
  const payload={planId:plan.planId,planSeal:plan.planSeal,sourceDecisionId:postFinalDecision.decisionId,sourceDecisionSeal:postFinalDecision.decisionSeal,reviewerId,verdict,note,reviewedAt,acknowledgedPlanSeal,acknowledgedFullExposure,acknowledgedImmediateStop,acknowledgedPostActivationReview,acknowledgedMonitoringMetrics:[...metricAck].sort(),acknowledgedRollbackTypes:[...rollbackAck].sort(),requiredMetrics,requiredRollbackTypes,targetCohortId:plan.targetCohortId,targetExposureShare:plan.targetExposureShare,minimumRaces:plan.minimumRaces};
  const activationSeal=simpleSealHash(JSON.stringify(stableSealValue(payload)));
  const activationId=`THICK-PRODUCTION-ACTIVATION-${activationSeal}`;
  if(verdict==="REJECT")return{...common,status:"PRODUCTION_ACTIVATION_REJECTED",eligible:false,decision:"REJECT_PRODUCTION_ACTIVATION",activationId,activationSeal,reviewerId,verdict,note,reviewedAt,planSeal:plan.planSeal,safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,productionActivationStartAllowed:false,activationMutationForbidden:true}};
  if(verdict==="HOLD")return{...common,status:"PRODUCTION_ACTIVATION_HELD",eligible:false,decision:"HOLD",activationId,activationSeal,reviewerId,verdict,note,reviewedAt,planSeal:plan.planSeal,safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,productionActivationStartAllowed:false,activationMutationForbidden:true}};
  return{...common,status:"PRODUCTION_ACTIVATION_REVIEW_APPROVED",eligible:true,decision:"AUTHORIZED_PRODUCTION_ACTIVATION_START_ONLY",activationId,activationSeal,reviewerId,verdict,note,reviewedAt,planSeal:plan.planSeal,acknowledgedPlanSeal,acknowledgedFullExposure,acknowledgedImmediateStop,acknowledgedPostActivationReview,acknowledgedMonitoringMetrics:[...metricAck].sort(),acknowledgedRollbackTypes:[...rollbackAck].sort(),requiredMetrics,requiredRollbackTypes,targetCohortId:plan.targetCohortId,targetExposureShare:plan.targetExposureShare,minimumRaces:plan.minimumRaces,safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,productionActivationStartAllowed:true,startIsSeparateOperation:true,activationExecutionAllowed:false,monitoringMetricsLocked:true,rollbackConditionsLocked:true,cohortLocked:true,fullExposureLocked:true,postActivationReviewRequired:true,activationMutationForbidden:true}};
}

export function verifyThickProductionActivationReview(activation,plan,postFinalDecision,postFinalReview,finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg){
  if(activation?.status!=="PRODUCTION_ACTIVATION_REVIEW_APPROVED")return{status:"PRODUCTION_ACTIVATION_APPROVAL_REQUIRED",valid:false};
  const source=verifyThickProductionActivationPlan(plan,postFinalDecision,postFinalReview,finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!source.valid)return{status:source.status||"PRODUCTION_ACTIVATION_PLAN_REQUIRED",valid:false};
  if(activation?.planId!==plan?.planId||activation?.planSeal!==plan?.planSeal||activation?.sourceDecisionId!==postFinalDecision?.decisionId)return{status:"PRODUCTION_ACTIVATION_REVIEW_CHAIN_MISMATCH",valid:false};
  const requiredMetrics=[...(plan?.monitoringMetrics||[])].map(String).sort();
  const requiredRollbackTypes=[...(plan?.rollbackTypes||[])].map(String).sort();
  const payload={planId:plan.planId,planSeal:plan.planSeal,sourceDecisionId:postFinalDecision.decisionId,sourceDecisionSeal:postFinalDecision.decisionSeal,reviewerId:activation.reviewerId||"",verdict:activation.verdict||"",note:activation.note||"",reviewedAt:activation.reviewedAt||"",acknowledgedPlanSeal:activation.acknowledgedPlanSeal===true,acknowledgedFullExposure:activation.acknowledgedFullExposure===true,acknowledgedImmediateStop:activation.acknowledgedImmediateStop===true,acknowledgedPostActivationReview:activation.acknowledgedPostActivationReview===true,acknowledgedMonitoringMetrics:[...(activation.acknowledgedMonitoringMetrics||[])].sort(),acknowledgedRollbackTypes:[...(activation.acknowledgedRollbackTypes||[])].sort(),requiredMetrics,requiredRollbackTypes,targetCohortId:plan.targetCohortId,targetExposureShare:plan.targetExposureShare,minimumRaces:plan.minimumRaces};
  const actual=simpleSealHash(JSON.stringify(stableSealValue(payload)));
  return{status:actual===activation.activationSeal?"PRODUCTION_ACTIVATION_REVIEW_VERIFIED":"SEAL_MISMATCH",valid:actual===activation.activationSeal,expectedSeal:activation.activationSeal,actualSeal:actual};
}


export function startThickProductionActivationRun(activation,plan,postFinalDecision,postFinalReview,finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg,options={}){
  const common={version:"THICK-PRODUCTION-ACTIVATION-RUN-1.0",researchOnly:true,autoPromotionAllowed:false,productionWriteAllowed:false,activationId:activation?.activationId||null,planId:plan?.planId||null,sourceDecisionId:postFinalDecision?.decisionId||null};
  const source=verifyThickProductionActivationReview(activation,plan,postFinalDecision,postFinalReview,finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!source.valid)return{...common,status:source.status||"PRODUCTION_ACTIVATION_APPROVAL_REQUIRED",eligible:false,decision:"BLOCK",sourceVerification:source};
  if(activation?.decision!=="AUTHORIZED_PRODUCTION_ACTIVATION_START_ONLY"||activation?.safeguards?.productionActivationStartAllowed!==true)return{...common,status:"PRODUCTION_ACTIVATION_START_AUTHORIZATION_REQUIRED",eligible:false,decision:"BLOCK"};
  const targetCohortId=String(options?.targetCohortId||plan?.targetCohortId||"").trim();
  if(!targetCohortId||targetCohortId!==String(plan?.targetCohortId||""))return{...common,status:"PRODUCTION_ACTIVATION_RUN_COHORT_MISMATCH",eligible:false,decision:"BLOCK",expectedCohortId:plan?.targetCohortId||null,targetCohortId:targetCohortId||null};
  const exposureShare=Number(options?.exposureShare??plan?.targetExposureShare);
  if(!Number.isFinite(exposureShare)||exposureShare!==1||exposureShare!==Number(plan?.targetExposureShare))return{...common,status:"PRODUCTION_ACTIVATION_RUN_EXPOSURE_MUST_BE_100_PERCENT",eligible:false,decision:"BLOCK",exposureShare:Number.isFinite(exposureShare)?exposureShare:null};
  const monitoringMetrics=[...(options?.monitoringMetrics||plan?.monitoringMetrics||[])].map(String).sort();
  const requiredMetrics=[...(plan?.monitoringMetrics||[])].map(String).sort();
  if(stableStringify(monitoringMetrics)!==stableStringify(requiredMetrics))return{...common,status:"PRODUCTION_ACTIVATION_RUN_MONITORING_MISMATCH",eligible:false,decision:"BLOCK",requiredMetrics,monitoringMetrics};
  const rollbackTypes=[...(options?.rollbackTypes||plan?.rollbackTypes||[])].map(String).sort();
  const requiredRollbackTypes=[...(plan?.rollbackTypes||[])].map(String).sort();
  if(stableStringify(rollbackTypes)!==stableStringify(requiredRollbackTypes))return{...common,status:"PRODUCTION_ACTIVATION_RUN_ROLLBACK_MISMATCH",eligible:false,decision:"BLOCK",requiredRollbackTypes,rollbackTypes};
  const immediateStop=options?.immediateStop!==false;
  if(!immediateStop||plan?.immediateStop!==true)return{...common,status:"PRODUCTION_ACTIVATION_RUN_IMMEDIATE_STOP_REQUIRED",eligible:false,decision:"BLOCK"};
  const postActivationReviewRequired=options?.postActivationReviewRequired!==false;
  if(!postActivationReviewRequired||plan?.postActivationReviewRequired!==true)return{...common,status:"PRODUCTION_ACTIVATION_RUN_POST_REVIEW_REQUIRED",eligible:false,decision:"BLOCK"};
  const minimumRaces=Number(options?.minimumRaces??plan?.minimumRaces);
  if(!Number.isInteger(minimumRaces)||minimumRaces!==Number(plan?.minimumRaces)||minimumRaces<100)return{...common,status:"PRODUCTION_ACTIVATION_RUN_MINIMUM_RACES_MISMATCH",eligible:false,decision:"BLOCK",minimumRaces:Number.isFinite(minimumRaces)?minimumRaces:null,expectedMinimumRaces:plan?.minimumRaces??null};
  const startedBy=String(options?.startedBy||"").trim();
  const startedAt=String(options?.startedAt||"").trim();
  const payload={activationId:activation.activationId,activationSeal:activation.activationSeal,planId:plan.planId,planSeal:plan.planSeal,sourceDecisionId:postFinalDecision.decisionId,sourceDecisionSeal:postFinalDecision.decisionSeal,targetCohortId,exposureShare,minimumRaces,monitoringMetrics,rollbackTypes,immediateStop,postActivationReviewRequired,startedBy,startedAt};
  const activationRunSeal=simpleSealHash(JSON.stringify(stableSealValue(payload)));
  const activationRunId=`THICK-PRODUCTION-ACTIVATION-RUN-${activationRunSeal}`;
  return{...common,status:"PRODUCTION_ACTIVATION_MONITORING_ACTIVE",eligible:true,decision:"MONITOR_PRODUCTION_ACTIVATION",activationRunId,activationRunSeal,activationSeal:activation.activationSeal,planSeal:plan.planSeal,targetCohortId,exposureShare,minimumRaces,monitoringMetrics,rollbackTypes,immediateStop,postActivationReviewRequired,startedBy,startedAt,safeguards:{autoPromotionAllowed:false,productionWriteAllowed:false,productionActivationActive:true,persistentProductionMutationAllowed:false,monitoringRequired:true,immediateRollbackRequired:true,postActivationReviewRequired:true,cohortLocked:true,fullExposureLocked:true,monitoringMetricsLocked:true,rollbackConditionsLocked:true,runMutationForbidden:true}};
}

export function verifyThickProductionActivationRun(activationRun,activation,plan,postFinalDecision,postFinalReview,finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg){
  if(activationRun?.status!=="PRODUCTION_ACTIVATION_MONITORING_ACTIVE")return{status:"PRODUCTION_ACTIVATION_RUN_REQUIRED",valid:false};
  const source=verifyThickProductionActivationReview(activation,plan,postFinalDecision,postFinalReview,finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!source.valid)return{status:source.status||"PRODUCTION_ACTIVATION_APPROVAL_REQUIRED",valid:false};
  if(activationRun?.activationId!==activation?.activationId||activationRun?.activationSeal!==activation?.activationSeal||activationRun?.planId!==plan?.planId||activationRun?.planSeal!==plan?.planSeal)return{status:"PRODUCTION_ACTIVATION_RUN_CHAIN_MISMATCH",valid:false};
  const payload={activationId:activation.activationId,activationSeal:activation.activationSeal,planId:plan.planId,planSeal:plan.planSeal,sourceDecisionId:postFinalDecision.decisionId,sourceDecisionSeal:postFinalDecision.decisionSeal,targetCohortId:activationRun.targetCohortId,exposureShare:activationRun.exposureShare,minimumRaces:activationRun.minimumRaces,monitoringMetrics:[...(activationRun.monitoringMetrics||[])].map(String).sort(),rollbackTypes:[...(activationRun.rollbackTypes||[])].map(String).sort(),immediateStop:activationRun.immediateStop===true,postActivationReviewRequired:activationRun.postActivationReviewRequired===true,startedBy:activationRun.startedBy||"",startedAt:activationRun.startedAt||""};
  const actual=simpleSealHash(JSON.stringify(stableSealValue(payload)));
  return{status:actual===activationRun.activationRunSeal?"PRODUCTION_ACTIVATION_RUN_VERIFIED":"SEAL_MISMATCH",valid:actual===activationRun.activationRunSeal,expectedSeal:activationRun.activationRunSeal,actualSeal:actual};
}

export function evaluateThickProductionActivationMonitoring(activationRun,activation,plan,postFinalDecision,postFinalReview,finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg,observation={}){
  const common={version:"THICK-PRODUCTION-ACTIVATION-MONITOR-1.0",researchOnly:true,autoPromotionAllowed:false,productionWriteAllowed:false,activationRunId:activationRun?.activationRunId||null,activationId:activation?.activationId||null,planId:plan?.planId||null,sourceDecisionId:postFinalDecision?.decisionId||null};
  const source=verifyThickProductionActivationRun(activationRun,activation,plan,postFinalDecision,postFinalReview,finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!source.valid)return{...common,status:source.status||"PRODUCTION_ACTIVATION_RUN_REQUIRED",active:false,decision:"BLOCK",sourceVerification:source};
  const cohortId=String(observation?.cohortId||"").trim();
  if(!cohortId||cohortId!==String(activationRun?.targetCohortId||""))return{...common,status:"PRODUCTION_ACTIVATION_MONITOR_COHORT_MISMATCH",active:false,decision:"BLOCK",expectedCohortId:activationRun?.targetCohortId||null,cohortId:cohortId||null};
  const exposureShare=Number(observation?.exposureShare??activationRun?.exposureShare);
  if(!Number.isFinite(exposureShare)||exposureShare!==1||exposureShare!==Number(activationRun?.exposureShare))return{...common,status:"PRODUCTION_ACTIVATION_MONITOR_EXPOSURE_MISMATCH",active:false,decision:"BLOCK",expectedExposureShare:1,exposureShare:Number.isFinite(exposureShare)?exposureShare:null};
  const races=Number(observation?.races);
  if(!Number.isInteger(races)||races<0)return{...common,status:"PRODUCTION_ACTIVATION_MONITOR_RACE_COUNT_INVALID",active:false,decision:"HOLD"};
  const requiredMetrics=[...(activationRun?.monitoringMetrics||[])].map(String).sort();
  const metrics=observation?.metrics&&typeof observation.metrics==="object"?observation.metrics:{};
  const missingMetrics=requiredMetrics.filter(k=>!Object.prototype.hasOwnProperty.call(metrics,k)||!Number.isFinite(Number(metrics[k])));
  if(missingMetrics.length)return{...common,status:"PRODUCTION_ACTIVATION_MONITORING_EVIDENCE_INCOMPLETE",active:false,decision:"HOLD",missingMetrics};
  const requiredRollbackTypes=[...(activationRun?.rollbackTypes||[])].map(String).sort();
  const evaluations=Array.isArray(observation?.rollbackEvaluations)?observation.rollbackEvaluations:[];
  const byType=new Map(evaluations.map(x=>[String(x?.type||""),x]));
  const missingRollbackEvaluations=requiredRollbackTypes.filter(t=>!byType.has(t)||typeof byType.get(t)?.breached!=="boolean");
  if(missingRollbackEvaluations.length)return{...common,status:"PRODUCTION_ACTIVATION_ROLLBACK_EVALUATION_INCOMPLETE",active:false,decision:"HOLD",missingRollbackEvaluations};
  const breaches=requiredRollbackTypes.filter(t=>byType.get(t)?.breached===true).map(t=>({type:t,evidence:byType.get(t)?.evidence??null,note:String(byType.get(t)?.note||"")}));
  const observedAt=String(observation?.observedAt||new Date().toISOString());
  const payload={activationRunId:activationRun.activationRunId,activationRunSeal:activationRun.activationRunSeal,cohortId,exposureShare,races,metrics:Object.fromEntries(requiredMetrics.map(k=>[k,Number(metrics[k])])),rollbackEvaluations:requiredRollbackTypes.map(t=>({type:t,breached:byType.get(t).breached===true,evidence:byType.get(t)?.evidence??null,note:String(byType.get(t)?.note||"")})),observedAt};
  const monitorSeal=simpleSealHash(JSON.stringify(stableSealValue(payload)));
  if(breaches.length)return{...common,status:"PRODUCTION_ACTIVATION_ROLLBACK_REQUIRED",active:false,decision:"STOP_AND_ROLLBACK",monitorSeal,activationRunSeal:activationRun.activationRunSeal,cohortId,exposureShare,races,minimumRaces:activationRun.minimumRaces,metrics:payload.metrics,rollbackEvaluations:payload.rollbackEvaluations,breaches,observedAt,safeguards:{autoPromotionAllowed:false,productionWriteAllowed:false,persistentProductionMutationAllowed:false,continuationAllowed:false,rollbackRequired:true,immediateStop:true,postActivationReviewRequired:true,monitorMutationForbidden:true}};
  if(races<Number(activationRun?.minimumRaces||0))return{...common,status:"PRODUCTION_ACTIVATION_MONITORING_CONTINUES",active:true,decision:"CONTINUE_PRODUCTION_ACTIVATION_MONITORING_ONLY",monitorSeal,activationRunSeal:activationRun.activationRunSeal,cohortId,exposureShare,races,minimumRaces:activationRun.minimumRaces,metrics:payload.metrics,rollbackEvaluations:payload.rollbackEvaluations,breaches:[],observedAt,safeguards:{autoPromotionAllowed:false,productionWriteAllowed:false,persistentProductionMutationAllowed:false,continuationAllowed:true,rollbackRequired:false,postActivationReviewRequired:true,monitorMutationForbidden:true}};
  return{...common,status:"PRODUCTION_ACTIVATION_MINIMUM_SAMPLE_REACHED_NO_BREACH",active:false,decision:"RETAIN_FOR_POST_PRODUCTION_ACTIVATION_REVIEW_ONLY",monitorSeal,activationRunSeal:activationRun.activationRunSeal,cohortId,exposureShare,races,minimumRaces:activationRun.minimumRaces,metrics:payload.metrics,rollbackEvaluations:payload.rollbackEvaluations,breaches:[],observedAt,safeguards:{autoPromotionAllowed:false,productionWriteAllowed:false,persistentProductionMutationAllowed:false,automaticProductionFinalizationAllowed:false,postActivationReviewRequired:true,manualPostActivationReviewRequired:true,rollbackRequired:false,monitorMutationForbidden:true}};
}

export function verifyThickProductionActivationMonitoring(activationMonitor,activationRun,activation,plan,postFinalDecision,postFinalReview,finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg){
  const allowed=new Set(["PRODUCTION_ACTIVATION_MONITORING_CONTINUES","PRODUCTION_ACTIVATION_ROLLBACK_REQUIRED","PRODUCTION_ACTIVATION_MINIMUM_SAMPLE_REACHED_NO_BREACH"]);
  if(!allowed.has(activationMonitor?.status))return{status:"PRODUCTION_ACTIVATION_MONITOR_REQUIRED",valid:false};
  const source=verifyThickProductionActivationRun(activationRun,activation,plan,postFinalDecision,postFinalReview,finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!source.valid)return{status:source.status||"PRODUCTION_ACTIVATION_RUN_REQUIRED",valid:false};
  if(activationMonitor?.activationRunId!==activationRun?.activationRunId||activationMonitor?.activationRunSeal!==activationRun?.activationRunSeal)return{status:"PRODUCTION_ACTIVATION_MONITOR_CHAIN_MISMATCH",valid:false};
  const requiredMetrics=[...(activationRun?.monitoringMetrics||[])].map(String).sort();
  const requiredRollbackTypes=[...(activationRun?.rollbackTypes||[])].map(String).sort();
  const metrics=activationMonitor?.metrics&&typeof activationMonitor.metrics==="object"?activationMonitor.metrics:{};
  const evaluations=Array.isArray(activationMonitor?.rollbackEvaluations)?activationMonitor.rollbackEvaluations:[];
  const byType=new Map(evaluations.map(x=>[String(x?.type||""),x]));
  if(requiredMetrics.some(k=>!Object.prototype.hasOwnProperty.call(metrics,k))||requiredRollbackTypes.some(t=>!byType.has(t)))return{status:"PRODUCTION_ACTIVATION_MONITOR_EVIDENCE_INCOMPLETE",valid:false};
  const payload={activationRunId:activationRun.activationRunId,activationRunSeal:activationRun.activationRunSeal,cohortId:activationMonitor.cohortId||"",exposureShare:Number(activationMonitor.exposureShare),races:Number(activationMonitor.races),metrics:Object.fromEntries(requiredMetrics.map(k=>[k,Number(metrics[k])])),rollbackEvaluations:requiredRollbackTypes.map(t=>({type:t,breached:byType.get(t)?.breached===true,evidence:byType.get(t)?.evidence??null,note:String(byType.get(t)?.note||"")})),observedAt:activationMonitor.observedAt||""};
  const actual=simpleSealHash(JSON.stringify(stableSealValue(payload)));
  return{status:actual===activationMonitor.monitorSeal?"PRODUCTION_ACTIVATION_MONITOR_VERIFIED":"SEAL_MISMATCH",valid:actual===activationMonitor.monitorSeal,expectedSeal:activationMonitor.monitorSeal,actualSeal:actual};
}

export function buildThickPostProductionActivationReviewPackage(activationMonitor,activationRun,activation,plan,postFinalDecision,postFinalReview,finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg,review={}){
  const common={version:"THICK-POST-PRODUCTION-ACTIVATION-REVIEW-1.0",researchOnly:true,productionWriteAllowed:false,autoPromotionAllowed:false,persistentProductionMutationAllowed:false,activationRunId:activationRun?.activationRunId||null,planId:plan?.planId||null};
  const source=verifyThickProductionActivationMonitoring(activationMonitor,activationRun,activation,plan,postFinalDecision,postFinalReview,finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!source.valid)return{...common,status:"POST_PRODUCTION_ACTIVATION_SOURCE_INVALID",decision:"BLOCK",sourceVerification:source};
  if(activationMonitor?.status!=="PRODUCTION_ACTIVATION_MINIMUM_SAMPLE_REACHED_NO_BREACH"||activationMonitor?.decision!=="RETAIN_FOR_POST_PRODUCTION_ACTIVATION_REVIEW_ONLY")return{...common,status:"POST_PRODUCTION_ACTIVATION_COMPLETED_MONITOR_REQUIRED",decision:"BLOCK"};
  const requiredMetrics=[...(activationRun?.monitoringMetrics||[])].map(String).sort();
  const summaryMetrics=review?.summaryMetrics&&typeof review.summaryMetrics==="object"?review.summaryMetrics:{};
  const baselineMetrics=review?.baselineMetrics&&typeof review.baselineMetrics==="object"?review.baselineMetrics:{};
  const missingSummary=requiredMetrics.filter(k=>!Number.isFinite(Number(summaryMetrics[k])));
  const missingBaseline=requiredMetrics.filter(k=>!Number.isFinite(Number(baselineMetrics[k])));
  if(missingSummary.length||missingBaseline.length)return{...common,status:"POST_PRODUCTION_ACTIVATION_REVIEW_INCOMPLETE",decision:"HOLD",missingSummaryMetrics:missingSummary,missingBaselineMetrics:missingBaseline};
  const counterEvidence=Array.isArray(review?.counterEvidence)?review.counterEvidence.filter(Boolean):[];
  if(!counterEvidence.length)return{...common,status:"POST_PRODUCTION_ACTIVATION_COUNTER_EVIDENCE_REQUIRED",decision:"HOLD"};
  if(!Array.isArray(review?.unresolvedIssues))return{...common,status:"POST_PRODUCTION_ACTIVATION_UNRESOLVED_ISSUES_REQUIRED",decision:"HOLD"};
  const unresolvedIssues=review.unresolvedIssues.filter(Boolean);
  const rollbackNonTriggerEvidence=Array.isArray(review?.rollbackNonTriggerEvidence)?review.rollbackNonTriggerEvidence.filter(Boolean):[];
  const requiredRollbackTypes=[...(activationRun?.rollbackTypes||[])].map(String).sort();
  const covered=new Set(rollbackNonTriggerEvidence.map(x=>String(x?.type||"")));
  const missingRollbackEvidence=requiredRollbackTypes.filter(t=>!covered.has(t));
  if(missingRollbackEvidence.length)return{...common,status:"POST_PRODUCTION_ACTIVATION_ROLLBACK_EVIDENCE_INCOMPLETE",decision:"HOLD",missingRollbackEvidence};
  const reviewerId=String(review?.reviewerId||"").trim();
  if(!reviewerId)return{...common,status:"POST_PRODUCTION_ACTIVATION_REVIEWER_REQUIRED",decision:"HOLD"};
  const reviewedAt=String(review?.reviewedAt||"").trim();
  const deltas=Object.fromEntries(requiredMetrics.map(k=>[k,Number(summaryMetrics[k])-Number(baselineMetrics[k])]));
  const payload={activationRunId:activationRun.activationRunId,activationRunSeal:activationRun.activationRunSeal,monitorSeal:activationMonitor.monitorSeal,activationId:activation.activationId,activationSeal:activation.activationSeal,planId:plan.planId,planSeal:plan.planSeal,targetCohortId:activationRun.targetCohortId,exposureShare:activationRun.exposureShare,races:activationMonitor.races,minimumRaces:activationRun.minimumRaces,requiredMetrics,summaryMetrics:Object.fromEntries(requiredMetrics.map(k=>[k,Number(summaryMetrics[k])])),baselineMetrics:Object.fromEntries(requiredMetrics.map(k=>[k,Number(baselineMetrics[k])])),deltas,counterEvidence,unresolvedIssues,rollbackNonTriggerEvidence,requiredRollbackTypes,reviewerId,reviewedAt};
  const reviewSeal=simpleSealHash(JSON.stringify(stableSealValue(payload)));
  const postProductionReviewId=`THICK-POST-PRODUCTION-ACTIVATION-${reviewSeal}`;
  return{...common,status:"POST_PRODUCTION_ACTIVATION_REVIEW_PACKAGE_READY",decision:"MANUAL_POST_PRODUCTION_ACTIVATION_DECISION_ONLY",postProductionReviewId,reviewSeal,reviewerId,reviewedAt,activationRunSeal:activationRun.activationRunSeal,monitorSeal:activationMonitor.monitorSeal,targetCohortId:activationRun.targetCohortId,exposureShare:activationRun.exposureShare,races:activationMonitor.races,minimumRaces:activationRun.minimumRaces,requiredMetrics,summaryMetrics:payload.summaryMetrics,baselineMetrics:payload.baselineMetrics,deltas,counterEvidence,unresolvedIssues,rollbackNonTriggerEvidence,requiredRollbackTypes,safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,persistentProductionMutationAllowed:false,automaticProductionFinalizationAllowed:false,manualDecisionRequired:true,counterEvidenceRequired:true,unresolvedIssuesRequired:true,rollbackEvidenceRequired:true,reviewMutationForbidden:true}};
}

export function verifyThickPostProductionActivationReviewPackage(postProductionReview,activationMonitor,activationRun,activation,plan,postFinalDecision,postFinalReview,finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg){
  if(postProductionReview?.status!=="POST_PRODUCTION_ACTIVATION_REVIEW_PACKAGE_READY")return{status:"POST_PRODUCTION_ACTIVATION_REVIEW_PACKAGE_REQUIRED",valid:false};
  const source=verifyThickProductionActivationMonitoring(activationMonitor,activationRun,activation,plan,postFinalDecision,postFinalReview,finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!source.valid)return{status:"POST_PRODUCTION_ACTIVATION_SOURCE_INVALID",valid:false,sourceVerification:source};
  if(postProductionReview?.activationRunId!==activationRun?.activationRunId||postProductionReview?.activationRunSeal!==activationRun?.activationRunSeal||postProductionReview?.monitorSeal!==activationMonitor?.monitorSeal)return{status:"POST_PRODUCTION_ACTIVATION_CHAIN_MISMATCH",valid:false};
  const requiredMetrics=[...(postProductionReview.requiredMetrics||[])].map(String).sort();
  const requiredRollbackTypes=[...(postProductionReview.requiredRollbackTypes||[])].map(String).sort();
  const payload={activationRunId:activationRun.activationRunId,activationRunSeal:activationRun.activationRunSeal,monitorSeal:activationMonitor.monitorSeal,activationId:activation.activationId,activationSeal:activation.activationSeal,planId:plan.planId,planSeal:plan.planSeal,targetCohortId:activationRun.targetCohortId,exposureShare:activationRun.exposureShare,races:postProductionReview.races,minimumRaces:activationRun.minimumRaces,requiredMetrics,summaryMetrics:postProductionReview.summaryMetrics||{},baselineMetrics:postProductionReview.baselineMetrics||{},deltas:postProductionReview.deltas||{},counterEvidence:postProductionReview.counterEvidence||[],unresolvedIssues:postProductionReview.unresolvedIssues||[],rollbackNonTriggerEvidence:postProductionReview.rollbackNonTriggerEvidence||[],requiredRollbackTypes,reviewerId:postProductionReview.reviewerId||"",reviewedAt:postProductionReview.reviewedAt||""};
  const actual=simpleSealHash(JSON.stringify(stableSealValue(payload)));
  return{status:actual===postProductionReview.reviewSeal?"POST_PRODUCTION_ACTIVATION_REVIEW_VERIFIED":"SEAL_MISMATCH",valid:actual===postProductionReview.reviewSeal,expectedSeal:postProductionReview.reviewSeal,actualSeal:actual};
}

export function finalizeThickPostProductionActivationDecision(postProductionReview,activationMonitor,activationRun,activation,plan,postFinalDecision,postFinalReview,finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg,decisionInput={}){
  const common={version:"THICK-POST-PRODUCTION-ACTIVATION-DECISION-1.0",researchOnly:true,productionWriteAllowed:false,autoPromotionAllowed:false,persistentProductionMutationAllowed:false,productionFinalizationAllowed:false,postProductionReviewId:postProductionReview?.postProductionReviewId||null};
  const source=verifyThickPostProductionActivationReviewPackage(postProductionReview,activationMonitor,activationRun,activation,plan,postFinalDecision,postFinalReview,finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!source.valid)return{...common,status:"POST_PRODUCTION_ACTIVATION_DECISION_SOURCE_INVALID",eligible:false,decision:"BLOCK",sourceVerification:source};
  const reviewerId=String(decisionInput?.reviewerId||"").trim();
  if(!reviewerId)return{...common,status:"POST_PRODUCTION_ACTIVATION_DECISION_REVIEWER_REQUIRED",eligible:false,decision:"HOLD"};
  const forbiddenReviewerIds=new Set([
    postProductionReview?.reviewerId,
    activation?.reviewerId,
    plan?.createdBy,
    postFinalDecision?.reviewerId,
    postFinalReview?.reviewerId,
    finalActivation?.reviewerId,
    finalPlan?.createdBy,
    postStagedDecision?.reviewerId,
    postReview?.reviewerId,
    stagedActivation?.reviewerId,
    stagedPlan?.createdBy,
    postCanaryDecision?.reviewerId,
    reviewPackage?.reviewerId,
    activationDecision?.reviewerId,
    finalDecision?.reviewerId
  ].map(x=>String(x||"").trim()).filter(Boolean));
  if(forbiddenReviewerIds.has(reviewerId))return{...common,status:"INDEPENDENT_POST_PRODUCTION_ACTIVATION_DECISION_REVIEWER_REQUIRED",eligible:false,decision:"HOLD",reviewerId,forbiddenReviewerIds:[...forbiddenReviewerIds].sort()};
  const verdict=String(decisionInput?.verdict||"").trim();
  const allowedVerdicts=new Set(["APPROVE_PRODUCTION_FINALIZATION_CANDIDATE","HOLD","REJECT"]);
  if(!allowedVerdicts.has(verdict))return{...common,status:"POST_PRODUCTION_ACTIVATION_DECISION_VERDICT_REQUIRED",eligible:false,decision:"HOLD",reviewerId};
  const acknowledgedCounterEvidence=decisionInput?.acknowledgedCounterEvidence===true;
  const acknowledgedUnresolvedIssues=decisionInput?.acknowledgedUnresolvedIssues===true;
  const acknowledgedRollbackTypes=new Set((decisionInput?.acknowledgedRollbackTypes||[]).map(String));
  const requiredRollbackTypes=[...(postProductionReview?.requiredRollbackTypes||[])].map(String).sort();
  const missingRollbackAcknowledgements=requiredRollbackTypes.filter(t=>!acknowledgedRollbackTypes.has(t));
  if(verdict==="APPROVE_PRODUCTION_FINALIZATION_CANDIDATE"&&!acknowledgedCounterEvidence)return{...common,status:"POST_PRODUCTION_ACTIVATION_COUNTER_EVIDENCE_ACK_REQUIRED",eligible:false,decision:"HOLD",reviewerId,verdict};
  if(verdict==="APPROVE_PRODUCTION_FINALIZATION_CANDIDATE"&&!acknowledgedUnresolvedIssues)return{...common,status:"POST_PRODUCTION_ACTIVATION_UNRESOLVED_ISSUES_ACK_REQUIRED",eligible:false,decision:"HOLD",reviewerId,verdict};
  if(verdict==="APPROVE_PRODUCTION_FINALIZATION_CANDIDATE"&&missingRollbackAcknowledgements.length)return{...common,status:"POST_PRODUCTION_ACTIVATION_ROLLBACK_ACK_INCOMPLETE",eligible:false,decision:"HOLD",reviewerId,verdict,missingRollbackAcknowledgements};
  const note=String(decisionInput?.note||"");
  const decidedAt=String(decisionInput?.decidedAt||"");
  const payload={postProductionReviewId:postProductionReview.postProductionReviewId,reviewSeal:postProductionReview.reviewSeal,activationRunId:activationRun.activationRunId,activationRunSeal:activationRun.activationRunSeal,monitorSeal:activationMonitor.monitorSeal,activationId:activation.activationId,activationSeal:activation.activationSeal,planId:plan.planId,planSeal:plan.planSeal,reviewerId,verdict,note,decidedAt,acknowledgedCounterEvidence,acknowledgedUnresolvedIssues,acknowledgedRollbackTypes:[...acknowledgedRollbackTypes].sort(),requiredRollbackTypes,targetCohortId:postProductionReview.targetCohortId||null,exposureShare:postProductionReview.exposureShare,summaryMetrics:postProductionReview.summaryMetrics||{},baselineMetrics:postProductionReview.baselineMetrics||{},deltas:postProductionReview.deltas||{},counterEvidence:postProductionReview.counterEvidence||[],unresolvedIssues:postProductionReview.unresolvedIssues||[],rollbackNonTriggerEvidence:postProductionReview.rollbackNonTriggerEvidence||[]};
  const decisionSeal=simpleSealHash(JSON.stringify(stableSealValue(payload)));
  const decisionId=`THICK-POST-PRODUCTION-ACTIVATION-DECISION-${decisionSeal}`;
  if(verdict==="REJECT")return{...common,status:"POST_PRODUCTION_ACTIVATION_DECISION_REJECTED",eligible:false,decision:"REJECT_PRODUCTION_FINALIZATION",decisionId,decisionSeal,reviewerId,verdict,note,decidedAt,reviewSeal:postProductionReview.reviewSeal,safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,persistentProductionMutationAllowed:false,productionFinalizationAllowed:false,productionFinalizationPlanningAllowed:false,decisionMutationForbidden:true}};
  if(verdict==="HOLD")return{...common,status:"POST_PRODUCTION_ACTIVATION_DECISION_HELD",eligible:false,decision:"HOLD",decisionId,decisionSeal,reviewerId,verdict,note,decidedAt,reviewSeal:postProductionReview.reviewSeal,safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,persistentProductionMutationAllowed:false,productionFinalizationAllowed:false,productionFinalizationPlanningAllowed:false,decisionMutationForbidden:true}};
  return{...common,status:"POST_PRODUCTION_ACTIVATION_DECISION_APPROVED",eligible:true,decision:"PRODUCTION_FINALIZATION_CANDIDATE_ONLY",decisionId,decisionSeal,reviewerId,verdict,note,decidedAt,reviewSeal:postProductionReview.reviewSeal,acknowledgedCounterEvidence,acknowledgedUnresolvedIssues,acknowledgedRollbackTypes:[...acknowledgedRollbackTypes].sort(),requiredRollbackTypes,targetCohortId:postProductionReview.targetCohortId||null,exposureShare:postProductionReview.exposureShare,summaryMetrics:postProductionReview.summaryMetrics||{},baselineMetrics:postProductionReview.baselineMetrics||{},deltas:postProductionReview.deltas||{},counterEvidence:postProductionReview.counterEvidence||[],unresolvedIssues:postProductionReview.unresolvedIssues||[],rollbackNonTriggerEvidence:postProductionReview.rollbackNonTriggerEvidence||[],safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,persistentProductionMutationAllowed:false,productionFinalizationAllowed:false,productionFinalizationPlanningAllowed:true,manualProductionFinalizationPlanRequired:true,rollbackConditionsLocked:true,decisionMutationForbidden:true}};
}

export function verifyThickPostProductionActivationDecision(postProductionDecision,postProductionReview,activationMonitor,activationRun,activation,plan,postFinalDecision,postFinalReview,finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg){
  if(!["POST_PRODUCTION_ACTIVATION_DECISION_APPROVED","POST_PRODUCTION_ACTIVATION_DECISION_REJECTED","POST_PRODUCTION_ACTIVATION_DECISION_HELD"].includes(postProductionDecision?.status))return{status:"POST_PRODUCTION_ACTIVATION_DECISION_REQUIRED",valid:false};
  const source=verifyThickPostProductionActivationReviewPackage(postProductionReview,activationMonitor,activationRun,activation,plan,postFinalDecision,postFinalReview,finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!source.valid)return{status:"POST_PRODUCTION_ACTIVATION_DECISION_SOURCE_INVALID",valid:false,sourceVerification:source};
  if(postProductionDecision?.postProductionReviewId!==postProductionReview?.postProductionReviewId||postProductionDecision?.reviewSeal!==postProductionReview?.reviewSeal)return{status:"POST_PRODUCTION_ACTIVATION_DECISION_CHAIN_MISMATCH",valid:false};
  const requiredRollbackTypes=[...(postProductionDecision.requiredRollbackTypes||[])].map(String).sort();
  const payload={postProductionReviewId:postProductionReview.postProductionReviewId,reviewSeal:postProductionReview.reviewSeal,activationRunId:activationRun.activationRunId,activationRunSeal:activationRun.activationRunSeal,monitorSeal:activationMonitor.monitorSeal,activationId:activation.activationId,activationSeal:activation.activationSeal,planId:plan.planId,planSeal:plan.planSeal,reviewerId:postProductionDecision.reviewerId||"",verdict:postProductionDecision.verdict||"",note:postProductionDecision.note||"",decidedAt:postProductionDecision.decidedAt||"",acknowledgedCounterEvidence:postProductionDecision.acknowledgedCounterEvidence===true,acknowledgedUnresolvedIssues:postProductionDecision.acknowledgedUnresolvedIssues===true,acknowledgedRollbackTypes:[...(postProductionDecision.acknowledgedRollbackTypes||[])].map(String).sort(),requiredRollbackTypes,targetCohortId:postProductionReview.targetCohortId||null,exposureShare:postProductionReview.exposureShare,summaryMetrics:postProductionReview.summaryMetrics||{},baselineMetrics:postProductionReview.baselineMetrics||{},deltas:postProductionReview.deltas||{},counterEvidence:postProductionReview.counterEvidence||[],unresolvedIssues:postProductionReview.unresolvedIssues||[],rollbackNonTriggerEvidence:postProductionReview.rollbackNonTriggerEvidence||[]};
  const actual=simpleSealHash(JSON.stringify(stableSealValue(payload)));
  return{status:actual===postProductionDecision.decisionSeal?"POST_PRODUCTION_ACTIVATION_DECISION_VERIFIED":"SEAL_MISMATCH",valid:actual===postProductionDecision.decisionSeal,expectedSeal:postProductionDecision.decisionSeal,actualSeal:actual};
}

export function createThickProductionFinalizationPlan(postProductionDecision,postProductionReview,activationMonitor,activationRun,activation,productionActivationPlan,postFinalDecision,postFinalReview,finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg,planInput={}){
  const common={version:"THICK-PRODUCTION-FINALIZATION-PLAN-1.0",researchOnly:true,productionWriteAllowed:false,autoPromotionAllowed:false,persistentProductionMutationAllowed:false};
  const source=verifyThickPostProductionActivationDecision(postProductionDecision,postProductionReview,activationMonitor,activationRun,activation,productionActivationPlan,postFinalDecision,postFinalReview,finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!source.valid||postProductionDecision?.decision!=="PRODUCTION_FINALIZATION_CANDIDATE_ONLY")return{...common,status:"PRODUCTION_FINALIZATION_SOURCE_NOT_APPROVED",eligible:false,sourceVerification:source};
  const targetCohortId=String(planInput.targetCohortId||postProductionDecision.targetCohortId||"");
  const exposureShare=Number(planInput.exposureShare??postProductionDecision.exposureShare);
  const minimumRaces=Number(planInput.minimumRaces??productionActivationPlan?.minimumRaces??100);
  const monitoringMetrics=[...(planInput.monitoringMetrics||productionActivationPlan?.monitoringMetrics||[])].map(String).sort();
  const rollbackTypes=[...(planInput.rollbackTypes||productionActivationPlan?.rollbackTypes||[])].map(String).sort();
  const immediateStop=planInput.immediateStop!==false;
  const postFinalizationReviewRequired=planInput.postFinalizationReviewRequired!==false;
  const createdBy=String(planInput.createdBy||"");
  const createdAt=String(planInput.createdAt||new Date().toISOString());
  if(!targetCohortId||targetCohortId!==String(postProductionDecision.targetCohortId||""))return{...common,status:"PRODUCTION_FINALIZATION_PLAN_COHORT_MISMATCH",eligible:false};
  if(exposureShare!==1)return{...common,status:"PRODUCTION_FINALIZATION_PLAN_EXPOSURE_MUST_BE_100_PERCENT",eligible:false};
  if(!Number.isInteger(minimumRaces)||minimumRaces<100)return{...common,status:"PRODUCTION_FINALIZATION_PLAN_MINIMUM_RACES_REQUIRED",eligible:false};
  const expectedMetrics=[...(productionActivationPlan?.monitoringMetrics||[])].map(String).sort();
  const expectedRollback=[...(productionActivationPlan?.rollbackTypes||[])].map(String).sort();
  if(monitoringMetrics.length<5||JSON.stringify(monitoringMetrics)!==JSON.stringify(expectedMetrics))return{...common,status:"PRODUCTION_FINALIZATION_PLAN_MONITORING_MISMATCH",eligible:false};
  if(rollbackTypes.length<5||JSON.stringify(rollbackTypes)!==JSON.stringify(expectedRollback))return{...common,status:"PRODUCTION_FINALIZATION_PLAN_ROLLBACK_MISMATCH",eligible:false};
  if(!immediateStop)return{...common,status:"PRODUCTION_FINALIZATION_PLAN_IMMEDIATE_STOP_REQUIRED",eligible:false};
  if(!postFinalizationReviewRequired)return{...common,status:"PRODUCTION_FINALIZATION_PLAN_POST_REVIEW_REQUIRED",eligible:false};
  if(!createdBy)return{...common,status:"PRODUCTION_FINALIZATION_PLAN_CREATOR_REQUIRED",eligible:false};
  const payload={decisionId:postProductionDecision.decisionId,decisionSeal:postProductionDecision.decisionSeal,reviewSeal:postProductionReview.reviewSeal,activationRunId:activationRun.activationRunId,activationRunSeal:activationRun.activationRunSeal,monitorSeal:activationMonitor.monitorSeal,productionActivationPlanId:productionActivationPlan.planId,productionActivationPlanSeal:productionActivationPlan.planSeal,targetCohortId,exposureShare,minimumRaces,monitoringMetrics,rollbackTypes,immediateStop,postFinalizationReviewRequired,createdBy,createdAt};
  const planSeal=simpleSealHash(JSON.stringify(stableSealValue(payload)));
  const finalizationPlanId=`THICK-PRODUCTION-FINALIZATION-PLAN-${planSeal}`;
  return{...common,status:"PRODUCTION_FINALIZATION_PLAN_READY",eligible:true,decision:"MANUAL_PRODUCTION_FINALIZATION_ACTIVATION_REVIEW_ONLY",finalizationPlanId,planSeal,...payload,safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,persistentProductionMutationAllowed:false,productionFinalizationAllowed:false,productionFinalizationActivationAllowed:false,manualActivationReviewRequired:true,cohortLocked:true,fullExposureLocked:true,monitoringMetricsLocked:true,rollbackConditionsLocked:true,immediateStopLocked:true,postFinalizationReviewRequired:true,planMutationForbidden:true}};
}

export function verifyThickProductionFinalizationPlan(finalizationPlan,postProductionDecision,postProductionReview,activationMonitor,activationRun,activation,productionActivationPlan,postFinalDecision,postFinalReview,finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg){
  if(finalizationPlan?.status!=="PRODUCTION_FINALIZATION_PLAN_READY")return{status:"PRODUCTION_FINALIZATION_PLAN_REQUIRED",valid:false};
  const source=verifyThickPostProductionActivationDecision(postProductionDecision,postProductionReview,activationMonitor,activationRun,activation,productionActivationPlan,postFinalDecision,postFinalReview,finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!source.valid||postProductionDecision?.decision!=="PRODUCTION_FINALIZATION_CANDIDATE_ONLY")return{status:"PRODUCTION_FINALIZATION_PLAN_SOURCE_INVALID",valid:false,sourceVerification:source};
  if(finalizationPlan?.decisionId!==postProductionDecision.decisionId||finalizationPlan?.decisionSeal!==postProductionDecision.decisionSeal)return{status:"PRODUCTION_FINALIZATION_PLAN_CHAIN_MISMATCH",valid:false};
  const payload={decisionId:postProductionDecision.decisionId,decisionSeal:postProductionDecision.decisionSeal,reviewSeal:postProductionReview.reviewSeal,activationRunId:activationRun.activationRunId,activationRunSeal:activationRun.activationRunSeal,monitorSeal:activationMonitor.monitorSeal,productionActivationPlanId:productionActivationPlan.planId,productionActivationPlanSeal:productionActivationPlan.planSeal,targetCohortId:finalizationPlan.targetCohortId,exposureShare:finalizationPlan.exposureShare,minimumRaces:finalizationPlan.minimumRaces,monitoringMetrics:[...(finalizationPlan.monitoringMetrics||[])].map(String).sort(),rollbackTypes:[...(finalizationPlan.rollbackTypes||[])].map(String).sort(),immediateStop:finalizationPlan.immediateStop===true,postFinalizationReviewRequired:finalizationPlan.postFinalizationReviewRequired===true,createdBy:finalizationPlan.createdBy||"",createdAt:finalizationPlan.createdAt||""};
  const actual=simpleSealHash(JSON.stringify(stableSealValue(payload)));
  return{status:actual===finalizationPlan.planSeal?"PRODUCTION_FINALIZATION_PLAN_VERIFIED":"SEAL_MISMATCH",valid:actual===finalizationPlan.planSeal,expectedSeal:finalizationPlan.planSeal,actualSeal:actual};
}

export function finalizeThickProductionFinalizationActivationReview(finalizationPlan,postProductionDecision,postProductionReview,activationMonitor,activationRun,activation,productionActivationPlan,postFinalDecision,postFinalReview,finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg,review={}){
  const common={version:"THICK-PRODUCTION-FINALIZATION-ACTIVATION-REVIEW-1.0",researchOnly:true,productionWriteAllowed:false,autoPromotionAllowed:false,persistentProductionMutationAllowed:false,productionFinalizationAllowed:false,finalizationPlanId:finalizationPlan?.finalizationPlanId||null,sourceDecisionId:postProductionDecision?.decisionId||null};
  const source=verifyThickProductionFinalizationPlan(finalizationPlan,postProductionDecision,postProductionReview,activationMonitor,activationRun,activation,productionActivationPlan,postFinalDecision,postFinalReview,finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!source.valid)return{...common,status:source.status||"PRODUCTION_FINALIZATION_PLAN_REQUIRED",eligible:false,decision:"BLOCK",sourceVerification:source};
  if(finalizationPlan?.decision!=="MANUAL_PRODUCTION_FINALIZATION_ACTIVATION_REVIEW_ONLY")return{...common,status:"PRODUCTION_FINALIZATION_ACTIVATION_REVIEW_REQUIRED",eligible:false,decision:"BLOCK"};
  if(Number(finalizationPlan?.exposureShare)!==1)return{...common,status:"PRODUCTION_FINALIZATION_EXPOSURE_MUST_BE_100_PERCENT",eligible:false,decision:"HOLD"};
  if(finalizationPlan?.immediateStop!==true)return{...common,status:"PRODUCTION_FINALIZATION_IMMEDIATE_STOP_REQUIRED",eligible:false,decision:"HOLD"};
  if(finalizationPlan?.postFinalizationReviewRequired!==true)return{...common,status:"PRODUCTION_FINALIZATION_POST_REVIEW_REQUIRED",eligible:false,decision:"HOLD"};
  const reviewerId=String(review?.reviewerId||"").trim();
  if(!reviewerId)return{...common,status:"PRODUCTION_FINALIZATION_ACTIVATION_REVIEWER_REQUIRED",eligible:false,decision:"HOLD"};
  const priorReviewerIds=new Set([
    finalizationPlan?.createdBy,
    postProductionDecision?.reviewerId,
    postProductionReview?.reviewerId,
    activation?.reviewerId,
    productionActivationPlan?.createdBy,
    postFinalDecision?.reviewerId,
    postFinalReview?.reviewerId,
    finalActivation?.reviewerId,
    finalPlan?.createdBy,
    postStagedDecision?.reviewerId,
    postReview?.reviewerId,
    stagedActivation?.reviewerId,
    stagedPlan?.createdBy,
    postCanaryDecision?.reviewerId,
    reviewPackage?.reviewerId,
    activationDecision?.reviewerId,
    finalDecision?.reviewerId,
    pkg?.sourceChain?.primaryReviewerId,
    pkg?.sourceChain?.finalReviewerId
  ].filter(Boolean).map(String));
  if(priorReviewerIds.has(reviewerId))return{...common,status:"INDEPENDENT_PRODUCTION_FINALIZATION_ACTIVATION_REVIEWER_REQUIRED",eligible:false,decision:"HOLD",reviewerId,priorReviewerIds:[...priorReviewerIds]};
  const verdict=String(review?.verdict||"").trim().toUpperCase();
  const allowed=new Set(["APPROVE_PRODUCTION_FINALIZATION_ACTIVATION","HOLD","REJECT"]);
  if(!allowed.has(verdict))return{...common,status:"PRODUCTION_FINALIZATION_ACTIVATION_VERDICT_REQUIRED",eligible:false,decision:"HOLD",reviewerId};
  const acknowledgedPlanSeal=review?.acknowledgedPlanSeal===true;
  const acknowledgedFullExposure=review?.acknowledgedFullExposure===true;
  const acknowledgedImmediateStop=review?.acknowledgedImmediateStop===true;
  const acknowledgedPostFinalizationReview=review?.acknowledgedPostFinalizationReview===true;
  const metricAck=new Set((Array.isArray(review?.acknowledgedMonitoringMetrics)?review.acknowledgedMonitoringMetrics:[]).map(String));
  const rollbackAck=new Set((Array.isArray(review?.acknowledgedRollbackTypes)?review.acknowledgedRollbackTypes:[]).map(String));
  const requiredMetrics=[...(finalizationPlan?.monitoringMetrics||[])].map(String).sort();
  const requiredRollbackTypes=[...(finalizationPlan?.rollbackTypes||[])].map(String).sort();
  const missingMetrics=requiredMetrics.filter(x=>!metricAck.has(x));
  const missingRollbackTypes=requiredRollbackTypes.filter(x=>!rollbackAck.has(x));
  if(verdict==="APPROVE_PRODUCTION_FINALIZATION_ACTIVATION"&&!acknowledgedPlanSeal)return{...common,status:"PRODUCTION_FINALIZATION_PLAN_SEAL_ACK_REQUIRED",eligible:false,decision:"HOLD",reviewerId,verdict};
  if(verdict==="APPROVE_PRODUCTION_FINALIZATION_ACTIVATION"&&!acknowledgedFullExposure)return{...common,status:"PRODUCTION_FINALIZATION_FULL_EXPOSURE_ACK_REQUIRED",eligible:false,decision:"HOLD",reviewerId,verdict};
  if(verdict==="APPROVE_PRODUCTION_FINALIZATION_ACTIVATION"&&!acknowledgedImmediateStop)return{...common,status:"PRODUCTION_FINALIZATION_IMMEDIATE_STOP_ACK_REQUIRED",eligible:false,decision:"HOLD",reviewerId,verdict};
  if(verdict==="APPROVE_PRODUCTION_FINALIZATION_ACTIVATION"&&!acknowledgedPostFinalizationReview)return{...common,status:"PRODUCTION_FINALIZATION_POST_REVIEW_ACK_REQUIRED",eligible:false,decision:"HOLD",reviewerId,verdict};
  if(verdict==="APPROVE_PRODUCTION_FINALIZATION_ACTIVATION"&&missingMetrics.length)return{...common,status:"PRODUCTION_FINALIZATION_MONITORING_ACK_INCOMPLETE",eligible:false,decision:"HOLD",reviewerId,verdict,missingMetrics};
  if(verdict==="APPROVE_PRODUCTION_FINALIZATION_ACTIVATION"&&missingRollbackTypes.length)return{...common,status:"PRODUCTION_FINALIZATION_ROLLBACK_ACK_INCOMPLETE",eligible:false,decision:"HOLD",reviewerId,verdict,missingRollbackTypes};
  const note=String(review?.note||"").trim();
  const reviewedAt=String(review?.reviewedAt||"").trim();
  const payload={finalizationPlanId:finalizationPlan.finalizationPlanId,planSeal:finalizationPlan.planSeal,sourceDecisionId:postProductionDecision.decisionId,sourceDecisionSeal:postProductionDecision.decisionSeal,reviewerId,verdict,note,reviewedAt,acknowledgedPlanSeal,acknowledgedFullExposure,acknowledgedImmediateStop,acknowledgedPostFinalizationReview,acknowledgedMonitoringMetrics:[...metricAck].sort(),acknowledgedRollbackTypes:[...rollbackAck].sort(),requiredMetrics,requiredRollbackTypes,targetCohortId:finalizationPlan.targetCohortId,exposureShare:finalizationPlan.exposureShare,minimumRaces:finalizationPlan.minimumRaces};
  const activationSeal=simpleSealHash(JSON.stringify(stableSealValue(payload)));
  const finalizationActivationId=`THICK-PRODUCTION-FINALIZATION-ACTIVATION-${activationSeal}`;
  if(verdict==="REJECT")return{...common,status:"PRODUCTION_FINALIZATION_ACTIVATION_REJECTED",eligible:false,decision:"REJECT_PRODUCTION_FINALIZATION",finalizationActivationId,activationSeal,reviewerId,verdict,note,reviewedAt,planSeal:finalizationPlan.planSeal,safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,persistentProductionMutationAllowed:false,productionFinalizationAllowed:false,productionFinalizationStartAllowed:false,activationMutationForbidden:true}};
  if(verdict==="HOLD")return{...common,status:"PRODUCTION_FINALIZATION_ACTIVATION_HELD",eligible:false,decision:"HOLD",finalizationActivationId,activationSeal,reviewerId,verdict,note,reviewedAt,planSeal:finalizationPlan.planSeal,safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,persistentProductionMutationAllowed:false,productionFinalizationAllowed:false,productionFinalizationStartAllowed:false,activationMutationForbidden:true}};
  return{...common,status:"PRODUCTION_FINALIZATION_ACTIVATION_REVIEW_APPROVED",eligible:true,decision:"AUTHORIZED_PRODUCTION_FINALIZATION_START_ONLY",finalizationActivationId,activationSeal,reviewerId,verdict,note,reviewedAt,planSeal:finalizationPlan.planSeal,acknowledgedPlanSeal,acknowledgedFullExposure,acknowledgedImmediateStop,acknowledgedPostFinalizationReview,acknowledgedMonitoringMetrics:[...metricAck].sort(),acknowledgedRollbackTypes:[...rollbackAck].sort(),requiredMetrics,requiredRollbackTypes,targetCohortId:finalizationPlan.targetCohortId,exposureShare:finalizationPlan.exposureShare,minimumRaces:finalizationPlan.minimumRaces,safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,persistentProductionMutationAllowed:false,productionFinalizationAllowed:false,productionFinalizationStartAllowed:true,startIsSeparateOperation:true,finalizationExecutionAllowed:false,monitoringMetricsLocked:true,rollbackConditionsLocked:true,cohortLocked:true,fullExposureLocked:true,postFinalizationReviewRequired:true,activationMutationForbidden:true}};
}

export function verifyThickProductionFinalizationActivationReview(finalizationActivation,finalizationPlan,postProductionDecision,postProductionReview,activationMonitor,activationRun,activation,productionActivationPlan,postFinalDecision,postFinalReview,finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg){
  if(finalizationActivation?.status!=="PRODUCTION_FINALIZATION_ACTIVATION_REVIEW_APPROVED")return{status:"PRODUCTION_FINALIZATION_ACTIVATION_APPROVAL_REQUIRED",valid:false};
  const source=verifyThickProductionFinalizationPlan(finalizationPlan,postProductionDecision,postProductionReview,activationMonitor,activationRun,activation,productionActivationPlan,postFinalDecision,postFinalReview,finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!source.valid)return{status:source.status||"PRODUCTION_FINALIZATION_PLAN_REQUIRED",valid:false,sourceVerification:source};
  if(finalizationActivation?.finalizationPlanId!==finalizationPlan?.finalizationPlanId||finalizationActivation?.planSeal!==finalizationPlan?.planSeal||finalizationActivation?.sourceDecisionId!==postProductionDecision?.decisionId)return{status:"PRODUCTION_FINALIZATION_ACTIVATION_CHAIN_MISMATCH",valid:false};
  const payload={finalizationPlanId:finalizationPlan.finalizationPlanId,planSeal:finalizationPlan.planSeal,sourceDecisionId:postProductionDecision.decisionId,sourceDecisionSeal:postProductionDecision.decisionSeal,reviewerId:finalizationActivation.reviewerId||"",verdict:finalizationActivation.verdict||"",note:finalizationActivation.note||"",reviewedAt:finalizationActivation.reviewedAt||"",acknowledgedPlanSeal:finalizationActivation.acknowledgedPlanSeal===true,acknowledgedFullExposure:finalizationActivation.acknowledgedFullExposure===true,acknowledgedImmediateStop:finalizationActivation.acknowledgedImmediateStop===true,acknowledgedPostFinalizationReview:finalizationActivation.acknowledgedPostFinalizationReview===true,acknowledgedMonitoringMetrics:[...(finalizationActivation.acknowledgedMonitoringMetrics||[])].map(String).sort(),acknowledgedRollbackTypes:[...(finalizationActivation.acknowledgedRollbackTypes||[])].map(String).sort(),requiredMetrics:[...(finalizationActivation.requiredMetrics||[])].map(String).sort(),requiredRollbackTypes:[...(finalizationActivation.requiredRollbackTypes||[])].map(String).sort(),targetCohortId:finalizationPlan.targetCohortId,exposureShare:finalizationPlan.exposureShare,minimumRaces:finalizationPlan.minimumRaces};
  const actual=simpleSealHash(JSON.stringify(stableSealValue(payload)));
  return{status:actual===finalizationActivation.activationSeal?"PRODUCTION_FINALIZATION_ACTIVATION_REVIEW_VERIFIED":"SEAL_MISMATCH",valid:actual===finalizationActivation.activationSeal,expectedSeal:finalizationActivation.activationSeal,actualSeal:actual};
}

export function startThickProductionFinalizationRun(finalizationActivation,finalizationPlan,postProductionDecision,postProductionReview,activationMonitor,activationRun,activation,productionActivationPlan,postFinalDecision,postFinalReview,finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg,start={}){
  const common={version:"THICK-PRODUCTION-FINALIZATION-RUN-1.0",researchOnly:true,productionWriteAllowed:false,autoPromotionAllowed:false,persistentProductionMutationAllowed:false,productionFinalizationAllowed:false,finalizationActivationId:finalizationActivation?.finalizationActivationId||null,finalizationPlanId:finalizationPlan?.finalizationPlanId||null};
  const source=verifyThickProductionFinalizationActivationReview(finalizationActivation,finalizationPlan,postProductionDecision,postProductionReview,activationMonitor,activationRun,activation,productionActivationPlan,postFinalDecision,postFinalReview,finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!source.valid)return{...common,status:"PRODUCTION_FINALIZATION_ACTIVATION_REQUIRED",active:false,decision:"BLOCK",sourceVerification:source};
  if(finalizationActivation?.decision!=="AUTHORIZED_PRODUCTION_FINALIZATION_START_ONLY")return{...common,status:"PRODUCTION_FINALIZATION_START_AUTHORIZATION_REQUIRED",active:false,decision:"BLOCK"};
  const targetCohortId=String(start?.targetCohortId??finalizationPlan?.targetCohortId??"").trim();
  const exposureShare=Number(start?.exposureShare??finalizationPlan?.exposureShare);
  const minimumRaces=Number(start?.minimumRaces??finalizationPlan?.minimumRaces);
  const monitoringMetrics=[...(start?.monitoringMetrics??finalizationPlan?.monitoringMetrics??[])].map(String).sort();
  const rollbackTypes=[...(start?.rollbackTypes??finalizationPlan?.rollbackTypes??[])].map(String).sort();
  const expectedMetrics=[...(finalizationPlan?.monitoringMetrics||[])].map(String).sort();
  const expectedRollback=[...(finalizationPlan?.rollbackTypes||[])].map(String).sort();
  if(targetCohortId!==String(finalizationPlan?.targetCohortId||""))return{...common,status:"PRODUCTION_FINALIZATION_COHORT_MISMATCH",active:false,decision:"BLOCK"};
  if(exposureShare!==1||exposureShare!==Number(finalizationPlan?.exposureShare))return{...common,status:"PRODUCTION_FINALIZATION_FULL_EXPOSURE_REQUIRED",active:false,decision:"BLOCK"};
  if(!Number.isFinite(minimumRaces)||minimumRaces<100||minimumRaces!==Number(finalizationPlan?.minimumRaces))return{...common,status:"PRODUCTION_FINALIZATION_MINIMUM_RACES_MISMATCH",active:false,decision:"BLOCK"};
  if(JSON.stringify(monitoringMetrics)!==JSON.stringify(expectedMetrics))return{...common,status:"PRODUCTION_FINALIZATION_MONITORING_METRICS_MISMATCH",active:false,decision:"BLOCK"};
  if(JSON.stringify(rollbackTypes)!==JSON.stringify(expectedRollback))return{...common,status:"PRODUCTION_FINALIZATION_ROLLBACK_TYPES_MISMATCH",active:false,decision:"BLOCK"};
  const immediateStopOnRollback=start?.immediateStopOnRollback??finalizationPlan?.immediateStop;
  const postFinalizationReviewRequired=start?.postFinalizationReviewRequired??finalizationPlan?.postFinalizationReviewRequired;
  if(immediateStopOnRollback!==true)return{...common,status:"PRODUCTION_FINALIZATION_IMMEDIATE_STOP_REQUIRED",active:false,decision:"BLOCK"};
  if(postFinalizationReviewRequired!==true)return{...common,status:"PRODUCTION_FINALIZATION_POST_REVIEW_REQUIRED",active:false,decision:"BLOCK"};
  const executorId=String(start?.executorId||"").trim();
  if(!executorId)return{...common,status:"PRODUCTION_FINALIZATION_EXECUTOR_REQUIRED",active:false,decision:"BLOCK"};
  const startedAt=String(start?.startedAt||"").trim();
  const payload={finalizationPlanId:finalizationPlan.finalizationPlanId,planSeal:finalizationPlan.planSeal,finalizationActivationId:finalizationActivation.finalizationActivationId,activationSeal:finalizationActivation.activationSeal,sourceDecisionId:postProductionDecision.decisionId,sourceDecisionSeal:postProductionDecision.decisionSeal,targetCohortId,exposureShare,minimumRaces,monitoringMetrics,rollbackTypes,immediateStopOnRollback:true,postFinalizationReviewRequired:true,executorId,startedAt};
  const finalizationRunSeal=simpleSealHash(JSON.stringify(stableSealValue(payload)));
  const finalizationRunId=`THICK-PRODUCTION-FINALIZATION-RUN-${finalizationRunSeal}`;
  return{...common,status:"PRODUCTION_FINALIZATION_MONITORING_ACTIVE",active:true,decision:"MONITOR_PRODUCTION_FINALIZATION_ONLY",finalizationRunId,finalizationRunSeal,planSeal:finalizationPlan.planSeal,activationSeal:finalizationActivation.activationSeal,sourceDecisionId:postProductionDecision.decisionId,targetCohortId,exposureShare,minimumRaces,monitoringMetrics,rollbackTypes,immediateStopOnRollback:true,postFinalizationReviewRequired:true,executorId,startedAt,safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,persistentProductionMutationAllowed:false,productionFinalizationAllowed:false,productionFinalizationCommitAllowed:false,monitoringOnly:true,cohortLocked:true,fullExposureLocked:true,monitoringMetricsLocked:true,rollbackConditionsLocked:true,immediateStopOnRollbackBreach:true,postFinalizationReviewRequired:true,runMutationForbidden:true}};
}

export function verifyThickProductionFinalizationRun(finalizationRun,finalizationActivation,finalizationPlan,postProductionDecision,postProductionReview,activationMonitor,activationRun,activation,productionActivationPlan,postFinalDecision,postFinalReview,finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg){
  if(finalizationRun?.status!=="PRODUCTION_FINALIZATION_MONITORING_ACTIVE")return{status:"PRODUCTION_FINALIZATION_ACTIVE_RUN_REQUIRED",valid:false};
  const source=verifyThickProductionFinalizationActivationReview(finalizationActivation,finalizationPlan,postProductionDecision,postProductionReview,activationMonitor,activationRun,activation,productionActivationPlan,postFinalDecision,postFinalReview,finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!source.valid)return{status:source.status||"PRODUCTION_FINALIZATION_ACTIVATION_REQUIRED",valid:false,sourceVerification:source};
  if(finalizationRun?.finalizationActivationId!==finalizationActivation?.finalizationActivationId||finalizationRun?.activationSeal!==finalizationActivation?.activationSeal||finalizationRun?.finalizationPlanId!==finalizationPlan?.finalizationPlanId||finalizationRun?.planSeal!==finalizationPlan?.planSeal)return{status:"PRODUCTION_FINALIZATION_RUN_CHAIN_MISMATCH",valid:false};
  const payload={finalizationPlanId:finalizationPlan.finalizationPlanId,planSeal:finalizationPlan.planSeal,finalizationActivationId:finalizationActivation.finalizationActivationId,activationSeal:finalizationActivation.activationSeal,sourceDecisionId:postProductionDecision.decisionId,sourceDecisionSeal:postProductionDecision.decisionSeal,targetCohortId:finalizationRun.targetCohortId||"",exposureShare:Number(finalizationRun.exposureShare),minimumRaces:Number(finalizationRun.minimumRaces),monitoringMetrics:[...(finalizationRun.monitoringMetrics||[])].map(String).sort(),rollbackTypes:[...(finalizationRun.rollbackTypes||[])].map(String).sort(),immediateStopOnRollback:finalizationRun.immediateStopOnRollback===true,postFinalizationReviewRequired:finalizationRun.postFinalizationReviewRequired===true,executorId:finalizationRun.executorId||"",startedAt:finalizationRun.startedAt||""};
  const actual=simpleSealHash(JSON.stringify(stableSealValue(payload)));
  return{status:actual===finalizationRun.finalizationRunSeal?"PRODUCTION_FINALIZATION_RUN_VERIFIED":"SEAL_MISMATCH",valid:actual===finalizationRun.finalizationRunSeal,expectedSeal:finalizationRun.finalizationRunSeal,actualSeal:actual};
}


export function evaluateThickProductionFinalizationMonitoring(finalizationRun,finalizationActivation,finalizationPlan,postProductionDecision,postProductionReview,activationMonitor,activationRun,activation,productionActivationPlan,postFinalDecision,postFinalReview,finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg,observation={}){
  const common={version:"THICK-PRODUCTION-FINALIZATION-MONITOR-1.0",researchOnly:true,autoPromotionAllowed:false,productionWriteAllowed:false,persistentProductionMutationAllowed:false,finalizationRunId:finalizationRun?.finalizationRunId||null,finalizationActivationId:finalizationActivation?.finalizationActivationId||null,finalizationPlanId:finalizationPlan?.finalizationPlanId||null,sourceDecisionId:postProductionDecision?.decisionId||null};
  const source=verifyThickProductionFinalizationRun(finalizationRun,finalizationActivation,finalizationPlan,postProductionDecision,postProductionReview,activationMonitor,activationRun,activation,productionActivationPlan,postFinalDecision,postFinalReview,finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!source.valid)return{...common,status:source.status||"PRODUCTION_FINALIZATION_ACTIVE_RUN_REQUIRED",active:false,decision:"BLOCK",sourceVerification:source};
  const cohortId=String(observation?.cohortId||"").trim();
  if(!cohortId||cohortId!==String(finalizationRun?.targetCohortId||""))return{...common,status:"PRODUCTION_FINALIZATION_MONITOR_COHORT_MISMATCH",active:false,decision:"BLOCK",expectedCohortId:finalizationRun?.targetCohortId||null,cohortId:cohortId||null};
  const exposureShare=Number(observation?.exposureShare??finalizationRun?.exposureShare);
  if(!Number.isFinite(exposureShare)||exposureShare!==1||exposureShare!==Number(finalizationRun?.exposureShare))return{...common,status:"PRODUCTION_FINALIZATION_MONITOR_EXPOSURE_MISMATCH",active:false,decision:"BLOCK",expectedExposureShare:1,exposureShare:Number.isFinite(exposureShare)?exposureShare:null};
  const races=Number(observation?.races);
  if(!Number.isInteger(races)||races<0)return{...common,status:"PRODUCTION_FINALIZATION_MONITOR_RACE_COUNT_INVALID",active:false,decision:"HOLD"};
  const requiredMetrics=[...(finalizationRun?.monitoringMetrics||[])].map(String).sort();
  const metrics=observation?.metrics&&typeof observation.metrics==="object"?observation.metrics:{};
  const missingMetrics=requiredMetrics.filter(k=>!Object.prototype.hasOwnProperty.call(metrics,k)||!Number.isFinite(Number(metrics[k])));
  if(missingMetrics.length)return{...common,status:"PRODUCTION_FINALIZATION_MONITORING_EVIDENCE_INCOMPLETE",active:false,decision:"HOLD",missingMetrics};
  const requiredRollbackTypes=[...(finalizationRun?.rollbackTypes||[])].map(String).sort();
  const evaluations=Array.isArray(observation?.rollbackEvaluations)?observation.rollbackEvaluations:[];
  const byType=new Map(evaluations.map(x=>[String(x?.type||""),x]));
  const missingRollbackEvaluations=requiredRollbackTypes.filter(t=>!byType.has(t)||typeof byType.get(t)?.breached!=="boolean");
  if(missingRollbackEvaluations.length)return{...common,status:"PRODUCTION_FINALIZATION_ROLLBACK_EVALUATION_INCOMPLETE",active:false,decision:"HOLD",missingRollbackEvaluations};
  const breaches=requiredRollbackTypes.filter(t=>byType.get(t)?.breached===true).map(t=>({type:t,evidence:byType.get(t)?.evidence??null,note:String(byType.get(t)?.note||"")}));
  const observedAt=String(observation?.observedAt||new Date().toISOString());
  const payload={finalizationRunId:finalizationRun.finalizationRunId,finalizationRunSeal:finalizationRun.finalizationRunSeal,cohortId,exposureShare,races,metrics:Object.fromEntries(requiredMetrics.map(k=>[k,Number(metrics[k])])),rollbackEvaluations:requiredRollbackTypes.map(t=>({type:t,breached:byType.get(t).breached===true,evidence:byType.get(t)?.evidence??null,note:String(byType.get(t)?.note||"")})),observedAt};
  const monitorSeal=simpleSealHash(JSON.stringify(stableSealValue(payload)));
  if(breaches.length)return{...common,status:"PRODUCTION_FINALIZATION_ROLLBACK_REQUIRED",active:false,decision:"STOP_AND_ROLLBACK",monitorSeal,finalizationRunSeal:finalizationRun.finalizationRunSeal,cohortId,exposureShare,races,minimumRaces:finalizationRun.minimumRaces,metrics:payload.metrics,rollbackEvaluations:payload.rollbackEvaluations,breaches,observedAt,safeguards:{autoPromotionAllowed:false,productionWriteAllowed:false,persistentProductionMutationAllowed:false,productionFinalizationCommitAllowed:false,continuationAllowed:false,rollbackRequired:true,immediateStop:true,postFinalizationReviewRequired:true,monitorMutationForbidden:true}};
  if(races<Number(finalizationRun?.minimumRaces||0))return{...common,status:"PRODUCTION_FINALIZATION_MONITORING_CONTINUES",active:true,decision:"CONTINUE_PRODUCTION_FINALIZATION_MONITORING_ONLY",monitorSeal,finalizationRunSeal:finalizationRun.finalizationRunSeal,cohortId,exposureShare,races,minimumRaces:finalizationRun.minimumRaces,metrics:payload.metrics,rollbackEvaluations:payload.rollbackEvaluations,breaches:[],observedAt,safeguards:{autoPromotionAllowed:false,productionWriteAllowed:false,persistentProductionMutationAllowed:false,productionFinalizationCommitAllowed:false,continuationAllowed:true,rollbackRequired:false,postFinalizationReviewRequired:true,monitorMutationForbidden:true}};
  return{...common,status:"PRODUCTION_FINALIZATION_MINIMUM_SAMPLE_REACHED_NO_BREACH",active:false,decision:"RETAIN_FOR_POST_PRODUCTION_FINALIZATION_REVIEW_ONLY",monitorSeal,finalizationRunSeal:finalizationRun.finalizationRunSeal,cohortId,exposureShare,races,minimumRaces:finalizationRun.minimumRaces,metrics:payload.metrics,rollbackEvaluations:payload.rollbackEvaluations,breaches:[],observedAt,safeguards:{autoPromotionAllowed:false,productionWriteAllowed:false,persistentProductionMutationAllowed:false,productionFinalizationCommitAllowed:false,automaticProductionFinalizationCommitAllowed:false,postFinalizationReviewRequired:true,manualPostFinalizationReviewRequired:true,rollbackRequired:false,monitorMutationForbidden:true}};
}

export function verifyThickProductionFinalizationMonitoring(finalizationMonitor,finalizationRun,finalizationActivation,finalizationPlan,postProductionDecision,postProductionReview,activationMonitor,activationRun,activation,productionActivationPlan,postFinalDecision,postFinalReview,finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg){
  const allowed=new Set(["PRODUCTION_FINALIZATION_MONITORING_CONTINUES","PRODUCTION_FINALIZATION_ROLLBACK_REQUIRED","PRODUCTION_FINALIZATION_MINIMUM_SAMPLE_REACHED_NO_BREACH"]);
  if(!allowed.has(finalizationMonitor?.status))return{status:"PRODUCTION_FINALIZATION_MONITOR_REQUIRED",valid:false};
  const source=verifyThickProductionFinalizationRun(finalizationRun,finalizationActivation,finalizationPlan,postProductionDecision,postProductionReview,activationMonitor,activationRun,activation,productionActivationPlan,postFinalDecision,postFinalReview,finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!source.valid)return{status:source.status||"PRODUCTION_FINALIZATION_ACTIVE_RUN_REQUIRED",valid:false};
  if(finalizationMonitor?.finalizationRunId!==finalizationRun?.finalizationRunId||finalizationMonitor?.finalizationRunSeal!==finalizationRun?.finalizationRunSeal)return{status:"PRODUCTION_FINALIZATION_MONITOR_CHAIN_MISMATCH",valid:false};
  const requiredMetrics=[...(finalizationRun?.monitoringMetrics||[])].map(String).sort();
  const requiredRollbackTypes=[...(finalizationRun?.rollbackTypes||[])].map(String).sort();
  const metrics=finalizationMonitor?.metrics&&typeof finalizationMonitor.metrics==="object"?finalizationMonitor.metrics:{};
  const evaluations=Array.isArray(finalizationMonitor?.rollbackEvaluations)?finalizationMonitor.rollbackEvaluations:[];
  const byType=new Map(evaluations.map(x=>[String(x?.type||""),x]));
  if(requiredMetrics.some(k=>!Object.prototype.hasOwnProperty.call(metrics,k))||requiredRollbackTypes.some(t=>!byType.has(t)))return{status:"PRODUCTION_FINALIZATION_MONITOR_EVIDENCE_INCOMPLETE",valid:false};
  const payload={finalizationRunId:finalizationRun.finalizationRunId,finalizationRunSeal:finalizationRun.finalizationRunSeal,cohortId:finalizationMonitor.cohortId||"",exposureShare:Number(finalizationMonitor.exposureShare),races:Number(finalizationMonitor.races),metrics:Object.fromEntries(requiredMetrics.map(k=>[k,Number(metrics[k])])),rollbackEvaluations:requiredRollbackTypes.map(t=>({type:t,breached:byType.get(t)?.breached===true,evidence:byType.get(t)?.evidence??null,note:String(byType.get(t)?.note||"")})),observedAt:finalizationMonitor.observedAt||""};
  const actual=simpleSealHash(JSON.stringify(stableSealValue(payload)));
  return{status:actual===finalizationMonitor.monitorSeal?"PRODUCTION_FINALIZATION_MONITOR_VERIFIED":"SEAL_MISMATCH",valid:actual===finalizationMonitor.monitorSeal,expectedSeal:finalizationMonitor.monitorSeal,actualSeal:actual};
}

export function buildThickPostProductionFinalizationReviewPackage(finalizationMonitor,finalizationRun,finalizationActivation,finalizationPlan,postProductionDecision,postProductionReview,activationMonitor,activationRun,activation,productionActivationPlan,postFinalDecision,postFinalReview,finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg,review={}){
  const common={version:"THICK-POST-PRODUCTION-FINALIZATION-REVIEW-1.0",researchOnly:true,productionWriteAllowed:false,autoPromotionAllowed:false,persistentProductionMutationAllowed:false,productionFinalizationCommitAllowed:false,finalizationRunId:finalizationRun?.finalizationRunId||null,finalizationPlanId:finalizationPlan?.finalizationPlanId||null};
  const source=verifyThickProductionFinalizationMonitoring(finalizationMonitor,finalizationRun,finalizationActivation,finalizationPlan,postProductionDecision,postProductionReview,activationMonitor,activationRun,activation,productionActivationPlan,postFinalDecision,postFinalReview,finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!source.valid)return{...common,status:"POST_PRODUCTION_FINALIZATION_SOURCE_INVALID",decision:"BLOCK",sourceVerification:source};
  if(finalizationMonitor?.status!=="PRODUCTION_FINALIZATION_MINIMUM_SAMPLE_REACHED_NO_BREACH"||finalizationMonitor?.decision!=="RETAIN_FOR_POST_PRODUCTION_FINALIZATION_REVIEW_ONLY")return{...common,status:"POST_PRODUCTION_FINALIZATION_COMPLETED_MONITOR_REQUIRED",decision:"BLOCK"};
  const requiredMetrics=[...(finalizationRun?.monitoringMetrics||[])].map(String).sort();
  const summaryMetrics=review?.summaryMetrics&&typeof review.summaryMetrics==="object"?review.summaryMetrics:{};
  const baselineMetrics=review?.baselineMetrics&&typeof review.baselineMetrics==="object"?review.baselineMetrics:{};
  const missingSummary=requiredMetrics.filter(k=>!Number.isFinite(Number(summaryMetrics[k])));
  const missingBaseline=requiredMetrics.filter(k=>!Number.isFinite(Number(baselineMetrics[k])));
  if(missingSummary.length||missingBaseline.length)return{...common,status:"POST_PRODUCTION_FINALIZATION_REVIEW_INCOMPLETE",decision:"HOLD",missingSummaryMetrics:missingSummary,missingBaselineMetrics:missingBaseline};
  const counterEvidence=Array.isArray(review?.counterEvidence)?review.counterEvidence.filter(Boolean):[];
  if(!counterEvidence.length)return{...common,status:"POST_PRODUCTION_FINALIZATION_COUNTER_EVIDENCE_REQUIRED",decision:"HOLD"};
  if(!Array.isArray(review?.unresolvedIssues))return{...common,status:"POST_PRODUCTION_FINALIZATION_UNRESOLVED_ISSUES_REQUIRED",decision:"HOLD"};
  const unresolvedIssues=review.unresolvedIssues.filter(Boolean);
  const rollbackNonTriggerEvidence=Array.isArray(review?.rollbackNonTriggerEvidence)?review.rollbackNonTriggerEvidence.filter(Boolean):[];
  const requiredRollbackTypes=[...(finalizationRun?.rollbackTypes||[])].map(String).sort();
  const covered=new Set(rollbackNonTriggerEvidence.map(x=>String(x?.type||"")));
  const missingRollbackEvidence=requiredRollbackTypes.filter(t=>!covered.has(t));
  if(missingRollbackEvidence.length)return{...common,status:"POST_PRODUCTION_FINALIZATION_ROLLBACK_EVIDENCE_INCOMPLETE",decision:"HOLD",missingRollbackEvidence};
  const reviewerId=String(review?.reviewerId||"").trim();
  if(!reviewerId)return{...common,status:"POST_PRODUCTION_FINALIZATION_REVIEWER_REQUIRED",decision:"HOLD"};
  const reviewedAt=String(review?.reviewedAt||"").trim();
  const deltas=Object.fromEntries(requiredMetrics.map(k=>[k,Number(summaryMetrics[k])-Number(baselineMetrics[k])]));
  const payload={finalizationRunId:finalizationRun.finalizationRunId,finalizationRunSeal:finalizationRun.finalizationRunSeal,monitorSeal:finalizationMonitor.monitorSeal,finalizationActivationId:finalizationActivation.finalizationActivationId,finalizationActivationSeal:finalizationActivation.finalizationActivationSeal,finalizationPlanId:finalizationPlan.finalizationPlanId,finalizationPlanSeal:finalizationPlan.finalizationPlanSeal,targetCohortId:finalizationRun.targetCohortId,exposureShare:finalizationRun.exposureShare,races:finalizationMonitor.races,minimumRaces:finalizationRun.minimumRaces,requiredMetrics,summaryMetrics:Object.fromEntries(requiredMetrics.map(k=>[k,Number(summaryMetrics[k])])),baselineMetrics:Object.fromEntries(requiredMetrics.map(k=>[k,Number(baselineMetrics[k])])),deltas,counterEvidence,unresolvedIssues,rollbackNonTriggerEvidence,requiredRollbackTypes,reviewerId,reviewedAt};
  const reviewSeal=simpleSealHash(JSON.stringify(stableSealValue(payload)));
  const postFinalizationReviewId=`THICK-POST-PRODUCTION-FINALIZATION-${reviewSeal}`;
  return{...common,status:"POST_PRODUCTION_FINALIZATION_REVIEW_PACKAGE_READY",decision:"MANUAL_POST_PRODUCTION_FINALIZATION_DECISION_ONLY",postFinalizationReviewId,reviewSeal,reviewerId,reviewedAt,finalizationRunSeal:finalizationRun.finalizationRunSeal,monitorSeal:finalizationMonitor.monitorSeal,targetCohortId:finalizationRun.targetCohortId,exposureShare:finalizationRun.exposureShare,races:finalizationMonitor.races,minimumRaces:finalizationRun.minimumRaces,requiredMetrics,summaryMetrics:payload.summaryMetrics,baselineMetrics:payload.baselineMetrics,deltas,counterEvidence,unresolvedIssues,rollbackNonTriggerEvidence,requiredRollbackTypes,safeguards:{productionWriteAllowed:false,autoPromotionAllowed:false,persistentProductionMutationAllowed:false,productionFinalizationCommitAllowed:false,automaticProductionFinalizationCommitAllowed:false,manualDecisionRequired:true,counterEvidenceRequired:true,unresolvedIssuesRequired:true,rollbackEvidenceRequired:true,reviewMutationForbidden:true}};
}

export function verifyThickPostProductionFinalizationReviewPackage(postFinalizationReview,finalizationMonitor,finalizationRun,finalizationActivation,finalizationPlan,postProductionDecision,postProductionReview,activationMonitor,activationRun,activation,productionActivationPlan,postFinalDecision,postFinalReview,finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg){
  if(postFinalizationReview?.status!=="POST_PRODUCTION_FINALIZATION_REVIEW_PACKAGE_READY")return{status:"POST_PRODUCTION_FINALIZATION_REVIEW_PACKAGE_REQUIRED",valid:false};
  const source=verifyThickProductionFinalizationMonitoring(finalizationMonitor,finalizationRun,finalizationActivation,finalizationPlan,postProductionDecision,postProductionReview,activationMonitor,activationRun,activation,productionActivationPlan,postFinalDecision,postFinalReview,finalMonitor,finalRun,finalActivation,finalPlan,postStagedDecision,postReview,stagedMonitor,stagedRun,stagedActivation,stagedPlan,postCanaryDecision,reviewPackage,monitor,run,activationDecision,canaryPlan,finalDecision,pkg);
  if(!source.valid)return{status:"POST_PRODUCTION_FINALIZATION_SOURCE_INVALID",valid:false,sourceVerification:source};
  if(postFinalizationReview?.finalizationRunId!==finalizationRun?.finalizationRunId||postFinalizationReview?.finalizationRunSeal!==finalizationRun?.finalizationRunSeal||postFinalizationReview?.monitorSeal!==finalizationMonitor?.monitorSeal)return{status:"POST_PRODUCTION_FINALIZATION_CHAIN_MISMATCH",valid:false};
  const requiredMetrics=[...(postFinalizationReview.requiredMetrics||[])].map(String).sort();
  const requiredRollbackTypes=[...(postFinalizationReview.requiredRollbackTypes||[])].map(String).sort();
  const payload={finalizationRunId:finalizationRun.finalizationRunId,finalizationRunSeal:finalizationRun.finalizationRunSeal,monitorSeal:finalizationMonitor.monitorSeal,finalizationActivationId:finalizationActivation.finalizationActivationId,finalizationActivationSeal:finalizationActivation.finalizationActivationSeal,finalizationPlanId:finalizationPlan.finalizationPlanId,finalizationPlanSeal:finalizationPlan.finalizationPlanSeal,targetCohortId:finalizationRun.targetCohortId,exposureShare:finalizationRun.exposureShare,races:postFinalizationReview.races,minimumRaces:finalizationRun.minimumRaces,requiredMetrics,summaryMetrics:postFinalizationReview.summaryMetrics||{},baselineMetrics:postFinalizationReview.baselineMetrics||{},deltas:postFinalizationReview.deltas||{},counterEvidence:postFinalizationReview.counterEvidence||[],unresolvedIssues:postFinalizationReview.unresolvedIssues||[],rollbackNonTriggerEvidence:postFinalizationReview.rollbackNonTriggerEvidence||[],requiredRollbackTypes,reviewerId:postFinalizationReview.reviewerId||"",reviewedAt:postFinalizationReview.reviewedAt||""};
  const actual=simpleSealHash(JSON.stringify(stableSealValue(payload)));
  return{status:actual===postFinalizationReview.reviewSeal?"POST_PRODUCTION_FINALIZATION_REVIEW_VERIFIED":"SEAL_MISMATCH",valid:actual===postFinalizationReview.reviewSeal,expectedSeal:postFinalizationReview.reviewSeal,actualSeal:actual};
}
