import crypto from'node:crypto';
export const ABNORMAL_SCHEMA_VERSION='KEIRIN_ABNORMAL_RESULT_V1';
const flags=['raceCancelled','refundOccurred','disqualificationOccurred','fallOccurred','didNotFinish','raceVoid'];
export function abnormalResultMetadata({raceKey,officialSource,sourceObservedAt,facts={},rawEvidence}={}){
  const normalized=Object.fromEntries(flags.map(k=>[k,typeof facts[k]==='boolean'?facts[k]:null])),known=flags.every(k=>typeof normalized[k]==='boolean'),reasons=Array.isArray(facts.abnormalReason)?[...new Set(facts.abnormalReason.map(String).filter(Boolean))]:[];
  const hash=rawEvidence==null?null:crypto.createHash('sha256').update(typeof rawEvidence==='string'?rawEvidence:JSON.stringify(rawEvidence)).digest('hex');
  return{schemaVersion:ABNORMAL_SCHEMA_VERSION,raceKey:String(raceKey||''),...normalized,abnormalResult:known?flags.some(k=>normalized[k]):null,abnormalReason:reasons,abnormalStatusKnown:known,officialSource:String(officialSource||'')||null,sourceObservedAt:String(sourceObservedAt||'')||null,sourceHash:hash,canonical:known&&Boolean(officialSource&&sourceObservedAt&&hash)};
}
