import fs from "node:fs";
const src=fs.readFileSync(new URL("../public/app.mjs",import.meta.url),"utf8");
for(const token of [
  "function safeFriendlyBetReason",
  "friendly purchase reason render failed",
  "prediction detail render failed",
  "この表示エラーでレース画面や保存済み予想を開けなくならないよう保護しています"
]){
  if(!src.includes(token)) throw new Error(`missing detail render guard: ${token}`);
}
console.log("Keirin detail render guard passed");
