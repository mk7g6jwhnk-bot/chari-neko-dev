const DISCOVER_CACHE = new Map();
const RETRY_DELAYS = [0, 700, 1600];
const TIMEOUT_MS = 90000;
const ACTIVE_RACE_TIMEOUT_MS = 70000;
const OFFICIAL_SCHEDULE_TIMEOUT_MS = 20000;
const VERSION = "keirin-discover-v6-official-schedule-active-race";

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
  if (!/^\d{8}$/.test(date)) return jsonResponse(400, { ok:false, error:"日付形式不正" });

  const base = String(process.env.KEIRIN_BROWSER_SERVICE_URL || "").trim().replace(/\/$/, "");
  if (!base) return jsonResponse(500, { ok:false, error:"KEIRIN_BROWSER_SERVICE_URLが設定されていません" });

  const attempts = [];

  // Primary: Railway's own authoritative discovery.
  const railway = await fetchRailwayDiscover(base, date, attempts);
  if (railway.ok) {
    const meetings = await buildMeetingsFromSource(base, date, railway.meetings, attempts);
    if (meetings.length) return success(date, meetings, "railway-discover+active-races", attempts, railway.meetings.length);
  }

  // Recovery: if Railway discovery returns 200/empty, recover venue identities
  // from the official monthly schedule, then confirm actual R numbers through
  // Railway /active-races. No synthetic 1..12 race list is created here.
  try {
    const officialMeetings = await discoverOfficialVenues(date, attempts);
    if (officialMeetings.length) {
      const meetings = await buildMeetingsFromSource(base, date, officialMeetings, attempts);
      if (meetings.length) return success(date, meetings, "official-schedule+active-races", attempts, officialMeetings.length);
    }
  } catch (error) {
    attempts.push({
      stage:"official-schedule-fallback",
      error:error instanceof Error ? error.message : String(error)
    });
  }

  const cached = DISCOVER_CACHE.get(date);
  if (cached && Date.now() - cached.savedAt < 6 * 60 * 60 * 1000) {
    return jsonResponse(200, {
      ...cached.result,
      stale:true,
      warning:"開催取得サービスが一時停止したため、直近の開催情報を表示しています。",
      diagnostics:{...(cached.result.diagnostics||{}),fallback:"warm-cache",attempts}
    });
  }

  return jsonResponse(200, {
    ok:true,
    date,
    meetings:[],
    stale:true,
    warning:"指定日の開催を確認できませんでした。取得経路を再確認してください。",
    diagnostics:{source:VERSION,attempts},
    checkedAt:new Date().toISOString()
  });
}

async function fetchRailwayDiscover(base, date, attempts) {
  for (let i=0; i<RETRY_DELAYS.length; i++) {
    if (RETRY_DELAYS[i]) await sleep(RETRY_DELAYS[i]);
    try {
      const response = await fetch(`${base}/keirin/discover?${new URLSearchParams({date})}`, {
        headers:{accept:"application/json","cache-control":"no-cache"},
        signal:AbortSignal.timeout(TIMEOUT_MS)
      });
      const payload = await response.json().catch(()=>null);
      attempts.push({
        stage:"railway-discover",
        attempt:i+1,
        status:response.status,
        meetingCount:Array.isArray(payload?.meetings)?payload.meetings.length:0,
        error:payload?.error||null
      });
      if (!response.ok || payload?.ok === false) {
        if (i < RETRY_DELAYS.length-1 && isRetryable(response.status,payload?.error)) continue;
        return {ok:false, meetings:[]};
      }
      if (String(payload?.date||"") !== date) return {ok:false, meetings:[]};
      return {ok:true, meetings:Array.isArray(payload?.meetings)?payload.meetings:[]};
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      attempts.push({stage:"railway-discover",attempt:i+1,error:message});
      if (i < RETRY_DELAYS.length-1 && isRetryable(0,message)) continue;
    }
  }
  return {ok:false, meetings:[]};
}

