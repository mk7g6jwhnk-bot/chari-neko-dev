import assert from"node:assert/strict";
import{acknowledgeCanaryRollback,activateCanaryRun,buildCanaryActivationPlan,finalApprovalFor,loadCanaryRuns,saveFinalPromotionApproval}from"../public/prediction-store.mjs";
const m=new Map(),storage={getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,String(v))};
const epoch="PROMOTION-METHOD-2026-08-V2-SEALED-ISOLATED",evalEpoch="SHADOW-EVAL-ISOLATED-NORMALIZED-V1";
const candidate={packageKey:"PKG",status:"FINAL_REVIEW_READY",fingerprint:"F1",methodologyEpoch:epoch,shadowEvaluationEpoch:evalEpoch};
const approval=saveFinalPromotionApproval(storage,{candidate,decision:"APPROVE_CANARY"});
activateCanaryRun(storage,{candidate,approval});
const runs=loadCanaryRuns(storage);runs[0].status="CANARY_ROLLBACK_RECOMMENDED";runs[0].rollbackSignal="RECENT_LOGLOSS_FLIP";storage.setItem("chari-neko:keirin-canary-runs:v1",JSON.stringify(runs));
const rolled=acknowledgeCanaryRollback(storage,"PKG");
assert.equal(rolled.finalApprovalInvalidated,true);
const invalid=finalApprovalFor(storage,"PKG");
assert.equal(invalid.decision,"ROLLBACK_LOCKED");
assert.equal(invalid.canaryActivationAllowed,false);
assert.equal(buildCanaryActivationPlan(candidate,invalid).status,"ROLLBACK_LOCKED");

const next={...candidate,fingerprint:"F2"};
const nextApproval=saveFinalPromotionApproval(storage,{candidate:next,decision:"APPROVE_CANARY"});
assert.equal(buildCanaryActivationPlan(next,nextApproval).status,"CANARY_PLAN_READY");
console.log("PASS rollback revokes final approval until new fingerprint is reapproved");