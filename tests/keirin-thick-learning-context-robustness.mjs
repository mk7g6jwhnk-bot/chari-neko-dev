import assert from"node:assert/strict";
import{assessThickLearningContextRobustness}from"../public/research-outcome-diagnostics.mjs";
const miss=(date,venue,session,grade,tag="THICK_HEAD_MISS")=>({version:"RESEARCH-OUTCOME-DIAGNOSTICS-1.3",raceDate:date,venue,session,raceGrade:grade,thickBetCount:2,tags:["THICK_CLUSTER_MISS",tag]});
const hit=(date,venue,session,grade)=>({version:"RESEARCH-OUTCOME-DIAGNOSTICS-1.3",raceDate:date,venue,session,raceGrade:grade,thickBetCount:2,tags:["THICK_CLUSTER_HIT"]});
const distributed=[];
for(const [date,venue] of [["2026-08-01","A"],["2026-08-02","B"],["2026-08-03","A"],["2026-08-04","B"]]){for(let i=0;i<5;i++)distributed.push(miss(date,venue,i%2?"DAY":"NIGHT",i%2?"F1":"F2"));for(let i=0;i<3;i++)distributed.push(hit(date,venue,i%2?"DAY":"NIGHT",i%2?"F1":"F2"));}
const global=assessThickLearningContextRobustness(distributed,{minimumEvaluated:30,minimumMisses:10,minimumDistinctDates:3,minimumWindowEvaluated:10,minimumContextEvaluated:8,localizationShare:.8});
assert.equal(global.status,"CONTEXT_ROBUST_REVIEW_CANDIDATE");assert.equal(global.eligible,true);assert.equal(global.globalCandidates[0].type,"THICK_HEAD_REPRESENTATION_REVIEW");assert.equal(global.productionWriteAllowed,false);
const localized=[];
for(const date of["2026-08-01","2026-08-02","2026-08-03","2026-08-04"]){for(let i=0;i<5;i++)localized.push(miss(date,"A",i%2?"DAY":"NIGHT","F1"));for(let i=0;i<3;i++)localized.push(hit(date,"A",i%2?"DAY":"NIGHT","F1"));for(let i=0;i<8;i++)localized.push(hit(date,"B",i%2?"DAY":"NIGHT","F2"));}
const local=assessThickLearningContextRobustness(localized,{minimumEvaluated:30,minimumMisses:10,minimumDistinctDates:3,minimumWindowEvaluated:10,minimumContextEvaluated:8,localizationShare:.8});
assert.equal(local.status,"CONTEXT_LOCALIZED");assert.equal(local.eligible,false);assert.ok(local.contextualCandidates.some(x=>x.dimension==="venue"&&x.contextValue==="A"));assert.ok(local.counterEvidence.some(x=>x.type==="CONTEXT_LOCALIZATION"));
console.log("keirin thick learning context robustness ok");
