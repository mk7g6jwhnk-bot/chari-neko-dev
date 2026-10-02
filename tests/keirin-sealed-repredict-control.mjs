import assert from "node:assert/strict";
import fs from "node:fs/promises";
const app=await fs.readFile(new URL("../public/app.mjs",import.meta.url),"utf8");
assert.match(app,/openDetail\(race\).*reuseSealedPrediction\(race,[^)]*local\)/s,"detail open must validate local cache against the server seal");
assert.match(app,/metadata=1/,"saved display must perform lightweight canonical identity validation");
assert.match(app,/function handleDetailPrimary\(\).*state\.sealedLookupBusy/s,"normal action must not predict while seal lookup is pending");
assert.match(app,/function handleDetailSecondary\(\).*if\(state\.snapshot\|\|timeUnknown\)predict\(\)/s,"explicit secondary action remains the repredict path");
assert.doesNotMatch(app,/reuseSealedPrediction\([^)]*\)[\s\S]{0,500}predict\(\)/,"seal reuse must not trigger automatic reprediction");
console.log("OK sealed prediction explicit repredict control test");
