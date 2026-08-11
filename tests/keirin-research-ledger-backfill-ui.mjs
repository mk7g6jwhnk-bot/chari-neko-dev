import assert from"node:assert/strict";import fs from"node:fs";
const app=fs.readFileSync(new URL("../public/app.mjs",import.meta.url),"utf8");
for(const t of["過去結果バックフィル","既存研究レコード保護","縮約形式バックフィル"])assert.ok(app.includes(t));
console.log("PASS research ledger backfill UI");
