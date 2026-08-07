import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  STORAGE_WARNING,
  createMemoryOfficialLineStore,
  createNetlifyOfficialLineStore,
  getOfficialLineStoreName,
  officialLineKey,
  resolveOfficialLines
} from "../netlify/lib/keirin-official-line-store.mjs";
import {
  buildLineText,
  handleKeirinPredict
} from "../netlify/functions/keirin-predict.mjs";

const fixture = JSON.parse(await readFile(
  new URL("./fixtures/keirin-browser-official-lines.json", import.meta.url),
  "utf8"
));
const fixtureLines = fixture.officialData.lines;
const request = { date: "20260807", venueCode: "45", raceNo: 2 };
const identity = { ...request, identityPassed: true };
const now = () => "2026-08-07T02:00:00.000Z";

// A: currently published official lines are saved and preferred.
const memory = createMemoryOfficialLineStore();
const current = await resolveOfficialLines({
  request,
  identity,
  currentLines: fixtureLines,
  venueName: "豊橋",
  buildLineText,
  store: memory,
  now
});
assert.equal(current.lineSource, "official");
assert.equal(current.lines.length, 7);
assert.equal(current.lineText, "17 652 43");
const saved = memory.values.get(officialLineKey(request));
assert.deepEqual(Object.keys(saved).sort(), [
  "date", "fetchedAt", "identityPassed", "lineCount", "lineText", "lines",
  "raceNo", "schemaVersion", "source", "venueCode", "venueName"
].sort());
assert.deepEqual(Object.keys(saved.lines[0]).sort(), ["number", "order", "position", "sourcePath", "sourceType"].sort());

// B: the same race restores only the previously captured official lines.
const cached = await resolveOfficialLines({
  request,
  identity,
  currentLines: [],
  venueName: "豊橋",
  buildLineText,
  store: memory,
  now
});
assert.equal(cached.lineSource, "cached-official");
assert.equal(cached.fetchedAt, now());
assert.equal(cached.lineText, "17 652 43");

// C: no history means unavailable; no official-looking line is invented.
const missing = await resolveOfficialLines({
  request,
  identity,
  currentLines: [],
  venueName: "豊橋",
  buildLineText,
  store: createMemoryOfficialLineStore(),
  now
});
assert.deepEqual(missing.lines, []);
assert.equal(missing.lineSource, "unavailable");

// D/E/F: date, venue and race number are all part of the exact key.
for (const mismatched of [
  { ...request, date: "20260808" },
  { ...request, venueCode: "55" },
  { ...request, raceNo: 3 }
]) {
  const result = await resolveOfficialLines({
    request: mismatched,
    identity: { ...mismatched, identityPassed: true },
    currentLines: [],
    venueName: "豊橋",
    buildLineText,
    store: memory,
    now
  });
  assert.equal(result.lineSource, "unavailable");
}

// G: failed identity never writes current lines.
const rejectedMemory = createMemoryOfficialLineStore();
const rejected = await resolveOfficialLines({
  request,
  identity: { ...identity, identityPassed: false },
  currentLines: fixtureLines,
  venueName: "豊橋",
  buildLineText,
  store: rejectedMemory,
  now
});
assert.equal(rejected.lineSource, "unavailable");
assert.equal(rejectedMemory.values.size, 0);

// H: corrupted or incompatible records are ignored.
const corruptMemory = createMemoryOfficialLineStore(new Map([[
  officialLineKey(request),
  { ...saved, schemaVersion: 2 }
]]));
const corrupt = await resolveOfficialLines({
  request,
  identity,
  currentLines: [],
  venueName: "豊橋",
  buildLineText,
  store: corruptMemory,
  now
});
assert.equal(corrupt.lineSource, "unavailable");

// I: write failure does not discard current official lines.
const writeFailure = await resolveOfficialLines({
  request,
  identity,
  currentLines: fixtureLines,
  venueName: "豊橋",
  buildLineText,
  store: { async get() { return null; }, async set() { throw new Error("write failed"); } },
  now
});
assert.equal(writeFailure.lineSource, "official");
assert.equal(writeFailure.lines.length, 7);
assert.equal(writeFailure.storageWarning, STORAGE_WARNING);

// J: read failure falls back to unavailable without throwing.
const readFailure = await resolveOfficialLines({
  request,
  identity,
  currentLines: [],
  venueName: "豊橋",
  buildLineText,
  store: { async get() { throw new Error("read failed"); }, async set() {} },
  now
});
assert.equal(readFailure.lineSource, "unavailable");
assert.equal(readFailure.storageWarning, STORAGE_WARNING);

