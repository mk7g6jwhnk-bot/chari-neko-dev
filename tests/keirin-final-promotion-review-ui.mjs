import assert from"node:assert/strict";import fs from"node:fs";
const app=fs.readFileSync(new URL("../public/app.mjs",import.meta.url),"utf8");
for(const t of["最終昇格審査ゲート","最終審査へ進行可","最終審査は保留","監査指紋","本番値は変更しません"])assert.ok(app.includes(t));
console.log("PASS final promotion review gate UI");
