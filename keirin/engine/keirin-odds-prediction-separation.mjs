import assert from "node:assert/strict";
import fs from "node:fs/promises";
const text=await fs.readFile(new URL("../keirin/engine/keirin-engine.mjs",import.meta.url),"utf8");
assert.match(text,/const predictionClassified=a\.passed\?classify\(terminals,\{\}\):terminals/);
assert.match(text,/applyPurchaseValueOnly\(predictionClassified,oddsByOrder\)/);
assert.match(text,/PROBABILITY_X_MARKET_ODDS/);
console.log("keirin-odds-prediction-separation: ok");
