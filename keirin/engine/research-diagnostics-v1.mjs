import crypto from "node:crypto";

export const SECOND_RANK_TRACE_SCHEMA="WINNER_CONDITIONED_SECOND_RANK_TRACE_V1";
export const RECOMMENDATION_TRACE_SCHEMA="KEIRIN_RECOMMENDATION_TRACE_V1";
export const DUAL_SHADOW_SCHEMA="RECOMMENDATION_DUAL_SHADOW_V1";
export const DUAL_SHADOW_RESULT_SCHEMA="RECOMMENDATION_DUAL_SHADOW_RESULT_V1";
export const DUAL_SHADOW_CONFIG=Object.freeze({
  configVersion:"RECOMMENDATION_DUAL_SHADOW_CONFIG_V1_PROVISIONAL",
  exploratory:true,
  buckets:Object.freeze({
    mainRatioHigh:0.6,
    mainRatioLow:0.3,
    fewTicketsMax:10,
    highCoverageTicketsMin:11,
    worldGapSmallMax:0.03,
    worldGapLargeMin:0.07,
    terminalGapSeparatedMin:0.03,
    secondaryRelativeStrongMin:0.85,
    distributedWorldEntropyMin:0.65,
    nearFourWorldMin:4
  }),
  levelBoundaries:Object.freeze({high:0.6,medium:0.4})
});
export const RECOMMENDATION_CONFIG=Object.freeze({
  configVersion:"KEIRIN_RECOMMENDATION_FILTER_CONFIG_V1",
  maxRecommendedScenarioCount:3,
  maxRecommendedTickets:15,
  totalCapNearLimit:13,
  maxUnknownEvidenceRatio:0.5,
  maxUnresolvedBranchRatio:0.35,
  minimumSelectedScenarioCoverage:0.5
});

