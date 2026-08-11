import assert from"node:assert/strict";
import{buildOutcomeDiagnostics,summarizeOutcomeDiagnostics}from"../public/research-outcome-diagnostics.mjs";
const snapshot={abilitiesUsed:[],riderMarks:[],branches:[],terminalLedger:[{order:[1,2,3],probability:.18}],betSelections:[
 {order:[1,2,3],category:"MAIN",probability:.18,naturalConvergenceScore:.9,odds:5,stake:500},
 {order:[1,3,2],category:"MAIN",probability:.10,naturalConvergenceScore:.7,odds:9,stake:300},
 {order:[4,5,6],category:"BUYABLE_HIGH",probability:.025,naturalConvergenceScore:.25,odds:120,stake:200}
]};
const miss=buildOutcomeDiagnostics(snapshot,{officialFinishOrder:[4,5,6],officialPayout:15000});
assert.equal(miss.researchOnly,true);assert.equal(miss.productionWriteAllowed,false);assert.ok(miss.tags.includes("HIGH_PAYOUT_CAPTURED"));
const gami=buildOutcomeDiagnostics(snapshot,{officialFinishOrder:[1,2,3],officialPayout:150});
assert.ok(gami.tags.includes("HIT_BUT_NEGATIVE_RETURN"));assert.equal(gami.netReturn,-250);
const missedHigh=buildOutcomeDiagnostics({...snapshot,betSelections:snapshot.betSelections.slice(0,2)},{officialFinishOrder:[4,5,6],officialPayout:15000});
assert.ok(missedHigh.tags.includes("HIGH_PAYOUT_OPPORTUNITY_MISSED"));assert.ok(missedHigh.tags.includes("HIGH_PAYOUT_TERMINAL_GENERATION_MISS"));
const sum=summarizeOutcomeDiagnostics([miss,gami,missedHigh]);assert.equal(sum.highPayoutRaceCount,2);assert.equal(sum.highPayoutMissCount,1);assert.equal(sum.negativeReturnHitCount,1);
console.log("PASS research outcome diagnostics");
