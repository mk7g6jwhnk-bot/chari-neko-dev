import assert from "node:assert/strict";
import handler from "../netlify/functions/keirin-discover.mjs";

const originalFetch = globalThis.fetch;
const calls = [];
globalThis.fetch = async url => {
  calls.push(String(url));
  const path = new URL(url).pathname;
  if (path.endsWith("/keirin/active-races")) return new Response(JSON.stringify({ ok: false, code: "DISCOVERY_FETCH_FAILED" }), { status: 502, headers: { "content-type": "application/json" } });
  if (path.endsWith("/keirin/read/predictions")) return new Response(JSON.stringify({ ok: true, date: "20260910", records: [
    { raceKey: "20260910-34-1", venue: "川崎", raceNumber: 1, scheduledStartTime: "2026-09-10T15:20:00+09:00", predictionSealedAt: "2026-09-10T00:00:00Z", lifecycleStatus: "PREDICTION_SEALED", resultAttached: false, compared: false },
    { raceKey: "20260910-34-2", venue: "川崎", raceNumber: 2, scheduledStartTime: "2026-09-10T15:45:00+09:00", predictionSealedAt: "2026-09-10T00:01:00Z", lifecycleStatus: "PREDICTION_SEALED", resultAttached: true, compared: true },
    { raceKey: "20260910-32-1", venue: "千葉", raceNumber: 1, scheduledStartTime: "2026-09-10T16:00:00+09:00", predictionSealedAt: "2026-09-10T00:02:00Z" }
  ] }), { status: 200, headers: { "content-type": "application/json" } });
  throw new Error(`unexpected live discovery: ${url}`);
};
process.env.KEIRIN_BROWSER_SERVICE_URL = "https://railway.example";
try {
  const response = await handler(new Request("https://site.example/.netlify/functions/keirin-discover?date=20260910"));
  const body = await response.json();
  assert.equal(response.status, 200); assert.equal(response.headers.get("x-chari-cache"), "STALE_SAVED");
  assert.equal(body.ok, true); assert.equal(body.stale, true); assert.equal(body.cacheStatus, "STALE_SAVED"); assert.match(body.warning, /更新待ち/);
  assert.equal(body.meetings.length, 1); assert.equal(body.meetings[0].venueCode, "34"); assert.deepEqual(body.meetings[0].raceNumbers, [1, 2]);
  assert.equal(body.meetings[0].races[0].startTime, "15:20"); assert.equal(body.meetings[0].races[1].resultConfirmed, true);
  assert.equal(calls.some(url => url.includes("/keirin/discover?")), false, "saved last-known prevents browser retry storm");
  assert.equal(body.diagnostics.source, "saved_prediction_last_known");
} finally { globalThis.fetch = originalFetch; }
console.log("PASS keirin discover saved last-known fallback");
