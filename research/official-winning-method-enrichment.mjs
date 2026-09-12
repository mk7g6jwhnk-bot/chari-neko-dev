import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const WINNING_METHODS = Object.freeze(['ESCAPE','MAKURI','DIFFERENCE','MARK','UNKNOWN']);

export function canonicalWinningMethod(value) {
  const raw = String(value ?? '').trim(), text = raw.toLowerCase();
  let canonical = 'UNKNOWN';
  if (/^逃げ?$|^nige$|^escape$/.test(text)) canonical='ESCAPE';
  else if (/^捲り?$|^まくり$|^makuri$/.test(text)) canonical='MAKURI';
  else if (/^差し?$|^sashi$|^difference$/.test(text)) canonical='DIFFERENCE';
  else if (/^マーク$|^mark$/.test(text)) canonical='MARK';
  return { raw:raw || null, canonical };
}

export function buildWinningMethodEnrichment({ raceKey, source, winningMethod, sourceTimestamp, fetchedAt = new Date().toISOString(), evidence = null, sourceError = null } = {}) {
  if (!/^\d{8}-[A-Za-z0-9]+-\d{1,2}$/.test(String(raceKey || ''))) throw Error('RACE_KEY_INVALID');
  const method=canonicalWinningMethod(winningMethod), status=method.canonical === 'UNKNOWN' ? (sourceError ? 'SOURCE_ERROR' : 'UNKNOWN') : 'CONFIRMED';
  const basis=JSON.stringify({raceKey,source:source || null,raw:method.raw,sourceTimestamp:sourceTimestamp || null,evidence});
  const sourceHash=crypto.createHash('sha256').update(basis).digest('hex');
  const row={schemaVersion:'OFFICIAL_WINNING_METHOD_ENRICHMENT_V1',raceKey:String(raceKey),source:source || null,winningMethod:method.canonical,sourceValue:method.raw,sourceTimestamp:sourceTimestamp || null,fetchedAt,sourceHash,canonical:status==='CONFIRMED',status,evidence,sourceError:sourceError || null,appendOnly:true,researchOnly:true};
  return Object.freeze({...row,enrichmentId:crypto.createHash('sha256').update(`${row.schemaVersion}|${raceKey}|${sourceHash}`).digest('hex')});
}

export class WinningMethodEnrichmentStore {
  constructor(directory){this.directory=path.resolve(directory);}
  async append(row){
    if(row?.appendOnly!==true||!row.enrichmentId)throw Error('ENRICHMENT_INVALID');
    const file=path.join(this.directory,`${row.enrichmentId}.json`);await fs.mkdir(this.directory,{recursive:true});
    try{const h=await fs.open(file,'wx');try{await h.writeFile(JSON.stringify(row));await h.sync();}finally{await h.close();}return{appended:1,duplicates:0};}
    catch(error){if(error.code==='EEXIST')return{appended:0,duplicates:1};throw error;}
  }
}