async function discoverOfficialVenues(date, attempts) {
  const year = date.slice(0,4);
  const month = date.slice(4,6);
  const day = Number(date.slice(6,8));
  const scheduleUrl = `https://www.keirin.jp/pc/raceschedule?${new URLSearchParams({scyy:year,scym:month})}`;

  const response = await fetch(scheduleUrl, {
    headers:{
      accept:"text/html,application/xhtml+xml",
      "accept-language":"ja,en-US;q=0.7,en;q=0.3",
      "user-agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150 Safari/537.36"
    },
    signal:AbortSignal.timeout(OFFICIAL_SCHEDULE_TIMEOUT_MS)
  });
  if (!response.ok) throw new Error(`KEIRIN.JP開催日程 HTTP ${response.status}`);

  const html = await response.text();
  if (html.length < 1000) throw new Error("KEIRIN.JP開催日程HTMLが空です");

  const rows = html.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
  const meetings = [];
  const seen = new Set();

  for (const [venueName, venueCode] of Object.entries(VENUE_CODES)) {
    if (venueCode === "32" || seen.has(venueCode)) continue;

    let found = false;
    for (const row of rows) {
      const cells = row.match(/<(?:th|td)\b[^>]*>[\s\S]*?<\/(?:th|td)>/gi) || [];
      if (cells.length < day + 1) continue;

      const nameText = stripTags(cells[0]).replace(/\s+/g,"").trim();
      if (!(nameText === venueName || nameText === `${venueName}競輪場` || nameText.includes(venueName))) continue;

      const target = cells[day];
      if (!target) continue;

      const text = stripTags(target).replace(/\s+/g,"").trim();
      const hasLink = /<a\b/i.test(target);
      const hasImage = /<img\b/i.test(target);
      if (hasLink || hasImage || text) {
        meetings.push({
          date,
          venueCode,
          venueName,
          raceNumbers:[],
          races:[]
        });
        seen.add(venueCode);
        found = true;
        break;
      }
    }
    if (found) continue;
  }

  attempts.push({
    stage:"official-schedule",
    status:200,
    venueCount:meetings.length,
    scheduleUrl
  });

  return meetings;
}

async function buildMeetingsFromSource(base, date, sourceMeetings, attempts) {
  const normalized = [];
  const seen = new Set();

  for (const item of Array.isArray(sourceMeetings)?sourceMeetings:[]) {
    const itemDate = String(item?.date||date).replace(/\D/g,"").slice(0,8);
    const venueCode = String(item?.venueCode||item?.code||"").replace(/\D/g,"").padStart(2,"0");
    const venueName = String(item?.venueName||item?.name||"").trim();
    if (itemDate !== date || !/^\d{2}$/.test(venueCode) || venueCode === "32" || !venueName || seen.has(venueCode)) continue;

    normalized.push({
      ...item,
      date,
      venueCode,
      venueName
    });
    seen.add(venueCode);
  }

  if (!normalized.length) return [];

  const active = await fetchActiveRaceMap(base,date,normalized.map(m=>m.venueCode),attempts);

  return normalized.map(m => {
    const scan = active.get(m.venueCode);
    const sourceRaceNumbers = normalizeRaceNos(m.raceNumbers);
    const scannedRaceNumbers = scan
      ? normalizeRaceNos([...(scan.activeRaceNos||[]),...(scan.endedRaceNos||[])])
      : [];

    // Official schedule establishes the venue. Active-races establishes R existence.
    // If active-races is temporarily unavailable, use already authoritative R data
    // supplied by Railway discover. Never invent 1..12 here.
    const raceNumbers = scannedRaceNumbers.length ? scannedRaceNumbers : sourceRaceNumbers;
    if (!raceNumbers.length) return null;

    const raceUrl = `${base}/keirin/race?${new URLSearchParams({
      date,
      venueCode:m.venueCode,
      venueName:m.venueName,
      raceNo:String(raceNumbers[0])
    })}`;

    return {
      date,
      venueCode:m.venueCode,
      venueName:m.venueName,
      raceNumbers,
      races:Array.isArray(m.races)
        ? m.races.map(r=>({
            raceNo:Number(r.raceNo),
            deadline:String(r.deadline||""),
            startTime:String(r.startTime||"")
          })).filter(r=>Number.isInteger(r.raceNo))
        : raceNumbers.map(raceNo=>({raceNo,deadline:"",startTime:""})),
      identityPassed:true,
      verifiedMeeting:true,
      discoveredUrl:raceUrl,
      discovery:{
        ok:true,
        source:VERSION,
        sourceRaceNumbers,
        scannedRaceNumbers,
        activeRaceScan:Boolean(scan),
        activeRaceNos:scan?.activeRaceNos||[],
        endedRaceNos:scan?.endedRaceNos||[],
        unknownRaceNos:scan?.unknownRaceNos||[],
        links:{
          raceCards:[],
          odds:[],
          results:[],
          other:[{
            text:"公式出走表",
            context:`${m.venueName} ${date}`,
            url:raceUrl
          }]
        }
      }
    };
  }).filter(Boolean);
}

