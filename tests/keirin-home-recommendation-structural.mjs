import assert from"node:assert/strict";import fs from"node:fs";
const app=fs.readFileSync(new URL("../public/app.mjs",import.meta.url),"utf8");
assert.ok(app.includes("function evaluateRecommendation"));
assert.ok(app.includes("本線なし"));
assert.ok(app.includes("展開連動に高重要度警告"));
assert.ok(app.includes("本線・連動・自然収束・オッズ・購入質量の構造条件を通過"));
assert.ok(!app.slice(app.indexOf("function renderHomeRecommendations"),app.indexOf("function openMeetings")).includes(".slice(0,limit);count.textContent"));
console.log("PASS structural home recommendations");
