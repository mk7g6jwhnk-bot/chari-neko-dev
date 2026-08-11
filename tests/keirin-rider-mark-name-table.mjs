import assert from"node:assert/strict";
import fs from"node:fs";
const app=fs.readFileSync(new URL("../public/app.mjs",import.meta.url),"utf8");
assert.doesNotMatch(app,/function renderRiderMarkNameTable/);
assert.doesNotMatch(app,/選手印を見る/);
assert.doesNotMatch(app,/印 → 着順評価 → 買い目/);
assert.match(app,/着順別評価を見る/);
assert.match(app,/買い目との矛盾は全体連動監査で確認します/);
console.log("PASS rider mark UI retired; direct linkage remains");
