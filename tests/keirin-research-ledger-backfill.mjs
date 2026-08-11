import assert from"node:assert/strict";
import{backfillResearchLearningLedger,loadResearchLearningRecords}from"../public/prediction-store.mjs";
const mem=new Map(),storage={getItem:k=>mem.get(k)||null,setItem:(k,v)=>mem.set(k,String(v))};
const snapKey="chari-neko:keirin-predictions:v1",ledgerKey="chari-neko:keirin-research-learning:v1";
const baseSnap={predictionSnapshotId:"OLD1",predictionVersion:"KEIRIN-old",createdAt:"2026-08-01T00:00:00Z",targetRace:{date:"20260801",venueName:"立川",venueCode:"28",raceNo:1},betSelections:[{order:[1,2,3],category:"本線"}],terminalLedger:[{order:[1,2,3],probability:.2,purchaseStatus:"購入"}],result:{resultStatus:"hit",officialFinishOrder:[1,2,3],checkedAt:"2026-08-01T01:00:00Z"}};
storage.setItem(snapKey,JSON.stringify([baseSnap]));
let s=backfillResearchLearningLedger(storage);
assert.equal(s.added,1);assert.equal(s.overwroteExisting,false);
let rows=loadResearchLearningRecords(storage);
assert.equal(rows.length,1);assert.equal(rows[0].predictionSnapshotId,"OLD1");assert.equal(rows[0].backfilled,true);
assert.equal(rows[0].exactTerminalGenerated,true);assert.equal(rows[0].exactTerminalPurchased,true);

s=backfillResearchLearningLedger(storage);
assert.equal(s.added,0);assert.equal(s.skippedExisting,1);
rows=loadResearchLearningRecords(storage);assert.equal(rows.length,1);

const rich={...rows[0],version:"RICH-NEWER",customField:"KEEP_ME"};
storage.setItem(ledgerKey,JSON.stringify([rich]));
s=backfillResearchLearningLedger(storage);
rows=loadResearchLearningRecords(storage);
assert.equal(s.added,0);assert.equal(rows[0].version,"RICH-NEWER");assert.equal(rows[0].customField,"KEEP_ME");
console.log("PASS repeat-safe research ledger backfill + existing record protection");
