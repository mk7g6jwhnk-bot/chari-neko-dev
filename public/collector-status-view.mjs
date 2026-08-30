export const COLLECTOR_STATUS_CACHE_KEY="chari-neko:collector-status:v1";
export const COLLECTOR_STATUS_MAX_AGE_MS=24*60*60*1000;

export function loadCachedCollectorStatus(storage,now=Date.now()){
  try{const value=JSON.parse(storage.getItem(COLLECTOR_STATUS_CACHE_KEY)||"null"),checked=Date.parse(value?.checkedAt||"");return value?.ok&&Number.isFinite(checked)&&now-checked<=COLLECTOR_STATUS_MAX_AGE_MS?value:null}catch{return null}
}
export function saveCachedCollectorStatus(storage,value){if(value?.ok&&!value.statusReadFailed)storage.setItem(COLLECTOR_STATUS_CACHE_KEY,JSON.stringify(value));return value}
export function collectorStatusViewModel(current,cached=null){
  if(current?.ok&&!current.statusReadFailed)return{mode:current.collectorHealthy?"LIVE_HEALTHY":"COLLECTOR_ERROR",status:current,notice:null};
  const last=current?.ok?current:cached;
  if(last?.ok)return{mode:last.collectorHealthy?"STALE_HEALTHY":"STALE_COLLECTOR_ERROR",status:last,notice:"現在の状態取得に失敗"};
  return{mode:"STATUS_UNAVAILABLE",status:null,notice:"状態を確認できません"};
}
