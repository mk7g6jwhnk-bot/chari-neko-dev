const HASH_RE=/^[a-f0-9]{64}$/;

export function explicitPredictionHash(value){
  const hash=String(value||"").trim().toLowerCase();
  return HASH_RE.test(hash)?hash:null;
}

export function predictionContentHash(value){
  if(!value||typeof value!=="object")return null;
  return explicitPredictionHash(value.predictionContentHash||value.contentHash||value.predictionIdentity?.predictionContentHash||value.artifactIdentity?.predictionContentHash||value.sealedPrediction?.predictionIdentity?.predictionContentHash);
}

export function latestPredictionSummary(records,raceKey){
  return (Array.isArray(records)?records:[]).filter(record=>record?.raceKey===raceKey&&predictionSummaryReadable(record)).sort((a,b)=>String(b.predictionSealedAt||b.sealedAt||b.generatedAt||"").localeCompare(String(a.predictionSealedAt||a.sealedAt||a.generatedAt||"")))[0]||null;
}

export function predictionSummaryReadable(record){
  if(!explicitPredictionHash(record?.predictionHash)||record?.immutable===false)return false;
  const integrity=String(record?.integrityStatus||"").toUpperCase(),lifecycle=String(record?.lifecycleStatus||record?.status||"").toUpperCase();
  if(integrity&&integrity!=="VALID"&&integrity!=="PASS")return false;
  return !/(MUTATED|HASH_MISMATCH|INVALID|CORRUPT|BROKEN)/.test(lifecycle);
}

export function derivePreRacePredictionState({summary=null,snapshot=null,lifecycle=null,summaryLoading=false,summaryLoaded=false,summaryError=false}={}){
  const remoteHash=explicitPredictionHash(summary?.predictionHash),localHash=explicitPredictionHash(snapshot?.sealedPrediction?.predictionHash),predictionHash=remoteHash||localHash;
  const remoteContent=predictionContentHash(summary),localContent=predictionContentHash(snapshot),updateAvailable=Boolean(remoteHash&&localHash&&remoteHash!==localHash&&remoteContent&&localContent&&remoteContent!==localContent);
  if(predictionHash)return{kind:updateAvailable?"UPDATED":"SAVED",label:updateAvailable?"更新あり":"予想保存済み",action:"予想を見る",predictionHash,updateAvailable,canOpenSaved:true};
  if(summaryLoading&&!summaryLoaded)return{kind:"LOADING",label:"取得中",action:"確認中",predictionHash:null,updateAvailable:false,canOpenSaved:false};
  if(lifecycle?.predictionSealedAt||lifecycle?.predictionSealed)return{kind:"LEGACY_UNLINKED",label:"予想保存済み（参照不可）",action:"詳細を見る",predictionHash:null,updateAvailable:false,canOpenSaved:false};
  if(summaryError&&!summaryLoaded)return{kind:"ERROR",label:"エラー",action:"再確認",predictionHash:null,updateAvailable:false,canOpenSaved:false};
  return{kind:"UNSAVED",label:"未保存",action:"予想する",predictionHash:null,updateAvailable:false,canOpenSaved:false};
}
