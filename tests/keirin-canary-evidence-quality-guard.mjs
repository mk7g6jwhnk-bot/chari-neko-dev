import assert from"node:assert/strict";
import{activateCanaryRun,canaryEvidenceQuality,refreshCanaryRuns,saveFinalPromotionApproval,summarizeCanaryRuns}from"../public/prediction-store.mjs";
const mem=new Map(),storage={getItem:k=>mem.get(k)||null,setItem:(k,v)=>mem.set(k,String(v))};
const ledgerKey="chari-neko:keirin-research-learning:v1";
const epoch="PROMOTION-METHOD-2026-08-V2-SEALED-ISOLATED";
const evalEpoch="SHADOW-EVAL-ISOLATED-NORMALIZED-V1";
const candidate={packageKey:"FIRST|MAKURI_REACH_N|natural|0.6800|0.7800",status:"FINAL_REVIEW_READY",fingerprint:"F1",methodologyEpoch:epoch,shadowEvaluationEpoch:evalEpoch,comparisonCount:30};

const decisive=Array.from({length:10},(_,i)=>({predictionSnapshotId:`B${i}`,learningMode:"NORMAL",checkedAt:`2026-08-09T${String(i).padStart(2,"0")}:00:00Z`,conditionEvidence:[{evidenceKey:`E${i}`,conditionId:`MAKURI_REACH_${i+1}`,stage:"FIRST",kind:"natural",status:i%2?"CONFIRMED":"REFUTED"}]}));
storage.setItem(ledgerKey,JSON.stringify(decisive));
const approval=saveFinalPromotionApproval(storage,{candidate,decision:"APPROVE_CANARY"});
const run=activateCanaryRun(storage,{candidate,approval,now:new Date("2026-08-10T00:00:00Z")});
assert.equal(run.evidenceQualityBaseline.decisiveRate,1);
assert.equal(canaryEvidenceQuality(storage,candidate.packageKey).decisiveCount,10);

const recent=Array.from({length:5},(_,i)=>({predictionSnapshotId:`N${i}`,learningMode:"NORMAL",checkedAt:`2026-08-10T0${i+1}:00:00Z`,conditionEvidence:[{evidenceKey:`N${i}`,conditionId:`MAKURI_REACH_${20+i}`,stage:"FIRST",kind:"natural",status:i===0?"CONFIRMED":"UNKNOWN"}]}));
storage.setItem(ledgerKey,JSON.stringify([...recent,...decisive]));
refreshCanaryRuns(storage,{finalReview:{candidates:[candidate]}},new Date("2026-08-10T06:00:00Z"));
const r=summarizeCanaryRuns(storage).rows[0];
assert.equal(r.status,"CANARY_ROLLBACK_RECOMMENDED");
assert.equal(r.rollbackSignal,"EVIDENCE_QUALITY_DROP");
assert.ok(r.evidenceQualityRecent.decisiveRate<.6);
assert.equal(r.productionPromotionAllowed,false);
console.log("PASS canary evidence quality rollback guard");
