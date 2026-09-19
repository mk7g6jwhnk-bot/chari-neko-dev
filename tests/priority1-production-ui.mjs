import assert from "node:assert/strict";
import fs from "node:fs";
const app=fs.readFileSync(new URL("../public/app.mjs",import.meta.url),"utf8"),resultProxy=fs.readFileSync(new URL("../netlify/functions/keirin-result.mjs",import.meta.url),"utf8"),sealed=fs.readFileSync(new URL("../public/sealed-result-client.mjs",import.meta.url),"utf8");
assert.match(resultProxy,/requestType: "manual_result"/,"manual result fetch must use canonical manual queue path");
assert.match(app,/canonicalHistoryPurchase/);assert.match(app,/購入成績対象外/);assert.match(app,/購入投資/);assert.match(app,/raceLifecycleView/);assert.match(app,/phase==="result-pending"/);assert.doesNotMatch(sealed,/standardPurchaseHit:verification\.standardPurchaseHit/,"reference verification must not become purchase hit");
console.log("PASS Priority 1 UI/manual fetch/lifecycle guards");
