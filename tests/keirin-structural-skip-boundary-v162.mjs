import assert from "node:assert/strict";
import {derivePredictionRatings} from "../public/prediction-ratings.mjs";
function snap({bets=12,shares=[.20,.17,.15,.12,.10],scores=[9,8,7,5,4],noBet=false,massStatus="BALANCED"}={}){
  return{noBet,betSelections:Array.from({length:bets},(_,i)=>({order:[1,2,(i%5)+3],category:i?"COVER":"MAIN"})),abilitiesUsed:Array.from({length:7},()=>({startPowerEvidence:{confidence:"medium",missingInputs:[]}})),predictionOutput:{lineConfidence:"高",audit:{generatedTerminalCount:210,adoptedTerminalCount:bets,branchSelectionAudit:{tiering:{contenderCutGap:2.5},rows:scores.map((score,i)=>({score,share:shares[i]}))},purchaseMassAudit:{eligibleCoverage:.82,weightedCoverageTarget:.75,massEfficiency:.96,status:massStatus}}}};
}
const many=derivePredictionRatings(snap({bets:12}));
const more=derivePredictionRatings(snap({bets:18}));
assert.equal(many.verdict,"購入可");
assert.equal(more.verdict,"購入可");
assert.equal(many.concentration,more.concentration,"買い目点数だけで集中度を変えている");
assert.equal(many.confidence,more.confidence,"買い目点数だけで信頼度を変えている");
const under=derivePredictionRatings(snap({bets:6,massStatus:"UNDER_COVERED"}));
assert.equal(under.verdict,"見送り寄り","少点数でも購入質量不足は注意扱いにする");
const ref=derivePredictionRatings(snap({bets:7,noBet:true}));
assert.equal(ref.verdict,"見送り","参考買い目/noBetを通常購入扱いしている");
assert.equal(ref.confidence,1);
assert.ok(ref.consistencyAudit.invariantChecks.every(x=>x.passed));
console.log("PASS v162 structural skip boundary",{many:many.verdict,more:more.verdict,under:under.verdict,reference:ref.verdict});
