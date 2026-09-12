import assert from "node:assert/strict";
import fs from "node:fs";
const source=fs.readFileSync(new URL("../public/app.mjs",import.meta.url),"utf8");
const {periodHtml}=await import('../public/performance-page.mjs');
const empty=periodHtml({periods:{today:{evaluatedRaces:0,investment:0,return:0,roi:null,hitRate:null}}});
assert.ok(empty.includes('0円'));assert.ok(empty.includes('—'));assert.ok(!empty.includes('NaN'));
for(const label of ["開催","対象","prefetch","発走前seal","seal失敗","発走前未達"])assert.ok(source.includes(`"${label}"`));
assert.ok(periodHtml({periods:{today:{categories:{}}}}).includes('data-category="thick"'));
console.log("PASS performance unknown/zero UI separation and daily collection fields");
