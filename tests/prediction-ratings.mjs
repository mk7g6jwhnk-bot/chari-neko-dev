import assert from"node:assert/strict";
import{derivePredictionRatings,starText}from"../public/prediction-ratings.mjs";

function snapshot({shares,scores,bets,generated=210,cutGap=0,lineConfidence="高",noBet=false}){
  return{
    noBet,
    betSelections:Array.from({length:bets},(_,i)=>({order:[1,2,(i%5)+3],category:i?"COVER":"MAIN"})),
    abilitiesUsed:Array.from({length:7},()=>({startPowerEvidence:{confidence:"medium",missingInputs:[]}})),
    predictionOutput:{lineConfidence,audit:{generatedTerminalCount:generated,adoptedTerminalCount:bets,branchSelectionAudit:{tiering:{contenderCutGap:cutGap},rows:scores.map((score,i)=>({score,share:shares[i]}))}}}
  };
}

const diffuse=snapshot({shares:[.078,.078,.077,.071,.069,.069],scores:[7.145,7.132,7.010,6.502,6.267,6.260],bets:47,cutGap:.938});
const focused=snapshot({shares:[.159,.142,.134,.130,.129,.07],scores:[7.687,6.871,6.492,6.284,6.251,3.912],bets:6,generated:504,cutGap:2.339});
const d=derivePredictionRatings(diffuse),f=derivePredictionRatings(focused);
assert.equal(d.concentration,1,"diffuse race should show minimum concentration");
assert.equal(d.rollover,1,"diffuse high-point race should not be rollover suitable");
assert.equal(d.verdict,"見送り推奨");
assert.ok(f.concentration>=3,"focused race should rank above diffuse concentration");
assert.ok(f.confidence>d.confidence,"focused race should have higher confidence");
assert.ok(f.rollover>d.rollover,"focused race should have higher rollover suitability");
assert.equal(f.verdict,"購入可");
assert.equal(f.calibrationStatus,"UNVALIDATED");
assert.ok(f.diagnostics.evaluationIndex>d.diagnostics.evaluationIndex,"continuous evaluation index should separate focused from diffuse");
assert.equal(starText(3),"★★★☆☆");
const blocked=derivePredictionRatings(snapshot({shares:[.2,.15,.1],scores:[8,6,4],bets:4,lineConfidence:"低"}));
assert.ok(blocked.confidence<=2,"non-high line confidence must cap display confidence");
assert.ok(blocked.diagnostics.evaluationIndex<=65,"caution verdict must cap provisional comparison index");
console.log("prediction-ratings: ok",{diffuse:d,focused:f,blocked});
