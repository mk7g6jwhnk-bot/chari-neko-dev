import assert from"node:assert/strict";import fs from"node:fs";
const app=fs.readFileSync(new URL("../public/app.mjs",import.meta.url),"utf8");
for(const t of["確率質量 正常","確率質量 異常","確率質量 未監査","平均終端確率質量","校正済み確率とは扱いません"])assert.ok(app.includes(t),t);
console.log("PASS probability mass audit UI");
