const DB_NAME="chari-neko-sealed-predictions",STORE="payloads",VERSION=1,METRICS_KEY="chari-neko:read-metrics:v1";

export function sealedCacheKey(raceKey,predictionHash){return `${raceKey}|${predictionHash}`}
export async function getSealedPredictionCache(raceKey,predictionHash){
  if(!predictionHash)return null;
  const db=await openDb();
  return request(db.transaction(STORE,"readonly").objectStore(STORE).get(sealedCacheKey(raceKey,predictionHash)));
}
export async function putSealedPredictionCache(raceKey,predictionHash,payload){
  if(!predictionHash)return;
  const db=await openDb(),tx=db.transaction(STORE,"readwrite");
  tx.objectStore(STORE).put({key:sealedCacheKey(raceKey,predictionHash),raceKey,predictionHash,payload,cachedAt:new Date().toISOString()});
  await transaction(tx);
}
export function recordReadMetric(metric,storage=globalThis.localStorage){
  const row={at:new Date().toISOString(),...metric};
  try{const rows=JSON.parse(storage.getItem(METRICS_KEY)||"[]");rows.push(row);storage.setItem(METRICS_KEY,JSON.stringify(rows.slice(-100)))}catch{}
  globalThis.__chariReadMetrics=globalThis.__chariReadMetrics||[];globalThis.__chariReadMetrics.push(row);
  return row;
}
function openDb(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,VERSION);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE,{keyPath:"key"})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function request(r){return new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error)})}
function transaction(tx){return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}
