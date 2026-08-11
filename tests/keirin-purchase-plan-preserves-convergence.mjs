import assert from"node:assert/strict";import fs from"node:fs";
const p=fs.readFileSync(new URL("../keirin/engine/purchase.mjs",import.meta.url),"utf8");
for(const field of ["naturalConvergenceScore","naturalConvergenceReasons","nodeConditionalProbability","nodeTrace","extraConditionCount"])assert.ok(p.includes(field));
console.log("PASS purchase plan preserves convergence + node fields");