// K: production, previews and branch deploys can never share a store.
assert.equal(getOfficialLineStoreName({ CONTEXT: "production", BRANCH: "ignored" }), "keirin-official-lines-v1-production");
assert.equal(getOfficialLineStoreName({ CONTEXT: "deploy-preview", BRANCH: "Feature/Line Cache" }), "keirin-official-lines-v1-preview-feature-line-cache");
assert.equal(getOfficialLineStoreName({ CONTEXT: "deploy-preview" }), "keirin-official-lines-v1-preview-unknown");
assert.equal(getOfficialLineStoreName({ CONTEXT: "branch-deploy", BRANCH: "Feature/Line Cache" }), "keirin-official-lines-v1-branch-feature-line-cache");
assert.equal(getOfficialLineStoreName({ CONTEXT: "branch-deploy" }), "keirin-official-lines-v1-branch-unknown");
assert.equal(getOfficialLineStoreName({ CONTEXT: "dev", BRANCH: "main" }), "keirin-official-lines-v1-dev");
let openedWith = null;
const netlifyStore = createNetlifyOfficialLineStore({
  env: { CONTEXT: "deploy-preview", BRANCH: "Feature/Line Cache" },
  getStoreImpl(options) {
    openedWith = options;
    return { async get() { return null; }, async setJSON() {} };
  }
});
await netlifyStore.get(officialLineKey(request));
assert.deepEqual(openedWith, {
  name: "keirin-official-lines-v1-preview-feature-line-cache",
  consistency: "strong"
});

// Non-official line shapes are never saved or used as cache candidates.
const invalidOfficial = await resolveOfficialLines({
  request,
  identity,
  currentLines: fixtureLines.map(item => ({ ...item, sourcePath: "" })),
  venueName: "豊橋",
  buildLineText,
  store: memory,
  now
});
assert.equal(invalidOfficial.lineSource, "unavailable");

// Function integration: current official -> saved -> cached official.
const functionMemory = createMemoryOfficialLineStore();
let browserLines = fixtureLines;
const originalFetch = globalThis.fetch;
const originalServiceUrl = process.env.KEIRIN_BROWSER_SERVICE_URL;
process.env.KEIRIN_BROWSER_SERVICE_URL = "https://railway.fixture";
globalThis.fetch = async () => Response.json(browserPayload(browserLines));
try {
  const url = "https://local/.netlify/functions/keirin-predict?date=20260807&venueCode=45&venueName=%E8%B1%8A%E6%A9%8B&raceNo=2";
  const firstResponse = await handleKeirinPredict({ url }, { officialLineStore: functionMemory });
  const first = await firstResponse.json();
  assert.equal(firstResponse.status, 200, JSON.stringify(first));
  assert.equal(first.lineSource, "official");
  assert.equal(first.dataQuality.lineConfidence, "高");
  const functionFetchedAt = first.lineFetchedAt;
  assert.ok(first.prediction.terminals.length > 0);
  assert.deepEqual(first.prediction.audit.errors, []);

  browserLines = [];
  const secondResponse = await handleKeirinPredict({ url }, { officialLineStore: functionMemory });
  const second = await secondResponse.json();
  assert.equal(secondResponse.status, 200);
  assert.equal(second.officialData.lines.length, 0, "current official response must remain distinguishable");
  assert.equal(second.lineSource, "cached-official");
  assert.equal(second.lineFetchedAt, functionFetchedAt);
  assert.equal(second.dataQuality.effectiveLineCount, 7);
  assert.equal(second.dataQuality.lineConfidence, "高");
  assert.ok(second.warnings.includes("取得済み公式ラインを使用"));
  assert.ok(!second.warnings.some(value => value.includes("公式ライン情報未取得")));
  assert.ok(second.prediction.branches.length > 0);
  assert.ok(second.prediction.terminals.length > 0);
  assert.deepEqual(second.prediction.audit.errors, []);
  assert.ok(second.prediction.purchasePlan.length > 0);
} finally {
  globalThis.fetch = originalFetch;
  if (originalServiceUrl === undefined) delete process.env.KEIRIN_BROWSER_SERVICE_URL;
  else process.env.KEIRIN_BROWSER_SERVICE_URL = originalServiceUrl;
}

function browserPayload(lines) {
  return {
    ok: true,
    officialData: {
      basic: { date: "2026/08/07", venueName: "豊橋", raceNo: 2 },
      participants: fixture.officialData.participants,
      lines,
      odds: { odds: { "1-2-3": 10, "1-3-2": 12 }, diagnostics: { source: "JST013" } }
    },
    audit: {
      identityPassed: true,
      expected: { date: "20260807", venueCode: "45", venueName: "豊橋", raceNo: 2 },
      actual: { date: "20260807", venueName: "豊橋", raceNo: 2 }
    },
    diagnostics: { version: "fixture" }
  };
}

console.log("keirin official line cache tests: ok");
