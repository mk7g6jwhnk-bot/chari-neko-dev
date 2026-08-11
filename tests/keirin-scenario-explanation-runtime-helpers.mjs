import assert from"node:assert/strict";
import fs from"node:fs";
const app=fs.readFileSync(new URL("../public/app.mjs",import.meta.url),"utf8");
assert.ok(app.includes("function renderScenarioExplanation"));
assert.ok(app.includes("function renderPredictionAxisExplanation"));
assert.ok(app.includes("function renderPurchaseScenarioExplanation"));
assert.ok(!app.includes("function explainMarkScenarioGap"),"retired rider-mark gap helper must stay removed");
assert.ok(!app.includes("展開説明：なぜこの買い目になったか"),"retired purchase-origin scenario heading must stay removed");
console.log("PASS prediction/purchase explanation runtime helpers");
