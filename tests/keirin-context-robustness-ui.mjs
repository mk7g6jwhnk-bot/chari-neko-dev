import assert from"node:assert/strict";import fs from"node:fs";
const app=fs.readFileSync(new URL("../public/app.mjs",import.meta.url),"utf8");
for(const t of["会場横断合格","会場横断不合格","会場標本不足","独立昇格監査へ進行可","独立昇格監査は保留"])assert.ok(app.includes(t));
console.log("PASS context robustness audit UI");
