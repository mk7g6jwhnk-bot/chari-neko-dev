
import assert from "node:assert/strict";
import {runReverseTree} from "../engine/index.mjs";
const k=runReverseTree({sport:"keirin",result:{order:[3,5,1],method:["まくり"]},observations:{sameLineTop2:false,frontRunners:[1],winnerPreRaceRank:2}});
assert.equal(k.audit.passed,true);assert.ok(k.hypotheses.length>=1);
const b=runReverseTree({sport:"boat",result:{order:[1,3,5],method:["逃げ"]},observations:{bestStartBoat:1,topStartBoats:[1,3],exhibitionTopBoats:[5]}});
assert.equal(b.audit.passed,true);
const a=runReverseTree({sport:"auto",result:{order:[6,2,4],method:[]},observations:{surface:"wet",frontHandicapCars:[1,2],rearHandicapCars:[6,7,8],topTrialCars:[6],startTopCars:[6],stableCars:[2,4]}});
assert.equal(a.audit.passed,true);
console.log("Reverse tree tests passed.");
