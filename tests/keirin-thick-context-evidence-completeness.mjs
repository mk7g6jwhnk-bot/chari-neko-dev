import assert from"node:assert/strict";
import{assessThickLearningContextRobustness,buildThickContextResearchLedger}from"../public/research-outcome-diagnostics.mjs";
const miss=(date,venue="",session="",grade="",tag="THICK_HEAD_MISS")=>({version:"RESEARCH-OUTCOME-DIAGNOSTICS-1.3",raceDate:date,venue,session,raceGrade:grade,thickBetCount:2,tags:["THICK_CLUSTER_MISS",tag]});
const hit=(date,venue="",session="",grade="")=>({version:"RESEARCH-OUTCOME-DIAGNOSTICS-1.3",raceDate:date,venue,session,raceGrade:grade,thickBetCount:2,tags:["THICK_CLUSTER_HIT"]});
const dates=["2026-08-01","2026-08-02","2026-08-03","2026-08-04"];
const opts={minimumEvaluated:30,minimumMisses:10,minimumDistinctDates:3,minimumWindowEvaluated:10,minimumContextEvaluated:8,minimumAuditedDimensions:1,localizationShare:.8};

// 1. Temporally robust but no context evidence: must not become global.
const missing=[];
for(const date of dates){for(let i=0;i<5;i++)missing.push(miss(date));for(let i=0;i<3;i++)missing.push(hit(date));}
const noContext=assessThickLearningContextRobustness(missing,opts);
assert.equal(noContext.status,"INSUFFICIENT_CONTEXT_EVIDENCE");
assert.equal(noContext.eligible,false);
assert.equal(noContext.globalCandidates.length,0);
assert.ok(noContext.counterEvidence.some(x=>x.type==="CONTEXT_AUDIT_COVERAGE_SHORTAGE"&&x.auditedDimensions===0&&x.required===1));

// 2. Only one qualifying venue group: still insufficient.
const oneGroup=[];
for(const date of dates){for(let i=0;i<5;i++)oneGroup.push(miss(date,"A"));for(let i=0;i<3;i++)oneGroup.push(hit(date,"A"));}
const one=assessThickLearningContextRobustness(oneGroup,{...opts,dimensions:["venue"]});
assert.equal(one.status,"INSUFFICIENT_CONTEXT_EVIDENCE");
assert.equal(one.globalCandidates.length,0);
assert.equal(one.temporalRobustness.eligible,true);

// 3. Two venue groups, each >=8 evaluated, with misses distributed: global candidate allowed.
const distributed=[];
for(const date of dates){
  for(let i=0;i<3;i++)distributed.push(miss(date,"A"));
  for(let i=0;i<1;i++)distributed.push(hit(date,"A"));
  for(let i=0;i<2;i++)distributed.push(miss(date,"B"));
  for(let i=0;i<2;i++)distributed.push(hit(date,"B"));
}
const global=assessThickLearningContextRobustness(distributed,{...opts,dimensions:["venue"]});
assert.equal(global.status,"CONTEXT_ROBUST_REVIEW_CANDIDATE");
assert.equal(global.eligible,true);
assert.equal(global.globalCandidates.length,1);
assert.deepEqual(global.globalCandidates[0].contextCoverage,{auditedDimensions:1,distributedDimensions:1,localizedDimensions:0,required:1});

// 4. Localized failure remains local-only.
const localized=[];
for(const date of dates){
  for(let i=0;i<5;i++)localized.push(miss(date,"A"));
  for(let i=0;i<3;i++)localized.push(hit(date,"A"));
  for(let i=0;i<8;i++)localized.push(hit(date,"B"));
}
const local=assessThickLearningContextRobustness(localized,{...opts,dimensions:["venue"]});
assert.equal(local.status,"CONTEXT_LOCALIZED");
assert.equal(local.eligible,false);
assert.equal(local.globalCandidates.length,0);
assert.ok(local.contextualCandidates.some(x=>x.dimension==="venue"&&x.contextValue==="A"));

// 5. Insufficient context must never populate the global ledger.
const ledger=buildThickContextResearchLedger(missing,opts);
assert.equal(ledger.sourceAudit.status,"INSUFFICIENT_CONTEXT_EVIDENCE");
assert.equal(ledger.globalLedger.length,0);
assert.equal(ledger.status,"NO_LEDGER_CANDIDATES");

console.log("keirin thick context evidence completeness ok");
