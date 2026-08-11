import assert from"node:assert/strict";
import fs from"node:fs";
const app=fs.readFileSync(new URL("../public/app.mjs",import.meta.url),"utf8");
assert.ok(app.includes("function unique(rows)"),"scenario explanation unique helper must exist");
const refs=(app.match(/\bunique\(/g)||[]).length;
assert.ok(refs>=2,"expected helper definition plus direct scenario explanation use");
assert.ok(app.includes("function renderScenarioExplanation"));
assert.ok(!app.includes("function explainMarkScenarioGap"),"retired rider-mark gap helper must stay removed");
console.log("PASS scenario explanation runtime helpers after rider-mark retirement");
