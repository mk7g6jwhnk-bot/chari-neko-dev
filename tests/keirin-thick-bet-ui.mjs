import assert from"node:assert/strict";import fs from"node:fs";
const app=fs.readFileSync(new URL("../public/app.mjs",import.meta.url),"utf8");
assert.ok(app.includes("function deriveThickBets"));
assert.ok(app.includes("<h3>厚め</h3>"));
assert.ok(app.includes("厚めは新しい買い目ではなく"));
assert.ok(app.includes("clearIndex"));
console.log("PASS thick-bet structural subset");
