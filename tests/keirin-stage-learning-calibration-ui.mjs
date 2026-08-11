import assert from"node:assert/strict";import fs from"node:fs";
const app=fs.readFileSync(new URL("../public/app.mjs",import.meta.url),"utf8");
for(const t of["1着候補の生成漏れ","2着枝の生成漏れ","3着終端の生成漏れ","確率校正","2着｜1着","3着｜1-2着","確率帯を見る","終端Log Loss"])assert.ok(app.includes(t),`${t} missing`);
console.log("PASS stage learning calibration UI");
