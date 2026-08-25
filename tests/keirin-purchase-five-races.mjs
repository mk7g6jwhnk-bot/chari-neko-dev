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
const storage={data:new Map(),getItem(key){return this.data.get(key)||null},setItem(key,value){this.data.set(key,String(value))}},counts=[],standardCounts=[],noBets=[],distributionAudits=[];
try{for(const [venueCode,venueName,raceNo] of cases){const response=await handler(new Request(`https://test/.netlify/functions/keirin-predict?${new URLSearchParams({date:"20260808",venueCode,venueName,raceNo:String(raceNo),budget:"3000"})}`)),payload=await response.json();assert.equal(response.status,200);assert.equal(payload.ok,true);assert.ok(payload.prediction.audit.terminalCount>0);assert.equal(payload.prediction.purchasePlan.length,payload.prediction.audit.purchaseCandidateCountAfterCompression);counts.push(payload.prediction.purchasePlan.length);standardCounts.push(payload.prediction.standardPurchasePlan.length);noBets.push(payload.prediction.noBet);distributionAudits.push(summarizeDistribution(payload.prediction,`${venueCode}-${raceNo}`));saveSnapshot(storage,createSnapshot(payload));}assert.ok(counts.every(count=>count>0),"終端生成成功レースで参考表示も0件になっている");assert.ok(new Set(counts).size>1,"5Rが機械的に同一点数ではない");assert.equal(loadSnapshots(storage).length,5);}finally{globalThis.fetch=originalFetch}
console.log(`Keirin five-race purchase flow passed: display=${counts.join(",")} standard=${standardCounts.join(",")} noBet=${noBets.join(",")}`);
console.log(JSON.stringify(distributionAudits.map(a=>({label:a.label,terminalCount:a.terminalCount,rawMass:a.rawMass,finalMass:a.finalMass,rawMax:a.rawMax,finalMax:a.finalMax,boundaryRank:a.naturalBoundary?.boundaryRank,top:a.top.map(x=>({order:x.order,probability:x.probability,terminalScore:x.terminalScore,positionScores:x.positionScores,supportCount:x.branches.length,supportSignature:x.branches.map(b=>`${b.id}:${b.contribution}`).join("|")})),permutations:a.permutations})),null,2));

function summarizeDistribution(prediction,label){
  const raw=[...(prediction.prediction?.terminals||[])].sort((a,b)=>(b.probability||0)-(a.probability||0));
  const final=[...(prediction.terminals||[])].sort((a,b)=>(b.probability||0)-(a.probability||0));
  const mass=(rows,n)=>Number(rows.slice(0,n).reduce((sum,row)=>sum+(Number(row.probability)||0),0).toFixed(8));
  const top=final.slice(0,10).map((row,index)=>({rank:index+1,order:row.order.join("-"),probability:Number((row.probability||0).toFixed(8)),terminalScore:Number((row.terminalScore||0).toFixed(8)),positionScores:row.branchContributions?.[0]?.positionScores||null,branches:(row.branchContributions||[]).map(c=>({id:c.branchId,contribution:Number((c.probability||0).toFixed(8)),pathScore:Number((c.pathScore||0).toFixed(6))}))}));
  const riders=top[0]?.order.split("-").map(Number)||[];
  const permutations=riders.length===3?permute(riders).map(order=>{const key=order.join("-"),rawRow=raw.find(row=>row.order.join("-")===key),finalRow=final.find(row=>row.order.join("-")===key);return{order:key,rawProbability:Number((rawRow?.probability||0).toFixed(8)),finalProbability:Number((finalRow?.probability||0).toFixed(8)),positionScores:rawRow?.branchContributions?.[0]?.positionScores||null};}):[];
  return{label,terminalCount:final.length,branchCount:prediction.prediction?.branches?.length||0,rawMass:Object.fromEntries([1,3,5,10,20,50,100].map(n=>[n,mass(raw,n)])),finalMass:Object.fromEntries([1,3,5,10,20,50,100].map(n=>[n,mass(final,n)])),rawMax:Number((raw[0]?.probability||0).toFixed(8)),finalMax:Number((final[0]?.probability||0).toFixed(8)),naturalBoundary:final[0]?.purchaseDistributionAudit||null,top,permutations};
}
function permute([a,b,c]){return[[a,b,c],[a,c,b],[b,a,c],[b,c,a],[c,a,b],[c,b,a]]}
