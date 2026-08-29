const DISCOVER_CACHE=new Map();
const RETRY_DELAYS=[0,700,1600];

export default async function handler(req){
  const url=new URL(req.url),date=url.searchParams.get("date")||"";
  if(!/^\d{8}$/.test(date))return jsonResponse(400,{ok:false,error:"日付形式不正"});
  const base=String(process.env.KEIRIN_BROWSER_SERVICE_URL||"").trim().replace(/\/$/,"");
  if(!base)return jsonResponse(500,{ok:false,error:"KEIRIN_BROWSER_SERVICE_URLが設定されていません"});
  const attempts=[];
  try{
    const active=await fetch(`${base}/keirin/active-races?${new URLSearchParams({date})}`,{headers:{accept:"application/json"},signal:AbortSignal.timeout(18000)}),text=await active.text();
    let payload=null;try{payload=JSON.parse(text)}catch{}
    attempts.push({endpoint:"active-races",status:active.status,parsed:Boolean(payload),bodyLength:text.length});
    if(active.ok&&payload?.ok&&Array.isArray(payload.venues)){
      const meetings=payload.venues.filter(v=>String(v.venueCode||"").padStart(2,"0")!=="32").map(venue=>adaptStatusMeeting(base,date,venue));
      const result={ok:true,date,meetings,checkedAt:payload.checkedAt||new Date().toISOString(),cacheHit:Boolean(payload.cacheHit),cacheStatus:payload.cacheStatus||"MISS",cacheAgeMs:payload.cacheAgeMs??null,diagnostics:{source:"collector_lifecycle_snapshot",serverReadMs:payload.serverReadMs??null,attempts}};
      if(meetings.length)DISCOVER_CACHE.set(date,{savedAt:Date.now(),result});
      return jsonResponse(200,result,{cacheStatus:result.cacheStatus});
    }
  }catch(error){attempts.push({endpoint:"active-races",error:String(error?.message||error)})}
  for(let i=0;i<RETRY_DELAYS.length;i++){
    if(RETRY_DELAYS[i])await sleep(RETRY_DELAYS[i]);
    try{
      const response=await fetch(`${base}/keirin/discover?${new URLSearchParams({date})}`,{headers:{accept:"application/json"},signal:AbortSignal.timeout(90000)});
      let payload;
      try{payload=await response.json()}catch{payload=null}
      attempts.push({attempt:i+1,status:response.status,error:payload?.error||null});
      if(!response.ok||payload?.ok===false){
        if(i<RETRY_DELAYS.length-1&&isRetryable(response.status,payload?.error))continue;
        break;
      }
      if(String(payload?.date||"")!==date){
        attempts.push({attempt:i+1,error:"開催取得結果の日付が要求と一致しません"});
        break;
      }

      const rawMeetings=Array.isArray(payload?.meetings)?payload.meetings:[];
      const rejected={wrongDate:0,missingVenue:0,excludedVenue:0};
      const meetings=rawMeetings
        .filter(meeting=>{
          if(String(meeting?.date||date)!==date){rejected.wrongDate++;return false}
          const code=String(meeting?.venueCode||"").padStart(2,"0");
          const name=String(meeting?.venueName||"").trim();
          if(!code||!name){rejected.missingVenue++;return false}
          if(code==="32"){rejected.excludedVenue++;return false}
          return true;
        })
        .map(meeting=>adaptMeeting(base,date,meeting));

      const result={
        ok:true,
        date,
        meetings,
        diagnostics:{
          source:"KEIRIN_BROWSER_SERVICE_URL",
          railwayMeetingCount:rawMeetings.length,
          adaptedMeetingCount:meetings.length,
          identityPassedCount:rawMeetings.filter(m=>m?.identityPassed===true).length,
          rejected,
          attempts
        },
        checkedAt:new Date().toISOString()
      };
      if(meetings.length)DISCOVER_CACHE.set(date,{savedAt:Date.now(),result});
      return jsonResponse(200,result);
    }catch(error){
      const message=error instanceof Error?error.message:String(error);
      attempts.push({attempt:i+1,error:message});
      if(i<RETRY_DELAYS.length-1&&isRetryable(0,message))continue;
      break;
    }
  }
  const cached=DISCOVER_CACHE.get(date);
  if(cached&&Date.now()-cached.savedAt<6*60*60*1000)return jsonResponse(200,{...cached.result,stale:true,warning:"開催取得サービスが一時停止したため、直近の開催情報を表示しています。",diagnostics:{...(cached.result.diagnostics||{}),fallback:"warm-cache",attempts}});
  return jsonResponse(502,{ok:false,error:"開催情報取得サービスが一時的に停止しています。数秒後に再試行してください。",attempts});
}

function adaptStatusMeeting(base,date,venue){
  return adaptMeeting(base,date,{...venue,identityPassed:true,raceNumbers:venue.raceNumbers||venue.races?.map(r=>r.raceNo)||[],races:venue.races||[]});
}
function adaptMeeting(base,date,meeting){
  const venueCode=String(meeting.venueCode||"").padStart(2,"0"),venueName=String(meeting.venueName||"");
  const raceUrl=`${base}/keirin/race?${new URLSearchParams({date,venueCode,venueName,raceNo:"1"})}`;
  const races=Array.isArray(meeting.races)
    ?meeting.races.map(r=>({
        raceNo:Number(r.raceNo),
        deadline:String(r.deadline||""),
        startTime:String(r.startTime||""),
        officialStatus:r.officialStatus||"OFFICIAL_STATUS_UNKNOWN",
        resultStatus:r.resultStatus||"OFFICIAL_STATUS_UNKNOWN",
        autoStatus:r.autoStatus||"NOT_COLLECTED",
        predictionSealed:Boolean(r.predictionSealed),
        resultConfirmed:Boolean(r.resultConfirmed),
        compared:Boolean(r.compared)
      })).filter(r=>Number.isInteger(r.raceNo))
    :[];
  const raceNumbers=Array.from(new Set([
    ...(Array.isArray(meeting.raceNumbers)?meeting.raceNumbers:[]).map(Number),
    ...races.map(r=>r.raceNo)
  ])).filter(Number.isInteger).sort((a,b)=>a-b);

  return {
    date,
    venueCode,
    venueName,
    raceNumbers,
    races,
    identityPassed:meeting?.identityPassed===true,
    verifiedMeeting:meeting?.identityPassed===true,
    finishedRaceCount:Number(meeting.finishedRaceCount||0),
    totalRaceCount:Number(meeting.totalRaceCount||races.length),
    nextRaceNo:Number(meeting.nextRaceNo)||null,
    allResultsConfirmed:meeting.allResultsConfirmed===true,
    statusLabel:meeting.statusLabel||"状態未確認",
    discoveredUrl:raceUrl,
    discovery:{
      ok:true,
      links:{
        raceCards:[],
        odds:[],
        results:[],
        other:[{text:"公式出走表",context:`${venueName} ${date}`,url:raceUrl}]
      },
      diagnostics:{
        source:"railway-adapter",
        identityPassed:meeting?.identityPassed===true
      }
    }
  };
}

function isRetryable(status,message){return status===0||status===408||status===425||status===429||status>=500||/page crashed|target closed|browser|navigation|timeout|timed out|socket|fetch failed/i.test(String(message||""))}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
function jsonResponse(status,body,{cacheStatus=null}={}){const response=new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"public, max-age=30, stale-while-revalidate=120"}});if(cacheStatus)response.headers.set("x-chari-cache",cacheStatus);return response}
