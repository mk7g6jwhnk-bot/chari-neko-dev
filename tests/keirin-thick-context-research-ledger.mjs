import assert from"node:assert/strict";
import{buildThickContextResearchLedger}from"../public/research-outcome-diagnostics.mjs";
const miss=(date,venue,tag="THICK_HEAD_MISS")=>({version:"RESEARCH-OUTCOME-DIAGNOSTICS-1.3",raceDate:date,venue,session:"DAY",raceGrade:"F1",thickBetCount:2,tags:["THICK_CLUSTER_MISS",tag]});
const hit=(date,venue)=>({version:"RESEARCH-OUTCOME-DIAGNOSTICS-1.3",raceDate:date,venue,session:"DAY",raceGrade:"F1",thickBetCount:2,tags:["THICK_CLUSTER_HIT"]});
const rows=[];
for(const date of["2026-08-01","2026-08-02","2026-08-03","2026-08-04"]){for(let i=0;i<5;i++)rows.push(miss(date,"A"));for(let i=0;i<3;i++)rows.push(hit(date,"A"));for(let i=0;i<8;i++)rows.push(hit(date,"B"));}
const ledger=buildThickContextResearchLedger(rows,{minimumEvaluated:30,minimumMisses:10,minimumDistinctDates:3,minimumWindowEvaluated:10,minimumContextEvaluated:8,localizationShare:.8});
assert.equal(ledger.status,"LOCAL_CONTEXT_CANDIDATES_RECORDED");
assert.equal(ledger.globalLedger.length,0);
assert.ok(ledger.contextualLedger.some(x=>x.dimension==="venue"&&x.contextValue==="A"));
assert.ok(ledger.contextualLedger.every(x=>x.globalRuleEligible===false&&x.localProductionAdjustmentEligible===false));
assert.equal(ledger.safeguards.globalAndLocalSeparated,true);
assert.equal(ledger.productionWriteAllowed,false);
console.log("keirin thick context research ledger ok");
