import assert from"node:assert/strict";import fs from"node:fs";
const app=fs.readFileSync(new URL("../public/app.mjs",import.meta.url),"utf8");
for(const t of ["研究学習集計","正解1着ファミリー生成率","正解1-2枝生成率","正解終端生成率","終端Log Loss"])assert.ok(app.includes(t));
console.log("PASS research learning aggregate UI");
