import assert from"node:assert/strict";import fs from"node:fs";
const app=fs.readFileSync(new URL("../public/app.mjs",import.meta.url),"utf8");
for(const t of["0%カナリア開始","0%カナリア監視","カナリア稼働中","カナリア検証済み","カナリア停止","本番影響0%"])assert.ok(app.includes(t));
console.log("PASS zero-impact canary monitor UI");
