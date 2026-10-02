import assert from"node:assert/strict";
import{attachCanonicalIdentity,canonicalPurchaseIdentity,validateCanonicalSnapshot}from"../public/canonical-prediction-cache.mjs";
import savedDetailHandler from"../netlify/functions/keirin-saved-prediction-detail.mjs";

const ticket=(n,world="W1")=>({order:[1,n,7],macroScenarioId:world,eventId:`${world}:E1`,terminalId:`${world}:T${n}`,betClass:n===2?"MAIN":"SCENARIO_BREAK",scenarioPurchaseClass:n===2?"MAIN":"SCENARIO_BREAK"});
const response={predictionHash:"hash-15",predictionHashVersion:"PREDICTION_CANONICAL_SNAPSHOT_V2",predictionVersion:"ENGINE",purchaseVersion:"v251-multi-world-scenario",predictionSealedAt:"2026-10-01T15:53:44.278Z",predictionPayload:{prediction:{engineVersion:"ENGINE",purchase:{purchaseVersion:"v251-multi-world-scenario"},canonicalPurchasePlan:{standardTickets:Array.from({length:15},(_,i)=>ticket(i+2,i<6?"W1":`W${2+Math.floor((i-6)/3)}`))}}}};
const identity=canonicalPurchaseIdentity(response);
assert.equal(identity.ticketCount,15);assert.equal(identity.worldCount,4);
const base={predictionVersion:"ENGINE",betSelections:identity.tickets.map(row=>({...row,category:row.ticketClass})),sealedPrediction:{predictionHash:"hash-15"},purchaseVersion:"v251-multi-world-scenario",predictionHashVersion:"PREDICTION_CANONICAL_SNAPSHOT_V2"};
assert.equal(validateCanonicalSnapshot(base,identity).passed,true,"matching cache must be reusable");
assert.ok(validateCanonicalSnapshot({...base,betSelections:base.betSelections.slice(0,2)},identity).reasons.includes("TICKETCOUNT_MISMATCH"),"2/15 mismatch must reload canonical");
assert.ok(validateCanonicalSnapshot({...base,purchaseVersion:"old"},identity).reasons.includes("PURCHASEVERSION_MISMATCH"));
assert.ok(validateCanonicalSnapshot({...base,sealedPrediction:{predictionHash:"other"}},identity).reasons.includes("PREDICTIONHASH_MISMATCH"));
assert.ok(validateCanonicalSnapshot({predictionVersion:"ENGINE",betSelections:base.betSelections},identity).reasons.includes("LOCAL_SNAPSHOT_STALE"),"legacy snapshot must be stale");
const refreshed=attachCanonicalIdentity({...base},response,"2026-10-02T00:09:00.000Z");
assert.equal(refreshed.sealedAt,"2026-10-01T15:53:44.278Z");assert.equal(refreshed.snapshotCreatedAt,"2026-10-02T00:09:00.000Z");
assert.equal(validateCanonicalSnapshot(refreshed,identity).passed,true);
const originalFetch=globalThis.fetch,originalBase=process.env.KEIRIN_BROWSER_SERVICE_URL;process.env.KEIRIN_BROWSER_SERVICE_URL="https://railway.invalid";
try{
  globalThis.fetch=async()=>new Response(JSON.stringify({...response,ok:true,raceKey:"20261002-85-3",integrityStatus:"VALID",temporalStatus:"VALID"}),{status:200,headers:{"content-type":"application/json"}});
  const metadataResponse=await savedDetailHandler(new Request("https://netlify.invalid/.netlify/functions/keirin-saved-prediction-detail?raceKey=20261002-85-3&predictionHash=hash-15&metadata=1")),metadata=await metadataResponse.json();
  assert.equal(metadataResponse.status,200);assert.equal(metadata.tickets.length,15);assert.equal(metadata.predictionHash,"hash-15");
  const mismatch=await savedDetailHandler(new Request("https://netlify.invalid/.netlify/functions/keirin-saved-prediction-detail?raceKey=20261002-85-3&predictionHash=wrong&metadata=1"));assert.equal(mismatch.status,409,"same race with another hash must not fall back");
}finally{globalThis.fetch=originalFetch;if(originalBase===undefined)delete process.env.KEIRIN_BROWSER_SERVICE_URL;else process.env.KEIRIN_BROWSER_SERVICE_URL=originalBase}
console.log("Canonical saved prediction cache: 12 PASS");
