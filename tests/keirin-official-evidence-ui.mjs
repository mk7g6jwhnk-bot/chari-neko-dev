import assert from"node:assert/strict";import fs from"node:fs";
const app=fs.readFileSync(new URL("../public/app.mjs",import.meta.url),"utf8");
for(const t of["公式証拠","公式証拠で自動判定","決まり手","構造化された追加証拠なし"])assert.ok(app.includes(t));
console.log("PASS official evidence UI");
