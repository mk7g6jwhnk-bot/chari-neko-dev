import assert from"node:assert/strict";import fs from"node:fs";
const a=fs.readFileSync(new URL("../public/app.mjs",import.meta.url),"utf8");
for(const x of["3着専用工程","3着条件を先に独立生成","低確率を理由に終端生成段階では削除しません"])assert.ok(a.includes(x),x);
console.log("PASS dedicated third UI note");