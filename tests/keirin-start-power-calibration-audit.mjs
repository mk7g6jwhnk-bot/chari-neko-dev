import assert from "node:assert/strict";
import { KEIRIN_START_POWER_BASELINE } from "../keirin/config/start-power-baseline-v1.mjs";
import { buildStartPowerEvidence } from "../keirin/start-power/start-power.mjs";

function evidence({ category = "standard", starts = 30, backCount = 0, homeCount = 0, profile = true } = {}) {
  return buildStartPowerEvidence({
    raceCategory: category,
    officialProfileEvidence: profile ? { identityPassed: true, officialTotalStarts: starts, backCount, homeCount } : null
  });
}

// The raw census is the scoring distribution.  Its observed zero mass gives
// 0/0 the empirical mid-rank; no arbitrary floor is permitted.
for (const category of ["standard", "girls"]) {
  const baseline = KEIRIN_START_POWER_BASELINE.categories[category];
  assert.equal(baseline.bFrequency.min, 0);
  assert.equal(baseline.hFrequency.min, 0);
  const zero = evidence({ category, starts: 24 });
  assert.equal(zero.rawBPercentileScore, Number((baseline.bFrequency.zeroRate * 5).toFixed(3)));
  assert.equal(zero.rawHPercentileScore, Number((baseline.hFrequency.zeroRate * 5).toFixed(3)));
  assert.equal(zero.value, Number((((baseline.bFrequency.zeroRate + baseline.hFrequency.zeroRate) * 2.5)).toFixed(3)));
}

const cases = [
  [0, 0, 24], [1, 0, 24], [0, 1, 24], [1, 1, 24], [2, 1, 24],
  [2, 2, 24], [4, 3, 25], [6, 7, 20], [10, 10, 30], [15, 15, 30]
].map(([backCount, homeCount, starts]) => ({ backCount, homeCount, starts, result: evidence({ starts, backCount, homeCount }) }));
for (const item of cases) {
  assert.equal(item.result.bFrequency, Number((item.backCount / item.starts).toFixed(3)));
  assert.equal(item.result.hFrequency, Number((item.homeCount / item.starts).toFixed(3)));
  assert.ok(item.result.value >= 0 && item.result.value <= 10);
}
for (let i = 1; i < cases.length; i += 1) {
  assert.ok(cases[i].result.value >= cases[i - 1].result.value, "increasing B/H observations must not lower startPower");
}

// Identical observed rates must have identical ability. Starts only affect
// quality and confidence (the 3-start case uses the observed zero rate).
const zeroByStarts = [3, 5, 10, 20, 30, 50].map(starts => evidence({ starts }));
assert.ok(zeroByStarts.every(item => item.value === zeroByStarts[0].value));
assert.deepEqual(zeroByStarts.map(item => item.startsQuality), [0.167, 0.25, 0.4, 0.571, 0.667, 0.769]);
const oneFifth = [5, 10, 20, 30, 50].map(starts => evidence({ starts, backCount: starts / 5, homeCount: starts / 5 }));
assert.ok(oneFifth.every(item => item.value === oneFifth[0].value));

const casesByFailure = {
  observedZero: evidence({ starts: 24 }),
  noProfile: evidence({ profile: false }),
  missingBh: evidence({ starts: 24, backCount: null, homeCount: null }),
  malformedBh: evidence({ starts: 24, backCount: "not-a-count", homeCount: "2x" }),
  impossibleBh: evidence({ starts: 24, backCount: 25, homeCount: 0 })
};
assert.deepEqual(casesByFailure.observedZero.missingInputs, []);
assert.ok(casesByFailure.noProfile.missingInputs.includes("verifiedOfficialProfile"));
assert.ok(casesByFailure.missingBh.missingInputs.includes("backCount"));
assert.ok(casesByFailure.malformedBh.missingInputs.includes("backCount"));
assert.ok(casesByFailure.impossibleBh.missingInputs.includes("B/H count exceeds officialTotalStarts"));
assert.equal(casesByFailure.observedZero.value, 2.649);
for (const key of ["noProfile", "missingBh", "malformedBh", "impossibleBh"]) {
  assert.equal(casesByFailure[key].value, 5, `${key} must be explicit neutral missing-data handling, not observed zero`);
  assert.notDeepEqual(casesByFailure[key].missingInputs, casesByFailure.observedZero.missingInputs);
}

console.log("start-power calibration audit PASS", JSON.stringify(cases.map(({ backCount, homeCount, starts, result }) => ({ backCount, homeCount, starts, b: result.bFrequency, h: result.hFrequency, bPct: result.rawBPercentileScore, hPct: result.rawHPercentileScore, startPower: result.value }))));
