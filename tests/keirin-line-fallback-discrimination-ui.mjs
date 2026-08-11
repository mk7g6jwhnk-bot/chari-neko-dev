import assert from"node:assert/strict";import fs from"node:fs";
const app=fs.readFileSync(new URL("../public/app.mjs",import.meta.url),"utf8");
for(const t of["並び未取得時の全員MAIN化も防止","参考買い目だけを残します","終端は削除しません"])assert.ok(app.includes(t),t);
console.log("PASS line fallback discrimination UI note");