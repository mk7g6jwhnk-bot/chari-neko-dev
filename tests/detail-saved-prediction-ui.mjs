import assert from "node:assert/strict";
import fs from "node:fs/promises";

const app=await fs.readFile(new URL("../public/app.mjs",import.meta.url),"utf8");
const css=await fs.readFile(new URL("../public/styles.css",import.meta.url),"utf8");
const openDetail=app.match(/function openDetail\(race\)\{[^\n]+/u)?.[0]||"";

assert.match(app,/function savedPredictionSummaryForRace\(race\).*predictionHash.*immutable.*HASH_MISMATCH/s,"only explicit readable prediction identities may be offered");
assert.match(app,/function openDetail\(race\).*selectedPredictionHash:predictionHash.*renderDetail\(\);show\("detail"\)/s,"detail must retain the selected immutable identity before payload restoration");
assert.match(app,/else if\(savedHash\)\{\$\("predictBtn"\)\.textContent=state\.sealedLookupBusy\?"保存済み予想を確認中…":"予想を見る"/s,"sealed detail must show the saved-view action before restoration");
assert.match(app,/if\(savedHash\)\{const local=.*reuseSealedPrediction\(state\.race,savedHash/s,"saved-view action must re-read the same hash");
assert.match(app,/predictionHash=\$\{encodeURIComponent\(metadata\.predictionHash\)\}/,"sealed detail body read must use the canonical prediction hash");
assert.doesNotMatch(openDetail,/reuseSealedPrediction\(/,"detail open itself must not perform an eager saved read");

const handler=app.match(/function handleDetailPrimary\(\)\{[^\n]+/u)?.[0]||"";
assert.ok(handler.indexOf("if(savedHash)")<handler.lastIndexOf("predict()"),"saved hash guard must precede prediction generation");
assert.match(handler,/if\(savedHash\).*return\}predict\(\)/s,"saved path must return before generation");
assert.match(app,/else\{\$\("predictBtn"\)\.textContent=state\.sealedLookupBusy\?"保存済み予想を確認中…":"このレースを予想"/s,"unsealed race keeps the existing prediction action");

assert.match(app,/keirin-saved-prediction-detail\?raceKey=.*metadata=1/s,"saved display reads storage metadata, not the prediction-generation endpoint");
assert.doesNotMatch(handler,/keirin-predict|fetchAndSavePredictionForRace/,"saved-view handler must not directly generate or browser-fetch");
assert.match(css,/@media\(max-width:390px\).*\.actionBar\{padding-left:10px;padding-right:10px\}/s,"existing iPhone-width action layout remains responsive");

console.log("OK detail saved prediction UI-only test");
