import assert from"node:assert/strict";
import{activateCanaryRun,refreshCanaryRuns,saveFinalPromotionApproval,saveShadowComparison,summarizeCanaryRuns}from"../public/prediction-store.mjs";
const mem=new Map(),storage={getItem:k=>mem.get(k)||null,setItem:(k,v)=>mem.set(k,String(v))};
const candidate={packageKey:"PKG",fingerprint:"FNV1A-abcd1234",status:"FINAL_REVIEW_READY",comparisonCount:30,methodologyEpoch:"PROMOTION-METHOD-2026-08-V2-SEALED-ISOLATED",shadowEvaluationEpoch:"SHADOW-EVAL-ISOLATED-NORMALIZED-V1"};
const approval=saveFinalPromotionApproval(storage,{candidate,decision:"APPROVE_CANARY"});
let run=activateCanaryRun(storage,{candidate,approval});
assert.equal(run.status,"CANARY_ACTIVE");assert.equal(run.baselineComparisonCount,0);assert.equal(run.productionWriteAllowed,false);

for(let i=0;i<20;i++){
  saveShadowComparison(storage,{comparisonId:`C${i}`,createdAt:`2026-08-${String(1+Math.floor(i/2)).padStart(2,"0")}T00:00:00Z`,status:"RESULT_ATTACHED",methodologyEpoch:"PROMOTION-METHOD-2026-08-V2-SEALED-ISOLATED",shadowEvaluationEpoch:"SHADOW-EVAL-ISOLATED-NORMALIZED-V1",adjustments:[{packageKey:"PKG"}],evaluationIntegrity:"ISOLATED_NORMALIZED",packageOutcomes:{PKG:{winner:i%5===0?"CURRENT":"SHADOW",logLossImprovement:i%5===0?.01:.08,qualificationEligible:true}}});
}
const shadowSummary={finalReview:{candidates:[candidate]}};
refreshCanaryRuns(storage,shadowSummary);
let s=summarizeCanaryRuns(storage),r=s.rows[0];
assert.equal(r.status,"CANARY_ACTIVE");assert.equal(r.rollbackSignal,"WAIT_POST_START_EVIDENCE");assert.equal(s.validated,0);assert.equal(r.productionPromotionAllowed,false);

refreshCanaryRuns(storage,{finalReview:{candidates:[{...candidate,fingerprint:"FNV1A-deadbeef"}]}});
s=summarizeCanaryRuns(storage);r=s.rows[0];
assert.equal(r.status,"CANARY_STALE");assert.equal(r.rollbackSignal,"AUDIT_FINGERPRINT_CHANGED");
console.log("PASS zero-impact canary monitor + stale approval rollback");
