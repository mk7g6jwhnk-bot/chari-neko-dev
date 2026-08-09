import { buildScreeningPreview } from "./keirin-odds.mjs";

function jsonResponse(status,body){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}})}

export default async function handler(req){
  const url=new URL(req.url),date=(url.searchParams.get("date")||"").replace(/\D/g,"").slice(0,8),venueCode=String(url.searchParams.get("venueCode")||"").padStart(2,"0"),venueName=url.searchParams.get("venueName")||"",raceNos=[...new Set(String(url.searchParams.get("raceNos")||"").split(",").map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=12))].sort((a,b)=>a-b);
  if(!/^\d{8}$/.test(date)||!/^\d{2}$/.test(venueCode)||!venueName||!raceNos.length)return jsonResponse(400,{ok:false,error:"日付・会場・対象Rが不足しています"});
  const base=String(process.env.KEIRIN_BROWSER_SERVICE_URL||"").trim().replace(/\/$/,"");
  if(!base)return jsonResponse(500,{ok:false,error:"KEIRIN_BROWSER_SERVICE_URLが設定されていません"});
  const q=new URLSearchParams({date,venueCode,venueName,raceNos:raceNos.join(",")});
  try{
    const response=await fetch(`${base}/keirin/preview-batch?${q}`,{headers:{accept:"application/json"},signal:AbortSignal.timeout(58000)});
    let payload;try{payload=await response.json()}catch{payload=null}
    if(!response.ok||payload?.ok===false){return jsonResponse(response.status||502,{ok:false,error:payload?.error||"会場一括一次選別の取得に失敗しました",busy:response.status===503,diagnostics:payload?.diagnostics||null})}
    const rows=(payload.items||[]).map(item=>normalizeItem(item,{date,venueCode,venueName})).filter(Boolean);
    return jsonResponse(200,{ok:true,items:rows,failures:payload.failures||[],diagnostics:payload.diagnostics||null,checkedAt:new Date().toISOString()});
  }catch(error){return jsonResponse(502,{ok:false,error:"一次選別データの一括取得が時間内に完了しませんでした",detail:error instanceof Error?error.message:String(error)})}
}

function normalizeItem(item,requested){
  const officialData=item?.officialData||{},basic=officialData.basic||{},raceNo=Number(basic.raceNo||item?.raceNo||0),returnedDate=String(basic.date||"").replace(/\D/g,"").slice(0,8),returnedVenue=String(basic.venueName||requested.venueName||"");
  if(returnedDate!==requested.date||!raceNo||(requested.venueName&&returnedVenue&&returnedVenue!==requested.venueName))return null;
  const odds=normalizeOdds(officialData.odds),screening=buildScreeningPreview(officialData,odds),startTime=String(basic.startTime||basic.deadline||""),deadline=String(basic.deadline||basic.startTime||"");
  return{race:{date:requested.date,venueCode:requested.venueCode,venueName:returnedVenue,raceNo,startTime,deadline},odds,screening,checkedAt:item.checkedAt||new Date().toISOString(),audit:item.audit||null,elapsedMs:item.elapsedMs||null};
}

function normalizeOdds(raw){
  const source=raw&&typeof raw==="object"?(raw.odds&&typeof raw.odds==="object"?raw.odds:raw.oddsByOrder&&typeof raw.oddsByOrder==="object"?raw.oddsByOrder:raw):{},odds={};
  for(const [key,value] of Object.entries(source||{})){const normalized=String(key).replace(/^OZZ/i,"").replace(/[^1-9]/g,"").split("").slice(0,3).join("-"),n=Number(value);if(/^[1-9]-[1-9]-[1-9]$/.test(normalized)&&Number.isFinite(n)&&n>1)odds[normalized]=n}
  return{available:Object.keys(odds).length>0,count:Object.keys(odds).length,odds};
}
