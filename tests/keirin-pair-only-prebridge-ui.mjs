import assert from"node:assert/strict";import fs from"node:fs";
const a=fs.readFileSync(new URL("../public/app.mjs",import.meta.url),"utf8");
for(const t of["購入評価前の入口も1-2着専用化","FIRST+SECONDだけの収束度","3着が弱いことでブリッジ到達前に落ちる経路を禁止"])assert.ok(a.includes(t),t);
console.log("PASS pair-only prebridge UI");