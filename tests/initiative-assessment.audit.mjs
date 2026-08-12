import assert from "node:assert/strict";
import { assessInitiative } from "../keirin/engine/initiative-assessment.mjs";

const scored = [
  {number:1,lineId:"A",lineOrder:1,role:"自力",officialScore:115,officialScoreGapToFieldMean:8,recentForm:8,startPower:8,stamina:8,roleScores:{first:8}},
  {number:2,lineId:"A",lineOrder:2,role:"番手",officialScore:95,officialScoreGapToFieldMean:-12,recentForm:7,startPower:5,stamina:7,roleScores:{first:6}},
  {number:3,lineId:"B",lineOrder:1,role:"自力",officialScore:103,officialScoreGapToFieldMean:-4,recentForm:7,startPower:7,stamina:7,roleScores:{first:7}},
];

const result = assessInitiative({scored, lines:[{id:"A"},{id:"B"}]});
assert.equal(result.version, "INITIATIVE-ASSESSMENT-1.0");
assert.equal(result.candidates.length, 3);
assert.equal(result.top.riderNumber, 1);
assert.ok(result.marginToSecond >= 0);
console.log("initiative assessment audit: PASS");
