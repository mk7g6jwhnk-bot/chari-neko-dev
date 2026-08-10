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

const broadButRawStrong=derivePredictionRatings(snapshot({shares:[.20,.17,.15,.12,.10],scores:[9,8,7,5,4],bets:12,cutGap:2.5}));
assert.ok(broadButRawStrong.concentration<=2,"12点採用なのに展開集中度4相当を許している");
assert.ok(broadButRawStrong.confidence<=3,"12点採用なのに信頼度4以上を許している");
assert.equal(broadButRawStrong.verdict,"見送り寄り");
assert.ok(broadButRawStrong.consistencyAudit.adjustments.length>0,"評価整合の補正履歴がない");
assert.ok(broadButRawStrong.consistencyAudit.invariantChecks.every(x=>x.passed),"評価整合 invariant が破れている");

const lowHeadCoverageSnapshot=snapshot({shares:[.18,.15,.12,.10],scores:[8,7,6,5],bets:4,generated:210,cutGap:1.2});
lowHeadCoverageSnapshot.predictionOutput.audit.terminalProbabilitySum=1;
lowHeadCoverageSnapshot.predictionOutput.audit.purchaseFamilyAudit={rows:[
  {first:1,tier:"main",probability:.25,probabilityShare:.25,adoptedProbability:.10,adoptedCoverage:.40},
  {first:2,tier:"contender",probability:.20,probabilityShare:.20,adoptedProbability:.15,adoptedCoverage:.75}
]};
const lowHeadCoverage=derivePredictionRatings(lowHeadCoverageSnapshot);
assert.equal(Number(lowHeadCoverage.diagnostics.topFamilyCoverage.toFixed(2)),.40,"最上位1着ファミリーの購入カバー率を評価監査へ引き継げていない");
assert.ok(lowHeadCoverage.auditFlags.some(x=>x.includes("購入カバー率が低い")),"低い本命頭カバー率を監査フラグにできていない");

console.log("prediction-ratings: ok",{diffuse:d,focused:f,blocked,broadButRawStrong,lowHeadCoverage});
