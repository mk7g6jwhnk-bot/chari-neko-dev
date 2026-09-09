import assert from "node:assert/strict";
import{evaluateThirdVariantShadow,shadowPurchasePlan,THIRD_VARIANT_SHADOW_RULES as R}from"../research/third-variant-shadow-v1.mjs";

const row=(order,code,probability,branch="A",betClass="NONE")=>({order,probability,purchaseRejectCode:code,purchaseStatus:code==="ADOPTED"?"購入採用":"購入不採用",dominantBranchId:branch,betClass});
const record={raceKey:"20260909-01-1",sealed:{predictionSealedAt:"2026-09-09T00:00:00Z",researchPrediction:{performanceSchemaVersion:"PURCHASE_PERFORMANCE_V2",purchaseEligibility:{canPurchase:true},standardPurchasePlan:[{order:[1,2,3],betClass:"MAIN"}],purchase:{audit:{terminalLifecycleAudit:{rows:[row("1-2-3","ADOPTED",.3,"A","MAIN"),row("1-2-4","THIRD_VARIANT_AMBIGUITY",.2),row("1-2-5","THIRD_VARIANT_AMBIGUITY",.1),row("3-4-5","THIRD_VARIANT_BOUNDARY",.09,"B")]}}}}},result:{result:{status:"confirmed",finishOrder:[1,2,4],payout:1200}}};
assert.equal(shadowPurchasePlan(record,R.CONTROL).candidate.length,1);
const ambiguity=shadowPurchasePlan(record,R.AMBIGUITY_ONE);
assert.equal(ambiguity.candidate.length,2);assert.deepEqual(ambiguity.rescued[0].order,[1,2,4]);assert.equal(ambiguity.rescued[0].betClass,"MAIN");
assert.equal(shadowPurchasePlan(record,R.BOUNDARY_ONE).candidate.length,1,"unknown family class must not be invented");
const report=evaluateThirdVariantShadow([record]);
assert.equal(report.productionWriteAllowed,false);assert.equal(report.autoPromotion,false);assert.equal(report.summaries.CONTROL.flat.hitRaces,0);assert.equal(report.summaries.AMBIGUITY_ONE.flat.hitRaces,1);assert.equal(report.summaries.AMBIGUITY_ONE.inflation.max,1);
const blocked=structuredClone(record);blocked.sealed.researchPrediction.purchaseEligibility.canPurchase=false;
assert.equal(shadowPurchasePlan(blocked,R.PAIR_TOP_ONE).candidate.length,1,"shadow must not change purchase gate");
console.log("PASS third-variant shadow v1");
