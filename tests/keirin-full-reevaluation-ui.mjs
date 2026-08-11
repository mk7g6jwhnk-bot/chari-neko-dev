import assert from"node:assert/strict";import fs from"node:fs";
const app=fs.readFileSync(new URL("../public/app.mjs",import.meta.url),"utf8");
for(const t of["着順再評価監査","残り全員を2着へ","残り全員を3着へ","別線番手・後位の混合終端"])assert.ok(app.includes(t),t);
console.log("PASS full reevaluation audit UI note");