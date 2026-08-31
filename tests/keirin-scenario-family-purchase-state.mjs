import assert from "node:assert/strict";
import{classify,allocate}from"../keirin/engine/purchase.mjs";
import{buildPurchaseEligibility}from"../keirin/engine/purchase-engine.mjs";
import{qualifyThickPredictionBets}from"../public/purchase-funding.mjs";
import{derivePredictionRatings}from"../public/prediction-ratings.mjs";

const contribution=(id,label,priority,probability)=>({branchId:id,branchLabel:label,branchPriority:priority,probability,decisionRatios:{first:1,second:1,third:1}});
const terminals=[
  {order:[3,1,2],probability:.25,chatForecastRole:"main",directMainBranchSupport:true,naturalConvergenceScore:.9,branchContributions:[contribution("PRIMARY-3","3主導権残り","main",.25)]},
  {order:[3,2,1],probability:.24,chatForecastRole:"main",directMainBranchSupport:true,naturalConvergenceScore:.86,branchContributions:[contribution("PRIMARY-3","3主導権残り","main",.24)]},
  {order:[3,1,5],probability:.23,chatForecastRole:"main",directMainBranchSupport:true,naturalConvergenceScore:.84,branchContributions:[contribution("PRIMARY-3","3主導権残り","main",.23)]},
  {order:[2,3,1],probability:.20,chatForecastRole:"cover",naturalConvergenceScore:.7,branchContributions:[contribution("MAKURI-2","2捲り成功","contender",.20)]},
  {order:[5,3,1],probability:.04,chatForecastRole:"cover",naturalConvergenceScore:.4,branchContributions:[contribution("SOLO-5","5単騎浮上","sub",.04)]},
  {order:[1,3,2],probability:.03,chatForecastRole:"cover",naturalConvergenceScore:.3,branchContributions:[contribution("SASHI-1","1番手差し","sub",.03)]},
  {order:[3,1,6],probability:.01,chatForecastRole:"main",directMainBranchSupport:true,naturalConvergenceScore:.2,branchContributions:[contribution("PRIMARY-3","3主導権残り","main",.01)]},
  {order:[3,1,7],probability:.001,chatForecastRole:"main",directMainBranchSupport:true,naturalConvergenceScore:.1,branchContributions:[contribution("PRIMARY-3","3主導権残り","main",.001)]}
];
const classified=classify(terminals,{}),adopted=classified.filter(x=>x.purchaseStatus==="購入採用");
const primary=adopted.filter(x=>x.originatingScenarioFamily==="PRIMARY-3");
assert.ok(primary.length>=2,"同一中心展開の着順違いが採用されるfixtureであること");
assert.ok(primary.every(x=>x.betClass==="MAIN"),"同一中心展開は順位に関係なく全てMAIN");
assert.ok(primary.some(x=>x.order.join("-")==="3-1-2")&&primary.some(x=>x.order.join("-")==="3-2-1"),"同じfamilyの2着違いが両方MAIN");
assert.ok(primary.some(x=>x.order.join("-")==="3-1-2")&&primary.some(x=>x.order.join("-")==="3-1-5"),"同じfamilyの3着違いが両方MAIN");
assert.ok(primary.every(x=>x.primaryBranch==="PRIMARY-3"&&x.scenarioFamilyRank&&Number.isFinite(x.scenarioFamilyProbability)));
assert.ok(adopted.some(x=>x.originatingScenarioFamily!=="PRIMARY-3"),"展開違いの押さえfixtureであること");
assert.ok(adopted.filter(x=>x.originatingScenarioFamily!=="PRIMARY-3").every(x=>x.betClass==="COVER"&&x.mainDifferenceReason));
assert.equal(adopted.filter(x=>x.betClass==="COVER"&&(!x.originatingScenarioFamily||!x.primaryBranch||!x.mainDifferenceReason)).length,0,"ORPHAN_COVERは0");

const plan=allocate(classified,3000),allowed=buildPurchaseEligibility({purchase:{noBet:false},standardPurchasePlan:plan,referencePurchasePlan:[],budget:3000});
assert.ok(plan.every(x=>x.originatingScenarioFamily&&x.primaryBranch),"funding planまでscenario family metadataを保持");
assert.ok(plan.filter(x=>x.betClass==="COVER").every(x=>x.mainDifferenceReason),"COVER差分理由をfunding planまで保持");
assert.equal(allowed.canPurchase,true);assert.equal(allowed.allowFunding,true);assert.equal(allowed.allowThick,true);
const stopped=buildPurchaseEligibility({purchase:{noBet:true,noBetReason:"AUDIT_BLOCK"},standardPurchasePlan:[],referencePurchasePlan:plan,budget:3000});
assert.equal(stopped.canPurchase,false);assert.equal(stopped.allowFunding,false);assert.equal(stopped.allowThick,false);
assert.deepEqual(qualifyThickPredictionBets({noBet:true,purchaseEligibility:stopped,betSelections:plan.map(x=>({...x,category:x.betClass}))}),[]);
assert.ok(qualifyThickPredictionBets({purchaseEligibility:allowed,betSelections:[{category:"MAIN",order:[3,1,2],probability:.4,naturalConvergenceScore:.9,globalRank:1,familyRank:1,pairRank:1},{category:"MAIN",order:[3,2,1],probability:.2,naturalConvergenceScore:.5,globalRank:4,familyRank:2,pairRank:1},{category:"COVER",order:[2,3,1],probability:.18,naturalConvergenceScore:.95,globalRank:2,familyRank:1,pairRank:1}]}).every(x=>x.category==="MAIN"));
const rating=derivePredictionRatings({noBet:false,purchaseEligibility:allowed,betSelections:[{category:"MAIN",order:[3,1,2]}],predictionOutput:{purchaseEligibility:allowed,audit:{}}});
assert.notEqual(rating.verdict,"見送り寄り");assert.equal(rating.purchaseEligibility.canPurchase,true);
console.log("scenario family / purchase eligibility alignment passed",{main:primary.length,cover:adopted.length-primary.length,state:allowed.state});
