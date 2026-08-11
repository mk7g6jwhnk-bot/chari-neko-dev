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
  "印を買い目に強制一致させていません"
])assert.ok(app.includes(text),`${text} missing`);
console.log("PASS scenario explanation UI");
