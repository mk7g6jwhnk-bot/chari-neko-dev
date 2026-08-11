import assert from"node:assert/strict";
import fs from"node:fs";
const app=fs.readFileSync(new URL("../public/app.mjs",import.meta.url),"utf8");
for(const text of [
  "軸になった展開と根拠",
  "軸になった展開",
  "この展開を軸にした根拠",
  "この展開から自然につながる上位終端",
  "代替展開を見る",
  "購入エンジン：なぜこの買い目を採用したか",
  "予測エンジンが保存した展開枝・着順条件・終端確率"
])assert.ok(app.includes(text),`${text} missing`);
assert.ok(!app.includes("展開説明：なぜこの買い目になったか"),"purchase-origin explanation heading must stay retired");
assert.ok(!app.includes("印を買い目に強制一致させていません"));
console.log("PASS prediction-axis explanation UI separated from purchase explanation");
