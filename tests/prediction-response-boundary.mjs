import assert from"node:assert/strict";
import{resolvePredictionResponse}from"../public/prediction-response-boundary.mjs";

const race={date:"20261008",venueCode:"22",venue:"前橋",raceNo:9};
const display={ok:true,race,prediction:{standardPurchasePlan:[{order:[1,2,3]}]}};
const canonical={ok:true,raceKey:"20261008-22-9",predictionHash:"a".repeat(64),predictionSealedAt:"2026-10-08T09:00:00.000Z",predictionPayload:display};

const direct=resolvePredictionResponse(display,race);
assert.equal(direct.payload,display);
assert.equal(direct.canonicalEnvelope,null);
assert.equal(direct.returnedRaceKey,"20261008-22-9");

const saved=resolvePredictionResponse(canonical,race);
assert.equal(saved.payload,display);
assert.equal(saved.canonicalEnvelope,canonical);
assert.equal(saved.payload.race.date,"20261008");

assert.throws(()=>resolvePredictionResponse({ok:true,predictionPayload:{prediction:{}}},race),/保存済み予想のレース識別情報/);
assert.throws(()=>resolvePredictionResponse(canonical,{...race,raceNo:8}),/選択内容と一致/);
assert.throws(()=>resolvePredictionResponse(canonical,undefined),/選択したレースの識別情報/);

console.log("PASS prediction response boundary: display, canonical saved detail, missing identity, wrong race rejection");
