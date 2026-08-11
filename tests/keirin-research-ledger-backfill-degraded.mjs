import assert from"node:assert/strict";
import{backfillResearchLearningLedger,loadResearchLearningRecords}from"../public/prediction-store.mjs";
const mem=new Map(),storage={getItem:k=>mem.get(k)||null,setItem:(k,v)=>mem.set(k,String(v))};
const snapKey="chari-neko:keirin-predictions:v1";
storage.setItem(snapKey,JSON.stringify([{predictionSnapshotId:"CMP1",predictionVersion:"OLD",storageCompacted:true,createdAt:"2026-08-01T00:00:00Z",targetRace:{date:"20260801",venueName:"平塚",raceNo:2},betSelections:[],terminalLedger:[{order:[2,1,3],probability:.1,purchaseStatus:"購入不採用"}],result:{resultStatus:"miss",officialFinishOrder:[2,1,3],checkedAt:"2026-08-01T01:00:00Z"}}]));
const s=backfillResearchLearningLedger(storage);
assert.equal(s.added,1);assert.equal(s.degradedCount,1);
const r=loadResearchLearningRecords(storage)[0];assert.equal(r.backfillDegraded,true);assert.equal(r.exactTerminalGenerated,true);
console.log("PASS compacted snapshot backfill degrades safely");
