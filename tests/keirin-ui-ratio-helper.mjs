import fs from "node:fs";
import assert from "node:assert/strict";
const source=fs.readFileSync(new URL("../public/app.mjs", import.meta.url),"utf8");
assert.match(source,/function\s+fmtRatio\s*\(/,"fmtRatio helper must be defined");
const calls=(source.match(/fmtRatio\s*\(/g)||[]).length;
assert.ok(calls>=2,"fmtRatio should be used by audit UI");
console.log("Keirin UI ratio helper passed");

assert.match(source,/function fmtPct\(/,"fmtPct helper must exist for audit percentage rendering");
