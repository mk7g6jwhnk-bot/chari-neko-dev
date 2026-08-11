import assert from"node:assert/strict";import handler from"../netlify/functions/keirin-predict.mjs";
const originalFetch=globalThis.fetch;process.env.KEIRIN_BROWSER_SERVICE_URL="https://railway.test";
globalThis.fetch=async()=>new Response(JSON.stringify({ok:true,officialData:{basic:{venueName:"立川",date:"2026/08/08",raceNo:12,startTime:"12:00"},participants:Array.from({length:7},(_,i)=>({number:i+1,registration:`28${String(i+1).padStart(4,"0")}`,name:`選手${i+1}`,score:88+((i*3+28)%11),escapeCount:(i+1)%4,makuriCount:(i*2)%5,differenceCount:i%3,markCount:(i+2)%4,backCount:(i*3)%7})),lines:[],odds:{ok:false,odds:{}}},audit:{identityPassed:true}}),{status:200,headers:{"content-type":"application/json"}});
try{
  const res=await handler(new Request("https://test/.netlify/functions/keirin-predict?date=20260808&venueCode=28&venueName=%E7%AB%8B%E5%B7%9D&raceNo=12&budget=3000"));
  const p=(await res.json()).prediction;
  const d=p.audit.lineFallbackAudit.discriminationAudit;
  assert.equal(d.sufficient,false);
  assert.equal(p.audit.lineFallbackAudit.flatEvidencePurchaseBlockApplied,true);
  assert.equal(p.noBet,true);
  assert.equal(p.noBetReason,"LINE_FALLBACK_INSUFFICIENT_DISCRIMINATION");
  assert.ok(p.purchasePlan.length>=1);
  assert.ok(p.purchasePlan.length<44);
  assert.equal(p.audit.referencePlan,true);
  assert.equal(p.purchasePlan.every(x=>x.referenceOnly===true),true);
  assert.ok(p.terminals.length>p.purchasePlan.length);
  console.log("PASS flat missing-line evidence no longer becomes 44 MAIN bets");
}finally{globalThis.fetch=originalFetch}