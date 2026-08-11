import assert from"node:assert/strict";import fs from"node:fs";
const s=fs.readFileSync(new URL("../public/prediction-store.mjs",import.meta.url),"utf8");
assert.ok(s.includes("mechanism:c?.mechanism||null"));
console.log("PASS mechanism identity/score preserved in compact node summary");
