import assert from "node:assert/strict";
import { createSnapshot } from "../public/prediction-store.mjs";

const evidence={
  value:9.3, confidence:"high", officialTotalStarts:28,
  rawBackCount:8, rawHomeCount:8,
  bFrequency:0.286, hFrequency:0.286,
  shrunkBFrequency:0.211, shrunkHFrequency:0.21,
  latentScore:9.3, startsQuality:0.651,
  raceCategory:"standard", priorStrength:15, missingInputs:[]
};
const snapshot=createSnapshot({
  race:{date:"20260809",venueCode:"28",venue:"立川",raceNo:3,participants:[{number:1,name:"A"}]},
  prediction:{engineVersion:"KEIRIN-0.5.9-start-power-empirical-quantile",scored:[{number:1,startPower:9.3,startPowerEvidence:evidence}],purchasePlan:[]}
},new Date("2026-08-09T03:00:00Z"));
assert.deepEqual(snapshot.abilitiesUsed[0].startPowerEvidence,evidence);
assert.equal(snapshot.abilitiesUsed[0].startPower,9.3);
console.log("keirin start-power input audit PASS");
