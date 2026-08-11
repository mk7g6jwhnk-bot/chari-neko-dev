import assert from"node:assert/strict";import handler from"../netlify/functions/keirin-predict.mjs";
const originalFetch=globalThis.fetch;process.env.KEIRIN_BROWSER_SERVICE_URL="https://railway.test";
globalThis.fetch=async()=>new Response(JSON.stringify({ok:true,officialData:{basic:{venueName:"立川",date:"2026/08/08",raceNo:12,startTime:"12:00"},participants:Array.from({length:7},(_,i)=>({number:i+1,registration:`28${String(i+1).padStart(4,"0")}`,name:`選手${i+1}`,score:88+((i*3+28)%11),escapeCount:(i+1)%4,makuriCount:(i*2)%5,differenceCount:i%3,markCount:(i+2)%4,backCount:(i*3)%7})),lines:[],odds:{ok:false,odds:{}}},audit:{identityPassed:true}}),{status:200,headers:{"content-type":"application/json"}});
try{
 const res=await handler(new Request("https://test/.netlify/functions/keirin-predict?date=20260808&venueCode=28&venueName=%E7%AB%8B%E5%B7%9D&raceNo=12&budget=3000"));
 const p=await res.json();const pred=p.prediction;
 assert.equal(pred.audit.chatSpecV1.mainInvariant.mainPurchasedCount,0);
 assert.equal(pred.audit.chatSpecV1.mainInvariant.passed,false);
 assert.equal(pred.noBet,true);
 assert.equal(pred.noBetReason,"LINE_AND_START_EVIDENCE_UNAVAILABLE");
 assert.equal(pred.audit.referencePlan,true);
 assert.equal(pred.purchasePlan.length,7);
 assert.equal(pred.purchasePlan.every(x=>x.referenceOnly===true),true);
 console.log("PASS missing line+start evidence keeps MAIN unresolved and uses 7 reference terminals");
}finally{globalThis.fetch=originalFetch}
