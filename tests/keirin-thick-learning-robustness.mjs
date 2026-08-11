import assert from"node:assert/strict";
import{assessThickLearningRobustness}from"../public/research-outcome-diagnostics.mjs";
const miss=(date,tag)=>({version:"RESEARCH-OUTCOME-DIAGNOSTICS-1.2",raceDate:date,thickBetCount:2,tags:["THICK_CLUSTER_MISS",tag]});
const hit=date=>({version:"RESEARCH-OUTCOME-DIAGNOSTICS-1.2",raceDate:date,thickBetCount:2,tags:["THICK_CLUSTER_HIT"]});
const stable=[];
for(const date of["2026-08-01","2026-08-02","2026-08-03","2026-08-04"]){for(let i=0;i<5;i++)stable.push(miss(date,"THICK_HEAD_MISS"));for(let i=0;i<3;i++)stable.push(hit(date));}
const robust=assessThickLearningRobustness(stable,{minimumEvaluated:30,minimumMisses:10,dominanceShare:.35,minimumDistinctDates:3,minimumWindowEvaluated:10});
assert.equal(robust.status,"ROBUST_REVIEW_CANDIDATE");assert.equal(robust.eligible,true);assert.equal(robust.validatedCandidates[0].type,"THICK_HEAD_REPRESENTATION_REVIEW");assert.equal(robust.productionWriteAllowed,false);
const oneDay=[];for(let i=0;i<20;i++)oneDay.push(miss("2026-08-01","THICK_HEAD_MISS"));for(let i=0;i<10;i++)oneDay.push(hit("2026-08-01"));
const period=assessThickLearningRobustness(oneDay,{minimumEvaluated:30,minimumMisses:10,dominanceShare:.35,minimumDistinctDates:3,minimumWindowEvaluated:10});assert.equal(period.status,"INSUFFICIENT_PERIOD_EVIDENCE");assert.equal(period.eligible,false);
const unstable=[];for(const date of["2026-08-01","2026-08-02"]){for(let i=0;i<8;i++)unstable.push(miss(date,"THICK_HEAD_MISS"));for(let i=0;i<2;i++)unstable.push(hit(date));}for(const date of["2026-08-03","2026-08-04"]){for(let i=0;i<4;i++)unstable.push(miss(date,"THICK_SECOND_MISS"));for(let i=0;i<1;i++)unstable.push(miss(date,"THICK_HEAD_MISS"));for(let i=0;i<5;i++)unstable.push(hit(date));}
const temporal=assessThickLearningRobustness(unstable,{minimumEvaluated:30,minimumMisses:10,dominanceShare:.35,minimumDistinctDates:3,minimumWindowEvaluated:10});assert.equal(temporal.status,"TEMPORAL_INSTABILITY");assert.equal(temporal.eligible,false);assert.ok(temporal.counterEvidence.some(x=>x.type==="TEMPORAL_NON_REPLICATION"));
console.log("keirin thick learning robustness ok");
