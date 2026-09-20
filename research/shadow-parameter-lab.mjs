import crypto from'node:crypto';
import{evaluateMarkTopN,rankRiderMarks}from'./mark-topn-evaluation.mjs';

export const SHADOW_SCHEMA='SHADOW_PARAMETER_LAB_V1';
export const PARAMETER_AUDIT=[
  {name:'RIDER_FIRST_RECENT_WEIGHT',classification:'SHADOW_READY',producer:'keirin-scoring roleScore(first)',consumer:'rider first-place ranking',reason:'saved scoreTrace contains prediction-time values, availability and weights'},
  {name:'TERMINAL_EVIDENCE_WEIGHT',classification:'SHADOW_READY',producer:'purchase classify terminalScore',consumer:'terminal ranking',reason:'saved relativeProbability and evidenceScore independently replay the current 0.65/0.35 formula'},
  {name:'RIDER_RELATIVE_SCORE_CORRECTION',classification:'NOT_IMPLEMENTED',reason:'no independent production correction with this name exists'},
  {name:'RACE_POINT_DIFF_CORRECTION',classification:'NOT_IMPLEMENTED',reason:'no independent production correction with this name exists'},
  {name:'SAME_LINE_ROLE_CORRECTION',classification:'NOT_IMPLEMENTED',reason:'current conditional compatibility is neutral unless logically contradictory'},
  {name:'PAIR_DIRECTION_CORRECTION',classification:'NEEDS_TRACE',reason:'pair rank is saved but the complete pre-merge branch contribution trace is not'},
  {name:'SECOND_PLACE_COMPATIBILITY',classification:'NEEDS_TRACE',reason:'saved terminal snapshot cannot independently replay every merged branch path'},
  {name:'THIRD_CONDITIONAL_CORRECTION',classification:'NEEDS_TRACE',reason:'dominant trace alone is insufficient for merged terminal probability replay'},
  {name:'SCENARIO_SUPPORT_CORRECTION',classification:'NOT_INDEPENDENT',reason:'scenario support is coupled to branch generation and family classification'},
  {name:'SCENARIO_COUNTER_EVIDENCE',classification:'NOT_IMPLEMENTED',reason:'no independent production correction found'},
  {name:'TERMINAL_RELATIVE_CONDITION',classification:'NEEDS_TRACE',reason:'per-contribution relative-condition trace is not retained in the saved response'},
  {name:'RECOMMENDATION_SCORE',classification:'UNSAFE_TO_REPLAY',reason:'depends on final purchase and odds gates'},
  {name:'THICK_SCORE',classification:'UNSAFE_TO_REPLAY',reason:'depends on final purchase qualification and cannot be varied independently'}
];
export const ACTIVE_VARIANTS={
  RIDER_FIRST_RECENT_WEIGHT:[.20,.24,.28,.32,.36],
  TERMINAL_EVIDENCE_WEIGHT:[.25,.30,.35,.40,.45]
};
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const ratio=(n,d)=>d?n/d:null;
const order=value=>(Array.isArray(value)?value:String(value||'').match(/\d+/g)||[]).map(Number).slice(0,3).join('-');
const deep=value=>structuredClone(value);
const sorted=(rows,score='score')=>[...rows].sort((a,b)=>Number(b[score])-Number(a[score])||String(a.id||a.order).localeCompare(String(b.id||b.order),'en'));

