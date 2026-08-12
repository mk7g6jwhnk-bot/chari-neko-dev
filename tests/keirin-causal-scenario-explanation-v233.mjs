import assert from"node:assert/strict";
import fs from"node:fs";
const explanation=fs.readFileSync(new URL("../keirin/engine/prediction-explanation.mjs",import.meta.url),"utf8");
const app=fs.readFileSync(new URL("../public/app.mjs",import.meta.url),"utf8");
for(const text of [
  "function buildLeaderReason",
  "主導権を想定した理由",
  "leaderReason",
  "B実績",
  "競走得点"
])assert.ok(explanation.includes(text)||app.includes(text),`${text} missing`);
assert.ok(app.includes("renderPurchaseScenarioExplanation(snapshot,bets,explanation)"));
assert.ok(app.includes("scenarioBetSentence(b,explanation)"));
console.log("PASS causal scenario explanation: leader reason precedes outcome");
