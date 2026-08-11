import assert from"node:assert/strict";
import{readFile}from"node:fs/promises";
import{runKeirinPredictionEngine}from"../keirin/engine/prediction-engine.mjs";

const riders=[
  rider(1,"先行一郎","A",1,"自力",8.5,8.2,7.2,5.6,5.3),
  rider(2,"差脚二郎","A",2,"番手",7.7,4.8,5.2,9.0,8.8),
  rider(3,"追走三郎","A",3,"三番手",7.0,3.8,4.7,7.4,8.2),
  rider(4,"捲り四郎","B",1,"自力",7.8,7.4,8.5,6.4,5.5),
  rider(5,"番手五郎","B",2,"番手",6.9,4.2,5.0,7.7,7.6),
  rider(6,"先行六郎","C",1,"自力",6.7,6.8,6.4,5.8,5.0),
  rider(7,"番手七郎","C",2,"番手",6.2,3.9,4.6,6.9,7.0)
];
const prediction=runKeirinPredictionEngine({race:{id:"V223-DISTRIBUTION",lineConfidence:"高",raceCategory:"standard",participants:riders}});
const audit=prediction.conditionalProbabilityDistributionAudit;
assert.equal(audit.version,"CONDITIONAL-PROBABILITY-DISTRIBUTION-AUDIT-1.0");
assert.ok(audit.totalGroupCount>0);
assert.ok(audit.nonNormalizedGroupCount>0,"current node conditional values should expose non-100% parent-state groups");
assert.equal(audit.nodeConditionalValuesAreValidDistributions,false);
assert.equal(audit.directChainFormulaEligible,false);
assert.equal(audit.recommendedNextStep,"RENORMALIZE_AFTER_CONDITION_BURDEN_BEFORE_USING_P1_P2_P3_AS_PROBABILITIES");
for(const stage of [audit.first,audit.second,audit.third]){
  assert.ok(stage.groupCount>0);
  assert.ok(stage.averageConditionalSum>0&&stage.averageConditionalSum<1);
}
const bad=audit.examples[0];
assert.ok(bad.conditionalSum<.999);
assert.ok(bad.candidates.some(c=>c.burden<1));
const appSource=await readFile(new URL("../public/app.mjs",import.meta.url),"utf8");
assert.match(appSource,/条件付き確率の100%監査/);
assert.match(appSource,/厳密な条件付き確率としては使用不可/);
console.log("keirin-conditional-probability-distribution-v223: PASS",{
  groups:audit.totalGroupCount,nonNormalized:audit.nonNormalizedGroupCount,
  firstAvg:audit.first.averageConditionalSum,secondAvg:audit.second.averageConditionalSum,thirdAvg:audit.third.averageConditionalSum
});
function rider(number,name,lineId,lineOrder,role,recentForm,startPower,sprintPower,finishPower,trackingSkill){return{id:String(number),number,name,lineId,lineOrder,role,recentForm,startPower,sprintPower,finishPower,trackingSkill,stamina:7,attackTiming:7,lineTrust:8,venueSuitability:6};}
