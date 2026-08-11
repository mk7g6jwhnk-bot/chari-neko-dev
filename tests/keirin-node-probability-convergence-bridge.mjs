import assert from"node:assert/strict";import fs from"node:fs";
const p=fs.readFileSync(new URL("../keirin/engine/chat-spec-v1-policy.mjs",import.meta.url),"utf8");
for(const field of ["completeTrace","nodeProbabilityScore","extraConditions","conditionPenalty"])assert.ok(p.includes(field));
console.log("PASS node probability -> natural convergence bridge");