async function fetchActiveRaceMap(base,date,venueCodes,attempts) {
  const codes=[...new Set(venueCodes)]
    .filter(code=>/^\d{2}$/.test(code)&&code!=="32")
    .slice(0,16);
  if (!codes.length) return new Map();

  try {
    const query = new URLSearchParams({date,venueCodes:codes.join(",")});
    const response = await fetch(`${base}/keirin/active-races?${query}`, {
      headers:{accept:"application/json","cache-control":"no-cache"},
      signal:AbortSignal.timeout(ACTIVE_RACE_TIMEOUT_MS)
    });
    const payload = await response.json().catch(()=>null);

    attempts.push({
      stage:"railway-active-races",
      status:response.status,
      venueCount:Array.isArray(payload?.venues)?payload.venues.length:0,
      error:payload?.error||null
    });

    if (!response.ok || payload?.ok !== true || !Array.isArray(payload?.venues)) return new Map();

    const map = new Map();
    for (const venue of payload.venues) {
      const code = String(venue?.venueCode||"").padStart(2,"0");
      if (!/^\d{2}$/.test(code) || code === "32") continue;
      map.set(code,{
        activeRaceNos:normalizeRaceNos(venue?.activeRaceNos),
        endedRaceNos:normalizeRaceNos(venue?.endedRaceNos),
        unknownRaceNos:normalizeRaceNos(venue?.unknownRaceNos)
      });
    }
    return map;
  } catch (error) {
    attempts.push({
      stage:"railway-active-races",
      error:error instanceof Error ? error.message : String(error)
    });
    return new Map();
  }
}

function normalizeRaceNos(values) {
  return [...new Set(
    (Array.isArray(values)?values:[])
      .map(Number)
      .filter(n=>Number.isInteger(n)&&n>=1&&n<=12)
  )].sort((a,b)=>a-b);
}

function success(date, meetings, source, attempts, sourceCount) {
  const result = {
    ok:true,
    date,
    meetings,
    stale:false,
    diagnostics:{
      source,
      sourceMeetingCount:sourceCount,
      meetingCount:meetings.length,
      raceCount:meetings.reduce((n,m)=>n+m.raceNumbers.length,0),
      attempts
    },
    checkedAt:new Date().toISOString()
  };
  DISCOVER_CACHE.set(date,{savedAt:Date.now(),result});
  return jsonResponse(200,result);
}

function isRetryable(status,message) {
  return status===0 || status===408 || status===425 || status===429 || status>=500 ||
    /page crashed|target closed|browser|navigation|timeout|timed out|socket|fetch failed|temporar/i.test(String(message||""));
}

function stripTags(value) {
  return String(value||"")
    .replace(/<script\b[\s\S]*?<\/script>/gi," ")
    .replace(/<style\b[\s\S]*?<\/style>/gi," ")
    .replace(/<[^>]+>/g," ")
    .replace(/&nbsp;|&#160;/gi," ")
    .replace(/&amp;/gi,"&")
    .replace(/&quot;/gi,'"')
    .replace(/&#39;|&apos;/gi,"'")
    .replace(/&lt;/gi,"<")
    .replace(/&gt;/gi,">");
}

function sleep(ms) { return new Promise(resolve=>setTimeout(resolve,ms)); }

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers:{
      "content-type":"application/json; charset=utf-8",
      "cache-control":"no-store"
    }
  });
}
