import assert from"node:assert/strict";
import{runKeirinEngine}from"../keirin/engine/keirin-engine.mjs";
import{PREDICTION_ENGINE_VERSION,PURCHASE_ENGINE_VERSION,ENGINE_PAIR_ID}from"../keirin/engine/engine-version.mjs";

const race={
 id:"pair-gate-v250-fixture",
 lineConfidence:"高",
 raceCategory:"standard",
 participants:[
  {number:1,name:"A",registration:"1",score:105},
  {number:2,name:"B",registration:"2",score:103},
  {number:3,name:"C",registration:"3",score:101},
  {number:4,name:"D",registration:"4",score:99},
  {number:5,name:"E",registration:"5",score:97},
  {number:6,name:"F",registration:"6",score:95},
  {number:7,name:"G",registration:"7",score:93}
 ]
};
const out=runKeirinEngine({race,oddsByOrder:{},budget:3000});
assert.equal(out.engineVersion,PREDICTION_ENGINE_VERSION);
assert.equal(out.purchase.purchaseVersion,PURCHASE_ENGINE_VERSION);
assert.equal(out.enginePair.enginePairId,ENGINE_PAIR_ID);
assert.equal(out.audit.enginePairAudit.enginePairId,ENGINE_PAIR_ID);
assert.equal(out.audit.enginePairAudit.pairFixed,true);
assert.equal(out.audit.enginePairAudit.passed,true);
assert.equal(out.prediction.audit.enginePairAudit.predictionEngineVersion,PREDICTION_ENGINE_VERSION);
assert.equal(out.purchase.audit.enginePairAudit.purchaseEngineVersion,PURCHASE_ENGINE_VERSION);
console.log("PASS v250 engine-pair gate",out.enginePair);
