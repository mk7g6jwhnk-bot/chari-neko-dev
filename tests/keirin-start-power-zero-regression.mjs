import assert from "node:assert/strict";
import { buildStartPowerEvidence } from "../keirin/start-power/start-power.mjs";

function observed(starts, backCount, homeCount) {
  return buildStartPowerEvidence({
    raceCategory: "standard",
    officialProfileEvidence: { identityPassed: true, officialTotalStarts: starts, backCount, homeCount }
  });
}

// All cases are observed official counts.  A missing profile is tested
// separately so that 0 is never silently converted into missing data.
const cases = [[0, 0, 3], [0, 0, 17], [0, 0, 21], [0, 0, 24], [0, 0, 27], [1, 1, 21], [4, 3, 25], [6, 7, 20]];
const evidence = cases.map(([backCount, homeCount, officialTotalStarts]) => observed(officialTotalStarts, backCount, homeCount));
for (const item of evidence) {
  assert.equal(item.profileIdentityPassed, true);
  assert.deepEqual(item.missingInputs, []);
  assert.ok(Number.isFinite(item.bFrequency));
  assert.ok(Number.isFinite(item.hFrequency));
  assert.ok(Number.isFinite(item.shrunkBFrequency));
  assert.ok(Number.isFinite(item.shrunkHFrequency));
}

const zeroes = evidence.slice(0, 5);
assert.ok(zeroes.every(item => item.value === 2.649), "observed B0/H0 must use the census zero-rate mid-rank, not a sample-size-dependent floor");
assert.ok(zeroes.every(item => item.value !== 5), "observed B0/H0 is never the neutral/missing fallback");
assert.deepEqual(zeroes.map(item => item.startsQuality), [0.167, 0.531, 0.583, 0.615, 0.643]);
assert.ok(evidence[5].value > zeroes[0].value);
assert.ok(evidence[6].value > evidence[5].value);
assert.ok(evidence[7].value > evidence[6].value);

const missing = buildStartPowerEvidence({ raceCategory: "standard", officialProfileEvidence: null });
assert.equal(missing.value, 5);
assert.ok(missing.missingInputs.includes("verifiedOfficialProfile"));
assert.notDeepEqual(missing.missingInputs, zeroes[0].missingInputs);

const invalid = observed(20, 21, 0);
assert.ok(invalid.missingInputs.includes("B/H count exceeds officialTotalStarts"));
console.log("start-power observed-zero regression PASS", evidence.map(item => item.value).join(","));
