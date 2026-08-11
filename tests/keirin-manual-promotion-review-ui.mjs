import assert from"node:assert/strict";import fs from"node:fs";
const app=fs.readFileSync(new URL("../public/app.mjs",import.meta.url),"utf8");
for(const t of["現在の審査","シャドー承認","追加データ待ち","現時点では採用しない","本番値は変更しません"])assert.ok(app.includes(t));
console.log("PASS manual promotion review UI");
