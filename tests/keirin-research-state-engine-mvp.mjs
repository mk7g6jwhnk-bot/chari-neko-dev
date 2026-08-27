import assert from"node:assert/strict";
import{
  MemoryResearchShadowSealStore,assertShadowSealUnchanged,assertTemporalIntegrity,
  comparePredictionLedgers,createResearchShadowSealWriter,inventorySealedSnapshots,
  runCurrentResearchParallel,runResearchStateGraph
}from"../research/state-engine/index.mjs";

const race={id:"research-mvp",raceCategory:"standard",lineConfidence:"高",participants:[
  rider(1,"A1","A",1,"自力",8.4,8.1,7.8,7.3,6.8,112,18,10),
  rider(2,"A2","A",2,"番手",7.4,6.2,7.2,8.1,8.4,109,3,2),
  rider(3,"A3","A",3,"三番手",6.8,5.8,6.6,7.5,8.0,105,1,1),
  rider(4,"B1","B",1,"自力",7.7,7.8,8.2,7.0,6.4,110,15,8),
  rider(5,"B2","B",2,"番手",7.2,5.9,7.0,7.8,8.2,107,2,1)
]};
const inputObservedAt="2026-08-27T01:00:00.000Z",predictionSealedAt="2026-08-27T01:01:00.000Z";
const parallel=runCurrentResearchParallel({race,inputObservedAt,predictionSealedAt});
assert.equal(parallel.audit.purchaseEngineConnected,false);
assert.equal(parallel.audit.oddsUsed,false);
assert.equal(parallel.research.calibratedProbability,null);
assert.equal(parallel.research.audit.terminalCount,60);
assert.ok(Math.abs(parallel.research.audit.terminalMass-1)<1e-9);
assert.deepEqual(parallel.research.graph.audit.stateTypes,["INITIATIVE","ATTACK_OUTCOME","LINE_TRACKING","OTHER_LINE_SURVIVAL","FOURTH_CORNER_POSITION"]);
assert.ok(Object.isFrozen(parallel.research.graph.initialState));
assert.ok(parallel.research.graph.paths.every(path=>path.nodes.length===5&&path.nodes.every(node=>node.calibratedProbability===null)));
assert.ok(parallel.research.terminals.every(row=>!("purchaseStatus"in row)&&!("betClass"in row)));

const unknownRace={id:"unknown",raceCategory:"standard",lineConfidence:"低",participants:[{number:1,id:"1",name:"U1",lineId:"unknown-1",role:"判定保留",officialScore:90},{number:2,id:"2",name:"U2",lineId:"unknown-2",role:"判定保留",officialScore:89},{number:3,id:"3",name:"U3",lineId:"unknown-3",role:"判定保留",officialScore:88}]};
const unknown=runResearchStateGraph({race:unknownRace});
assert.ok(unknown.paths.some(path=>path.nodes.some(node=>node.status==="UNKNOWN")));
assert.ok(unknown.paths.every(path=>path.state.officialLines.every(line=>line.type==="判定保留")));

const officialOrder=parallel.research.terminals[0].order;
const comparison=comparePredictionLedgers({currentTerminals:parallel.current.terminals,researchTerminals:parallel.research.terminals,officialOrder});
assert.equal(comparison.firstDropState.status,"UNVERIFIED");
assert.ok(Number.isFinite(comparison.current.exactTerminalRank));
assert.equal(comparison.research.exactTerminalRank,1);
const observed={INITIATIVE:"RIDER_99"};
const dropped=comparePredictionLedgers({currentTerminals:parallel.current.terminals,researchTerminals:parallel.research.terminals,officialOrder,observedStateOutcomes:observed});
assert.equal(dropped.firstDropState.stateType,"INITIATIVE");

assert.throws(()=>assertTemporalIntegrity({inputObservedAt:"2026-08-27T01:02:00Z",predictionSealedAt:"2026-08-27T01:01:00Z"}),/INPUT_AFTER_PREDICTION_SEAL/);
assert.throws(()=>assertTemporalIntegrity({inputObservedAt,predictionSealedAt,resultObservedAt:"2026-08-27T01:00:30Z"}),/RESULT_NOT_STRICTLY_AFTER/);

const store=new MemoryResearchShadowSealStore(),writer=createResearchShadowSealWriter({store});
const seal=await writer.seal({raceKey:"20260827-TEST-1",preRaceInput:{race},parallelOutput:parallel,inputObservedAt,predictionSealedAt});
assert.equal(assertShadowSealUnchanged(seal).valid,true);
assert.equal((await writer.list()).length,1);
const inventory=inventorySealedSnapshots(await writer.list());
assert.equal(inventory.total,1);assert.equal(inventory.comparableSealedCount,1);assert.equal(inventory.pendingResultCount,1);
assert.equal(inventory.historicalInputReconstructionAllowed,false);
await assert.rejects(()=>writer.seal({raceKey:"LEAK",preRaceInput:{race,result:{finishOrder:[1,2,3]}},parallelOutput:parallel,inputObservedAt,predictionSealedAt}),/RESULT_DATA_FORBIDDEN/);

console.log("PASS research state engine MVP structure");
console.log(JSON.stringify({current:{terminalCount:parallel.current.terminals.length,top:top(parallel.current.terminals,row=>row.probability)},research:{terminalCount:parallel.research.terminals.length,pathCount:parallel.research.graph.paths.length,calibrationStatus:parallel.research.calibrationStatus,top:top(parallel.research.terminals,row=>row.terminalProbability)},comparison,inventory},null,2));

function rider(number,name,lineId,lineOrder,role,recent,start,sprint,finish,tracking,officialScore,back,home){return{id:String(number),number,name,lineId,lineOrder,role,officialScore,recentForm:recent,startPower:start,sprintPower:sprint,finishPower:finish,trackingSkill:tracking,recentFormEvidence:{selectedMetric:recent,confidence:"high"},startPowerEvidence:{usable:true,bPercentileScore:start,hPercentileScore:start*.8,rawBackCount:back,rawHomeCount:home,officialTotalStarts:30,startsQuality:.67,confidence:"high"},kimariteAbilityEvidence:{adopted:true}}}
function top(rows,p){return[...rows].sort((a,b)=>p(b)-p(a)).slice(0,3).map((row,index)=>({rank:index+1,order:row.order.join("-"),modelProbability:p(row),calibratedProbability:null}))}
