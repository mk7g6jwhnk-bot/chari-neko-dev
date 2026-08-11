import assert from"node:assert/strict";import fs from"node:fs";
const app=fs.readFileSync(new URL("../public/app.mjs",import.meta.url),"utf8");
for(const t of["証拠確定率","直近証拠の確定率","ロールバック推奨"])assert.ok(app.includes(t),t);
console.log("PASS canary evidence quality UI");
