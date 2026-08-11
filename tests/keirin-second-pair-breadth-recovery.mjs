import assert from"node:assert/strict";
import handler from"../netlify/functions/keirin-predict.mjs";
const originalFetch=globalThis.fetch;process.env.KEIRIN_BROWSER_SERVICE_URL="https://railway.test";
globalThis.fetch=async()=>new Response(JSON.stringify({ok:true,officialData:{basic:{venueName:"いわき平",date:"2026/08/08",raceNo:11,startTime:"12:00"},participants:Array.from({length:7},(_,index)=>({number:index+1,registration:`13${String(index+1).padStart(4,"0")}`,name:`選手${index+1}`,score:88+((index*3+13)%11),escapeCount:(index+1)%4,makuriCount:(index*2)%5,differenceCount:index%3,markCount:(index+2)%4,backCount:(index*3)%7})),lines:[[1,2,3],[4,5],[6],[7]].flatMap((group,lineIndex)=>group.map((number,position)=>({number,lineId:`L${lineIndex+1}`,position:position+1}))),odds:{ok:false,odds:{}}},audit:{identityPassed:true}}),{status:200,headers:{"content-type":"application/json"}});
try{
 const res=await handler(new Request("https://test/.netlify/functions/keirin-predict?date=20260808&venueCode=13&venueName=%E3%81%84%E3%82%8F%E3%81%8D%E5%B9%B3&raceNo=11&budget=3000")),p=await res.json();
 assert.equal(res.status,200);assert.equal(p.ok,true);assert.equal(p.prediction.purchasePlan.length,10);
 const a=p.prediction.audit.chatSpecV1.secondPairBreadthAudit;assert.ok(a);assert.equal(a.policy,"PRIMARY_FIRST_FAMILY_SECOND_PAIR_BREADTH_ONLY");assert.ok(a.primaryFirstFamilyNumber);
 if(a.recoveryCount>0){
   assert.ok(a.recoveries.every(row=>row.secondRelative>=.94));
   assert.ok(a.recoveries.every(row=>Number(String(row.pair).split("-")[0])===Number(a.primaryFirstFamilyNumber)));
 }
 assert.equal(p.prediction.audit.chatSpecV1.invariants.find(row=>row.key==="NO_UNAUTHORIZED_LOW_NATURAL_CONVERGENCE_PURCHASE")?.passed,true);
}finally{globalThis.fetch=originalFetch;}
console.log("PASS v156/v209 second-pair breadth policy remains available without forced recovery count");
