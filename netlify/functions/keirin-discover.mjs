const CACHE = new Map();
const RETRIES = [0, 700, 1600];

const VENUES = {
  函館:"11", 青森:"12", いわき平:"13", 弥彦:"21", 前橋:"22", 取手:"23",
  宇都宮:"24", 大宮:"25", 西武園:"26", 京王閣:"27", 立川:"28", 松戸:"31",
  千葉:"32", 川崎:"34", 平塚:"35", 小田原:"36", 伊東:"37", 静岡:"38",
  名古屋:"42", 岐阜:"43", 大垣:"44", 豊橋:"45", 富山:"46", 松阪:"47",
  四日市:"48", 福井:"51", 奈良:"53", 向日町:"54", 和歌山:"55", 岸和田:"56",
  玉野:"61", 広島:"62", 防府:"63", 高松:"71", 小松島:"73", 高知:"74",
  松山:"75", 小倉:"81", 久留米:"83", 武雄:"84", 佐世保:"85", 別府:"86", 熊本:"87"
};

export default async function handler(req) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date") || "";

  if (!/^\d{8}$/.test(date)) {
    return response(400, { ok:false, error:"日付形式不正" });
  }

  const cached = CACHE.get(date);
  if (cached && Date.now() - cached.at < 300000) {
    return response(200, {
      ...cached.data,
      diagnostics: { ...cached.data.diagnostics, cacheHit:true }
    });
  }

  const attempts = [];

  /*
   * 最優先：KEIRIN.JP公式開催日程。
   * Railway discoverの返却件数を正本にしない。
   */
  try {
    const officialMeetings = await discoverOfficial(date, attempts);

    if (officialMeetings.length > 0) {
      const meetings = officialMeetings.map(x => normalizeMeeting(date, x, "KEIRIN_JP_OFFICIAL_SCHEDULE"));
      const data = {
        ok:true,
        date,
        meetings,
        stale:false,
        checkedAt:new Date().toISOString(),
        diagnostics:{
          source:"KEIRIN_JP_OFFICIAL_SCHEDULE",
          authoritative:true,
          meetingCount:meetings.length,
          venueCodes:meetings.map(x => x.venueCode),
          raceProbeCount:0,
          attempts
        }
      };

      CACHE.set(date, { at:Date.now(), data });
      return response(200, data);
    }

    attempts.push({ stage:"official", error:"開催会場0件" });
  } catch (e) {
    attempts.push({
      stage:"official",
      error:e instanceof Error ? e.message : String(e)
    });
  }

  /*
   * 公式日程取得失敗時だけRailwayへフォールバック。
   * ここでも /keirin/race は呼ばない。
   */
  const base = String(process.env.KEIRIN_BROWSER_SERVICE_URL || "")
    .trim()
    .replace(/\/$/, "");

  if (base) {
    for (let i=0; i<RETRIES.length; i++) {
      if (RETRIES[i]) await sleep(RETRIES[i]);

      try {
        const r = await fetch(
          `${base}/keirin/discover?${new URLSearchParams({date})}`,
          {
            headers:{accept:"application/json"},
            signal:AbortSignal.timeout(90000)
          }
        );

        const p = await r.json().catch(() => null);

        attempts.push({
          stage:"railway",
          attempt:i+1,
          status:r.status,
          meetingCount:Array.isArray(p?.meetings) ? p.meetings.length : 0
        });

        if (!r.ok || p?.ok === false) continue;
        if (String(p?.date || date) !== date) continue;

        const meetings = (Array.isArray(p?.meetings) ? p.meetings : [])
          .filter(x =>
            String(x?.date || date) === date &&
            x?.identityPassed === true &&
            String(x?.venueCode || "") !== "32"
          )
          .map(x => normalizeMeeting(date, x, "RAILWAY_FALLBACK"));

        if (meetings.length) {
          const data = {
            ok:true,
            date,
            meetings,
            stale:true,
            warning:"公式開催日程を取得できなかったためRailway結果を表示しています。",
            checkedAt:new Date().toISOString(),
            diagnostics:{
              source:"RAILWAY_FALLBACK",
              authoritative:false,
              meetingCount:meetings.length,
              raceProbeCount:0,
              attempts
            }
          };

          CACHE.set(date, { at:Date.now(), data });
          return response(200, data);
        }
      } catch (e) {
        attempts.push({
          stage:"railway",
          attempt:i+1,
          error:e instanceof Error ? e.message : String(e)
        });
      }
    }
  }

  const warm = CACHE.get(date);
  if (warm && Date.now() - warm.at < 21600000) {
    return response(200, {
      ...warm.data,
      stale:true,
      warning:"開催情報取得に失敗したため、直近の取得結果を表示しています。",
      diagnostics:{
        ...warm.data.diagnostics,
        fallback:"warm-cache",
        attempts
      }
    });
  }

  return response(502, {
    ok:false,
    error:"開催情報を全会場取得できませんでした。",
    attempts
  });
}

