import assert from"node:assert/strict";
import{runKeirinPredictionEngine}from"../keirin/engine/prediction-engine.mjs";
import{runKeirinEngine}from"../keirin/engine/keirin-engine.mjs";
import{createSnapshot}from"../public/prediction-store.mjs";

const riders=[
  rider(1,"先行一郎","A",1,"自力",8.5,8.2,7.2,5.6,5.3),
  rider(2,"差脚二郎","A",2,"番手",7.7,4.8,5.2,9.0,8.8),
  rider(3,"追走三郎","A",3,"三番手",7.0,3.8,4.7,7.4,8.2),
  rider(4,"捲り四郎","B",1,"自力",7.8,7.4,8.5,6.4,5.5),
  rider(5,"番手五郎","B",2,"番手",6.9,4.2,5.0,7.7,7.6),
  rider(6,"先行六郎","C",1,"自力",6.7,6.8,6.4,5.8,5.0),
  rider(7,"番手七郎","C",2,"番手",6.2,3.9,4.6,6.9,7.0)
];
const race={id:"V221-EXPLAIN",lineConfidence:"高",raceCategory:"standard",participants:riders};
const prediction=runKeirinPredictionEngine({race});
assert.equal(prediction.explanation.generatedFrom,"PREDICTION_ENGINE_ONLY");
assert.equal(prediction.explanation.purchaseFieldsUsed,false);
assert.equal(prediction.explanation.oddsUsed,false);
assert.ok(prediction.explanation.axis?.timeline);
assert.ok(/先行|捲り|踏み合|差す/.test(prediction.explanation.axis.timeline),prediction.explanation.axis.timeline);
assert.ok(prediction.explanation.axis.reasons.length>=3);
assert.ok(prediction.explanation.axis.source.branchId);
assert.ok(prediction.explanation.axis.primaryOrder.length===3);
assert.equal(prediction.explanation.audit.passed,true);

const engineLow=runKeirinEngine({race,oddsByOrder:{"1-2-3":2.1},budget:3000});
const engineHigh=runKeirinEngine({race,oddsByOrder:{"1-2-3":250,"2-1-3":180},budget:3000});
assert.deepEqual(engineLow.predictionExplanation,engineHigh.predictionExplanation,"予測側の軸説明はオッズ・購入判断で変わってはいけない");
assert.deepEqual(engineLow.predictionExplanation,engineLow.prediction.explanation);
const snapshot=createSnapshot({race:{...race,date:"20260811",venueCode:"75",venue:"松山",raceNo:11,startTime:"20:27"},prediction:engineLow,odds:{ok:true,odds:{}}},new Date("2026-08-11T11:00:00Z"));
assert.equal(snapshot.predictionExplanation?.generatedFrom,"PREDICTION_ENGINE_ONLY");
assert.ok(snapshot.predictionExplanation?.axis?.timeline);

const appSource=await (await import("node:fs/promises")).readFile(new URL("../public/app.mjs",import.meta.url),"utf8");
assert.match(appSource,/軸になった展開と根拠/);
assert.match(appSource,/この展開を軸にした根拠/);
assert.match(appSource,/購入エンジン：なぜこの買い目を採用したか/);
console.log("keirin-prediction-axis-explanation-v221: PASS",prediction.explanation.axis.timeline);

function rider(number,name,lineId,lineOrder,role,recentForm,startPower,sprintPower,finishPower,trackingSkill){
  return{id:String(number),number,name,lineId,lineOrder,role,recentForm,startPower,sprintPower,finishPower,trackingSkill,stamina:7,attackTiming:7,lineTrust:8,venueSuitability:6};
}
