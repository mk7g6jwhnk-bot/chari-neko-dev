import assert from "node:assert/strict";
import handler from "../netlify/functions/keirin-predict.mjs";

const cases=[
  ["13","いわき平",11,7,[[1,2,3],[4,5],[6],[7]]],
  ["24","宇都宮",9,7,[[1,2],[3,4,5],[6,7]]],
  ["55","和歌山",1,8,[[1,2,3],[4,5,6],[7],[8]]],
  ["85","佐世保",12,7,[[1,2,3],[4,5],[6,7]]]
];
const originalFetch=globalThis.fetch;process.env.KEIRIN_BROWSER_SERVICE_URL="https://railway.test";
globalThis.fetch=async url=>{const u=new URL(url),venueCode=u.searchParams.get("venueCode"),entry=cases.find(item=>item[0]===venueCode),count=entry[3],lines=entry[4].flatMap((group,lineIndex)=>group.map((number,position)=>({number,lineId:`L${lineIndex+1}`,position:position+1})));return new Response(JSON.stringify({ok:true,officialData:{basic:{venueName:entry[1],date:"2026/08/08",raceNo:entry[2],startTime:"12:00"},participants:Array.from({length:count},(_,index)=>({number:index+1,registration:`${venueCode}${String(index+1).padStart(4,"0")}`,name:`選手${index+1}`,score:88+((index*3+Number(venueCode))%11),escapeCount:(index+1)%4,makuriCount:(index*2)%5,differenceCount:index%3,markCount:(index+2)%4,backCount:(index*3)%7})),lines,odds:{ok:false,odds:{}}},audit:{identityPassed:true}}),{status:200,headers:{"content-type":"application/json"}})};
try{
  const counts=[];
  for(const [venueCode,venueName,raceNo] of cases){
    const response=await handler(new Request(`https://test/.netlify/functions/keirin-predict?${new URLSearchParams({date:"20260808",venueCode,venueName,raceNo:String(raceNo),budget:"3000"})}`));
    const payload=await response.json();assert.equal(response.status,200);assert.equal(payload.ok,true);
    const audit=payload.prediction.audit;
    counts.push(payload.prediction.purchasePlan.length);
    assert.equal(audit.purchaseFunnelAudit.rejectCodeCounts.PURCHASE_CLASS_NOT_SATISFIED??0,0,"coverage recovery must not stop on rows that later fail purchase classification");
    const primary=audit.purchaseFamilyAudit.rows.find(row=>row.isPrimaryFirstFamily);
    assert.ok(primary,"primary family audit missing");
    assert.ok((primary.selectedCoverageGate??0)<=primary.adoptedCoverage+1e-9,"selected coverage must not be inflated by unclassifiable provisional rows");
  }
  assert.deepEqual(counts,[14,14,12,14]);
}finally{globalThis.fetch=originalFetch;}
console.log("PASS classifiable coverage recovery");
