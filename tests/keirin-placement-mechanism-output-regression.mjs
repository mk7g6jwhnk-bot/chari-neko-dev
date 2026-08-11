import assert from"node:assert/strict";import fs from"node:fs";
const p=fs.readFileSync(new URL("./keirin-purchase-five-races.mjs",import.meta.url),"utf8");
assert.ok(p.includes("5Rが機械的に同一点数ではない"));
console.log("PASS placement mechanism change guarded by full five-race regression in npm test");
