import assert from"node:assert/strict";
import fs from"node:fs";
const app=fs.readFileSync(new URL("../public/app.mjs",import.meta.url),"utf8");
for(const text of [
  "展開説明：なぜこの買い目になったか",
  "レース全体の説明",
  "本線にしました",
  "押さえにしました",
  "高配当候補にしました",
  "自然収束度",
  "着順別評価・主展開枝・自然収束度・購入分類"
])assert.ok(app.includes(text),`${text} missing`);
assert.ok(!app.includes("印を買い目に強制一致させていません"));
console.log("PASS scenario explanation UI without rider marks");
