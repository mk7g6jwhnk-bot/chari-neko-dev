import crypto from'node:crypto';
export const EXACTA_SCHEMA_VERSION='KEIRIN_EXACTA_PAYOUT_V1';
const clean=v=>String(v??'').trim();const amount=v=>v!==null&&v!==''&&Number.isFinite(Number(v))&&Number(v)>0?Number(v):null;
const pair=v=>(Array.isArray(v)?v:clean(v).match(/\d+/g)||[]).map(Number).filter(Number.isFinite).slice(0,2);
const stable=v=>JSON.stringify(v,Object.keys(v).sort());
export function canonicalExactaPayout({raceKey,winningPair,payoutPer100,payoutStatus='UNKNOWN',officialSource,sourceObservedAt,rawEvidence}={}){
  const p=pair(winningPair),pay=amount(payoutPer100),status=['CONFIRMED','NOT_OFFERED','REFUND','INVALID','UNKNOWN'].includes(payoutStatus)?payoutStatus:'UNKNOWN';
  const evidence={raceKey:clean(raceKey),betType:'EXACTA',winningPair:p,payoutPer100:pay,payoutStatus:status,officialSource:clean(officialSource)||null,sourceObservedAt:clean(sourceObservedAt)||null};
  const sourceHash=rawEvidence==null?null:crypto.createHash('sha256').update(typeof rawEvidence==='string'?rawEvidence:stable(rawEvidence)).digest('hex');
  const canonical=status==='CONFIRMED'&&/^\d{8}-[A-Za-z0-9]+-\d{1,2}$/.test(evidence.raceKey)&&p.length===2&&p[0]!==p[1]&&pay!==null&&Boolean(evidence.officialSource&&evidence.sourceObservedAt&&sourceHash);
  return{schemaVersion:EXACTA_SCHEMA_VERSION,...evidence,sourceHash,canonical};
}
