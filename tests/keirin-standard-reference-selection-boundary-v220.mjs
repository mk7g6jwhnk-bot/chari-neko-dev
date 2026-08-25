import assert from"node:assert/strict";
import fs from"node:fs";
import handler from"../netlify/functions/keirin-predict.mjs";
import{createSnapshot,saveSnapshot,attachResult}from"../public/prediction-store.mjs";

const originalFetch=globalThis.fetch;process.env.KEIRIN_BROWSER_SERVICE_URL="https://railway.test";
const storage={data:new Map(),getItem(k){return this.data.get(k)??null},setItem(k,v){this.data.set(k,String(v))}};
globalThis.fetch=async()=>new Response(JSON.stringify({ok:true,officialData:{basic:{venueName:"立川",date:"2026/08/08",raceNo:12,startTime:"12:00"},participants:Array.from({length:7},(_,index)=>({number:index+1,registration:`28${String(index+1).padStart(4,"0")}`,name:`選手${index+1}`,score:88+((index*3+28)%11),escapeCount:(index+1)%4,makuriCount:(index*2)%5,differenceCount:index%3,markCount:(index+2)%4,backCount:(index*3)%7})),lines:[],odds:{ok:false,odds:{}}},audit:{identityPassed:true}}),{status:200,headers:{"content-type":"application/json"}});
try{
 const res=await handler(new Request("https://test/.netlify/functions/keirin-predict?date=20260808&venueCode=28&venueName=%E7%AB%8B%E5%B7%9D&raceNo=12&budget=3000"));
 const payload=await res.json();assert.equal(res.status,200);assert.equal(payload.ok,true);
 const p=payload.prediction;
 assert.equal(p.noBet,false);
 assert.ok(p.standardPurchasePlan.length>0);
 assert.equal(p.referencePurchasePlan.length,0);
 assert.equal(p.standardPurchasePlan.every(x=>["MAIN","COVER","BUYABLE_HIGH"].includes(x.betClass)),true);
 assert.equal(p.audit.selectionBoundaryAudit.standardBetCount,p.standardPurchasePlan.length);
 assert.equal(p.audit.selectionBoundaryAudit.referenceBetCount,0);
 assert.equal(p.audit.selectionBoundaryAudit.passed,true);
 const snapshot=createSnapshot(payload,new Date("2026-08-11T11:00:00Z"));
 assert.equal(snapshot.betSelections.length,p.standardPurchasePlan.length);
 assert.equal(snapshot.referenceBetSelections.length,0);
 assert.equal(snapshot.standardBetCount,p.standardPurchasePlan.length);
 assert.equal(snapshot.referenceBetCount,0);
 saveSnapshot(storage,snapshot);
 const standardOrder=snapshot.betSelections[0].order;
 const updated=attachResult(storage,snapshot.predictionSnapshotId,{status:"confirmed",finishOrder:standardOrder,payout:12340},new Date("2026-08-11T11:05:00Z"));
 assert.equal(updated.result.resultStatus,"hit");
 assert.deepEqual(updated.result.matchedSelection,standardOrder);
 const app=fs.readFileSync(new URL("../public/app.mjs",import.meta.url),"utf8");
 assert.match(app,/標準買い目/);assert.match(app,/参考買い目/);assert.match(app,/参考・資金配分対象外/);
 assert.match(app,/REFERENCEは標準購入ではありません/);
 console.log("keirin standard/reference selection boundary v220 passed");
}finally{globalThis.fetch=originalFetch}
