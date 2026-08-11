import assert from"node:assert/strict";import fs from"node:fs";
const s=fs.readFileSync(new URL("../public/prediction-store.mjs",import.meta.url),"utf8");
assert.ok(s.includes("function sensitivityAuditFixed"));
assert.ok(s.includes("fullDataRecalculation:false"));
assert.ok(s.includes('proposalSource:"TRAIN_ONLY_FIXED"'));
assert.ok(s.includes('validationScope:"SEALED_HOLDOUT_ONLY"'));
assert.ok(!/function sensitivityAudit\(rows\)/.test(s));
console.log("PASS no downstream full-data sensitivity recalculation");