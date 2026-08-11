import assert from"node:assert/strict";
import{evaluateFinalPromotionReview,evaluateShadowQualification}from"../public/prediction-store.mjs";
const venues=["立川","平塚","前橋","富山"];
const good=Array.from({length:36},(_,i)=>({
  comparisonId:`G${i}`,createdAt:`2026-08-${String(1+Math.floor(i/4)).padStart(2,"0")}T00:00:00Z`,
  date:`202608${String(1+Math.floor(i/4)).padStart(2,"0")}`,venueName:venues[i%4],
  status:"RESULT_ATTACHED",methodologyEpoch:"PROMOTION-METHOD-2026-08-V2-SEALED-ISOLATED",shadowEvaluationEpoch:"SHADOW-EVAL-ISOLATED-NORMALIZED-V1",adjustments:[{packageKey:"PKG"}],evaluationIntegrity:"ISOLATED_NORMALIZED",
  packageOutcomes:{PKG:{winner:i%5===0?"CURRENT":"SHADOW",logLossImprovement:i%5===0?.01:.08,qualificationEligible:true}}
}));
let q=evaluateShadowQualification(good);
assert.equal(q.packages[0].status,"SHADOW_VALIDATED");
let r=evaluateFinalPromotionReview(good,q);
assert.equal(r.readyCount,1);
assert.equal(r.candidates[0].status,"FINAL_REVIEW_READY");
assert.equal(r.candidates[0].checks.every(x=>x.passed),true);
assert.equal(r.candidates[0].productionPromotionAllowed,false);
assert.ok(r.candidates[0].fingerprint.startsWith("FNV1A-"));

const small=good.slice(0,24);
q=evaluateShadowQualification(small);
r=evaluateFinalPromotionReview(small,q);
assert.equal(r.readyCount,0);
assert.equal(r.candidates[0].status,"FINAL_REVIEW_BLOCKED");
console.log("PASS final promotion review gate + production isolation");
