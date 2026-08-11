import fs from "node:fs";
const src=fs.readFileSync(new URL("../public/app.mjs",import.meta.url),"utf8");
for(const token of ["function friendlyPurchaseReason","なぜ買う？","判断材料","分類チェック","詳しい購入監査を見る（開発用）","買い目の理由を見る"]){
  if(!src.includes(token))throw new Error(`missing human purchase UI token: ${token}`);
}
if(!src.includes("高配当だから本線なのではなく、主展開由来"))throw new Error("main high-odds classification explanation missing");
console.log("Keirin human purchase reason UI passed");
