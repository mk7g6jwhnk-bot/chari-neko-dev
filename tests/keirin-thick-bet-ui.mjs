import assert from"node:assert/strict";import fs from"node:fs";
const app=fs.readFileSync(new URL("../public/app.mjs",import.meta.url),"utf8");
const funding=fs.readFileSync(new URL("../public/purchase-funding.mjs",import.meta.url),"utf8");
assert.ok(app.includes('from"./purchase-funding.mjs"'));
assert.ok(app.includes("<h3>厚め</h3>"));
assert.ok(app.includes("厚めは新しい買い目ではなく"));
assert.ok(funding.includes("function deriveThickBets")||funding.includes("export function deriveThickBets"));
assert.ok(funding.includes("categoryUsedInPriorityScore:false"));
console.log("PASS thick-bet funding separation UI");
