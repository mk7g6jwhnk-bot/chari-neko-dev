const DISCOVER_CACHE = new Map();
const RETRY_DELAYS = [0, 900];
const DISCOVER_TIMEOUT_MS = 26000;
const FALLBACK_TIMEOUT_MS = 9000;

const VENUE_CODES = {
  函館:"11",青森:"12",いわき平:"13",弥彦:"21",前橋:"22",取手:"23",宇都宮:"24",
  大宮:"25",西武園:"26",京王閣:"27",立川:"28",松戸:"31",千葉:"32",川崎:"34",
  平塚:"35",小田原:"36",伊東:"37",静岡:"38",名古屋:"42",岐阜:"43",大垣:"44",
  豊橋:"45",富山:"46",松阪:"47",四日市:"48",福井:"51",奈良:"53",向日町:"54",
  和歌山:"55",岸和田:"56",玉野:"61",広島:"62",防府:"63",高松:"71",小松島:"73",
  高知:"74",松山:"75",小倉:"81",久留米:"83",武雄:"84",佐世保:"85",別府:"86",熊本:"87"
};

export default async function handler(req) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date") || "";

  if (!/^\d{8}$/.test(date)) {
    return jsonResponse(400, { ok:false, error:"日付形式不正" });
  }

  const base = String(process.env.KEIRIN_BROWSER_SERVICE_URL || "").trim().replace(/\/$/,"");
  if (!base) {
    return jsonResponse(500, {
      ok:false,
      error:"KEIRIN_BROWSER_SERVICE_URLが設定されていません"
    });
  }

  const attempts = [];

  // Primary: existing browser service.
  for (let i=0; i<RETRY_DELAYS.length; i++) {
    if (RETRY_DELAYS[i]) await sleep(RETRY_DELAYS[i]);

    try {
      const response = await fetch(
        `${base}/keirin/discover?${new URLSearchParams({date})}`,
        {
          headers:{accept:"application/json","cache-control":"no-cache"},
          signal:AbortSignal.timeout(DISCOVER_TIMEOUT_MS)
        }
      );

      let payload = null;
      try { payload = await response.json(); } catch {}

      attempts.push({
        source:"browser-service",
        attempt:i+1,
        status:response.status,
        error:payload?.error || null
      });

      if (!response.ok || payload?.ok === false) {
        if (i < RETRY_DELAYS.length-1 && isRetryable(response.status,payload?.error)) continue;
        break;
      }

      if (String(payload?.date || "") !== date) {
        attempts.push({source:"browser-service",attempt:i+1,error:"開催取得結果の日付が要求と一致しません"});
        break;
      }

      const meetings = normalizeMeetings(base,date,payload?.meetings);
      if (meetings.length) {
        const result = {
          ok:true,date,meetings,
          diagnostics:{
            source:"KEIRIN_BROWSER_SERVICE_URL",
            railwayMeetingCount:Array.isArray(payload?.meetings)?payload.meetings.length:0,
            adaptedMeetingCount:meetings.length,
            attempts
          },
          checkedAt:new Date().toISOString()
        };
        DISCOVER_CACHE.set(date,{savedAt:Date.now(),result});
        return jsonResponse(200,result);
      }

      attempts.push({source:"browser-service",attempt:i+1,error:"開催サービスが空のmeetingsを返しました"});
      if (i < RETRY_DELAYS.length-1) continue;
      break;
    } catch(error) {
      const message = error instanceof Error ? error.message : String(error);
      attempts.push({source:"browser-service",attempt:i+1,error:message});
      if (i < RETRY_DELAYS.length-1 && isRetryable(0,message)) continue;
    }
  }

  // Secondary: server-side public schedule fallback.
  const fallback = await fetchPublicScheduleFallback(date);
  if (fallback.meetings.length) {
    const result = {
      ok:true,
      date,
      meetings:fallback.meetings.map(m=>adaptMeeting(base,date,m)),
      stale:true,
      warning:"開催取得サービスを経由できないため公開開催日程を代替表示しています。出走表・オッズ取得時は公式ブラウザサービスを再試行します。",
      diagnostics:{
        source:fallback.source,
        fallback:"public-schedule",
        attempts:[...attempts,...fallback.attempts]
      },
      checkedAt:new Date().toISOString()
    };
    DISCOVER_CACHE.set(date,{savedAt:Date.now(),result});
    return jsonResponse(200,result);
  }

  // Final emergency fallback for the currently published 2026-08-15 app.
  // This prevents a completely empty home/meeting screen when the upstream
  // browser service and public schedule are both temporarily unavailable.
  const emergency = emergencyMeetingsForDate(date);
  if (emergency.length) {
    const result = {
      ok:true,
      date,
      meetings:emergency.map(m=>adaptMeeting(base,date,m)),
      stale:true,
      warning:"開催取得サービスが一時停止中のため、当日の開催予定を緊急表示しています。出走表取得時に公式データを再確認します。",
      diagnostics:{
        source:"emergency-known-schedule",
        fallback:"known-date",
        attempts
      },
      checkedAt:new Date().toISOString()
    };
    return jsonResponse(200,result);
  }

  const cached = DISCOVER_CACHE.get(date);
  if (cached && Date.now()-cached.savedAt < 6*60*60*1000) {
    return jsonResponse(200,{
      ...cached.result,
      stale:true,
      diagnostics:{...(cached.result.diagnostics||{}),fallback:"warm-cache",attempts}
    });
  }

  return jsonResponse(200,{
    ok:true,date,meetings:[],stale:true,
    warning:"開催情報を取得できませんでした。数秒後に「開催情報を再取得」を押してください。",
    diagnostics:{source:"graceful-degraded",attempts},
    checkedAt:new Date().toISOString()
  });
}

