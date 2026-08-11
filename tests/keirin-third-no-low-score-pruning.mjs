import assert from"node:assert/strict";import fs from"node:fs";
const s=fs.readFileSync(new URL("../keirin/sports/keirin-terminals.mjs",import.meta.url),"utf8");
const block=s.slice(s.indexOf("const thirdCandidates=generateThirdCandidates"),s.indexOf("const bestThird",s.indexOf("const thirdCandidates=generateThirdCandidates")));
assert.ok(block.includes("thirdCandidates.map"));
assert.equal(block.includes(".filter(item=>item.score>0)"),false);
assert.ok(s.includes("GENERATE_ALL_REMAINING_THIRD_CONDITIONS_BEFORE_SCORE_AND_PROBABILITY"));
console.log("PASS no third low-score generation pruning");