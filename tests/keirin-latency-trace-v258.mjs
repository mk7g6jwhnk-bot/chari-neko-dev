import assert from "node:assert/strict";
import {buildLatencyTrace,buildPrefetchTrace} from "../netlify/functions/keirin-predict.mjs";

const trace=buildLatencyTrace({queueWaitMs:11,engineTotalMs:7,purchaseMs:2,serializationMs:3,officialStages:{"fetch-official-json":13,"read-token":5,"load-official-profiles":17,"fetch-odds":19,validation:23}},performance.now()-100);
for(const key of ["queueWaitMs","raceFetchMs","lineFetchMs","profileFetchMs","oddsFetchMs","validationMs","predictionMs","purchaseMs","displayBuildMs","totalMs"])assert.ok(Object.hasOwn(trace,key),key);
assert.deepEqual(buildPrefetchTrace({officialCacheState:"HIT",officialCacheAgeMs:250}),{hit:true,ageMs:250});
console.log("PASS canonical latency and prefetch trace fields");
