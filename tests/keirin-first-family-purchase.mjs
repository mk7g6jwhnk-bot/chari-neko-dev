import assert from "node:assert/strict";
import {classify,allocate,purchaseDiagnostics} from "../keirin/engine/purchase.mjs";

function t(order,probability,priority,ratios,branchId){
  return{order,probability,branchContributions:[{branchId,branchLabel:branchId,branchPriority:priority,probability,requiredFirstNumber:order[0],decisionRatios:ratios,positionScores:{},positionEvidence:{}}]};
}
const strong={first:.98,second:.96,third:.95};
const terminals=[
  t([2,4,6],.30,"main",strong,"MAIN-2"),
  t([2,4,1],.12,"main",{first:.98,second:.96,third:.90},"MAIN-2"),
  t([2,5,6],.10,"main",{first:.98,second:.91,third:.94},"MAIN-2"),
  t([2,7,6],.02,"main",{first:.98,second:.30,third:.94},"MAIN-2"),
  t([3,1,5],.18,"contender",strong,"CONT-3"),
  t([7,4,1],.08,"sub",strong,"SUB-7"),
  t([7,1,6],.03,"sub",{first:.97,second:.90,third:.90},"SUB-7"),
  t([7,6,1],.01,"sub",{first:.97,second:.30,third:.90},"SUB-7")
];
const odds={"2-4-6":8,"2-4-1":20,"2-5-6":35,"3-1-5":12,"7-4-1":300,"7-1-6":500,"7-6-1":1000};
const classified=classify(terminals,odds),by=Object.fromEntries(classified.map(x=>[x.order.join("-"),x]));
assert.equal(by["2-4-6"].betClass,"MAIN");
assert.equal(by["2-4-1"].betClass,"MAIN","同一の本命1着・2着から自然な3着違いが本線に残っていない");
assert.equal(by["2-5-6"].betClass,"MAIN","本命1着を固定した別2着の自然終端が本線に残っていない");
assert.equal(by["2-7-6"].purchaseStatus,"購入不採用","2着の独立支持が弱い終端まで本線に混入している");
assert.equal(by["3-1-5"].betClass,"COVER","有力別頭ファミリーが押さえに分類されていない");
assert.equal(by["7-4-1"].betClass,"BUYABLE_HIGH","別展開の成立確率×オッズ妙味が高配当候補に反映されていない");
assert.equal(by["7-6-1"].purchaseStatus,"購入不採用","別展開でも2着支持が弱い終端まで高配当に混入している");
const diag=purchaseDiagnostics(classified,[],3000);
const head2=diag.purchaseFamilyAudit.rows.find(x=>x.first===2),head7=diag.purchaseFamilyAudit.rows.find(x=>x.first===7);
assert.ok(head2&&head2.main>=3,"本命頭ファミリーの生成→自然候補→購入の監査が不足");
assert.ok(head7&&head7.buyableHigh>=1,"別頭高配当ファミリー監査が不足");
const plan=allocate(classified,3000);
assert.equal(plan.reduce((sum,x)=>sum+(x.stake||0),0),3000);
assert.ok(plan.every(x=>x.stake>=100));
const mainSameProb=[
  {order:[1,2,3],betClass:"MAIN",purchaseStatus:"購入採用",probability:.1,odds:10,branchSupport:1,purchaseReason:"a"},
  {order:[1,2,4],betClass:"MAIN",purchaseStatus:"購入採用",probability:.1,odds:100,branchSupport:1,purchaseReason:"b"}
];
const valuePlan=allocate(mainSameProb,1000);
assert.ok(valuePlan.find(x=>x.order[2]===4).stake>valuePlan.find(x=>x.order[2]===3).stake,"資金配分に確率×オッズ妙味が反映されていない");
console.log("Keirin first-family purchase hierarchy passed",JSON.stringify(diag.purchaseFamilyAudit.rows));