const n=value=>Number.isFinite(Number(value))?Number(value):null;
const key=row=>(row?.order||[]).map(Number).slice(0,3).join("-");
const stable=value=>Array.isArray(value)?`[${value.map(stable).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${stable(value[k])}`).join(",")}}`:JSON.stringify(value);
const hash=value=>crypto.createHash("sha256").update(stable(value)).digest("hex");
const actualCompare=(a,b)=>(n(b.terminalScore)??-Infinity)-(n(a.terminalScore)??-Infinity)||(n(b.probability)??-Infinity)-(n(a.probability)??-Infinity)||key(a).localeCompare(key(b),"en");

export function buildWinnerConditionedSecondRankTrace({race,prediction,purchase,parameterHash=null,generatedAt=new Date().toISOString()}={}){
  const terminals=[...(purchase?.terminals||[])].filter(row=>(n(row.probability)??0)>0).sort(actualCompare);
  const maxProbability=Math.max(0,...terminals.map(row=>n(row.probability)??0));
  const winners=[];
  for(const winnerRiderId of [...new Set(terminals.map(row=>Number(row.order?.[0])).filter(Number.isFinite))].sort((a,b)=>a-b)){
    const rows=terminals.filter(row=>Number(row.order?.[0])===winnerRiderId),bySecond=new Map();
    for(const row of rows){const second=Number(row.order?.[1]);if(!Number.isFinite(second))continue;const current=bySecond.get(second);if(!current||actualCompare(row,current)<0)bySecond.set(second,row);}
    const ranked=[...bySecond.values()].sort(actualCompare),rankedSecondCandidateIds=ranked.map(row=>Number(row.order[1]));
    winners.push({winnerRiderId,winnerConditionedCandidateSetSize:ranked.length,rankedSecondCandidateIds,candidates:ranked.map((row,index)=>candidate(row,index,ranked,maxProbability))});
  }
  const trace={schemaVersion:SECOND_RANK_TRACE_SCHEMA,raceKey:race?.raceKey||race?.id||null,capturedAt:generatedAt,predictionHash:null,predictionVersion:prediction?.predictionVersion||null,purchaseVersion:purchase?.purchaseVersion||null,parameterHash,resultDataUsed:false,rankingFormula:"terminalScore=relativeProbability*0.65+evidenceScore*0.35; probability; order",winnerCount:winners.length,winners};
  trace.inputHash=hash({raceKey:trace.raceKey,predictionVersion:trace.predictionVersion,purchaseVersion:trace.purchaseVersion,winners:winners.map(x=>({winner:x.winnerRiderId,seconds:x.rankedSecondCandidateIds}))});
  trace.traceHash=hash({...trace,traceHash:undefined});return trace;
}

function candidate(row,index,ranked,maxProbability){
  const dominant=[...(row.branchContributions||[])].sort((a,b)=>(n(b.probability)??0)-(n(a.probability)??0)||String(a.branchId).localeCompare(String(b.branchId),"en"))[0]||null;
  const ratios=row.decisionRatios||dominant?.decisionRatios||{},positions=row.positionScores||dominant?.positionScores||{},evidence=row.positionEvidence||dominant?.positionEvidence||{};
  const next=ranked[index+1],scoreTie=next&&n(next.terminalScore)===n(row.terminalScore),probTie=scoreTie&&n(next.probability)===n(row.probability);
  const compatibility=row?.conditionalEvaluation?.second||dominant?.conditionalEvaluation?.second||null;
  return{macroScenarioId:row.macroScenarioId||null,eventId:row.eventId||null,branchId:row.dominantBranchId||row.branchId||dominant?.branchId||null,winnerRiderId:Number(row.order?.[0]),secondCandidateRiderId:Number(row.order?.[1]),representativeTerminalId:row.terminalId||key(row),rawTerminalWeightedScore:n(row.probability),normalizationDenominator:maxProbability||null,normalizedProbability:null,normalizedProbabilityReason:"NOT_COMPUTED_SEPARATELY",maxProbability:maxProbability||null,relativeProbability:n(row.relativeProbability),positionScoreFirst:n(positions.first),positionScoreSecond:n(positions.second),positionScoreThird:n(positions.third),positionFit:n(row.positionFit),positionBalance:n(row.positionBalance),firstDecisionRatio:n(ratios.first),secondDecisionRatio:n(ratios.second),thirdDecisionRatio:n(ratios.third),decisionRatioFit:geometric([ratios.first,ratios.second,ratios.third]),positionEvidenceCount:n(row.evidenceCount)??Object.values(evidence).filter(Boolean).length,evidenceScore:n(row.evidenceScore),terminalScore:n(row.terminalScore),fallbackReason:null,compatibilityFactor:null,penaltyReason:null,penaltyValue:null,referenceFields:{compatibilityFactor:n(compatibility?.factor),relativeConditionPenalty:n(row.relativeConditionPenalty),purchaseRejectCode:row.purchaseRejectCode||null},finalSortTuple:[n(row.terminalScore),n(row.probability),key(row)],finalRank:index+1,tieBreakReason:probTie?"ORDER_LEXICOGRAPHIC":scoreTie?"NORMALIZED_PROBABILITY":"TERMINAL_SCORE"};
}

function geometric(values){const rows=values.map(n).filter(x=>x!==null&&x>0);return rows.length?Math.pow(rows.reduce((a,b)=>a*b,1),1/rows.length):null;}

export function buildRecommendationTrace({race,prediction,purchase,multiWorldScenario,generatedAt=new Date().toISOString(),enabled=true,config=RECOMMENDATION_CONFIG}={}){
  if(!enabled)return{schemaVersion:RECOMMENDATION_TRACE_SCHEMA,enabled:false,legacyParity:true,configVersion:config.configVersion,resultDataUsed:false};
  const scenarios=multiWorldScenario?.scenarios||[],plan=purchase?.standardPurchasePlan||[],selectedIds=[...new Set(plan.map(x=>x.macroScenarioId).filter(Boolean))];
  const scores=scenarios.map(x=>n(x.relativeScenarioScore)??0),scoreSum=scores.reduce((a,b)=>a+b,0)||1,topScenarioConcentration=Math.max(0,...scores)/scoreSum;
  const ticketsPerScenario=Object.fromEntries(selectedIds.map(id=>[id,plan.filter(x=>x.macroScenarioId===id).length]));
  const axesByScenario=Object.fromEntries(selectedIds.map(id=>[id,[...new Set(plan.filter(x=>x.macroScenarioId===id).map(x=>Number(x.order?.[0])).filter(Number.isFinite))]]));
  const axisCount=new Set(plan.map(x=>Number(x.order?.[0])).filter(Number.isFinite)).size,unexplainedAxisCount=plan.filter(x=>!x.macroScenarioId).length;
  const unresolved=(prediction?.branches||[]).filter(x=>/UNKNOWN|INSUFFICIENT|UNRESOLVED/i.test(`${x?.branchType||""} ${x?.initiativeState||""} ${x?.lineState||""}`)).length;
  const branchCount=(prediction?.branches||[]).length,unresolvedBranchRatio=branchCount?unresolved/branchCount:0;
  const evidenceRows=(purchase?.terminals||[]).filter(x=>x.purchaseStatus==="購入採用"),unknownEvidence=evidenceRows.filter(x=>n(x.evidenceCount)===0).length,unknownEvidenceRatio=evidenceRows.length?unknownEvidence/evidenceRows.length:0;
  const selectedScenarioCoverage=scenarios.length?selectedIds.length/scenarios.length:0,totalTickets=plan.length,totalCap=Number(multiWorldScenario?.purchase?.config?.totalCap||config.maxRecommendedTickets),perScenarioCapHit=Object.entries(ticketsPerScenario).some(([id,count])=>{const rank=scenarios.findIndex(x=>x.macroScenarioId===id);const cap=rank===0?6:rank===1?4:3;return count>=cap;});
  const canPurchase=purchase?.purchaseEligibility?.canPurchase!==false&&!purchase?.noBet&&totalTickets>0,positive=[],negative=[];
  if(selectedIds.length>=2)positive.push("MULTI_SCENARIO_COVERAGE_GOOD");
  if(topScenarioConcentration>=0.45)positive.push("MAIN_SCENARIO_CONCENTRATED");
  if(unknownEvidenceRatio<=config.maxUnknownEvidenceRatio)positive.push("EVENT_EVIDENCE_SUFFICIENT");
  if(totalTickets>0&&totalTickets<config.totalCapNearLimit)positive.push("TERMINAL_SET_COMPACT");
  if(selectedScenarioCoverage<config.minimumSelectedScenarioCoverage)negative.push("SCENARIO_COVERAGE_LOW");
  if(unknownEvidenceRatio>config.maxUnknownEvidenceRatio)negative.push("UNKNOWN_EVIDENCE_HIGH");
  if(unresolvedBranchRatio>config.maxUnresolvedBranchRatio)negative.push("UNRESOLVED_BRANCH");
  if(totalTickets>=config.totalCapNearLimit)negative.push("TOTAL_CAP_NEAR_LIMIT");
  if(totalTickets>totalCap||perScenarioCapHit&&totalTickets===totalCap)negative.push("TERMINAL_SET_EXPANDED");
  if(scenarios.length>config.maxRecommendedScenarioCount&&topScenarioConcentration<0.45)negative.push("SCENARIO_TOO_DIFFUSE");
  let recommendationClass="RECOMMENDED";
  if(!canPurchase)recommendationClass=purchase?.purchaseEligibility?.canPurchase===false?"PURCHASE_INELIGIBLE":"SKIP_RECOMMENDED";
  else if(negative.includes("UNRESOLVED_BRANCH")||negative.includes("UNKNOWN_EVIDENCE_HIGH")||negative.includes("TERMINAL_SET_EXPANDED"))recommendationClass="SKIP_RECOMMENDED";
  else if(negative.length)recommendationClass="PURCHASEABLE_NOT_RECOMMENDED";
  const trace={schemaVersion:RECOMMENDATION_TRACE_SCHEMA,enabled:true,legacyParity:true,raceKey:race?.raceKey||race?.id||null,predictionHash:null,capturedAt:generatedAt,resultDataUsed:false,configVersion:config.configVersion,config,macroScenarioCount:scenarios.length,selectedScenarioCount:selectedIds.length,scenarioScores:scenarios.map(x=>({macroScenarioId:x.macroScenarioId,relativeScenarioScore:n(x.relativeScenarioScore),eventCount:(x.events||[]).length})),eventCount:scenarios.reduce((s,x)=>s+(x.events||[]).length,0),terminalCount:(purchase?.terminals||[]).length,ticketsPerScenario,totalTickets,axisCount,axesByScenario,axisExplainedByScenario:unexplainedAxisCount===0,unexplainedAxisCount,topScenarioConcentration,selectedScenarioCoverage,unresolvedBranchCount:unresolved,unknownEvidenceCount:unknownEvidence,perScenarioCapHit,totalCapHit:totalTickets>=totalCap,recommendationClass,recommendationScore:null,reasonCodes:[...positive,...negative],positiveReasons:positive,negativeReasons:negative};
  trace.traceHash=hash({...trace,traceHash:undefined});return trace;
}

export function buildDualRecommendationShadow({race,prediction,purchase,multiWorldScenario,generatedAt=new Date().toISOString(),enabled=true,config=DUAL_SHADOW_CONFIG}={}){
  if(!enabled)return{schemaVersion:DUAL_SHADOW_SCHEMA,enabled:false,shadowOnly:true,productionRecommendationChanged:false,purchaseChanged:false,resultDataUsed:false,configVersion:config.configVersion};
  const scenarios=[...(multiWorldScenario?.scenarios||[])].sort((a,b)=>(n(a.scenarioRank)??Infinity)-(n(b.scenarioRank)??Infinity)||(n(b.relativeScenarioScore)??0)-(n(a.relativeScenarioScore)??0)||String(a.macroScenarioId||"").localeCompare(String(b.macroScenarioId||""),"en"));
  const plan=[...(purchase?.standardPurchasePlan||[])],scenarioById=new Map(scenarios.map((row,index)=>[row.macroScenarioId,{...row,resolvedRank:n(row.scenarioRank)??index+1}]));
  const selectedIds=[...new Set(plan.map(row=>row.macroScenarioId).filter(Boolean))],counts=Object.fromEntries(selectedIds.map(id=>[id,plan.filter(row=>row.macroScenarioId===id).length]));
  const rank1=scenarios[0]||null,rank2=scenarios[1]||null,rank1Score=n(rank1?.relativeScenarioScore),rank2Score=n(rank2?.relativeScenarioScore),worldGap=rank1Score!==null&&rank2Score!==null?rank1Score-rank2Score:null;
  const mainId=rank1?.macroScenarioId||null,mainTickets=mainId?plan.filter(row=>row.macroScenarioId===mainId):[],mainRatio=plan.length?mainTickets.length/plan.length:null;
  const secondaryIds=selectedIds.filter(id=>(scenarioById.get(id)?.resolvedRank??Infinity)===2),breakIds=selectedIds.filter(id=>(scenarioById.get(id)?.resolvedRank??Infinity)>=3);
  const provenanceFields=["macroScenarioId","eventId","terminalId"],mainProvenanceCompleteness=mainTickets.length?mainTickets.reduce((sum,row)=>sum+provenanceFields.filter(field=>row?.[field]).length,0)/(mainTickets.length*provenanceFields.length):null;
  const mainScores=mainTickets.map(row=>n(row.terminalRelativeScore)??n(row.terminalScore)??n(row.probability)).filter(x=>x!==null).sort((a,b)=>b-a),mainTerminalTopGap=mainScores.length>=2?mainScores[0]-mainScores[1]:mainScores.length===1?null:null;
  const distribution=selectedIds.map(id=>counts[id]||0),worldTicketEntropyNormalized=normalizedEntropy(distribution),totalCap=n(multiWorldScenario?.purchase?.config?.totalCap),totalCapContact=totalCap!==null&&plan.length>=totalCap;
  const secondaryRelativeStrength=rank1Score!==null&&rank1Score>0&&rank2Score!==null?rank2Score/rank1Score:null;
  const rawFeatures={generatedWorldCount:scenarios.length,purchaseWorldCount:selectedIds.length,totalTickets:plan.length,mainTicketCount:mainTickets.length,mainRatio,mainProvenanceCompleteness,singleWorldConcentrated:selectedIds.length===1,rank1WorldScore:rank1Score,rank2WorldScore:rank2Score,rank1Rank2ScoreGap:worldGap,mainTerminalTopGap,secondaryActive:secondaryIds.length>0,breakActive:breakIds.length>0,secondaryTicketCount:secondaryIds.reduce((sum,id)=>sum+(counts[id]||0),0),breakTicketCount:breakIds.reduce((sum,id)=>sum+(counts[id]||0),0),worldTicketCounts:counts,worldTicketEntropyNormalized,totalCap,totalCapContact,secondaryRelativeStrength};
  const missing=[];if(!scenarios.length)missing.push("WORLD_STRUCTURE_MISSING");if(!plan.length)missing.push("CANONICAL_PURCHASE_PLAN_MISSING");if(plan.length&&mainProvenanceCompleteness===null)missing.push("MAIN_PROVENANCE_MISSING");if(rank1Score===null)missing.push("RANK1_WORLD_SCORE_MISSING");
  const dataQuality={status:missing.length?"INSUFFICIENT":"COMPLETE",missingFeatures:missing,featureCount:Object.keys(rawFeatures).length,availableFeatureCount:Object.values(rawFeatures).filter(value=>value!==null&&value!==undefined).length};
  const buckets={mainRatio:bucketMainRatio(mainRatio,config.buckets),totalTickets:plan.length<=config.buckets.fewTicketsMax?"FEW":plan.length>=config.buckets.highCoverageTicketsMin?"HIGH_COVERAGE":"MEDIUM",purchaseWorldCount:selectedIds.length===1?"ONE":selectedIds.length===4?"FOUR":selectedIds.length>=5?"FIVE_PLUS":"TWO_TO_THREE",worldScoreGap:bucketGap(worldGap,config.buckets),mainTerminalTopGap:mainTerminalTopGap===null?"INSUFFICIENT_OR_SINGLE":mainTerminalTopGap>=config.buckets.terminalGapSeparatedMin?"SEPARATED":"CLOSE",secondaryRelativeStrength:secondaryRelativeStrength===null?"NOT_APPLICABLE_SINGLE_WORLD":secondaryRelativeStrength>=config.buckets.secondaryRelativeStrongMin?"STRONG":"WEAK_OR_MODERATE",worldTicketDistribution:worldTicketEntropyNormalized===null?"NOT_APPLICABLE_SINGLE_WORLD":worldTicketEntropyNormalized>=config.buckets.distributedWorldEntropyMin?"DISTRIBUTED":"CONCENTRATED"};
  const standardReasons=[];
  if(mainProvenanceCompleteness===1)standardReasons.push("MAIN_PROVENANCE_COMPLETE");
  if(buckets.mainRatio==="HIGH")standardReasons.push("MAIN_RATIO_HIGH");
  if(rawFeatures.singleWorldConcentrated)standardReasons.push("SINGLE_WORLD_CONCENTRATED");
  if(buckets.totalTickets==="FEW")standardReasons.push("FEW_TICKET_STRUCTURE");
  if(buckets.worldScoreGap==="MEDIUM"||buckets.worldScoreGap==="LARGE"||buckets.worldScoreGap==="NOT_APPLICABLE_SINGLE_WORLD")standardReasons.push("WORLD_SCORE_SEPARATED");
  if(buckets.mainTerminalTopGap==="SEPARATED")standardReasons.push("MAIN_TERMINAL_SEPARATED");
  const highReasons=[];
  if(selectedIds.length>=2&&buckets.worldTicketDistribution==="DISTRIBUTED")highReasons.push("MULTI_WORLD_DISTRIBUTED");
  if(selectedIds.length>=config.buckets.nearFourWorldMin)highReasons.push("FOUR_WORLD_COVERAGE");
  if(rawFeatures.secondaryActive)highReasons.push("SECONDARY_ACTIVE");
  if(rawFeatures.breakActive)highReasons.push("BREAK_ACTIVE");
  if(buckets.totalTickets==="HIGH_COVERAGE")highReasons.push("HIGH_TICKET_COVERAGE");
  if(totalCapContact)highReasons.push("TOTAL_CAP_CONTACT");
  if(buckets.mainRatio==="MEDIUM")highReasons.push("MAIN_RATIO_BALANCED");
  if(buckets.worldScoreGap==="SMALL")highReasons.push("WORLD_SCORE_DENSE");
  if(buckets.secondaryRelativeStrength==="STRONG")highReasons.push("SECONDARY_RELATIVE_STRENGTH");
  const standard=shadowView({rawFeatures,buckets,matchedReasons:standardReasons,signalCount:6,dataQuality,config}),highPayout=shadowView({rawFeatures,buckets,matchedReasons:highReasons,signalCount:9,dataQuality,config});
  const trace={schemaVersion:DUAL_SHADOW_SCHEMA,enabled:true,shadowOnly:true,productionRecommendationChanged:false,purchaseChanged:false,raceKey:race?.raceKey||race?.id||null,predictionHash:null,predictionHashLinkStatus:"BOUND_BY_MANIFEST_AFTER_SEAL",sealedAt:null,featureTimestamp:generatedAt,capturedAt:generatedAt,resultDataUsed:false,configVersion:config.configVersion,config:{...config},standardHitShadow:standard,highPayoutOpportunityShadow:highPayout};
  trace.inputHash=hash({raceKey:trace.raceKey,rawFeatures,configVersion:trace.configVersion});trace.traceHash=hash({...trace,traceHash:undefined});return trace;
}

export function buildDualShadowResultEvaluation({shadow,predictionHash=null,hit=false,payout=null,resultObservedAt=new Date().toISOString()}={}){
  if(shadow?.schemaVersion!==DUAL_SHADOW_SCHEMA||shadow?.resultDataUsed!==false)return{schemaVersion:DUAL_SHADOW_RESULT_SCHEMA,status:"SHADOW_UNAVAILABLE",predictionHash,resultDataUsedOnlyForEvaluation:true};
  const amount=n(payout),outcome={hit:Boolean(hit),payout:amount,manSha:Boolean(hit&&amount!==null&&amount>=10000),payoutAtLeast20000:Boolean(hit&&amount!==null&&amount>=20000),payoutAtLeast30000:Boolean(hit&&amount!==null&&amount>=30000)};
  return{schemaVersion:DUAL_SHADOW_RESULT_SCHEMA,status:"AVAILABLE",predictionHash:predictionHash||shadow.predictionHash||null,resultObservedAt,resultDataUsedOnlyForEvaluation:true,shadowTraceHash:shadow.traceHash||null,standardHitShadow:{shadowLevel:shadow.standardHitShadow?.shadowLevel||"INSUFFICIENT",hit:outcome.hit,payout:outcome.payout},highPayoutOpportunityShadow:{shadowLevel:shadow.highPayoutOpportunityShadow?.shadowLevel||"INSUFFICIENT",...outcome}};
}

function shadowView({rawFeatures,buckets,matchedReasons,signalCount,dataQuality,config}){const shadowScoreRelative=signalCount?matchedReasons.length/signalCount:0,shadowLevel=dataQuality.status!=="COMPLETE"?"INSUFFICIENT":shadowScoreRelative>=config.levelBoundaries.high?"HIGH":shadowScoreRelative>=config.levelBoundaries.medium?"MEDIUM":"LOW";return{rawFeatures:{...rawFeatures},buckets:{...buckets},matchedReasons:[...matchedReasons],shadowLevel,shadowScoreRelative:Number(shadowScoreRelative.toFixed(6)),dataQuality:{...dataQuality}}}
function bucketMainRatio(value,buckets){return value===null?"INSUFFICIENT":value>=buckets.mainRatioHigh?"HIGH":value<buckets.mainRatioLow?"LOW":"MEDIUM"}
function bucketGap(value,buckets){return value===null?"NOT_APPLICABLE_SINGLE_WORLD":value<=buckets.worldGapSmallMax?"SMALL":value>=buckets.worldGapLargeMin?"LARGE":"MEDIUM"}
function normalizedEntropy(values){const total=values.reduce((sum,value)=>sum+value,0);if(values.length<2||!total)return null;const entropy=-values.reduce((sum,value)=>{const p=value/total;return p?sum+p*Math.log(p):sum},0);return entropy/Math.log(values.length)}
