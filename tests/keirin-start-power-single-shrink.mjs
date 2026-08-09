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

assert.equal(low.value, Math.max(0.5, Math.min(9.5, low.latentScore)));
assert.equal(mid.value, Math.max(0.5, Math.min(9.5, mid.latentScore)));
assert.equal(high.value, Math.max(0.5, Math.min(9.5, high.latentScore)));
assert.ok(high.value - low.value > 4, "startPower should no longer collapse riders into a narrow 5.x band");
assert.ok(high.value > mid.value && mid.value > low.value, "B/H evidence ordering must remain monotonic");
assert.equal(sparse.confidence, "low", "small-sample uncertainty must remain visible as confidence");
assert.ok(sparse.inputsUsed.includes("startsQualityConfidenceDiagnostic"));
assert.ok(!sparse.inputsUsed.includes("startsQualityNeutralShrinkage"));

console.log("keirin startPower single-shrink test passed", {
  low: low.value, mid: mid.value, high: high.value, sparse: sparse.value, sparseConfidence: sparse.confidence
});
