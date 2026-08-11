import assert from"node:assert/strict";import fs from"node:fs";
const app=fs.readFileSync(new URL("../public/app.mjs",import.meta.url),"utf8");
for(const t of["訓練側で固定した同じ提案値","全データで提案値を作り直しません"])assert.ok(app.includes(t),t);
console.log("PASS sealed validation pipeline UI");