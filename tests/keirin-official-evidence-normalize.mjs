import assert from"node:assert/strict";
import{normalizeResult}from"../netlify/functions/keirin-result.mjs";
const legacy=normalizeResult({status:"confirmed",finishOrder:[1,2,3],payout:1250,source:"official"});
assert.deepEqual(legacy,{status:"confirmed",finishOrder:[1,2,3],payout:1250,source:"official"});
const r=normalizeResult({status:"confirmed",finishOrder:[5,1,4],kimarite:"捲り",B:5,S:1,payout:12340,incidents:[{type:"落車",number:7}]});
assert.equal(r.winningMethod,"捲り");assert.equal(r.markers.backNumber,5);assert.equal(r.markers.startNumber,1);assert.equal(r.incidents.length,1);assert.equal(r.officialEvidenceAvailable,true);
console.log("PASS official result evidence normalization + legacy shape");
