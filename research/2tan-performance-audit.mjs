// Read-only reproduction runner. It reads existing sealed records; it never requests a prediction or result refresh.
import fs from'node:fs/promises';import{audit2Tan}from'./2tan-shadow-strategy.mjs';
const base=process.env.AUDIT_BASE_URL||'https://chari-neko-dev.netlify.app/.netlify/functions';
const source=JSON.parse(await fs.readFile(process.argv[2]||'research/thick-readonly-audit-results.json','utf8'));
const keys=(source.ticketDiagnostics||[]).filter(x=>x.inConfirmedCohort).map(x=>x.raceKey),out=[];
async function read(path){let last;for(let attempt=1;attempt<=5;attempt++){try{const r=await fetch(`${base}/${path}`,{headers:{accept:'application/json'},signal:AbortSignal.timeout(45000)});if(r.ok)return r.json();last=Error(`${path}: HTTP ${r.status}`);}catch(error){last=error;}if(attempt<5)await new Promise(resolve=>setTimeout(resolve,750*attempt));}throw last;}
for(let i=0;i<keys.length;i+=2){const batch=keys.slice(i,i+2);const rows=await Promise.all(batch.map(async raceKey=>{try{return{raceKey,prediction:await read(`keirin-saved-prediction-detail?raceKey=${encodeURIComponent(raceKey)}`),result:await read(`keirin-sealed-result?raceKey=${encodeURIComponent(raceKey)}`)}}catch(error){return{raceKey,error:error.message}}}));out.push(...rows);}
const report=JSON.stringify({...audit2Tan(out.filter(x=>!x.error)),readFailures:out.filter(x=>x.error),source:'existing sealed prediction/result read endpoints',readOnly:true},null,2);const output=process.argv[3];if(output)await fs.writeFile(output,report+'\n');else console.log(report);
