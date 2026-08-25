import assert from"node:assert/strict";import handler from"../netlify/functions/keirin-predict.mjs";
const originalFetch=globalThis.fetch;process.env.KEIRIN_BROWSER_SERVICE_URL="https://railway.test";
globalThis.fetch=async()=>new Response(JSON.stringify({ok:true,officialData:{basic:{venueName:"立川",date:"2026/08/08",raceNo:12,startTime:"12:00"},participants:Array.from({length:9},(_,i)=>({number:i+1,registration:`28${String(i+1).padStart(4,"0")}`,name:`選手${i+1}`,score:88+((i*3+28)%11),escapeCount:(i+1)%4,makuriCount:(i*2)%5,differenceCount:i%3,markCount:(i+2)%4,backCount:(i*3)%7})),lines:[],odds:{ok:false,odds:{}}},audit:{identityPassed:true}}),{status:200,headers:{"content-type":"application/json"}});
try{
  const res=await handler(new Request("https://test/.netlify/functions/keirin-predict?date=20260808&venueCode=28&venueName=%E7%AB%8B%E5%B7%9D&raceNo=12&budget=3000"));
  const body=await res.json();
  assert.equal(res.status,200,body.error||"prediction request failed");
  const p=body.prediction;
  const d=p.audit.lineFallbackAudit.discriminationAudit;
  assert.equal(d.sufficient,false);
  assert.equal(p.terminals.length,504);
  assert.equal(p.audit.lineFallbackAudit.flatEvidenceWarning,true);
  assert.equal(p.audit.lineFallbackAudit.flatEvidencePurchaseBlockApplied,false);
  assert.equal(p.noBet,false);
  assert.equal(p.noBetReason,null);
  assert.ok(p.standardPurchasePlan.length>=1);
  assert.equal(p.referencePurchasePlan.length,0);
  assert.equal(p.purchasePlan.length,p.standardPurchasePlan.length);
  assert.equal(p.audit.purchaseCandidateCountAfterCompression,p.standardPurchasePlan.length);
  assert.equal(p.purchasePlan.every(x=>x.referenceOnly!==true),true);
  console.log(`PASS 504 terminals -> ${p.audit.purchaseCandidateCountAfterCompression} purchase candidates -> ${p.standardPurchasePlan.length} standard bets`);
}finally{globalThis.fetch=originalFetch}
