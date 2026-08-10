import assert from "node:assert/strict";
import { buildStartPowerEvidence } from "../keirin/start-power/start-power.mjs";

function participant(starts, backCount, homeCount) {
  return {
    raceCategory: "standard",
    officialForeignFlag: false,
    officialProfileEvidence: {
      identityPassed: true,
      officialTotalStarts: starts,
      backCount,
      homeCount,
      winningStyleRates: {}
    }
  };
}

const low = buildStartPowerEvidence(participant(28, 0, 0));
const mid = buildStartPowerEvidence(participant(28, 2, 2));
const high = buildStartPowerEvidence(participant(28, 8, 8));
const sparse = buildStartPowerEvidence(participant(8, 4, 4));
const screenshotZero = buildStartPowerEvidence(participant(18, 0, 0));
const screenshotFront = buildStartPowerEvidence(participant(22, 11, 11));
const screenshotActive = buildStartPowerEvidence(participant(18, 5, 6));

assert.ok(high.value > mid.value && mid.value > low.value, "B/H evidence ordering must remain monotonic");
assert.ok(high.value - low.value > 5, "empirical mapping should preserve meaningful rider separation");
assert.equal(sparse.confidence, "low", "small-sample uncertainty must remain visible as confidence");
assert.ok(sparse.inputsUsed.includes("startsQualityConfidenceDiagnostic"));
assert.ok(sparse.inputsUsed.includes("standard.shrunkFrequencyEmpiricalQuantiles"));
assert.ok(!sparse.inputsUsed.includes("startsQualityNeutralShrinkage"));

// Regression cases from the live audit after officialTotalStarts was fixed.
// They must no longer bunch at 9.1-9.5 merely because the skewed B/H
// distribution was forced through a normal CDF.
assert.ok(screenshotZero.value >= 3 && screenshotZero.value <= 4.5, `0/18 should remain low but not pathological: ${screenshotZero.value}`);
assert.ok(screenshotActive.value >= 7 && screenshotActive.value <= 8.5, `5B/6H over 18 starts should be strong but not saturated: ${screenshotActive.value}`);
assert.ok(screenshotFront.value >= 8.5 && screenshotFront.value < 9.5, `11B/11H over 22 starts should be elite but below hard saturation: ${screenshotFront.value}`);
assert.ok(screenshotFront.value > screenshotActive.value && screenshotActive.value > screenshotZero.value);
assert.ok(Number.isFinite(screenshotActive.bPercentileScore));
assert.ok(Number.isFinite(screenshotActive.hPercentileScore));

console.log("keirin startPower empirical-quantile test passed", {
  low: low.value, mid: mid.value, high: high.value, sparse: sparse.value,
  zero18: screenshotZero.value, active18: screenshotActive.value, front22: screenshotFront.value
});