async function discoverOfficial(date, attempts) {
  const year = date.slice(0,4);
  const month = date.slice(4,6);
  const targetDay = Number(date.slice(6,8));

  const scheduleUrl =
    `https://www.keirin.jp/pc/raceschedule?${new URLSearchParams({
      scym:month,
      scyy:year
    })}`;

  const r = await fetch(scheduleUrl, {
    headers:{
      accept:"text/html,application/xhtml+xml",
      "accept-language":"ja,en-US;q=0.7,en;q=0.3",
      "user-agent":"Mozilla/5.0 ChariNeko"
    },
    signal:AbortSignal.timeout(20000)
  });

  if (!r.ok) {
    throw new Error(`KEIRIN.JP HTTP ${r.status}`);
  }

  const html = await r.text();

  if (!html || html.length < 1000) {
    throw new Error("開催日程HTMLが空です");
  }

  /*
   * HTML表を解析する。
   * 会場名の行を見つけ、日付セルを colspan 考慮で特定する。
   */
  const rows = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];
  const found = [];

  for (const [venueName, venueCode] of Object.entries(VENUES)) {
    if (venueCode === "32") continue;

    const row = rows.find(row =>
      venueRowMatches(row, venueName, venueCode)
    );

    if (!row) continue;

    const cells = parseCells(row);
    if (cells.length < 2) continue;

    let logicalDay = 1;
    let targetCell = null;

    /*
     * 1列目は会場名。
     * 以降の日付セルを colspan で進める。
     */
    for (let i=1; i<cells.length; i++) {
      const span = Math.max(
        1,
        parseInt(getAttr(cells[i].attrs, "colspan") || "1", 10) || 1
      );

      if (targetDay >= logicalDay && targetDay < logicalDay + span) {
        targetCell = cells[i];
        break;
      }

      logicalDay += span;
    }

    if (!targetCell) continue;

    if (!isActiveCell(targetCell.html)) continue;

    const href =
      extractHref(targetCell.html) ||
      extractHref(row) ||
      null;

    found.push({
      date,
      venueCode,
      venueName,
      raceNumbers:Array.from({length:12}, (_,i) => i+1),
      races:[],
      targetUrl:href ? absolute(href, scheduleUrl) : null
    });
  }

  const unique = [...new Map(
    found.map(x => [x.venueCode, x])
  ).values()];

  attempts.push({
    stage:"official",
    status:200,
    meetingCount:unique.length,
    venueCodes:unique.map(x => x.venueCode),
    scheduleUrl
  });

  return unique;
}

function venueRowMatches(row, venueName, venueCode) {
  const text = strip(row);

  if (text.includes(venueName)) return true;

  const codePatterns = [
    `jocd=${venueCode}`,
    `jcd=${venueCode}`,
    `bkcd=${venueCode}`,
    `venueCode=${venueCode}`
  ];

  return codePatterns.some(x => row.includes(x));
}

function isActiveCell(html) {
  const text = strip(html);

  /*
   * 空セル・ハイフンだけは開催なし。
   * リンク、画像、開催種別文字、または非空文字があれば開催候補。
   */
  if (!text || /^[-－—]+$/.test(text)) return false;

  return (
    /<a\b/i.test(html) ||
    /<img\b/i.test(html) ||
    /<svg\b/i.test(html) ||
    /開催|F[0-9]|G[0-9]|ナイター|ミッド|モーニング/i.test(html) ||
    text.length > 0
  );
}

function parseCells(row) {
  const result = [];
  const re = /<(th|td)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let m;

  while ((m = re.exec(row))) {
    result.push({
      attrs:m[2] || "",
      html:m[3] || ""
    });
  }

  return result;
}

function extractHref(html) {
  const m = String(html || "").match(
    /<a\b[^>]*href\s*=\s*["']([^"']+)["']/i
  );

  return m ? decode(m[1]) : null;
}

function getAttr(attrs, name) {
  const re = new RegExp(
    "\\b" + name + "\\s*=\\s*[\"']([^\"']*)[\"']",
    "i"
  );

  return String(attrs || "").match(re)?.[1] || "";
}

function normalizeMeeting(date, x, source) {
  const venueCode = String(x.venueCode || "").padStart(2,"0");
  const venueName = String(x.venueName || "");

  return {
    date,
    venueCode,
    venueName,
    raceNumbers:Array.isArray(x.raceNumbers)
      ? x.raceNumbers.map(Number).filter(Number.isInteger)
      : [],
    races:Array.isArray(x.races)
      ? x.races
      : [],
    identityPassed:true,
    verifiedMeeting:true,
    discoveredUrl:x.targetUrl || x.discoveredUrl || "",
    discovery:{
      ok:true,
      source,
      links:{
        raceCards:[],
        odds:[],
        results:[],
        other:[]
      }
    }
  };
}

function strip(value) {
  return String(value || "")
    .replace(/<script\b[\s\S]*?<\/script>/gi," ")
    .replace(/<style\b[\s\S]*?<\/style>/gi," ")
    .replace(/<[^>]+>/g," ")
    .replace(/&nbsp;|&#160;/gi," ")
    .replace(/&amp;/gi,"&")
    .replace(/&quot;/gi,'"')
    .replace(/&#39;|&apos;/gi,"'")
    .replace(/\s+/g," ")
    .trim();
}

function decode(value) {
  return String(value || "")
    .replace(/&amp;/gi,"&")
    .replace(/&quot;/gi,'"')
    .replace(/&#39;|&apos;/gi,"'");
}

function absolute(href, base) {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function response(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers:{
      "content-type":"application/json; charset=utf-8",
      "cache-control":"no-store"
    }
  });
}
