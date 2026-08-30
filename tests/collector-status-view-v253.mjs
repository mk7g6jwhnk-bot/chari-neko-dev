import assert from "node:assert/strict";
import {collectorStatusViewModel,loadCachedCollectorStatus,saveCachedCollectorStatus} from "../public/collector-status-view.mjs";
class MemoryStorage{constructor(){this.map=new Map()}getItem(k){return this.map.get(k)||null}setItem(k,v){this.map.set(k,String(v))}}
const healthy={ok:true,collectorHealthy:true,checkedAt:"2026-08-30T08:15:00+09:00"},unhealthy={...healthy,collectorHealthy:false};
assert.equal(collectorStatusViewModel(healthy).mode,"LIVE_HEALTHY");
assert.equal(collectorStatusViewModel({...healthy,statusReadFailed:true},healthy).mode,"STALE_HEALTHY");
assert.equal(collectorStatusViewModel({ok:false,statusReadFailed:true},null).mode,"STATUS_UNAVAILABLE");
assert.equal(collectorStatusViewModel(unhealthy).mode,"COLLECTOR_ERROR");
assert.equal(collectorStatusViewModel({...unhealthy,statusReadFailed:true},unhealthy).mode,"STALE_COLLECTOR_ERROR");
const storage=new MemoryStorage();saveCachedCollectorStatus(storage,healthy);assert.deepEqual(loadCachedCollectorStatus(storage,Date.parse("2026-08-30T08:16:00+09:00")),healthy);assert.equal(loadCachedCollectorStatus(storage,Date.parse("2026-09-01T08:16:00+09:00")),null);
console.log("PASS collector status live/stale/no-cache/actual-error separation");
