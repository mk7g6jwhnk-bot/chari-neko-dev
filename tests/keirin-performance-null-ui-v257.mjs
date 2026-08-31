import assert from "node:assert/strict";
import fs from "node:fs";
const source=fs.readFileSync(new URL("../public/app.mjs",import.meta.url),"utf8");
assert.match(source,/v===null\|\|v===undefined\|\|!Number\.isFinite\(Number\(v\)\)\?"—"/);
for(const label of ["開催","対象","prefetch","発走前seal","seal失敗","発走前未達"])assert.ok(source.includes(`"${label}"`));
assert.ok(source.includes('p?.categories?.[key]'));
console.log("PASS performance unknown/zero UI separation and daily collection fields");
