import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  NUMERIC_FORMULA_FORWARD_IDS,
  NUMERIC_FORMULA_FORWARD_SET,
  NUMERIC_FORMULA_FORWARD_SHADOW_SCHEMA,
  NUMERIC_FORMULA_FORWARD_RESULT_SCHEMA,
  NUMERIC_FORMULA_SET_HASH,
  buildNumericFormulaForwardResult,
  buildNumericFormulaForwardShadow
} from "../keirin/engine/numeric-formula-forward-shadow-v1.mjs";
import {runKeirinEngine} from "../keirin/engine/keirin-engine.mjs";

const frozen=JSON.parse(await fs.readFile(new URL("../research/numeric-feature-discovery/stage2-frozen-formulas.json",import.meta.url),"utf8"));
const expectedFields=["formulaId","expression","seedFeatureNames","coefficients","transform","operation","missingRule","epsilon","formulaFamily"];
for(const definition of NUMERIC_FORMULA_FORWARD_SET.formulas){
  const source=frozen.formulas.find(row=>row.formulaId===definition.formulaId);assert.ok(source);
  for(const field of expectedFields)assert.deepEqual(definition[field],source[field]);
  assert.deepEqual(definition.quantileBoundaries,source.discovery.quantileBoundaries);
  assert.equal(definition.direction,source.discovery.direction);
  assert.equal(definition.directionLabel,source.discovery.directionLabel);
  assert.match(definition.formulaHash,/^[a-f0-9]{64}$/);
}
assert.deepEqual(NUMERIC_FORMULA_FORWARD_SET.formulas.map(row=>row.formulaId),NUMERIC_FORMULA_FORWARD_IDS);
assert.equal(NUMERIC_FORMULA_FORWARD_SET.sourceFreezeHash,frozen.freezeHash);
assert.match(NUMERIC_FORMULA_SET_HASH,/^[a-f0-9]{64}$/);

const orders=[[1,2,3],[1,3,2],[2,1,3],[2,3,1],[3,1,2],[3,2,1],[4,1,2],[4,2,1],[5,1,2],[5,2,1],[6,1,2],[6,2,1]],scores=[1,.9,.8,.7,.6,.5,.4,.3,.2,.1,.09,.08];
const terminals=orders.map((order,index)=>({order,terminalScore:scores[index],macroScenarioId:index<4?"MS-1":index<8?"MS-2":"MS-3",scenarioPurchaseClass:index<4?"MAIN":index<8?"SECONDARY":"SCENARIO_BREAK"}));
const purchase={terminals,standardPurchasePlan:terminals.slice(0,3).map(row=>({order:row.order,macroScenarioId:row.macroScenarioId}))};
const multiWorldScenario={scenarios:[{macroScenarioId:"MS-1",scenarioRank:1,relativeScenarioScore:.5},{macroScenarioId:"MS-2",scenarioRank:2,relativeScenarioScore:.4},{macroScenarioId:"MS-3",scenarioRank:3,relativeScenarioScore:.3}]};
const shadow=buildNumericFormulaForwardShadow({race:{raceKey:"20990101-01-1"},prediction:{terminals},purchase,multiWorldScenario,generatedAt:"2099-01-01T00:00:00.000Z"});
assert.equal(shadow.schemaVersion,NUMERIC_FORMULA_FORWARD_SHADOW_SCHEMA);
assert.equal(shadow.resultDataUsed,false);
assert.equal(shadow.formulaSetHash,NUMERIC_FORMULA_SET_HASH);
assert.equal(shadow.validFormulaCount,5);
assert.equal(shadow.missingFormulaCount,0);
assert.deepEqual(shadow.formulas.map(row=>row.formulaId),NUMERIC_FORMULA_FORWARD_IDS);
assert.ok(shadow.formulas.every(row=>row.valid&&Number.isFinite(row.value)&&row.quantileBucket));
assert.equal(shadow.formulas.find(row=>row.formulaId==="F0617").direction,"LOWER_IS_HIT_ASSOCIATED");
assert.ok(Math.abs(shadow.formulas.find(row=>row.formulaId==="F0588").value-.02)<1e-12);
assert.ok(Math.abs(shadow.formulas.find(row=>row.formulaId==="F0586").value-.3)<1e-12);
assert.ok(Math.abs(shadow.formulas.find(row=>row.formulaId==="F0054").value-(1/(2+1e-9)))<1e-12);

