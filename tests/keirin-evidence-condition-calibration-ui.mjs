import assert from"node:assert/strict";import fs from"node:fs";
const app=fs.readFileSync(new URL("../public/app.mjs",import.meta.url),"utf8");
for(const t of["成立条件の確率校正","再校正候補","要監視","標本不足","本番値は変更しません"])assert.ok(app.includes(t));
console.log("PASS evidence condition calibration UI");
