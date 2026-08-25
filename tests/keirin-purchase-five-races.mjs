import assert from "node:assert/strict";
import handler from "../netlify/functions/keirin-predict.mjs";
import {createSnapshot,saveSnapshot,loadSnapshots} from "../public/prediction-store.mjs";

const cases=[
  ["13","いわき平",11,7,[[1,2,3],[4,5],[6],[7]]],
  ["24","宇都宮",9,7,[[1,2],[3,4,5],[6,7]]],
  ["28","立川",12,7,[]],
  ["55","和歌山",1,8,[[1,2,3],[4,5,6],[7],[8]]],
  ["85","佐世保",12,7,[[1,2,3],[4,5],[6,7]]]
];
const originalFetch=globalThis.fetch;process.env.KEIRIN_BROWSER_SERVICE_URL="https://railway.test";
globalThis.fetch=async url=>{const u=new URL(url),venueCode=u.searchParams.get("venueCode"),entry=cases.find(item=>item[0]===venueCode),count=entry[3],lines=entry[4].flatMap((group,lineIndex)=>group.map((number,position)=>({number,lineId:`L${lineIndex+1}`,position:position+1})));return new Response(JSON.stringify({ok:true,officialData:{basic:{venueName:entry[1],date:"2026/08/08",raceNo:entry[2],startTime:"12:00"},participants:Array.from({length:count},(_,index)=>({number:index+1,registration:`${venueCode}${String(index+1).padStart(4,"0")}`,name:`選手${index+1}`,score:88+((index*3+Number(venueCode))%11),escapeCount:(index+1)%4,makuriCount:(index*2)%5,differenceCount:index%3,markCount:(index+2)%4,backCount:(index*3)%7})),lines,odds:{ok:false,odds:{}}},audit:{identityPassed:true}}),{status:200,headers:{"content-type":"application/json"}})};
const storage={data:new Map(),getItem(key){return this.data.get(key)||null},setItem(key,value){this.data.set(key,String(value))}},counts=[],standardCounts=[],noBets=[];
try{for(const [venueCode,venueName,raceNo] of cases){const response=await handler(new Request(`https://test/.netlify/functions/keirin-predict?${new URLSearchParams({date:"20260808",venueCode,venueName,raceNo:String(raceNo),budget:"3000"})}`)),payload=await response.json();assert.equal(response.status,200);assert.equal(payload.ok,true);assert.ok(payload.prediction.audit.terminalCount>0);assert.equal(payload.prediction.purchasePlan.length,payload.prediction.audit.purchaseCandidateCountAfterCompression);counts.push(payload.prediction.purchasePlan.length);standardCounts.push(payload.prediction.standardPurchasePlan.length);noBets.push(payload.prediction.noBet);saveSnapshot(storage,createSnapshot(payload));}assert.ok(counts.every(count=>count>0),"終端生成成功レースで参考表示も0件になっている");assert.ok(new Set(counts).size>1,"5Rが機械的に同一点数ではない");assert.equal(loadSnapshots(storage).length,5);}finally{globalThis.fetch=originalFetch}
console.log(`Keirin five-race purchase flow passed: display=${counts.join(",")} standard=${standardCounts.join(",")} noBet=${noBets.join(",")}`);
