import assert from "node:assert/strict";
import handler from "../netlify/functions/keirin-screening-batch.mjs";

const originalFetch=globalThis.fetch;
process.env.KEIRIN_BROWSER_SERVICE_URL="https://railway.example";
try{
  globalThis.fetch=async url=>{
    assert.ok(String(url).includes('/keirin/preview-batch?'));
    return new Response(JSON.stringify({
      ok:true,
      items:[
        {ok:true,raceNo:7,checkedAt:"2026-08-09T10:00:00Z",officialData:{basic:{date:"20260809",venueName:"前橋",raceNo:7,startTime:"18:30",deadline:"18:27",className:"A級"},participants:Array.from({length:7},(_,i)=>({number:i+1,className:"A3"})),lines:[{number:7,lineId:"line-1",position:1},{number:4,lineId:"line-1",position:2},{number:1,lineId:"line-1",position:3},{number:2,lineId:"line-2",position:1},{number:5,lineId:"line-2",position:2},{number:3,lineId:"line-2",position:3},{number:6,lineId:"line-3",position:1}],odds:{odds:{"7-4-1":8.2,"2-5-3":18.4,"6-2-7":120.2}}}},
        {ok:true,raceNo:8,checkedAt:"2026-08-09T10:00:01Z",officialData:{basic:{date:"20260809",venueName:"前橋",raceNo:8,startTime:"18:55",deadline:"18:52",className:"A級"},participants:Array.from({length:7},(_,i)=>({number:i+1,className:"A3"})),lines:[{number:1,lineId:"line-1",position:1},{number:2,lineId:"line-1",position:2},{number:3,lineId:"line-2",position:1},{number:4,lineId:"line-2",position:2},{number:5,lineId:"line-3",position:1},{number:6,lineId:"line-3",position:2},{number:7,lineId:"line-4",position:1}],odds:{odds:{"1-2-3":4.2,"3-4-1":22.1,"7-1-2":95.0}}}}
      ],failures:[]
    }),{status:200,headers:{"content-type":"application/json"}})
  };
  const response=await handler(new Request('https://test/.netlify/functions/keirin-screening-batch?date=20260809&venueCode=22&venueName=%E5%89%8D%E6%A9%8B&raceNos=7,8'));
  const payload=await response.json();
  assert.equal(response.status,200);
  assert.equal(payload.ok,true);
  assert.equal(payload.items.length,2);
  assert.equal(payload.items[0].race.raceNo,7);
  assert.equal(payload.items[0].screening.stage,'PRIMARY_SCREENING');
  assert.equal(payload.items[0].screening.lineVerified,true);
  assert.equal(payload.items[0].race.deadline,'18:27');
  console.log('PASS screening batch adapter');
} finally {
  globalThis.fetch=originalFetch;
}
