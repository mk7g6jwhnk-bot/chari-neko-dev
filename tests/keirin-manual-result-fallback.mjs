import assert from "node:assert/strict";
import handler from "../netlify/functions/keirin-result.mjs";

const originalFetch=globalThis.fetch,originalBase=process.env.KEIRIN_BROWSER_SERVICE_URL,originalSecret=process.env.AUTO_RESEARCH_CALLBACK_SECRET;
try{
  process.env.KEIRIN_BROWSER_SERVICE_URL="https://railway.test";
  process.env.AUTO_RESEARCH_CALLBACK_SECRET="test-only";
  const calls=[];
  globalThis.fetch=async(url,options)=>{
    calls.push({url:String(url),headers:options?.headers});
    if(String(url).includes("/keirin/race?"))return new Response(JSON.stringify({ok:false,error:"OFFICIAL_RACE_PAYLOAD_INCOMPLETE"}),{status:422,headers:{"content-type":"application/json"}});
    return new Response(JSON.stringify({ok:true,officialResult:{status:"confirmed",finishOrder:[1,2,3],payout:89490,source:"saved"}}),{status:200,headers:{"content-type":"application/json"}});
  };
  const response=await handler(new Request("https://app.test/.netlify/functions/keirin-result?date=20260912&venueCode=46&venueName=富山&raceNo=2")),body=await response.json();
  assert.equal(response.status,200);assert.equal(body.source,"saved_sealed_result");assert.deepEqual(body.result.finishOrder,[1,2,3]);assert.equal(body.result.payout,89490);
  assert.match(calls[0].url,/requestType=manual_result/);assert.match(calls[1].url,/predictions\/sealed\/20260912-46-2\/result/);assert.equal(calls[1].headers["x-auto-research-secret"],"test-only");
  console.log("PASS manual result canonical live path with saved sealed fallback");
}finally{
  globalThis.fetch=originalFetch;
  if(originalBase===undefined)delete process.env.KEIRIN_BROWSER_SERVICE_URL;else process.env.KEIRIN_BROWSER_SERVICE_URL=originalBase;
  if(originalSecret===undefined)delete process.env.AUTO_RESEARCH_CALLBACK_SECRET;else process.env.AUTO_RESEARCH_CALLBACK_SECRET=originalSecret;
}
