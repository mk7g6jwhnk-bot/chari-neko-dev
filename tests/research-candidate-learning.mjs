import assert from "node:assert/strict";
import { assertRankPreserved, rerankResearchTerminals, temperatureScaleTerminals } from "../research/state-engine/candidate-learning.mjs";

const terminals = [
  { order: [1, 2, 3], terminalProbability: 0.6 },
  { order: [2, 1, 3], terminalProbability: 0.3 },
  { order: [3, 1, 2], terminalProbability: 0.1 }
];
const features = terminals.map((row, index) => ({ order: row.order, initiativeFamilyMass: 0.4 - index * 0.1, fourthCornerFit: 0.8 - index * 0.2 }));

const unchanged = rerankResearchTerminals(terminals, features, { initiativeFamilyLogWeight: 0, fourthCornerFitLogWeight: 0 });
assert.deepEqual(unchanged.map(row => row.order), terminals.map(row => row.order));

const calibrated = temperatureScaleTerminals(terminals, 0.5);
assert.ok(Math.abs(calibrated.reduce((sum, row) => sum + row.calibratedProbability, 0) - 1) < 1e-12);
assert.equal(assertRankPreserved(terminals, calibrated), true);
assert.throws(() => temperatureScaleTerminals(terminals, 0), /POSITIVE_TEMPERATURE_REQUIRED/);

console.log("research candidate learning tests passed");
