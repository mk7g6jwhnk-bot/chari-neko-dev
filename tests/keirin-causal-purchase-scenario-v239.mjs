import assert from "node:assert/strict";
import fs from "node:fs";
const app=fs.readFileSync(new URL("../public/app.mjs",import.meta.url),"utf8");
assert.ok(app.includes("function scenarioBetSentence"));
assert.ok(app.includes("この買い目になるシナリオ"));
assert.ok(app.includes("主導権を想定した理由："));
assert.ok(app.includes('"FIRST_PATH","SECOND_PATH","THIRD_PATH","LINE_ROLE"'));
assert.ok(app.includes("購入判断："));
console.log("PASS v239 causal purchase scenario explanation");
