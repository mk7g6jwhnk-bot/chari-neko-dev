import assert from"node:assert/strict";
import fs from"node:fs";
import{createSnapshot,loadSnapshots,saveCanonicalSnapshot,saveSnapshot,STORAGE_KEY}from"../public/prediction-store.mjs";
import{snapshotRestorePlan}from"../public/prediction-snapshot-restore.mjs";
import{attachCanonicalIdentity}from"../public/canonical-prediction-cache.mjs";

class MemoryStorage{
  constructor(seed={}){this.data=new Map(Object.entries(seed))}
  getItem(key){return this.data.has(key)?this.data.get(key):null}
  setItem(key,value){this.data.set(key,String(value))}
  dump(){return Object.fromEntries(this.data)}
}

function payload(){return{race:{date:"20261010",venueCode:"46",venue:"富山",raceNo:10,participants:[{number:1,name:"A"},{number:2,name:"B"},{number:3,name:"C"}]},prediction:{engineVersion:"KEIRIN-0.6.0-rider-selection-weak",purchaseEligibility:{canPurchase:true},standardPurchasePlan:[{order:[1,2,3],betClass:"MAIN",ticketClass:"MAIN",worldClass:"MAIN",stake:3000}],purchasePlan:[{order:[1,2,3],betClass:"MAIN",ticketClass:"MAIN",worldClass:"MAIN",stake:3000}]}}}

const storage=new MemoryStorage(),created=createSnapshot(payload(),new Date("2026-10-10T00:00:00.000Z"));
const saved=saveSnapshot(storage,created);
assert.equal(loadSnapshots(storage).length,1,"first display must persist one snapshot");
assert.equal(snapshotRestorePlan(saved,saved.targetRace).mode,"LOCAL_UNSEALED");

const afterNavigation=loadSnapshots(storage)[0];
assert.equal(snapshotRestorePlan(afterNavigation,created.targetRace).restorable,true,"navigation restore");
const afterReload=new MemoryStorage(storage.dump()),reloaded=loadSnapshots(afterReload)[0];
assert.equal(snapshotRestorePlan(reloaded,created.targetRace).mode,"LOCAL_UNSEALED","reload restore");
const afterRestart=new MemoryStorage(afterReload.dump()),restarted=loadSnapshots(afterRestart)[0];
assert.equal(snapshotRestorePlan(restarted,created.targetRace).restorable,true,"restart-equivalent restore");
assert.equal(saveSnapshot(afterRestart,createSnapshot(payload(),new Date("2026-10-10T00:01:00.000Z"))).predictionSnapshotId,created.predictionSnapshotId,"same saved prediction is reused");
assert.equal(loadSnapshots(afterRestart).length,1,"restore must not generate or duplicate a prediction");

const envelope={raceKey:"20261010-46-10",predictionHash:"a".repeat(64),predictionHashVersion:"PREDICTION_CANONICAL_SNAPSHOT_V2",predictionVersion:"KEIRIN-0.6.0-rider-selection-weak",purchaseVersion:"v251-multi-world-scenario",predictionSealedAt:"2026-10-10T00:00:00.000Z",integrityStatus:"VALID",temporalStatus:"VALID",immutable:true,predictionPayload:payload()};
const canonical=attachCanonicalIdentity(createSnapshot(payload(),new Date("2026-10-10T00:02:00.000Z")),envelope),beforeHash=canonical.sealedPrediction.predictionHash;
saveCanonicalSnapshot(afterRestart,canonical);
const canonicalReloaded=loadSnapshots(new MemoryStorage(afterRestart.dump())).find(row=>row?.sealedPrediction?.predictionHash===beforeHash);
assert.equal(snapshotRestorePlan(canonicalReloaded,canonical.targetRace).mode,"CANONICAL_SEALED");
assert.equal(canonicalReloaded.sealedPrediction.predictionHash,beforeHash,"canonical identity must not change");
assert.equal(snapshotRestorePlan(restarted,{...restarted.targetRace,raceNo:9}).restorable,false,"wrong race identity must be rejected");
assert.equal(afterRestart.getItem(STORAGE_KEY).includes(beforeHash),true);

const app=fs.readFileSync(new URL("../public/app.mjs",import.meta.url),"utf8");
assert.match(app,/state\.snapshot=restoreLocal\?local:null/);
assert.match(app,/state\.snapshot=restoreLocal\?snapshot:null/);
assert.doesNotMatch(app,/predictionVersion===SNAPSHOT_COMPATIBLE_VERSION/);
console.log("prediction snapshot save/restore regression: PASS");
