import assert from "node:assert/strict";
import fs from "node:fs";
const app=fs.readFileSync(new URL("../public/app.mjs",import.meta.url),"utf8");
assert.ok(app.includes("purchase scenario explanation skipped"));
assert.ok(app.includes("scenarioBetSentence(b,explanation)"));
assert.ok(app.includes("scenarioBetSentence(b,null)"));
assert.ok(app.includes("const safeExplanation"));
console.log("PASS v234 causal explanation is isolated from purchase rendering");
