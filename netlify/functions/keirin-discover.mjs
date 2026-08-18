const CACHE=new Map(),RETRIES=[0,700,1600],TIMEOUT=90000,VERSION="keirin-discover-v7-no-active-races-dependency";
export default async function handler(req){
 const u=new URL(req.url),date=u.searchParams.get("date")||"";
 if(!/^\d{8}$/.test(date))return out(400,{ok:false,error:"日付形式不正"});
 const base=String(process.env.KEIRIN_BROWSER_SERVICE_URL||"").trim().replace(/\/$/,"");
 if(!base)return out(500,{ok:false,error:"KEIRIN_BROWSER_SERVICE_URLが設定されていません"});
 const attempts=[];
 for(let i=0;i<RETRIES.length;i++){
  if(RETRIES[i])await sleep(RETRIES[i]);
  try{
   const r=await fetch(`${base}/keirin/discover?${new URLSearchParams({date})}`,{headers:{accept:"application/json","cache-control":"no-cache"},signal:AbortSignal.timeout(TIMEOUT)});
   const p=await r.json().catch(()=>null);
   attempts.push({endpoint:"/keirin/discover",attempt:i+1,status:r.status,railwayMeetingCount:Array.isArray(p?.meetings)?p.meetings.length:0});
   if(!r.ok||p?.ok===false){if(i<RETRIES.length-1&&retry(r.status,p?.error))continue;break}
   if(String(p?.date||"")!==date)return out(502,{ok:false,error:"開催取得結果の日付が要求日と一致しません",diagnostics:{version:VERSION,attempts}});
   const meetings=normalize(base,date,p?.meetings);
   if(meetings.length){
    const result={ok:true,date,meetings,stale:false,diagnostics:{source:VERSION,railwayMeetingCount:Array.isArray(p?.meetings)?p.meetings.length:0,adaptedMeetingCount:meetings.length,raceCount:meetings.reduce((n,m)=>n+m.raceNumbers.length,0),activeRacesRequired:false,attempts},checkedAt:new Date().toISOString()};
    CACHE.set(date,{savedAt:Date.now(),result});return out(200,result);
   }
   const c=CACHE.get(date);if(c&&Date.now()-c.savedAt<21600000)return out(200,{...c.result,stale:true,warning:"指定日の開催を取得できなかったため、直近の取得結果を表示しています。",diagnostics:{...c.result.diagnostics,fallback:"warm-cache",attempts}});
   return out(200,{ok:true,date,meetings:[],stale:false,warning:"指定日の開催情報が取得できませんでした。",diagnostics:{source:VERSION,railwayMeetingCount:Array.isArray(p?.meetings)?p.meetings.length:0,activeRacesRequired:false,attempts},checkedAt:new Date().toISOString()});
  }catch(e){const m=e instanceof Error?e.message:String(e);attempts.push({endpoint:"/keirin/discover",attempt:i+1,error:m});if(i<RETRIES.length-1&&retry(0,m))continue;break}
 }
 const c=CACHE.get(date);if(c&&Date.now()-c.savedAt<21600000)return out(200,{...c.result,stale:true,warning:"開催取得サービスが一時停止したため、直近の取得結果を表示しています。",diagnostics:{...c.result.diagnostics,fallback:"warm-cache",attempts}});
 return out(200,{ok:true,date,meetings:[],stale:true,warning:"開催取得サービスに接続できませんでした。",diagnostics:{source:VERSION,fallback:"graceful-degraded",attempts},checkedAt:new Date().toISOString()});
}
function normalize(base,date,items){
 const seen=new Set(),res=[];
 for(const x of Array.isArray(items)?items:[]){
  const d=String(x?.date||date).replace(/\D/g,"").slice(0,8),code=String(x?.venueCode||x?.code||"").replace(/\D/g,"").padStart(2,"0"),name=String(x?.venueName||x?.name||"").trim();
  if(d!==date||!/^\d{2}$/.test(code)||code==="32"||!name||seen.has(code))continue;
  const nums=[...new Set((Array.isArray(x?.raceNumbers)?x.raceNumbers:[]).map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=12))].sort((a,b)=>a-b);
  if(!nums.length)continue;
  const races=Array.isArray(x?.races)?x.races.map(r=>({raceNo:Number(r?.raceNo),deadline:String(r?.deadline||""),startTime:String(r?.startTime||"")})).filter(r=>Number.isInteger(r.raceNo)&&r.raceNo>=1&&r.raceNo<=12):nums.map(raceNo=>({raceNo,deadline:"",startTime:""}));
  const raceUrl=`${base}/keirin/race?${new URLSearchParams({date,venueCode:code,venueName:name,raceNo:String(nums[0])})}`;
  res.push({date,venueCode:code,venueName:name,raceNumbers:nums,races,identityPassed:x.identityPassed!==false,verifiedMeeting:x.verifiedMeeting!==false,discoveredUrl:raceUrl,discovery:{ok:true,source:VERSION,links:{raceCards:x?.discovery?.links?.raceCards||[],odds:x?.discovery?.links?.odds||[],results:x?.discovery?.links?.results||[],other:[{text:"公式出走表",context:`${name} ${date} ${nums[0]}R`,url:raceUrl}]}}});
  seen.add(code);
 }
 return res;
}
function retry(s,m){return s===0||s===408||s===425||s===429||s>=500||/timeout|timed out|socket|fetch failed|target closed|browser|navigation|temporar/i.test(String(m||""))}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
function out(status,body){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}})}
