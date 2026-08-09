import assert from "node:assert/strict";
import fs from "node:fs";
const source=fs.readFileSync(new URL("../public/app.mjs",import.meta.url),"utf8");
const fn=source.match(/function nextFrontierRaces\([^\n]+/)?.[0]||"";
assert.ok(fn.includes("activeMap.has(code)"),"scan result must distinguish a completed venue from missing scan data");
assert.ok(fn.includes("if(!pool.length)continue"),"completed venues must not fall back to old race numbers");
assert.ok(fn.includes("for(let depth=0;out.length<limit;depth++)"),"remaining slots must be filled by later races from active venues");
assert.ok(fn.includes("queue[depth]"),"single active venue should be able to supply multiple next races");
console.log("PASS screening pagination");
