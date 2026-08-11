import assert from"node:assert/strict";import fs from"node:fs";
const a=fs.readFileSync(new URL("../public/app.mjs",import.meta.url),"utf8");
for(const t of["ロールバック確定","data-canary-rollback","同じ監査指紋","新しい監査指紋"])assert.ok(a.includes(t),t);
console.log("PASS canary rollback lock UI");