import assert from "node:assert/strict";
import handler from "../netlify/functions/keirin-active-races.mjs";

const originalFetch=globalThis.fetch;
process.env.KEIRIN_BROWSER_SERVICE_URL="https://railway.example";
try{
  globalThis.fetch=async url=>{
    const parsed=new URL(String(url));
    assert.equal(parsed.pathname,"/keirin/active-races");
    assert.equal(parsed.searchParams.get("date"),"20260809");
    assert.equal(parsed.searchParams.get("venueCodes"),"22,34");
    return new Response(JSON.stringify({ok:true,date:"20260809",venues:[
      {venueCode:"22",activeRaceNos:[10,11,12],endedRaceNos:[1,2,3,4,5,6,7,8,9],unknownRaceNos:[]},
      {venueCode:"34",activeRaceNos:[4,5,6,7,8,9,10,11,12],endedRaceNos:[1,2,3],unknownRaceNos:[]}
    ]}),{status:200,headers:{"content-type":"application/json"}});
  };
  const response=await handler(new Request("https://test/.netlify/functions/keirin-active-races?date=20260809&venueCodes=22,34"));
  const payload=await response.json();
  assert.equal(response.status,200);
  assert.equal(payload.venues.length,2);
  assert.deepEqual(payload.venues[0].activeRaceNos,[10,11,12]);
  console.log("PASS active race scan adapter");
} finally { globalThis.fetch=originalFetch; }
