import assert from "node:assert/strict";
import {classify,purchaseDiagnostics} from "../keirin/engine/purchase.mjs";

function t(order,probability,priority,ratios,id){
  return {order,probability,branchContributions:[{
    branchId:id,branchLabel:id,branchPriority:priority,probability,
    requiredFirstNumber:order[0],decisionRatios:ratios,positionScores:{},positionEvidence:{}
  }]};
}

const terminals=[
  t([1,2,3],.24,"main",{first:.98,second:.96,third:.95},"MAIN-1"),
  // 旧ゲートでは second=.80 が固定floor .85未満で落ちるが、最上位頭の確率カバー補完として独立支持を再確認する。
  t([1,4,3],.10,"main",{first:.98,second:.80,third:.94},"MAIN-1"),
  t([1,5,3],.08,"main",{first:.98,second:.76,third:.93},"MAIN-1"),
  // 明確に弱い2着はカバー率を理由に復活させない。
  t([1,6,3],.06,"main",{first:.98,second:.30,third:.92},"MAIN-1"),
  t([2,1,3],.18,"contender",{first:.96,second:.95,third:.94},"CONT-2"),
  t([2,4,3],.12,"contender",{first:.96,second:.94,third:.93},"CONT-2"),
  t([2,5,3],.08,"contender",{first:.96,second:.90,third:.92},"CONT-2"),
  t([7,1,4],.14,"sub",{first:.94,second:.92,third:.91},"SUB-7")
];

const classified=classify(terminals,{});
const by=Object.fromEntries(classified.map(x=>[x.order.join("-"),x]));
assert.equal(by["1-2-3"].betClass,"MAIN");
assert.equal(by["1-4-3"].purchaseStatus,"購入採用","最上位頭の確率カバー補完が働いていない");
assert.equal(by["1-4-3"].adoptionMode,"PRIMARY_FAMILY_COVERAGE_SUPPLEMENT");
assert.equal(by["1-5-3"].purchaseStatus,"購入採用","最上位頭が目標カバー前に打ち切られている");
assert.equal(by["1-6-3"].purchaseStatus,"購入不採用","弱い2着までカバー率だけで復活している");
assert.equal(by["2-1-3"].purchaseStatus,"購入採用","最上位頭完了後の有力別頭補完が消えている");
assert.equal(by["2-4-3"].purchaseRejectCode,"OTHER_FAMILY_COVERAGE_TARGET_REACHED","別頭を必要以上に広げている");

const diag=purchaseDiagnostics(classified,[],3000);
const head1=diag.purchaseFamilyAudit.rows.find(x=>x.first===1);
const head2=diag.purchaseFamilyAudit.rows.find(x=>x.first===2);
assert.equal(diag.purchaseFamilyAudit.primaryFirst,1);
assert.ok(head1.isPrimaryFirstFamily);
assert.ok(head1.coverageTarget>=.70&&head1.coverageTarget<=.80);
assert.ok(head1.adoptedCoverage>=head1.coverageTarget,"最上位頭の優先カバー目標を満たしていない");
assert.ok(head2.adopted<3,"別頭が最上位頭より先に広がっている");
console.log("Keirin primary-family coverage-first passed",JSON.stringify({head1,head2}));
