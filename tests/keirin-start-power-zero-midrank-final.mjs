import assert from "node:assert/strict";
import {applyStartPowerEvidence} from "../keirin/start-power/start-power.mjs";

const make=(number,b,h,starts,category="standard")=>({
  number,
  raceCategory:category,
  officialTotalStarts:starts,
  backCount:b,
  homeCount:h,
  officialProfileEvidence:{
    identityPassed:true,
    backCount:b,
    homeCount:h,
    officialTotalStarts:starts
  }
});

for (const starts of [3,17,21,24,27]) {
  const out=applyStartPowerEvidence([make(1,0,0,starts)])[0];
  assert.equal(out.startPower,2.649);
  assert.deepEqual(out.startPowerEvidence.missingInputs,[]);
}

const girls=applyStartPowerEvidence([make(1,0,0,24,"girls")])[0];
assert.equal(girls.startPower,1.531);

const missing=applyStartPowerEvidence([{
  number:1,raceCategory:"standard",officialTotalStarts:24,
  officialProfileEvidence:{identityPassed:false}
}])[0];
assert.equal(missing.startPower,null);
assert.ok(missing.startPowerEvidence.missingInputs.includes("verifiedOfficialProfile"));

const invalid=applyStartPowerEvidence([make(1,25,0,24)])[0];
assert.equal(invalid.startPower,null);
assert.ok(invalid.startPowerEvidence.missingInputs.includes("B/H count exceeds officialTotalStarts"));

const one=applyStartPowerEvidence([make(1,1,1,24)])[0];
assert.ok(one.startPower>2.649 && one.startPower<10);

console.log("PASS start-power zero-midrank regression", {
  zero3:applyStartPowerEvidence([make(1,0,0,3)])[0].startPower,
  zero24:applyStartPowerEvidence([make(1,0,0,24)])[0].startPower,
  one24:one.startPower,
  girlsZero:girls.startPower
});
