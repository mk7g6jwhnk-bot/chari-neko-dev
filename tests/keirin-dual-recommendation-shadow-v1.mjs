import assert from "node:assert/strict";
import {gzipSync} from "node:zlib";
import {performance} from "node:perf_hooks";
import {buildDualRecommendationShadow,buildDualShadowResultEvaluation} from "../keirin/engine/research-diagnostics-v1.mjs";
import {runKeirinEngine} from "../keirin/engine/keirin-engine.mjs";

const scenario=(id,rank,score)=>({macroScenarioId:id,scenarioRank:rank,relativeScenarioScore:score,events:[{eventId:`${id}:E01`}]});
const ticket=(id,rank,index,{score=.5,complete=true}={})=>({order:[rank,((rank+index)%7)+1,((rank+index+1)%7)+1],macroScenarioId:id,eventId:`${id}:E01`,terminalId:complete?`${id}:E01:T${String(index).padStart(2,"0")}`:null,terminalRelativeScore:score,rankWithinScenario:index,scenarioTicketRank:index});
function fixture({scores=[.5],counts=[6],totalCap=15,complete=true,scoreStep=.02}={}){
  const scenarios=scores.map((score,index)=>scenario(`MS-${index+1}`,index+1,score)),plan=[];
  counts.forEach((count,index)=>{for(let row=1;row<=count;row++)plan.push(ticket(`MS-${index+1}`,index+1,row,{score:.8-row*scoreStep,complete:complete||index>0}))});
  return{race:{raceKey:"20261005-35-1"},prediction:{predictionVersion:"P1"},purchase:{purchaseVersion:"BUY1",standardPurchasePlan:plan,terminals:plan},multiWorldScenario:{scenarios,purchase:{config:{totalCap}}}};
}
const build=input=>buildDualRecommendationShadow({...input,generatedAt:"2026-10-05T00:00:00.000Z"});

const standardOnly=build(fixture({scores:[.5],counts:[6]}));
assert.equal(standardOnly.standardHitShadow.shadowLevel,"HIGH");
assert.equal(standardOnly.highPayoutOpportunityShadow.shadowLevel,"LOW");

const highOnly=build(fixture({scores:[.5,.49,.32,.2],counts:[6,4,3,2]}));
assert.equal(highOnly.highPayoutOpportunityShadow.shadowLevel,"HIGH");
assert.equal(highOnly.standardHitShadow.shadowLevel,"LOW");

const bothHigh=build(fixture({scores:[.5,.45,.3,.2],counts:[9,3,2,1],scoreStep:.04}));
assert.equal(bothHigh.standardHitShadow.shadowLevel,"HIGH");
assert.equal(bothHigh.highPayoutOpportunityShadow.shadowLevel,"HIGH");

const bothLow=build(fixture({scores:[.5,.3],counts:[1,9],complete:false}));
assert.equal(bothLow.standardHitShadow.shadowLevel,"LOW");
assert.equal(bothLow.highPayoutOpportunityShadow.shadowLevel,"LOW");
assert.equal(standardOnly.standardHitShadow.rawFeatures.purchaseWorldCount,1);
assert.equal(highOnly.highPayoutOpportunityShadow.buckets.purchaseWorldCount,"FOUR");
assert.equal(highOnly.highPayoutOpportunityShadow.rawFeatures.totalTickets,15);
assert.equal(highOnly.highPayoutOpportunityShadow.rawFeatures.secondaryActive,true);
assert.equal(highOnly.highPayoutOpportunityShadow.rawFeatures.breakActive,true);

const hash="a".repeat(64),linked={...highOnly,predictionHash:hash};
assert.equal(linked.predictionHash,hash);
assert.equal(linked.resultDataUsed,false);
const before=structuredClone(linked),evaluation=buildDualShadowResultEvaluation({shadow:linked,predictionHash:hash,hit:true,payout:31200,resultObservedAt:"2026-10-05T08:00:00.000Z"});
assert.deepEqual(linked,before);
assert.equal(evaluation.standardHitShadow.hit,true);
assert.equal(evaluation.highPayoutOpportunityShadow.manSha,true);
assert.equal(evaluation.highPayoutOpportunityShadow.payoutAtLeast30000,true);

const insufficient=build({race:{raceKey:"20261005-35-2"},prediction:{},purchase:{standardPurchasePlan:[]},multiWorldScenario:{scenarios:[]}});
assert.equal(insufficient.standardHitShadow.shadowLevel,"INSUFFICIENT");
assert.equal(insufficient.highPayoutOpportunityShadow.shadowLevel,"INSUFFICIENT");

const previousRecommendation={recommendationClass:"SKIP_RECOMMENDED",reasonCodes:["UNCHANGED"]},purchaseBefore=structuredClone(highOnly.standardHitShadow.rawFeatures.worldTicketCounts);
assert.deepEqual(previousRecommendation,{recommendationClass:"SKIP_RECOMMENDED",reasonCodes:["UNCHANGED"]});
assert.deepEqual(highOnly.standardHitShadow.rawFeatures.worldTicketCounts,purchaseBefore);

const participants=Array.from({length:7},(_,index)=>({id:String(index+1),number:index+1,name:`R${index+1}`,lineId:`L${Math.floor(index/2)+1}`,lineOrder:index%2+1,recentForm:7,startPower:7,sprintPower:7,finishPower:7,trackingSkill:7}));
delete process.env.KEIRIN_RECOMMENDATION_DUAL_SHADOW_V1;
process.env.KEIRIN_RECOMMENDATION_FILTER_V1="1";
const legacy=runKeirinEngine({race:{id:"parity",participants,lineConfidence:"高"},captureResearchTrace:true});
process.env.KEIRIN_RECOMMENDATION_DUAL_SHADOW_V1="1";
const shadowed=runKeirinEngine({race:{id:"parity",participants,lineConfidence:"高"},captureResearchTrace:true});
delete process.env.KEIRIN_RECOMMENDATION_DUAL_SHADOW_V1;
delete process.env.KEIRIN_RECOMMENDATION_FILTER_V1;
assert.equal("dualRecommendationShadow" in legacy,false);
assert.equal(shadowed.dualRecommendationShadow.schemaVersion,"RECOMMENDATION_DUAL_SHADOW_V1");
assert.deepEqual(shadowed.standardPurchasePlan,legacy.standardPurchasePlan);
assert.deepEqual(shadowed.terminals,legacy.terminals);
assert.deepEqual(shadowed.scored,legacy.scored);
const recommendationDecision=trace=>{const copy=structuredClone(trace);delete copy.capturedAt;delete copy.traceHash;return copy};
assert.deepEqual(recommendationDecision(shadowed.recommendationFilter),recommendationDecision(legacy.recommendationFilter));
assert.equal(shadowed.researchTerminalTrace.dualRecommendationShadow.resultDataUsed,false);

const started=performance.now();for(let index=0;index<200;index++)buildDualRecommendationShadow({...highOnly,generatedAt:"2026-10-05T00:00:00.000Z"});
const cpuMsPerRace=(performance.now()-started)/200,rawBytes=Buffer.byteLength(JSON.stringify(highOnly)),gzipBytes=gzipSync(JSON.stringify(highOnly)).length;
console.log(JSON.stringify({ok:true,cases:15,rawBytesPerRace:rawBytes,gzipBytesPerRace:gzipBytes,cpuMsPerRace:Number(cpuMsPerRace.toFixed(4))}));
