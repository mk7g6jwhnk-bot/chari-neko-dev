import assert from"node:assert/strict";
import{attachCanonicalIdentity,canonicalPurchaseIdentity,validateCanonicalSnapshot}from"../public/canonical-prediction-cache.mjs";
import savedDetailHandler from"../netlify/functions/keirin-saved-prediction-detail.mjs";

let passed=0;const check=(name,fn)=>{fn();passed++;console.log(`PASS ${name}`)};
const ticket=(n,world="W1")=>({order:[1,n,7],macroScenarioId:world,eventId:`${world}:E1`,terminalId:`${world}:T${n}`,betClass:n===2?"MAIN":"SCENARIO_BREAK",ticketClass:n===2?"MAIN":"SCENARIO_BREAK",worldClass:n<8?"MAIN":"SCENARIO_BREAK",ticketClassVersion:"MULTI_WORLD_TICKET_CLASS_V2",classificationSource:"CANONICAL_V2",scenarioPurchaseClass:n===2?"MAIN":"SCENARIO_BREAK",thick:false});
const response={ok:true,raceKey:"20261002-85-3",predictionHash:"hash-15",predictionHashVersion:"PREDICTION_CANONICAL_SNAPSHOT_V2",predictionVersion:"ENGINE",purchaseVersion:"v251-multi-world-scenario",predictionSealedAt:"2026-10-01T15:53:44.278Z",integrityStatus:"VALID",temporalStatus:"VALID",immutable:true,predictionPayload:{race:{date:"20261002",venueCode:"85",venueName:"佐世保",raceNo:3},prediction:{engineVersion:"ENGINE",purchase:{purchaseVersion:"v251-multi-world-scenario"},canonicalPurchasePlan:{standardTickets:Array.from({length:15},(_,i)=>ticket(i+2,i<6?"W1":`W${2+Math.floor((i-6)/3)}`))}}}};
const identity=canonicalPurchaseIdentity(response),base=attachCanonicalIdentity({targetRace:{date:"20261002",venueCode:"85",raceNo:3},predictionVersion:"ENGINE",betSelections:identity.tickets.map(row=>({...row,category:row.ticketClass})),purchaseVersion:"v251-multi-world-scenario"},response,"2026-10-02T00:09:00.000Z");
check("hash version present and matching",()=>assert.equal(validateCanonicalSnapshot(base,identity).passed,true));
check("hash version mismatch fails",()=>assert.ok(validateCanonicalSnapshot({...base,predictionHashVersion:"OTHER"},identity).reasons.includes("PREDICTION_HASH_VERSION_MISMATCH")));
const legacyResponse={...response,predictionHashVersion:null},legacyIdentity=canonicalPurchaseIdentity(legacyResponse),legacy=attachCanonicalIdentity({...base},legacyResponse,"2026-10-02T00:09:00.000Z");
check("missing hash version with complete identity is compatible",()=>{const audit=validateCanonicalSnapshot(legacy,legacyIdentity);assert.equal(audit.passed,true);assert.equal(audit.compatibilityStatus,"LEGACY_HASH_VERSION_COMPATIBLE");assert.ok(audit.reasons.includes("HASH_VERSION_MISSING_COMPATIBLE"))});
check("missing hash version prediction hash mismatch fails",()=>assert.ok(validateCanonicalSnapshot({...legacy,sealedPrediction:{...legacy.sealedPrediction,predictionHash:"other"}},legacyIdentity).reasons.includes("PREDICTION_HASH_MISMATCH")));
check("missing hash version purchase version mismatch fails",()=>assert.ok(validateCanonicalSnapshot({...legacy,purchaseVersion:"old"},legacyIdentity).reasons.includes("PURCHASE_VERSION_MISMATCH")));
check("missing hash version ticket count mismatch fails",()=>assert.ok(validateCanonicalSnapshot({...legacy,betSelections:legacy.betSelections.slice(0,2)},legacyIdentity).reasons.includes("TICKET_COUNT_MISMATCH")));
check("integrity invalid fails",()=>assert.ok(validateCanonicalSnapshot({...legacy,sealedPrediction:{...legacy.sealedPrediction,integrityStatus:"INVALID"}},legacyIdentity).reasons.includes("INTEGRITY_INVALID")));
check("temporal invalid fails",()=>assert.ok(validateCanonicalSnapshot({...legacy,sealedPrediction:{...legacy.sealedPrediction,temporalStatus:"INVALID"}},legacyIdentity).reasons.includes("TEMPORAL_INVALID")));
check("race mismatch fails",()=>assert.ok(validateCanonicalSnapshot({...legacy,targetRace:{...legacy.targetRace,raceNo:4}},legacyIdentity).reasons.includes("RACE_KEY_MISMATCH")));
check("sealed time mismatch fails",()=>assert.ok(validateCanonicalSnapshot({...legacy,sealedAt:"2026-10-01T15:54:00.000Z"},legacyIdentity).reasons.includes("SEALED_AT_MISMATCH")));
check("ambiguous legacy classification is not promoted",()=>{const x=structuredClone(legacy);x.betSelections[0].ticketClassVersion=null;const audit=validateCanonicalSnapshot(x,legacyIdentity);assert.equal(audit.passed,false);assert.ok(audit.reasons.includes("HASH_VERSION_MISSING_INCOMPATIBLE"))});
check("V2 classification retained",()=>{assert.equal(legacy.betSelections[0].ticketClassVersion,"MULTI_WORLD_TICKET_CLASS_V2");assert.equal(legacy.betSelections[0].classificationSource,"CANONICAL_V2");assert.equal(legacy.betSelections[0].worldClass,"MAIN")});
const originalFetch=globalThis.fetch,originalBase=process.env.KEIRIN_BROWSER_SERVICE_URL;process.env.KEIRIN_BROWSER_SERVICE_URL="https://railway.invalid";
try{
  globalThis.fetch=async()=>new Response(JSON.stringify(legacyResponse),{status:200,headers:{"content-type":"application/json"}});
  const metadataResponse=await savedDetailHandler(new Request("https://netlify.invalid/.netlify/functions/keirin-saved-prediction-detail?raceKey=20261002-85-3&predictionHash=hash-15&metadata=1")),metadata=await metadataResponse.json();
  check("metadata preserves null hash version and V2 identity",()=>{assert.equal(metadataResponse.status,200);assert.equal(metadata.predictionHashVersion,null);assert.equal(metadata.tickets.length,15);assert.equal(metadata.tickets[0].ticketClassVersion,"MULTI_WORLD_TICKET_CLASS_V2");assert.equal(metadata.tickets[0].classificationSource,"CANONICAL_V2");assert.equal(metadata.immutable,true)});
  const mismatch=await savedDetailHandler(new Request("https://netlify.invalid/.netlify/functions/keirin-saved-prediction-detail?raceKey=20261002-85-3&predictionHash=wrong&metadata=1"));
  check("prediction hash mismatch remains blocked",()=>assert.equal(mismatch.status,409));
}finally{globalThis.fetch=originalFetch;if(originalBase===undefined)delete process.env.KEIRIN_BROWSER_SERVICE_URL;else process.env.KEIRIN_BROWSER_SERVICE_URL=originalBase}
console.log(JSON.stringify({passed:true,cases:passed}));
