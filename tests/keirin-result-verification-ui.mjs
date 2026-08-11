import assert from"node:assert/strict";import fs from"node:fs";
const app=fs.readFileSync(new URL("../public/app.mjs",import.meta.url),"utf8");
for(const t of ["結果検証・研究学習","正解終端の生成漏れ","本番ロジック自動反映: しない","原因ノードは公式経過・映像等の証拠が取れるまで保留"])assert.ok(app.includes(t));
console.log("PASS result verification UI");
