import fs from "node:fs";
import assert from "node:assert/strict";

const app=fs.readFileSync(new URL("../public/app.mjs",import.meta.url),"utf8");
assert.match(app,/performancePage\.open\(\);void loadCollectorStatus\(\)/,"opening performance must refresh canonical status");
assert.match(app,/state\.screen==="performance"\|\|state\.screen==="home"/,"visible performance/home surfaces must refresh status");
assert.match(app,/document\.visibilityState!=="visible"\)return/,"background tabs must not poll collector status");
assert.match(app,/APP_UPDATE_CHECK_INTERVAL_MS=5\*60\*1000/,"status refresh must remain low-frequency");
console.log("performance live refresh: PASS");
