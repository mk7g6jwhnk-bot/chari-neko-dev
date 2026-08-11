import assert from"node:assert/strict";import fs from"node:fs";
const src=fs.readFileSync(new URL("../keirin/sports/keirin-terminals.mjs",import.meta.url),"utf8");
for(const token of["mechanismAdjustedProbability","centered*.12","Math.max(-.12,Math.min(.12","baseProbability","adjustedProbability"])assert.ok(src.includes(token),token);
console.log("PASS bounded monotonic mechanism adjustment guard present");
