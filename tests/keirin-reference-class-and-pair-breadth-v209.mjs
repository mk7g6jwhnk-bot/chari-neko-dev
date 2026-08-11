import assert from "node:assert/strict";
import handler from "../netlify/functions/keirin-predict.mjs";
const originalFetch=globalThis.fetch;process.env.KEIRIN_BROWSER_SERVICE_URL="https://railway.test";
const make=(venueCode,venueName,raceNo,lines)=>new Response(JSON.stringify({ok:true,officialData:{basic:{venueName,date:"2026/08/08",raceNo,startTime:"12:00"},participants:Array.from({length:7},(_,i)=>({number:i+1,registration:`${venueCode}${String(i+1).padStart(4,"0")}`,name:`選手${i+1}`,score:88+((i*3+Number(venueCode))%11),escapeCount:(i+1)%4,makuriCount:(i*2)%5,differenceCount:i%3,markCount:(i+2)%4,backCount:(i*3)%7})),lines,odds:{ok:false,odds:{}}},audit:{identityPassed:true}}),{status:200,headers:{"content-type":"application/json"}});
try{
 globalThis.fetch=async()=>make("28","立川",12,[]);
 let r=await handler(new Request("https://test/.netlify/functions/keirin-predict?date=20260808&venueCode=28&venueName=%E7%AB%8B%E5%B7%9D&raceNo=12&budget=3000"));let p=(await r.json()).prediction;
 assert.equal(p.noBet,true);assert.ok(p.purchasePlan.length>0);assert.ok(p.purchasePlan.every(x=>x.referenceOnly===true&&x.betClass==="REFERENCE"&&x.purchaseStatus==="参考表示"));assert.equal(p.recommendations.backup.length,0);
 const lines=[[1,2,3],[4,5],[6],[7]].flatMap((g,li)=>g.map((number,pos)=>({number,lineId:`L${li+1}`,position:pos+1})));
 globalThis.fetch=async()=>make("13","いわき平",11,lines);
 r=await handler(new Request("https://test/.netlify/functions/keirin-predict?date=20260808&venueCode=13&venueName=%E3%81%84%E3%82%8F%E3%81%8D%E5%B9%B3&raceNo=11&budget=3000"));p=(await r.json()).prediction;
 const a=p.audit.chatSpecV1.secondPairBreadthAudit;assert.equal(a.policy,"PRIMARY_FIRST_FAMILY_SECOND_PAIR_BREADTH_ONLY");assert.equal(a.nonPrimaryHeadsUseFirstFamilyBreadthGuards,true);assert.ok(a.strongPairCount>0);assert.ok(a.recoveries.every(x=>Number(String(x.pair).split("-")[0])===Number(a.primaryFirstFamilyNumber)));assert.equal(p.purchasePlan.length,14);
}finally{globalThis.fetch=originalFetch}
console.log("PASS v209 reference class and primary-family pair breadth guard");
