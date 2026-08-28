import assert from "node:assert/strict";
import { validateReusableSeal } from "../public/sealed-prediction-client.mjs";
import handler from "../netlify/functions/keirin-sealed-prediction.mjs";

const race = { date: "20260828", venueCode: "61", raceNo: 7 };
const valid = {
  ok: true,
  raceKey: "20260828-61-7",
  immutable: true,
  integrityStatus: "VALID",
  temporalStatus: "VALID",
  predictionVersion: "ENGINE-1",
  predictionHash: "sealed-hash",
  predictionPayload: { prediction: { terminals: [] }, race }
};
assert.deepEqual(validateReusableSeal(valid, race, "ENGINE-1").reasons, []);
for (const [field, value, reason] of [
  ["raceKey", "20260828-61-8", "race_key_mismatch"],
  ["immutable", false, "not_immutable"],
  ["integrityStatus", "INVALID", "integrity_invalid"],
  ["temporalStatus", "INVALID", "temporal_invalid"],
  ["predictionVersion", "ENGINE-2", "prediction_version_incompatible"]
]) {
  const changed = structuredClone(valid);
  changed[field] = value;
  assert.ok(validateReusableSeal(changed, race, "ENGINE-1").reasons.includes(reason));
}
const missing = structuredClone(valid);
delete missing.predictionPayload.prediction;
assert.ok(validateReusableSeal(missing, race, "ENGINE-1").reasons.includes("display_payload_missing"));
const originalFetch=globalThis.fetch,originalBase=process.env.KEIRIN_BROWSER_SERVICE_URL;
process.env.KEIRIN_BROWSER_SERVICE_URL="https://browser.test";
try{
  globalThis.fetch=async url=>{assert.match(String(url),/research\/shadow\/prediction/);return new Response(JSON.stringify(valid),{status:200,headers:{"content-type":"application/json"}})};
  const proxied=await handler(new Request("https://app.test/.netlify/functions/keirin-sealed-prediction?date=20260828&venueCode=61&raceNo=7"));
  assert.equal(proxied.status,200);assert.equal((await proxied.json()).predictionHash,valid.predictionHash);
  globalThis.fetch=async()=>new Response(JSON.stringify({ok:false}),{status:404,headers:{"content-type":"application/json"}});
  assert.equal((await handler(new Request("https://app.test/.netlify/functions/keirin-sealed-prediction?date=20260828&venueCode=61&raceNo=8"))).status,404);
}finally{globalThis.fetch=originalFetch;if(originalBase===undefined)delete process.env.KEIRIN_BROWSER_SERVICE_URL;else process.env.KEIRIN_BROWSER_SERVICE_URL=originalBase}
console.log("OK sealed prediction reuse validation tests");
