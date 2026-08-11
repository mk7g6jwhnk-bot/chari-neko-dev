import assert from"node:assert/strict";import fs from"node:fs";
const app=fs.readFileSync(new URL("../public/app.mjs",import.meta.url),"utf8");
for(const t of["シャドー運用判定","標本蓄積中","シャドー継続","シャドー検証済み","ロールバック推奨"])assert.ok(app.includes(t));
console.log("PASS shadow qualification UI");
