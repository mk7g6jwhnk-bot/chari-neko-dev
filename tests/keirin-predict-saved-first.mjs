import assert from "node:assert/strict";
import handler from "../netlify/functions/keirin-predict.mjs";

const originalFetch = globalThis.fetch;
const raceKey = "20261002-85-1";
const saved = {
  ok: true,
  raceKey,
  predictionHash: "sealed-hash",
  predictionSealedAt: "2026-10-01T15:28:57.220Z",
  integrityStatus: "VALID",
  temporalStatus: "VALID",
  predictionPayload: { prediction: { terminals: [{ order: [1, 2, 3] }] } }
};
const requests = [];

try {
  process.env.KEIRIN_BROWSER_SERVICE_URL = "https://browser.test";
  globalThis.fetch = async url => {
    requests.push(String(url));
    return new Response(JSON.stringify(saved), { status: 200, headers: { "content-type": "application/json" } });
  };
  const response = await handler(new Request("https://site.test/.netlify/functions/keirin-predict?date=20261002&venueCode=85&venueName=%E4%BD%90%E4%B8%96%E4%BF%9D&raceNo=1&budget=3000&display=1"));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.predictionHash, "sealed-hash");
  assert.equal(body.reusedSealedPrediction, true);
  assert.equal(body.generationPerformed, false);
  assert.deepEqual(requests, [`https://browser.test/keirin/read/predictions/${raceKey}`]);
  console.log("keirin-predict-saved-first: PASS");
} finally {
  globalThis.fetch = originalFetch;
}