const missing=buildNumericFormulaForwardShadow({race:{raceKey:"20990101-01-2"},prediction:{terminals},purchase,multiWorldScenario:{scenarios:multiWorldScenario.scenarios.slice(0,1)},generatedAt:"2099-01-01T00:00:00.000Z"});
assert.equal(missing.formulas.find(row=>row.formulaId==="F0617").valid,true);
for(const id of["F0491","F0588","F0586"]){const row=missing.formulas.find(item=>item.formulaId===id);assert.equal(row.valid,false);assert.equal(row.value,null);assert.equal(row.missingReason,"WORLD_COMPARISON_NOT_AVAILABLE")}
assert.ok(missing.formulas.every(row=>row.value===null||Number.isFinite(row.value)));

const before=structuredClone(shadow),evaluation=buildNumericFormulaForwardResult({shadow,predictionHash:"a".repeat(64),hit:true,payout:31200,resultObservedAt:"2099-01-01T01:00:00.000Z"});
assert.deepEqual(shadow,before);
assert.equal(evaluation.schemaVersion,NUMERIC_FORMULA_FORWARD_RESULT_SCHEMA);
assert.equal(evaluation.predictionHash,"a".repeat(64));
assert.equal(evaluation.formulaSetHash,shadow.formulaSetHash);
assert.equal(evaluation.resultDataUsedOnlyForEvaluation,true);
assert.deepEqual(evaluation.outcome,{hit:true,payout:31200,high10k:true,high20k:true,high30k:true});
assert.deepEqual(evaluation.formulas.map(row=>row.value),shadow.formulas.map(row=>row.value));

const participants=Array.from({length:7},(_,index)=>({id:String(index+1),number:index+1,name:`R${index+1}`,lineId:`L${Math.floor(index/2)+1}`,lineOrder:index%2+1,recentForm:7,startPower:7,sprintPower:7,finishPower:7,trackingSkill:7}));
process.env.KEIRIN_RECOMMENDATION_FILTER_V1="1";process.env.KEIRIN_RECOMMENDATION_DUAL_SHADOW_V1="1";process.env.KEIRIN_NUMERIC_FORMULA_FORWARD_SHADOW_V1="0";
const control=runKeirinEngine({race:{id:"parity",raceKey:"20990101-01-3",participants,lineConfidence:"高"},captureResearchTrace:true});
process.env.KEIRIN_NUMERIC_FORMULA_FORWARD_SHADOW_V1="1";
const candidate=runKeirinEngine({race:{id:"parity",raceKey:"20990101-01-3",participants,lineConfidence:"高"},captureResearchTrace:true});
for(const name of["KEIRIN_RECOMMENDATION_FILTER_V1","KEIRIN_RECOMMENDATION_DUAL_SHADOW_V1","KEIRIN_NUMERIC_FORMULA_FORWARD_SHADOW_V1"])delete process.env[name];
assert.equal("numericFormulaForwardShadow" in control,false);
assert.equal(candidate.numericFormulaForwardShadow.schemaVersion,NUMERIC_FORMULA_FORWARD_SHADOW_SCHEMA);
assert.equal(candidate.researchTerminalTrace.numericFormulaForwardShadow.resultDataUsed,false);
assert.deepEqual(candidate.standardPurchasePlan,control.standardPurchasePlan);
assert.deepEqual(candidate.terminals,control.terminals);
assert.deepEqual(candidate.scored,control.scored);
const timeless=value=>{const copy=structuredClone(value);for(const field of["capturedAt","featureTimestamp","generatedAt","traceHash","inputHash"])delete copy[field];return copy};
assert.deepEqual(timeless(candidate.recommendationFilter),timeless(control.recommendationFilter));
assert.deepEqual(timeless(candidate.dualRecommendationShadow),timeless(control.dualRecommendationShadow));

console.log(JSON.stringify({ok:true,cases:15,formulaSetHash:NUMERIC_FORMULA_SET_HASH,formulaHashes:Object.fromEntries(NUMERIC_FORMULA_FORWARD_SET.formulas.map(row=>[row.formulaId,row.formulaHash])),validValues:Object.fromEntries(shadow.formulas.map(row=>[row.formulaId,row.value])),missingFormulaCount:missing.missingFormulaCount,predictionChanged:false,purchaseChanged:false,recommendationChanged:false,dualShadowChanged:false,historicalBackfill:0,resultLeakage:0},null,2));
