import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath,pathToFileURL}from'node:url';import {buildPublicValidationStatus,pushPublicValidationStatus}from'./validation-status-public.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),dataRoot=path.join(root,'daily-validation');
export async function syncLatest({summaryFile,fetchImpl=fetch}={}){const file=summaryFile||await latestSummary(),summary=JSON.parse(await fs.readFile(file,'utf8'));if(summary.daily?.status==='DAILY_VALIDATION_FAILED')throw Error('FAILED_VALIDATION_NOT_SYNCED');return pushPublicValidationStatus(buildPublicValidationStatus(summary),{fetchImpl});}
async function latestSummary(){const names=(await fs.readdir(dataRoot,{withFileTypes:true})).filter(x=>x.isDirectory()&&/^\d{4}-\d{2}-\d{2}$/.test(x.name)).map(x=>x.name).sort().reverse();if(!names.length)throw Error('NO_SUCCESSFUL_DAILY_SUMMARY');return path.join(dataRoot,names[0],'summary.json');}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(await syncLatest({summaryFile:process.argv[2]}),null,2));

