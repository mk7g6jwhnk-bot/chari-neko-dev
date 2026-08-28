import assert from"node:assert/strict";
import{allocatePreviewStakes,deriveThickBets,fundingPriorityScore,fundingSeparationAudit,qualifyThickPredictionBets}from"../public/purchase-funding.mjs";
const same={probability:.20,naturalConvergenceScore:.82,odds:12};
const main={...same,order:[1,2,3],category:"MAIN",stake:100};
const cover={...same,order:[1,2,4],category:"COVER",stake:100};
const high={...same,order:[1,2,5],category:"BUYABLE_HIGH",stake:100};
assert.equal(fundingPriorityScore(main),fundingPriorityScore(cover));
assert.equal(fundingPriorityScore(main),fundingPriorityScore(high));
const audit=fundingSeparationAudit([main,cover,high]);
assert.equal(audit.passed,true);assert.equal(audit.categoryUsedInPriorityScore,false);
const noCluster=[
 {...main,probability:.20,naturalConvergenceScore:.80},
 {...cover,probability:.19,naturalConvergenceScore:.80},
 {...high,probability:.18,naturalConvergenceScore:.80}
];
assert.equal(deriveThickBets({betSelections:noCluster}).length,0,"near-flat candidates must not invent a thick cluster");
assert.deepEqual(allocatePreviewStakes(noCluster,1200,"thick"),allocatePreviewStakes(noCluster,1200,"standard"),"thick mode must not fall back to category-only MAIN boosting");
const clear=[
 {...main,probability:.42,naturalConvergenceScore:.93},
 {...cover,probability:.17,naturalConvergenceScore:.78},
 {...high,probability:.16,naturalConvergenceScore:.76}
];
const thick=deriveThickBets({betSelections:clear});
assert.ok(thick.length>=1);assert.deepEqual(thick[0].order,[1,2,3]);
const standard=allocatePreviewStakes(clear,1200,"standard"),priority=allocatePreviewStakes(clear,1200,"thick");
assert.ok(priority[0]>standard[0],"detected thick cluster should receive more stake only when user selects thick priority");
const highOddsOnly=clear.map((row,index)=>({...row,probability:.2-index*.01,naturalConvergenceScore:.8,odds:index===2?999:2}));
assert.equal(qualifyThickPredictionBets({betSelections:highOddsOnly}).some(x=>x.order.join("-")==="1-2-5"),false,"odds must not create prediction qualification");
assert.equal(deriveThickBets({betSelections:clear.map(row=>({...row,naturalConvergenceScore:0}))}).length,0,"zero natural convergence must not be called thick");
console.log("PASS funding/classification separation",thick.map(x=>x.order.join("-")).join(","));
