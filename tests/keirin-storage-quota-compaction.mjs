import assert from"node:assert/strict";
import{saveSnapshot,loadSnapshots}from"../public/prediction-store.mjs";
class QuotaStorage{constructor(limit){this.limit=limit;this.map=new Map()}getItem(k){return this.map.get(k)||null}setItem(k,v){if(String(v).length>this.limit){const e=new Error("Setting the value exceeded the quota");e.name="QuotaExceededError";throw e}this.map.set(k,String(v))}}
const storage=new QuotaStorage(150000);
const huge=(i)=>({predictionSnapshotId:`s${i}`,createdAt:new Date(2026,0,i+1).toISOString(),targetRace:{date:"20260810",venueCode:"01",venueName:"T",raceNo:i+1},predictionVersion:"v",participants:Array.from({length:7},(_,n)=>({number:n+1,name:"x".repeat(40),sourcePath:"z".repeat(200)})),abilitiesUsed:Array.from({length:7},(_,n)=>({number:n+1,scoreTrace:{blob:"x".repeat(500)}})),predictionOutput:{audit:{blob:"x".repeat(2000)}},branches:Array.from({length:20},(_,n)=>({id:n,label:"branch".repeat(20),blob:"x".repeat(300)})),terminalLedger:Array.from({length:210},(_,n)=>({order:[1+(n%7),1+((n+1)%7),1+((n+2)%7)],probability:.001,purchaseStatus:"REJECTED",purchaseRejectCode:"LOW",purchaseReason:"x".repeat(120),betClass:"NONE",dominantBranchLabel:"x".repeat(100)})),betSelections:[{order:[1,2,3],category:"MAIN",reason:"x".repeat(300)}],result:null});
for(let i=0;i<12;i++)saveSnapshot(storage,huge(i));
const rows=loadSnapshots(storage);
assert(rows.length>0);
assert(rows.some(x=>x.storageCompacted===true),"quota fallback should compact older snapshots");
assert.equal(rows[0].predictionSnapshotId,"s11");
console.log("Keirin storage quota compaction passed",rows.length);
