import assert from"node:assert/strict";
import handler from"../netlify/functions/keirin-predict.mjs";
import{allocate}from"../keirin/engine/purchase.mjs";
import{qualifyThickPredictionBets}from"../public/purchase-funding.mjs";

const allocated=allocate([{order:[1,2,3],betClass:"MAIN",purchaseStatus:"購入採用",probability:.2,terminalScore:.9,naturalConvergenceScore:.8,globalRank:1,familyRank:1,pairRank:1,nodeConditionalProbability:.7,scenarioCoherence:.9,branchFit:.8}],3000);
assert.equal(allocated[0].naturalConvergenceScore,.8);
assert.equal(allocated[0].globalRank,1);
const eligibility={state:"PURCHASE_ALLOWED",canPurchase:true,allowThick:true,allowFunding:true};
const qualified=qualifyThickPredictionBets({purchaseEligibility:eligibility,betSelections:[{...allocated[0],category:"MAIN"},{...allocated[0],category:"MAIN",order:[1,3,2],probability:.18,naturalConvergenceScore:.78,globalRank:2,familyRank:2,pairRank:1},{...allocated[0],category:"MAIN",order:[1,4,2],probability:.03,naturalConvergenceScore:.2,globalRank:9,familyRank:5,pairRank:1},{...allocated[0],category:"COVER",order:[1,2,4],probability:.19,terminalScore:.95,naturalConvergenceScore:.95,globalRank:1,familyRank:1,pairRank:1,nodeConditionalProbability:.9,scenarioCoherence:.9,branchFit:.9}]});
assert.ok(qualified.length>=1,"prediction-qualified thick subset must receive preserved evidence");
assert.ok(qualified.every(item=>item.category==="MAIN"),"COVER must never qualify as thick");

const originalFetch=globalThis.fetch;process.env.KEIRIN_BROWSER_SERVICE_URL="https://railway.test";
globalThis.fetch=async()=>new Response(JSON.stringify({ok:true,officialData:{basic:{venueName:"いわき平",date:"2026/08/08",raceNo:11,startTime:"12:00"},participants:Array.from({length:7},(_,i)=>({number:i+1,registration:`13${String(i+1).padStart(4,"0")}`,name:`選手${i+1}`,score:88+((i*3+13)%11),escapeCount:(i+1)%4,makuriCount:(i*2)%5,differenceCount:i%3,markCount:(i+2)%4,backCount:(i*3)%7})),lines:[[1,2,3],[4,5],[6],[7]].flatMap((group,lineIndex)=>group.map((number,position)=>({number,lineId:`L${lineIndex+1}`,position:position+1}))),odds:{ok:false,odds:{}}},audit:{identityPassed:true}}),{status:200,headers:{"content-type":"application/json"}});
try{const response=await handler(new Request("https://test/.netlify/functions/keirin-predict?date=20260808&venueCode=13&venueName=%E3%81%84%E3%82%8F%E3%81%8D%E5%B9%B3&raceNo=11&budget=1000")),payload=await response.json();assert.equal(response.status,200);assert.equal(payload.prediction.standardPurchasePlan.length,0);assert.equal(payload.prediction.noBet,true);assert.equal(payload.prediction.noBetReason,"DIFFUSE_CLUSTER_EXCEEDS_BUDGET");assert.equal(payload.prediction.audit.purchaseRegime,"EXTREMELY_DIFFUSE");assert.ok(payload.prediction.referencePurchasePlan.length>0);assert.equal(payload.prediction.audit.predictionPurchaseBoundaryAudit.passed,true)}finally{globalThis.fetch=originalFetch}
console.log("PASS budget-infeasible diffuse cluster + thick evidence preservation");
