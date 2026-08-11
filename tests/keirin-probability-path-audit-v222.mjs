import assert from"node:assert/strict";
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
const prediction=runKeirinPredictionEngine({race:{id:"V222-AUDIT",lineConfidence:"高",raceCategory:"standard",participants:riders}});
const audit=prediction.probabilityPathAudit;
assert.equal(audit.version,"PROBABILITY-PATH-AUDIT-1.0");
assert.equal(audit.finalFormulaUsesNodeConditionalProduct,false);
assert.equal(audit.terminalCount,prediction.terminals.length);
assert.ok(audit.rows.length>0);
const row=audit.rows.find(r=>r.conditionalChainProduct>0);
assert.ok(row);
assert.equal(row.conditionalChainUsedDirectly,false);
assert.ok(Number.isFinite(row.finalVsConditionalChainRatio));
assert.ok(audit.siblingGroups.some(g=>g.items.length>=2));
const appSource=await (await import("node:fs/promises")).readFile(new URL("../public/app.mjs",import.meta.url),"utf8");
assert.match(appSource,/確率経路監査を見る/);
assert.match(appSource,/条件付き連鎖/);
console.log("keirin-probability-path-audit-v222: PASS",row.order.join("-"),row.conditionalChainProduct,row.finalProbability);
function rider(number,name,lineId,lineOrder,role,recentForm,startPower,sprintPower,finishPower,trackingSkill){return{id:String(number),number,name,lineId,lineOrder,role,recentForm,startPower,sprintPower,finishPower,trackingSkill,stamina:7,attackTiming:7,lineTrust:8,venueSuitability:6};}
