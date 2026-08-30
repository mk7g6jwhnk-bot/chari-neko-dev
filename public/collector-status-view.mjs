export const COLLECTOR_STATUS_SCHEMA_VERSION="COLLECTOR_STATUS_V2";
export const COLLECTOR_DAILY_CACHE_PREFIX="chari-neko:collector-status:daily:v2";
export const COLLECTOR_RESEARCH_CACHE_KEY="chari-neko:collector-status:research:v2";
export const COLLECTOR_STATUS_MAX_AGE_MS=24*60*60*1000;
export const COLLECTOR_RESEARCH_MAX_AGE_MS=30*24*60*60*1000;

export function collectorLocalDate(now=Date.now()){
  return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(now)).replace(/-/g,"");
}

export function loadCachedCollectorStatus(storage,now=Date.now(),date=collectorLocalDate(now)){
  const daily=read(storage,`${COLLECTOR_DAILY_CACHE_PREFIX}:${date}`,now,COLLECTOR_STATUS_MAX_AGE_MS),research=read(storage,COLLECTOR_RESEARCH_CACHE_KEY,now,COLLECTOR_RESEARCH_MAX_AGE_MS);
  if(!daily&&!research)return null;
  return compose(daily,research,{statusReadFailed:true,localCache:true,checkedAt:latest(daily?.observedAt,research?.observedAt)});
}

export function saveCachedCollectorStatus(storage,value){
  if(value?.schemaVersion!==COLLECTOR_STATUS_SCHEMA_VERSION)return value;
  if(value.autoStatusAvailable&&/^\d{8}$/.test(value.dailyDate||""))storage.setItem(`${COLLECTOR_DAILY_CACHE_PREFIX}:${value.dailyDate}`,JSON.stringify({schemaVersion:COLLECTOR_STATUS_SCHEMA_VERSION,source:value.autoSource||"auto_lifecycle",observedAt:value.autoObservedAt||value.checkedAt,dailyDate:value.dailyDate,collectorHealthy:value.collectorHealthy,browserConnected:value.browserConnected,todayRaceCount:value.todayRaceCount,sealedPredictionCount:value.sealedPredictionCount,resultLoadedCount:value.resultLoadedCount,verifiedCount:value.verifiedCount,waitingPredictionCount:value.waitingPredictionCount,pendingResultCount:value.pendingResultCount,failureCount:value.failureCount,retryingCount:value.retryingCount,lastPredictionRunAt:value.lastPredictionRunAt,lastResultRunAt:value.lastResultRunAt,lastSuccessfulCollectorUpdate:value.lastSuccessfulCollectorUpdate,lastError:value.lastError,recentErrors:value.recentErrors,storageMode:value.storageMode}));
  if(value.researchStatusAvailable&&value.researchProgress)storage.setItem(COLLECTOR_RESEARCH_CACHE_KEY,JSON.stringify({schemaVersion:COLLECTOR_STATUS_SCHEMA_VERSION,source:value.researchSource||"research_shadow",observedAt:value.researchObservedAt||value.checkedAt,researchProgress:value.researchProgress}));
  return value;
}

export function collectorStatusViewModel(current,cached=null){
  const currentAuto=current?.ok&&current.autoStatusAvailable&&current.autoCurrent!==false?current:null,currentResearch=current?.ok&&current.researchStatusAvailable&&current.researchCurrent!==false?current:null;
  const cachedAuto=cached?.autoStatusAvailable?cached:null,cachedResearch=cached?.researchStatusAvailable?cached:null;
  const auto=currentAuto||cachedAuto,research=currentResearch||cachedResearch;
  if(!auto&&!research)return{mode:"STATUS_UNAVAILABLE",status:null,autoMode:"UNAVAILABLE",researchMode:"UNAVAILABLE"};
  const status=compose(auto,research,{statusReadFailed:!currentAuto||!currentResearch,checkedAt:latest(auto?.autoObservedAt||auto?.checkedAt,research?.researchObservedAt||research?.checkedAt)});
  const autoMode=currentAuto?(status.collectorHealthy?"LIVE_HEALTHY":"COLLECTOR_ERROR"):(cachedAuto?(status.collectorHealthy?"STALE_HEALTHY":"STALE_COLLECTOR_ERROR"):"UNAVAILABLE");
  const researchMode=currentResearch?"LIVE":cachedResearch?"STALE":"UNAVAILABLE";
  return{mode:autoMode,status,autoMode,researchMode,notice:status.statusReadFailed?"現在の状態取得に失敗":""};
}

function compose(auto,research,extra={}){return{ok:true,schemaVersion:COLLECTOR_STATUS_SCHEMA_VERSION,autoStatusAvailable:Boolean(auto?.autoStatusAvailable??auto?.dailyDate),researchStatusAvailable:Boolean(research?.researchStatusAvailable??research?.researchProgress),dailyDate:auto?.dailyDate||null,autoSource:auto?.autoSource||auto?.source||null,autoObservedAt:auto?.autoObservedAt||auto?.observedAt||null,researchSource:research?.researchSource||research?.source||null,researchObservedAt:research?.researchObservedAt||research?.observedAt||null,collectorHealthy:auto?.collectorHealthy??null,browserConnected:auto?.browserConnected??null,todayRaceCount:auto?.todayRaceCount??null,sealedPredictionCount:auto?.sealedPredictionCount??null,resultLoadedCount:auto?.resultLoadedCount??null,verifiedCount:auto?.verifiedCount??null,waitingPredictionCount:auto?.waitingPredictionCount??null,pendingResultCount:auto?.pendingResultCount??null,failureCount:auto?.failureCount??null,retryingCount:auto?.retryingCount??null,lastPredictionRunAt:auto?.lastPredictionRunAt||null,lastResultRunAt:auto?.lastResultRunAt||null,lastSuccessfulCollectorUpdate:auto?.lastSuccessfulCollectorUpdate||null,lastError:auto?.lastError||null,recentErrors:auto?.recentErrors||[],storageMode:auto?.storageMode||null,researchProgress:research?.researchProgress||null,...extra};}
function read(storage,key,now,maxAge){try{const value=JSON.parse(storage.getItem(key)||"null"),observed=Date.parse(value?.observedAt||"");return value?.schemaVersion===COLLECTOR_STATUS_SCHEMA_VERSION&&Number.isFinite(observed)&&now-observed<=maxAge?value:null}catch{return null}}
function latest(...values){return values.filter(Boolean).sort((a,b)=>Date.parse(b)-Date.parse(a))[0]||null}