function shape(values){
  const xs=[...values].map(Number).filter(Number.isFinite).sort((a,b)=>b-a),gaps=xs.slice(0,-1).map((x,i)=>x-xs[i+1]);
  if(!xs.length)return{status:'UNKNOWN'};
  const top=xs[0],median=gaps.length?[...gaps].sort((a,b)=>a-b)[Math.floor(gaps.length/2)]:0,plateauStart=1;
  let plateau=plateauStart;while(plateau<xs.length&&gaps[plateau-1]<=median)plateau++;
  const n=Math.min(5,xs.length),sx=n*(n-1)/2,sy=xs.slice(0,n).reduce((a,b)=>a+b,0),sxx=Array.from({length:n},(_,i)=>i*i).reduce((a,b)=>a+b,0),sxy=xs.slice(0,n).reduce((s,y,i)=>s+i*y,0);
  return{status:'AVAILABLE',adjacentScoreGaps:gaps,top1Top2Gap:gaps[0]??null,top2Top3Gap:gaps[1]??null,top3Top4Gap:gaps[2]??null,top4Top5Gap:gaps[3]??null,
    localDensity:xs.filter(x=>x>=top*.95).length,plateauLength:plateau,lowerGroupSeparation:n<xs.length?xs[n-1]-xs[n]:null,
    slope:n>1?(n*sxy-sx*sy)/(n*sxx-sx*sx):null};
}
function scoreRiders(row,recentWeight){
  return(row.prediction.riderScores||[]).map(r=>{
    const trace=r.scoreTrace?.first||[];
    if(!trace.length)return{number:r.number,score:Number(r.score),traceAvailable:false};
    let total=0,weight=0;
    for(const item of trace){if(item.available===false)continue;const w=item.key==='recentForm'?recentWeight:Number(item.weight);const v=Number(item.value);if(Number.isFinite(v)&&Number.isFinite(w)){total+=v*w;weight+=w;}}
    return{number:Number(r.number),score:weight?Math.max(0,Math.min(10,total/weight)):Number(r.score),traceAvailable:true};
  });
}
function terminalRows(row,evidenceWeight){
  return(row.prediction.terminals||[]).map(t=>{const relative=Number(t.relativeProbability),evidence=Number(t.evidenceScore),probability=Number(t.probability)||0;
    const replayable=Number.isFinite(relative)&&Number.isFinite(evidence);
    return{...t,order:order(t.order),shadowScore:replayable?relative*(1-evidenceWeight)+evidence*evidenceWeight:Number(t.terminalScore)||probability,replayable};});
}
function groupRanking(terminals,keyFn){const map=new Map();for(const t of terminals){const key=keyFn(t);if(key)map.set(key,(map.get(key)||0)+Number(t.shadowScore||0));}return sorted([...map].map(([id,score])=>({id,score})));}
function baselineSets(row){const tickets=new Set((row.purchase?.tickets||[]).map(t=>order(t.order))),adopted=new Set((row.prediction.terminals||[]).filter(t=>t.purchaseStatus==='購入採用').map(t=>order(t.order))),meaningful=new Set((row.prediction.terminals||[]).filter(t=>t.representativeTerminal).map(t=>order(t.order)));return{tickets,adopted,meaningful};}
function takeSet(ranking,n){return new Set(ranking.slice(0,n).map(x=>x.order));}
function purchaseMetrics(races){const investment=races.reduce((s,r)=>s+r.simulatedFinalCandidateSet.length*100,0),hits=races.filter(r=>r.finalSurvival).length,ret=races.reduce((s,r)=>s+(r.finalSurvival?Number(r.payout)||0:0),0),counts=races.map(r=>r.simulatedFinalCandidateSet.length).sort((a,b)=>a-b);return{races:races.length,exactMeaningfulSurvival:races.filter(r=>r.meaningfulSurvival).length,exactCandidateSurvival:races.filter(r=>r.candidateSurvival).length,exactFinalSurvival:hits,hitRate:ratio(hits,races.length),investment,return:ret,roi:ratio(ret,investment),avgTickets:ratio(counts.reduce((a,b)=>a+b,0),counts.length),medianTickets:counts.length?counts[Math.floor(counts.length/2)]:null,p90Tickets:counts.length?counts[Math.min(counts.length-1,Math.ceil(counts.length*.9)-1)]:null};}
function evaluateTerminalVariant(rows,value,baseline){const races=[];for(const row of rows){const terminals=sorted(terminalRows(row,value),'shadowScore'),sets=baselineSets(row),actual=order(row.result.finishOrder);
    const meaningful=takeSet(terminals,sets.meaningful.size),candidate=takeSet(terminals,sets.adopted.size),final=takeSet(terminals,sets.tickets.size);
    const pair=groupRanking(terminals,t=>t.order.split('-').slice(0,2).join('-')),scenario=groupRanking(terminals,t=>t.dominantBranchId||null),actualPair=actual.split('-').slice(0,2).join('-');
    const third=terminals.filter(t=>t.order.startsWith(`${actualPair}-`));
    races.push({raceKey:row.raceKey,snapshotHash:row.hashes.predictionHash,actual,terminalRanking:terminals.map((t,i)=>({order:t.order,rank:i+1,score:t.shadowScore})),pairRanking:pair,thirdRanking:third.map((t,i)=>({order:t.order,rank:i+1,score:t.shadowScore})),riderRanking:'UNKNOWN',
      meaningfulSet:[...meaningful],simulatedPurchaseCandidateSet:[...candidate],simulatedFinalCandidateSet:[...final],recommendationState:'UNKNOWN',thickState:'UNKNOWN',
      meaningfulSurvival:meaningful.has(actual),candidateSurvival:candidate.has(actual),finalSurvival:final.has(actual),payout:row.result.payout,
      exactPairRank:pair.findIndex(x=>x.id===actualPair)+1||null,exactThirdConditionalRank:third.findIndex(x=>x.order===actual)+1||null,
      scoreShapes:{rider:'UNKNOWN',scenario:shape(scenario.map(x=>x.score)),pair:shape(pair.map(x=>x.score)),terminal:shape(terminals.map(x=>x.shadowScore))}});}
  return{races,metrics:purchaseMetrics(races)};}
