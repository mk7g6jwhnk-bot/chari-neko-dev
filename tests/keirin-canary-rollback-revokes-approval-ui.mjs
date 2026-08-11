import assert from"node:assert/strict";import fs from"node:fs";
const a=fs.readFileSync(new URL("../public/app.mjs",import.meta.url),"utf8");
for(const t of["ロールバック確定・承認失効","最終カナリア承認も失効済み","再審査・再承認"])assert.ok(a.includes(t),t);
console.log("PASS rollback approval invalidation UI");