import assert from"node:assert/strict";
import{enforcePostClassificationMainInvariant}from"../keirin/engine/purchase-engine.mjs";
import{allocatePreviewStakes,deriveThickBets,purchaseEligibility}from"../public/purchase-funding.mjs";

const main=terminal([3,1,2],"MAIN",{role:"main",branch:"CENTER"}),cover=terminal([3,4,2],"COVER",{role:"contender",branch:"ALT"});
let result=enforcePostClassificationMainInvariant([main,cover]);
assert.equal(result.passed,true);assert.equal(result.parentLinkedCoverCount,1);assert.equal(result.terminals.find(x=>x.betClass==="COVER").coverParentOrder,"3-1-2");

result=enforcePostClassificationMainInvariant([terminal([1,4,5],"COVER",{role:"contender"}),terminal([4,1,5],"COVER",{role:"contender"})]);
assert.equal(result.terminals.filter(x=>x.purchaseStatus==="購入採用").length,0);assert.equal(result.orphanCoverRejectedCount,2);assert.ok(result.terminals.every(x=>x.purchaseRejectCode==="ORPHAN_COVER"));

result=enforcePostClassificationMainInvariant([terminal([6,1,2],"COVER",{role:"main",natural:.72,pairNatural:.71}),terminal([1,6,2],"COVER",{role:"contender"})]);
assert.equal(result.recoveredOrder,null);assert.equal(result.terminals.find(x=>x.order.join("-")==="6-1-2").betClass,"MAIN");

result=enforcePostClassificationMainInvariant([terminal([6,1,2],"COVER",{role:"main",natural:.72,pairNatural:.71,status:"購入不採用"}),terminal([1,6,2],"COVER",{role:"contender"})]);
assert.equal(result.terminals.find(x=>x.order.join("-")==="6-1-2").purchaseStatus,"購入不採用");assert.equal(result.orphanCoverRejectedCount,1);

const orphanSnapshot={noBet:false,betSelections:[{order:[1,4,5],category:"COVER",probability:.1,naturalConvergenceScore:.8},{order:[4,1,5],category:"COVER",probability:.09,naturalConvergenceScore:.7}]};
assert.equal(purchaseEligibility(orphanSnapshot).eligible,false);assert.equal(purchaseEligibility(orphanSnapshot).reason,"ORPHAN_COVER");assert.equal(allocatePreviewStakes(orphanSnapshot.betSelections,3000),null);assert.deepEqual(deriveThickBets(orphanSnapshot),[]);
const eligibleSnapshot={...orphanSnapshot,betSelections:[{order:[3,1,2],category:"MAIN",probability:.2,naturalConvergenceScore:.9},...orphanSnapshot.betSelections]};
assert.equal(purchaseEligibility(eligibleSnapshot).eligible,true);assert.equal(allocatePreviewStakes(eligibleSnapshot.betSelections,3000).reduce((a,b)=>a+b,0),3000);
console.log("PASS MAIN/COVER classification, orphan rejection, funding and thick eligibility coherence");

function terminal(order,betClass,{role="contender",branch="ALT",natural=.7,pairNatural=.7,status="購入採用"}={}){return{order,betClass,purchaseStatus:status,chatForecastRole:role,branchHeadMatched:true,pairNaturalPositionEligible:true,naturalConvergenceScore:natural,pairNaturalConvergenceScore:pairNatural,dominantBranchId:branch,terminalScore:.8,probability:.1}}