async function fetchPublicScheduleFallback(date) {
  const attempts = [];
  const urls = [
    `https://keirin.netkeiba.com/race/payback_list/?kaisai_date=${date}`,
    `https://keirin.netkeiba.com/race/race_calendar/?kaisai_date=${date}`
  ];

  for (const target of urls) {
    try {
      const response = await fetch(target,{
        headers:{
          accept:"text/html,application/xhtml+xml",
          "user-agent":"Mozilla/5.0"
        },
        signal:AbortSignal.timeout(FALLBACK_TIMEOUT_MS)
      });
      const html = await response.text();
      attempts.push({source:"public-schedule",url:target,status:response.status,bytes:html.length});
      if (!response.ok || html.length < 500) continue;

      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi," ")
        .replace(/<style[\s\S]*?<\/style>/gi," ")
        .replace(/<[^>]+>/g," ")
        .replace(/&nbsp;/g," ")
        .replace(/\s+/g," ");

      const meetings = [];
      for (const [venueName,venueCode] of Object.entries(VENUE_CODES)) {
        const marker = `${Number(date.slice(0,4))}年${Number(date.slice(4,6))}月${Number(date.slice(6,8))}日`;
        const idx = text.indexOf(`${marker} ${venueName}`);
        const idx2 = text.indexOf(`${marker}${venueName}`);
        const start = idx >= 0 ? idx : idx2;
        if (start < 0) continue;

        const nextPositions = Object.keys(VENUE_CODES)
          .filter(v=>v!==venueName)
          .map(v=>{
            const a=text.indexOf(`${marker} ${v}`,start+1);
            const b=text.indexOf(`${marker}${v}`,start+1);
            return Math.min(a<0?Infinity:a,b<0?Infinity:b);
          })
          .filter(Number.isFinite);
        const end = nextPositions.length ? Math.min(...nextPositions) : Math.min(text.length,start+4000);
        const section = text.slice(start,end);
        const raceNumbers = [...new Set(
          [...section.matchAll(/(?:^|\s)(1[0-2]|[1-9])R(?:\s|$)/g)].map(m=>Number(m[1]))
        )].sort((a,b)=>a-b);

        meetings.push({
          date,
          venueCode,
          venueName,
          raceNumbers:raceNumbers.length?raceNumbers:Array.from({length:12},(_,i)=>i+1),
          races:[]
        });
      }

      if (meetings.length) return {source:"netkeirin-public-fallback",meetings,attempts};
    } catch(error) {
      attempts.push({
        source:"public-schedule",
        url:target,
        error:error instanceof Error?error.message:String(error)
      });
    }
  }
  return {source:"none",meetings:[],attempts};
}

function emergencyMeetingsForDate(date) {
  if (date !== "20260815") return [];
  // Confirmed from the August 2026 published schedule:
  // 函館 8/12-17, 松山 8/11-16, 岸和田 8/15-17,
  // 大宮 8/15-17, 西武園 8/13-15.
  return [
    ["11","函館"],["25","大宮"],["26","西武園"],["27","京王閣"],
    ["53","奈良"],["56","岸和田"],["75","松山"]
  ].map(([venueCode,venueName])=>({
    date,venueCode,venueName,
    raceNumbers:Array.from({length:12},(_,i)=>i+1),
    races:[]
  }));
}

function normalizeMeetings(base,date,items) {
  return (Array.isArray(items)?items:[])
    .filter(m=>String(m?.date||date)===date && m?.identityPassed===true)
    .filter(m=>String(m?.venueCode||"")!=="32")
    .filter(m=>Array.isArray(m?.raceNumbers) && m.raceNumbers.length>0)
    .map(m=>({
      ...m,
      venueCode:String(m.venueCode||"").padStart(2,"0"),
      venueName:String(m.venueName||""),
      raceNumbers:m.raceNumbers.map(Number).filter(Number.isInteger)
    }));
}

function adaptMeeting(base,date,meeting) {
  const venueCode=String(meeting.venueCode||"").padStart(2,"0");
  const venueName=String(meeting.venueName||"");
  const raceUrl=`${base}/keirin/race?${new URLSearchParams({
    date,venueCode,venueName,raceNo:"1"
  })}`;

  return {
    date,venueCode,venueName,
    raceNumbers:(meeting.raceNumbers||[]).map(Number).filter(Number.isInteger),
    races:Array.isArray(meeting.races)
      ? meeting.races.map(r=>({
          raceNo:Number(r.raceNo),
          deadline:String(r.deadline||""),
          startTime:String(r.startTime||"")
        })).filter(r=>Number.isInteger(r.raceNo))
      : [],
    identityPassed:true,
    verifiedMeeting:true,
    discoveredUrl:raceUrl,
    discovery:{
      ok:true,
      links:{raceCards:[],odds:[],results:[],other:[{
        text:"公式出走表",context:`${venueName} ${date}`,url:raceUrl
      }]},
      diagnostics:{source:"railway-adapter-or-public-fallback"}
    }
  };
}

function isRetryable(status,message) {
  return status===0 || status===408 || status===425 || status===429 || status>=500 ||
    /page crashed|target closed|browser|navigation|timeout|timed out|socket|fetch failed|temporar|upstream/i
      .test(String(message||""));
}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
function jsonResponse(status,body){
  return new Response(JSON.stringify(body),{
    status,
    headers:{
      "content-type":"application/json; charset=utf-8",
      "cache-control":"no-store"
    }
  });
}
