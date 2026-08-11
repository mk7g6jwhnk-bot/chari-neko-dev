import assert from"node:assert/strict";import fs from"node:fs";
const app=fs.readFileSync(new URL("../public/app.mjs",import.meta.url),"utf8");
for(const t of["カナリア承認","CANARY_SHADOW","本番影響","0%","監査指紋が変われば承認は無効"])assert.ok(app.includes(t));
console.log("PASS final manual approval canary UI");
