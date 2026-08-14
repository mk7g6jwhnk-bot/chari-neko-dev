import assert from "node:assert/strict";
import { calculateStartPower } from "../keirin/start-power/start-power.mjs";

function participant(starts, backCount, homeCount) {
  return {
    raceCategory: "standard",
    officialProfileEvidence: {
      identityPassed: true,
      officialTotalStarts: starts,
      backCount,
      homeCount
    }
  };
}

const low = calculateStartPower(participant(28, 0, 0));
const mid = calculateStartPower(participant(28, 2, 2));
const high = calculateStartPower(participant(28, 8, 8));
const sparse = calculateStartPower(participant(8, 4, 4));
const screenshotZero = calculateStartPower(participant(18, 0, 0));
const screenshotFront = calculateStartPower(participant(22, 11, 11));
const screenshotActive = calculateStartPower(participant(18, 5, 6));

assert.equal(low.startPower, 2.649);
assert.equal(screenshotZero.startPower, 2.649);
assert.ok(high.startPower > mid.startPower && mid.startPower > low.startPower);
assert.ok(high.startPower - low.startPower > 5);
assert.equal(sparse.startPowerEvidence.confidence, "low");
assert.equal(sparse.startPowerEvidence.status, "VERIFIED");
assert.deepEqual(screenshotZero.startPowerEvidence.missingInputs, []);
assert.equal(screenshotZero.startPowerEvidence.rawBackCount, 0);
assert.equal(screenshotZero.startPowerEvidence.rawHomeCount, 0);
assert.equal(screenshotZero.startPowerEvidence.officialTotalStarts, 18);
assert.ok(screenshotActive.startPower >= 7 && screenshotActive.startPower <= 8.5);
assert.ok(screenshotFront.startPower >= 8.5 && screenshotFront.startPower < 9.5);
assert.ok(screenshotFront.startPower > screenshotActive.startPower);
assert.ok(Number.isFinite(screenshotActive.startPowerEvidence.bPercentileScore));
assert.ok(Number.isFinite(screenshotActive.startPowerEvidence.hPercentileScore));

const missing = calculateStartPower(participant(null, 0, 0));
assert.equal(missing.startPower, null);
assert.equal(missing.startPowerEvidence.status, "MISSING_INPUTS");

console.log("keirin startPower current-calibration test passed", {
  zero18: screenshotZero.startPower,
  active18: screenshotActive.startPower,
  front22: screenshotFront.startPower
});
