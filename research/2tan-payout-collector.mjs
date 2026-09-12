import fs from'node:fs/promises';import path from'node:path';import crypto from'node:crypto';import{canonicalExactaPayout}from'./2tan-canonical-payout-schema.mjs';import{abnormalResultMetadata}from'./keirin-abnormal-result-schema.mjs';
const id=x=>crypto.createHash('sha256').update(`${x.raceKey}|${x.kind}|${x.sourceHash||'UNKNOWN'}|${x.schemaVersion}`).digest('hex');
export function buildEnrichments(observation){return[{kind:'EXACTA_PAYOUT',...canonicalExactaPayout(observation.exacta)},{kind:'ABNORMAL_RESULT',...abnormalResultMetadata(observation.abnormal)}].map(x=>({...x,enrichmentId:id(x),appendOnly:true,createdAt:observation.createdAt||new Date().toISOString()}));}
export class AppendOnlyEnrichmentStore{
  constructor(file){this.file=file;this.ids=new Set();this.loaded=false;}
  async load(){if(this.loaded)return;try{for(const line of (await fs.readFile(this.file,'utf8')).split(/\r?\n/).filter(Boolean))this.ids.add(JSON.parse(line).enrichmentId);}catch(e){if(e.code!=='ENOENT')throw e;}this.loaded=true;}
  async append(rows){await this.load();const fresh=rows.filter(x=>x.appendOnly===true&&!this.ids.has(x.enrichmentId));if(!fresh.length)return{appended:0,duplicates:rows.length};await fs.mkdir(path.dirname(this.file),{recursive:true});await fs.appendFile(this.file,fresh.map(x=>JSON.stringify(x)).join('\n')+'\n');fresh.forEach(x=>this.ids.add(x.enrichmentId));return{appended:fresh.length,duplicates:rows.length-fresh.length};}
}
export class BoundedExactaCollector{
  constructor({observe,store,maxPending=8,retries=3}){this.observe=observe;this.store=store;this.maxPending=maxPending;this.retries=retries;this.queue=[];this.running=false;this.checkpoint=null;}
  enqueue(race){if(this.queue.length>=this.maxPending)return false;if(this.queue.some(x=>x.raceKey===race.raceKey))return true;this.queue.push(race);return true;}
  async drain(){if(this.running)return;this.running=true;try{while(this.queue.length){const race=this.queue.shift();let value,error;for(let a=1;a<=this.retries;a++)try{value=await this.observe(race);break}catch(e){error=e;}if(value)await this.store.append(buildEnrichments(value));this.checkpoint={raceKey:race.raceKey,completedAt:new Date().toISOString(),ok:Boolean(value),error:value?null:String(error?.message||error)};}}finally{this.running=false;}}
}
