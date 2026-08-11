import assert from"node:assert/strict";
import{backfillResearchLearningLedger,loadResearchLearningRecords,summarizeResearchLearning}from"../public/prediction-store.mjs";
const mem=new Map(),storage={getItem:k=>mem.get(k)||null,setItem:(k,v)=>mem.set(k,String(v))};
storage.setItem("chari-neko:keirin-predictions:v1",JSON.stringify([{
 predictionSnapshotId:"BAD",predictionVersion:"X",createdAt:"2026-08-10T00:00:00Z",
 targetRace:{date:"20260810",venueName:"平塚",raceNo:1},betSelections:[],
 terminalLedger:[{order:[1,2,3],probability:.8},{order:[2,1,3],probability:.7}],
 result:{resultStatus:"miss",officialFinishOrder:[1,2,3],checkedAt:"2026-08-10T01:00:00Z"}
}]));
backfillResearchLearningLedger(storage);
const r=loadResearchLearningRecords(storage)[0];
assert.equal(r.probabilityMassDiagnostics.status,"INVALID_TOTAL_MASS");
assert.equal(r.probabilityMassDiagnostics.terminalMassTotal,1.5);
assert.equal(r.probabilityMassDiagnostics.calibrationEligible,false);
const first=r.calibrationSamples.FIRST.find(x=>x.number===1);
assert.equal(first.probability,.8);
const secondHead=r.calibrationSamples.FIRST.find(x=>x.number===2);
assert.equal(secondHead.probability,.7);
const s=summarizeResearchLearning(storage);
assert.equal(s.probabilityMass.invalidCount,1);
assert.equal(s.stageCalibration.FIRST.probabilityMassStatus,"MASS_INVALID");
console.log("PASS invalid mass flagged without silent probability clipping");
