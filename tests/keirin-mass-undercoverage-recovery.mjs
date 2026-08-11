import assert from "node:assert/strict";
import fs from "node:fs";
import handler from "../netlify/functions/keirin-predict.mjs";

const source=fs.readFileSync(new URL("../keirin/engine/chat-spec-v1-policy.mjs",import.meta.url),"utf8");
assert.match(source,/SECOND_PAIR_BREADTH_RECOVERY/);
assert.match(source,/ONE_REPRESENTATIVE_PER_STRONGLY_SUPPORTED_SECOND_PAIR/);
assert.match(source,/secondRelativeFloor:\.94/);
assert.match(source,/fixedTicketQuotaApplied:false/);
assert.match(source,/GLOBAL_MASS_WARN_ONLY_PAIR_LOCAL_RECOVERY/);

const cases=[
  ["13","いわき平",11,7,[[1,2,3],[4,5],[6],[7]],10],
  ["24","宇都宮",9,7,[[1,2],[3,4,5],[6,7]],10],
  ["28","立川",12,7,[],7],
  ["55","和歌山",1,8,[[1,2,3],[4,5,6],[7],[8]],12],
  ["85","佐世保",12,7,[[1,2,3],[4,5],[6,7]],10]
];
const originalFetch=globalThis.fetch;process.env.KEIRIN_BROWSER_SERVICE_URL="https://railway.test";
globalThis.fetch=async url=>{const u=new URL(url),venueCode=u.searchParams.get("venueCode"),entry=cases.find(item=>item[0]===venueCode),count=entry[3],lines=entry[4].flatMap((group,lineIndex)=>group.map((number,position)=>({number,lineId:`L${lineIndex+1}`,position:position+1})));return new Response(JSON.stringify({ok:true,officialData:{basic:{venueName:entry[1],date:"2026/08/08",raceNo:entry[2],startTime:"12:00"},participants:Array.from({length:count},(_,index)=>({number:index+1,registration:`${venueCode}${String(index+1).padStart(4,"0")}`,name:`選手${index+1}`,score:88+((index*3+Number(venueCode))%11),escapeCount:(index+1)%4,makuriCount:(index*2)%5,differenceCount:index%3,markCount:(index+2)%4,backCount:(index*3)%7})),lines,odds:{ok:false,odds:{}}},audit:{identityPassed:true}}),{status:200,headers:{"content-type":"application/json"}})};
try{
  for(const [venueCode,venueName,raceNo,,,expected] of cases){
    const response=await handler(new Request(`https://test/.netlify/functions/keirin-predict?${new URLSearchParams({date:"20260808",venueCode,venueName,raceNo:String(raceNo),budget:"3000"})}`));
    const payload=await response.json();assert.equal(payload.ok,true);
    assert.equal(payload.prediction.purchasePlan.length,expected);
    if(venueCode!=="28"){
      const audit=payload.prediction.audit.chatSpecV1?.secondPairBreadthAudit||payload.prediction.audit.secondPairBreadthAudit;
      assert.ok(audit?.recoveryCount>=3,"strong second pairs should be recovered");
      assert.equal(audit.fixedTicketQuotaApplied,false);
    }
  }
}finally{globalThis.fetch=originalFetch;}
console.log("PASS v156 strong second-pair breadth recovery without global mass fill");
