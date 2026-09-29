import crypto from "node:crypto";

export const SECOND_RANK_TRACE_SCHEMA="WINNER_CONDITIONED_SECOND_RANK_TRACE_V1";
export const RECOMMENDATION_TRACE_SCHEMA="KEIRIN_RECOMMENDATION_TRACE_V1";
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
  const winners=[];
  for(const winnerRiderId of [...new Set(terminals.map(row=>Number(row.order?.[0])).filter(Number.isFinite))].sort((a,b)=>a-b)){
    const rows=terminals.filter(row=>Number(row.order?.[0])===winnerRiderId),bySecond=new Map();
    for(const row of rows){const second=Number(row.order?.[1]);if(!Number.isFinite(second))continue;const current=bySecond.get(second);if(!current||actualCompare(row,current)<0)bySecond.set(second,row);}
    const ranked=[...bySecond.values()].sort(actualCompare),rankedSecondCandidateIds=ranked.map(row=>Number(row.order[1]));
    const maxProbability=Math.max(0,...rows.map(row=>n(row.probability)??0));
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
  return{macroScenarioId:row.macroScenarioId||null,eventId:row.eventId||null,branchId:row.dominantBranchId||row.branchId||dominant?.branchId||null,winnerRiderId:Number(row.order?.[0]),secondCandidateRiderId:Number(row.order?.[1]),representativeTerminalId:row.terminalId||key(row),rawTerminalWeightedScore:n(row.probability),normalizationDenominator:maxProbability||null,normalizedProbability:n(row.probability),maxProbability:maxProbability||null,relativeProbability:n(row.relativeProbability),positionScoreFirst:n(positions.first),positionScoreSecond:n(positions.second),positionScoreThird:n(positions.third),positionFit:n(row.positionFit),positionBalance:n(row.positionBalance),firstDecisionRatio:n(ratios.first),secondDecisionRatio:n(ratios.second),thirdDecisionRatio:n(ratios.third),decisionRatioFit:geometric([ratios.first,ratios.second,ratios.third]),positionEvidenceCount:n(row.evidenceCount)??Object.values(evidence).filter(Boolean).length,evidenceScore:n(row.evidenceScore),terminalScore:n(row.terminalScore),fallbackReason:row.purchaseRejectCode||null,compatibilityFactor:n(compatibility?.factor),penaltyReason:row.relativeConditionPenalty?"RELATIVE_CONDITION_PENALTY":null,penaltyValue:n(row.relativeConditionPenalty),finalSortTuple:[n(row.terminalScore),n(row.probability),key(row)],finalRank:index+1,tieBreakReason:probTie?"ORDER_LEXICOGRAPHIC":scoreTie?"NORMALIZED_PROBABILITY":"TERMINAL_SCORE"};
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