function evaluateRiderVariant(rows,value){const scoreByRace=new Map(),races=[];for(const row of rows){const riders=scoreRiders(row,value);scoreByRace.set(row.raceKey,riders);const ranking=rankRiderMarks(row,{scoreOverride:riders}),actual=(row.result.finishOrder||[]).map(Number);races.push({raceKey:row.raceKey,snapshotHash:row.hashes.predictionHash,riderRanking:ranking.map(r=>({number:r.number,rank:r.rank,mark:r.mark,score:r.score})),pairRanking:'UNKNOWN',thirdRanking:'UNKNOWN',terminalRanking:'UNKNOWN',meaningfulSet:'UNKNOWN',simulatedPurchaseCandidateSet:'UNKNOWN',simulatedFinalCandidateSet:'UNKNOWN',recommendationState:'UNKNOWN',thickState:'UNKNOWN',scoreShapes:{rider:shape(ranking.map(r=>r.score)),scenario:'UNKNOWN',pair:'UNKNOWN',terminal:'UNKNOWN'},winnerRank:ranking.findIndex(r=>r.number===actual[0])+1||null});}
  const marks=evaluateMarkTopN(rows,{scoreByRace});return{races,metrics:{races:rows.length,winnerTop1:marks.cumulative['◎'].winnerCapture,winnerTop2:marks.cumulative['◎○'].winnerCapture,winnerTop3:marks.cumulative['◎○▲'].winnerCapture,winnerTop5:marks.cumulative['◎○▲△☆'].winnerCapture,top3AllCovered:marks.cumulative['◎○▲'].exactTop3AllCovered,marks}};}

export function evaluateShadowParameterLab(source,{cohorts=null,includeRaceDetails=true,variants=ACTIVE_VARIANTS}={}){
  const before=hash(source),rows=deep(source.rows||[]),protectedKeys=new Set(cohorts?.protectedFinal||[]),exploration=new Set(cohorts?.exploration||rows.slice(0,Math.floor(rows.length*.6)).map(r=>r.raceKey)),confirmation=new Set(cohorts?.confirmation||rows.slice(Math.floor(rows.length*.6),Math.floor(rows.length*.8)).map(r=>r.raceKey));
  const eligible=rows.filter(r=>!protectedKeys.has(r.raceKey)&&(exploration.has(r.raceKey)||confirmation.has(r.raceKey))),results=[];
  for(const [parameterName,values]of Object.entries(variants)){const baseline=parameterName==='RIDER_FIRST_RECENT_WEIGHT'?.28:.35;for(const value of values){const evaluated=parameterName==='RIDER_FIRST_RECENT_WEIGHT'?evaluateRiderVariant(eligible,value):evaluateTerminalVariant(eligible,value,baseline);const cohortMetrics={};for(const[name,set]of[['EXPLORATION',exploration],['CONFIRMATION',confirmation]]){const subset=evaluated.races.filter(r=>set.has(r.raceKey));cohortMetrics[name]=parameterName==='RIDER_FIRST_RECENT_WEIGHT'?{races:subset.length,winnerTop1:subset.filter(r=>r.winnerRank===1).length,winnerTop3:subset.filter(r=>r.winnerRank&&r.winnerRank<=3).length}:purchaseMetrics(subset);}
      results.push({parameterName,variantId:value===baseline?'BASELINE':`${value<baseline?'MINUS':'PLUS'}_${Math.abs(value-baseline).toFixed(2)}`,baselineValue:baseline,shadowValue:value,state:value===baseline?'ACTIVE':'DATA_NOT_ENOUGH',metrics:evaluated.metrics,cohortMetrics,races:includeRaceDetails?evaluated.races:undefined});}}
  const after=hash(source);return{schemaVersion:SHADOW_SCHEMA,generatedAt:rows.at(-1)?.resultObservedAt||rows.at(-1)?.predictionSealedAt||null,parameterAudit:PARAMETER_AUDIT,activeVariants:variants,cohorts:{exploration:[...exploration],confirmation:[...confirmation],finalHoldout:cohorts?.finalHoldout||[],protectedFinalUsed:0,evaluatedRaces:eligible.length},results,
    safety:{predictionHashBefore:before,predictionHashAfter:after,productionHashMismatch:Number(before!==after),resultUsedForShadowGeneration:false,resultUsedForEvaluationOnly:true,historicalMutation:0,productionPredictionChanged:false,productionPurchaseChanged:false,recommendationChanged:false,thickChanged:false,autoTuning:false,cliffMethodImplemented:false}};
}






