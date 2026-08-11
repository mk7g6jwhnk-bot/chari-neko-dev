import assert from"node:assert/strict";
import{backfillResearchLearningLedger,loadResearchLearningRecords,summarizeResearchLearning}from"../public/prediction-store.mjs";
const mem=new Map(),storage={getItem:k=>mem.get(k)||null,setItem:(k,v)=>mem.set(k,String(v))};
const snapKey="chari-neko:keirin-predictions:v1";
storage.setItem(snapKey,JSON.stringify([{
 predictionSnapshotId:"M1",predictionVersion:"X",createdAt:"2026-08-10T00:00:00Z",
 targetRace:{date:"20260810",venueName:"立川",raceNo:1},
 betSelections:[{order:[1,2,3],category:"本線"}],
 terminalLedger:[
  {order:[1,2,3],probability:.4},{order:[1,3,2],probability:.1},
  {order:[2,1,3],probability:.3},{order:[2,3,1],probability:.2}
 ],
 result:{resultStatus:"hit",officialFinishOrder:[1,2,3],checkedAt:"2026-08-10T01:00:00Z"}
}]));
backfillResearchLearningLedger(storage);
const r=loadResearchLearningRecords(storage)[0];
assert.equal(r.probabilityMassDiagnostics.status,"OK");
assert.equal(r.probabilityMassDiagnostics.terminalMassTotal,1);
assert.equal(r.probabilityMassDiagnostics.calibrationEligible,true);
const s=summarizeResearchLearning(storage);
assert.equal(s.probabilityMass.verifiedCount,1);
assert.equal(s.stageCalibration.FIRST.probabilityMassStatus,"MASS_VERIFIED");
console.log("PASS probability mass audit + stage calibration status");
