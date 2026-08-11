import assert from "node:assert/strict";
import handler from "../netlify/functions/keirin-predict.mjs";
const originalFetch=globalThis.fetch;process.env.KEIRIN_BROWSER_SERVICE_URL="https://railway.test";
globalThis.fetch=async()=>new Response(JSON.stringify({ok:true,officialData:{basic:{venueName:"いわき平",date:"2026/08/08",raceNo:11,startTime:"12:00"},participants:Array.from({length:7},(_,index)=>({number:index+1,registration:`13${String(index+1).padStart(4,"0")}`,name:`選手${index+1}`,score:88+((index*3+13)%11),escapeCount:(index+1)%4,makuriCount:(index*2)%5,differenceCount:index%3,markCount:(index+2)%4,backCount:(index*3)%7})),lines:[[1,2,3],[4,5],[6],[7]].flatMap((group,lineIndex)=>group.map((number,position)=>({number,lineId:`L${lineIndex+1}`,position:position+1}))),odds:{ok:false,odds:{}}},audit:{identityPassed:true}}),{status:200,headers:{"content-type":"application/json"}});
try{
  const res=await handler(new Request("https://test/.netlify/functions/keirin-predict?date=20260808&venueCode=13&venueName=%E3%81%84%E3%82%8F%E3%81%8D%E5%B9%B3&raceNo=11&budget=3000")),p=await res.json();
  assert.equal(res.status,200);assert.equal(p.ok,true);assert.equal(p.prediction.purchasePlan.length,10);
  const audit=p.prediction.audit.chatSpecV1.scenarioClassificationAudit;
  assert.equal(audit.passed,true);assert.equal(audit.mismatchCount,0);assert.equal(audit.pointCountBasedClassificationCount,0);
  const recoveries=p.prediction.audit.chatSpecV1.secondPairBreadthAudit.recoveries;
  assert.ok(recoveries.length>=4);assert.ok(recoveries.every(row=>["MAIN","COVER"].includes(row.betClass)));assert.ok(recoveries.every(row=>row.classificationReason));
}finally{globalThis.fetch=originalFetch}
console.log("PASS v157 scenario-origin classification alignment");
