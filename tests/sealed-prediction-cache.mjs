import assert from "node:assert/strict";
import { recordReadMetric, sealedCacheKey } from "../public/sealed-prediction-cache.mjs";

assert.equal(sealedCacheKey("20260828-73-5","abc"),"20260828-73-5|abc");
const values=new Map(),storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
recordReadMetric({type:"prediction-detail",cache:"hit",responseBytes:0},storage);
const saved=JSON.parse([...values.values()][0]);
assert.equal(saved.length,1);
assert.equal(saved[0].cache,"hit");
assert.equal(saved[0].responseBytes,0);
console.log("OK sealed prediction cache metrics tests");
