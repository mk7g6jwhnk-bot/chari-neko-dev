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

const broadBase=snapshot({shares:[.20,.17,.15,.12,.10],scores:[9,8,7,5,4],bets:12,cutGap:2.5});
broadBase.predictionOutput.audit.purchaseMassAudit={eligibleCoverage:.82,weightedCoverageTarget:.75,massEfficiency:.96,status:"BALANCED"};
const broadButRawStrong=derivePredictionRatings(broadBase);
assert.ok(broadButRawStrong.concentration>=4,"12点という点数だけで展開集中度を下げている");
assert.ok(broadButRawStrong.confidence>=4,"12点という点数だけで信頼度を下げている");
assert.equal(broadButRawStrong.verdict,"購入可");
assert.ok(broadButRawStrong.consistencyAudit.invariantChecks.every(x=>x.passed),"構造的に強い多点購入の invariant が破れている");

const broadMore=snapshot({shares:[.20,.17,.15,.12,.10],scores:[9,8,7,5,4],bets:18,cutGap:2.5});
broadMore.predictionOutput.audit.purchaseMassAudit={eligibleCoverage:.82,weightedCoverageTarget:.75,massEfficiency:.96,status:"BALANCED"};
const broadMoreRating=derivePredictionRatings(broadMore);
assert.equal(broadMoreRating.verdict,"購入可","18点でも点数だけで見送りにしてはいけない");
assert.equal(broadMoreRating.concentration,broadButRawStrong.concentration,"点数だけで集中度が変わっている");

const massWarn=snapshot({shares:[.20,.17,.15,.12,.10],scores:[9,8,7,5,4],bets:6,cutGap:2.5});
massWarn.predictionOutput.audit.purchaseMassAudit={eligibleCoverage:.48,weightedCoverageTarget:.75,massEfficiency:.92,status:"UNDER_COVERED"};
const massWarnRating=derivePredictionRatings(massWarn);
assert.equal(massWarnRating.verdict,"見送り寄り","点数が少なくても購入質量不足は注意判定にする");
assert.ok(massWarnRating.consistencyAudit.invariantChecks.every(x=>x.passed),"質量不足による注意判定を矛盾扱いしている");

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
