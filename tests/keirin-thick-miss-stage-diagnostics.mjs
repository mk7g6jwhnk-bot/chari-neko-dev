import assert from"node:assert/strict";
import{buildOutcomeDiagnostics,summarizeOutcomeDiagnostics,deriveResearchThickSubset}from"../public/research-outcome-diagnostics.mjs";

const bet=(order,p,branch="A",category="MAIN")=>({order,category,probability:p,naturalConvergenceScore:1,odds:6,stake:200,dominantBranchId:branch});
const makeSnapshot=(top1,top2,ledger)=>({abilitiesUsed:[],riderMarks:[],branches:[],terminalLedger:ledger,betSelections:[
 bet(top1,.30,top1.branch||"A"),bet(top2,.28,top2.branch||"A"),bet([7,6,5],.03,"F1","COVER"),bet([6,7,5],.025,"F2","COVER"),bet([5,7,6],.02,"F3","COVER")
].map(b=>Array.isArray(b.order)?b:{...b,order:[1,1,1]} )});
const t=(order,branch="A")=>({order,probability:.1,dominantBranchId:branch,dominantBranchLabel:`${branch}展開`});

const ledger=[t([1,2,3],"A"),t([1,2,4],"A"),t([1,5,3],"B"),t([6,2,3],"C")];

const thirdSnap=makeSnapshot([1,2,4],[1,2,5],ledger);
assert.equal(deriveResearchThickSubset(thirdSnap).length,2);
const third=buildOutcomeDiagnostics(thirdSnap,{officialFinishOrder:[1,2,3],officialPayout:800});
assert.equal(third.thickMiss.status,"THICK_THIRD_MISS");
assert.equal(third.thickMiss.upstreamFailure,"PURCHASE_SELECTION_MISS");
assert.ok(third.tags.includes("THICK_THIRD_MISS"));

const secondSnap=makeSnapshot([1,5,3],[1,4,2],ledger);
const second=buildOutcomeDiagnostics(secondSnap,{officialFinishOrder:[1,2,3],officialPayout:800});
assert.equal(second.thickMiss.status,"THICK_SECOND_MISS");

const headSnap=makeSnapshot([6,2,3],[5,4,3],ledger);
const head=buildOutcomeDiagnostics(headSnap,{officialFinishOrder:[1,2,3],officialPayout:800});
assert.equal(head.thickMiss.status,"THICK_HEAD_MISS");

const branchLedger=[...ledger,t([1,2,7],"Z")];
const branchSnap=makeSnapshot([1,2,4],[1,2,5],branchLedger);
const branchMiss=buildOutcomeDiagnostics(branchSnap,{officialFinishOrder:[1,2,7],officialPayout:12000});
assert.ok(branchMiss.tags.includes("THICK_SCENARIO_BRANCH_MISS"));
assert.equal(branchMiss.thickMiss.correctBranchRepresentedInThick,false);

const sum=summarizeOutcomeDiagnostics([third,second,head,branchMiss]);
assert.equal(sum.thickHeadMissCount,1);
assert.equal(sum.thickSecondMissCount,1);
assert.equal(sum.thickThirdMissCount,2);
assert.equal(sum.thickScenarioBranchMissCount,1);
console.log("PASS thick miss stage diagnostics");
