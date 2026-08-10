import assert from "node:assert/strict";
import {classify} from "../keirin/engine/purchase.mjs";

function t(order,probability,priority,ratios,id){
  return {order,probability,branchContributions:[{branchId:id,branchLabel:id,branchPriority:priority,probability,requiredFirstNumber:order[0],decisionRatios:ratios,positionScores:{},positionEvidence:{}}]};
}

// mainファミリー内でcontenderの高確率終端が先にカバー目標を満たしても、main終端を消してはいけない。
const terminals=[
  t([1,2,3],.26,"contender",{first:.98,second:.96,third:.95},"CONT-1"),
  t([1,2,4],.22,"contender",{first:.98,second:.95,third:.94},"CONT-1"),
  t([1,3,2],.08,"main",{first:.97,second:.94,third:.93},"MAIN-1"),
  t([2,1,3],.18,"contender",{first:.96,second:.94,third:.93},"CONT-2"),
  t([2,3,1],.14,"contender",{first:.95,second:.93,third:.92},"CONT-2"),
  t([7,1,4],.12,"sub",{first:.94,second:.92,third:.91},"SUB-7")
];
const classified=classify(terminals,{});
const adopted=classified.filter(x=>x.purchaseStatus==="購入採用");
assert.ok(adopted.some(x=>x.betClass==="MAIN"),"main展開の自然終端があるのに本線0件になっている");
assert.equal(classified.find(x=>x.order.join("-")==="1-3-2").betClass,"MAIN","main由来終端がCOVERへ降格している");

// 最上位頭がcontenderでも、別頭のmain自然終端はMAIN区分を維持する。
const terminals2=[
  t([1,2,3],.35,"contender",{first:.98,second:.96,third:.95},"CONT-1"),
  t([1,3,2],.25,"contender",{first:.97,second:.95,third:.94},"CONT-1"),
  t([2,1,3],.22,"main",{first:.97,second:.95,third:.94},"MAIN-2"),
  t([2,3,1],.18,"main",{first:.96,second:.94,third:.93},"MAIN-2")
];
const classified2=classify(terminals2,{});
assert.ok(classified2.filter(x=>x.purchaseStatus==="購入採用"&&x.betClass==="MAIN").length>=1,"別頭のmainファミリーが押さえに上書きされている");
console.log("Keirin main class preservation passed");
