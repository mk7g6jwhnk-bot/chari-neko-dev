import { load as loadHtml } from "cheerio";

const CACHE = new Map();
const RETRIES = [0, 700, 1600];
const VERSION = "keirin-discover-v10-official-schedule";
const TIMEOUT_MS = 30000;

const VENUE_CODES = {
  函館:"11", 青森:"12", いわき平:"13", 弥彦:"21", 前橋:"22", 取手:"23", 宇都宮:"24",
  大宮:"25", 西武園:"26", 京王閣:"27", 立川:"28", 松戸:"31", 千葉:"32", 川崎:"34",
  平塚:"35", 小田原:"36", 伊東:"37", 静岡:"38", 豊橋:"45", 名古屋:"42", 岐阜:"43",
  大垣:"44", 富山:"46", 松阪:"47", 四日市:"48", 福井:"51", 奈良:"53",
  向日町:"54", 和歌山:"55", 岸和田:"56", 玉野:"61", 広島:"62", 防府:"63",
  高松:"71", 小松島:"73", 高知:"74", 松山:"75", 小倉:"81", 久留米:"83",
  武雄:"84", 佐世保:"85", 別府:"86", 熊本:"87"
};

export default async function handler(req) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date") || "";

  if (!/^\d{8}$/.test(date)) {
    return json(400, { ok: false, error: "日付形式不正" });
  }

  const base = String(process.env.KEIRIN_BROWSER_SERVICE_URL || "")
    .trim()
    .replace(/\/$/, "");

  const attempts = [];
  let railwayMeetings = [];

  if (base) {
    for (let i = 0; i < RETRIES.length; i++) {
      if (RETRIES[i]) await sleep(RETRIES[i]);

      try {
        const response = await fetch(
          `${base}/keirin/discover?${new URLSearchParams({ date })}`,
          {
            headers: { accept: "application/json", "cache-control": "no-cache" },
            signal: AbortSignal.timeout(TIMEOUT_MS)
          }
        );

        const payload = await response.json().catch(() => null);
        railwayMeetings = Array.isArray(payload?.meetings) ? payload.meetings : [];

        attempts.push({
          stage: "railway-discover",
          attempt: i + 1,
          status: response.status,
          meetingCount: railwayMeetings.length
        });

        if (response.ok && payload?.ok !== false) break;
      } catch (error) {
        attempts.push({
          stage: "railway-discover",
          attempt: i + 1,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  /*
   * Railway discoverが開催を返したら、それをそのまま使用。
   * /keirin/race は開催一覧では呼ばない。
   */
  const railway = normalizeMeetings(date, railwayMeetings);
  if (railway.length) {
    return finish(date, railway, "railway-discover", attempts);
  }

  /*
   * Railwayが200/0件でも「取得失敗」として終了しない。
   * KEIRIN.JPの実際の開催日程ページを直接取得する。
   */
  try {
    const official = await fetchOfficialSchedule(date, attempts);
    if (official.length) {
      return finish(date, official, "keirin-jp-official-schedule", attempts);
    }
  } catch (error) {
    attempts.push({
      stage: "official-schedule",
      error: error instanceof Error ? error.message : String(error)
    });
  }

  const cached = CACHE.get(date);
  if (cached && Date.now() - cached.savedAt < 6 * 60 * 60 * 1000) {
    return json(200, {
      ...cached.result,
      stale: true,
      warning: "開催取得に失敗したため、直近の取得結果を表示しています。",
      diagnostics: {
        ...cached.result.diagnostics,
        fallback: "warm-cache",
        attempts
      }
    });
  }

  return json(200, {
    ok: true,
    date,
    meetings: [],
    stale: true,
    warning: "指定日の開催情報を確認できませんでした。",
    diagnostics: { source: VERSION, attempts },
    checkedAt: new Date().toISOString()
  });
}

async function fetchOfficialSchedule(date, attempts) {
  const year = date.slice(0, 4);
  const month = date.slice(4, 6);
  const day = Number(date.slice(6, 8));

  const url =
    `https://keirin.jp/pc/raceschedule?${new URLSearchParams({
      scym: month,
      scyy: year
    })}`;

  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "Mozilla/5.0 ChariNeko/1.0"
    },
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    throw new Error(`KEIRIN.JP開催日程 HTTP ${response.status}`);
  }

  const html = await response.text();
  const $ = loadHtml(html);
  const result = [];
  const seen = new Set();

  /*
   * KEIRIN.JP開催日程は「会場名 + 1〜31日のセル」の表。
   * 日セルに開催リンク/img/文字が存在するものだけ採用する。
   */
  $("table tr").each((_i, tr) => {
    const cells = $(tr).children("th,td");
    if (cells.length < day + 1) return;

    const first = cells.eq(0).text().replace(/\s+/g, "").trim();
    const venueName = resolveVenue(first);
    if (!venueName) return;

    const target = cells.eq(day);
    if (!isActiveScheduleCell(target)) return;

    const venueCode = VENUE_CODES[venueName];
    if (!venueCode || venueCode === "32" || seen.has(venueCode)) return;

    result.push({
      date,
      venueCode,
      venueName,
      raceNumbers: [],
      races: []
    });
    seen.add(venueCode);
  });

  attempts.push({
    stage: "official-schedule",
    status: 200,
    venueCount: result.length,
    scheduleUrl: url
  });

  return result;
}

function isActiveScheduleCell(cell) {
  if (cell.find("a[href]").length > 0) return true;
  if (cell.find("img").length > 0) return true;

  const text = cell.text().replace(/\s+/g, "").trim();
  if (!text) return false;

  const emptyTokens = new Set(["-", "－", "—", "None", "null"]);
  return !emptyTokens.has(text);
}

function resolveVenue(raw) {
  if (!raw) return "";

  const names = Object.keys(VENUE_CODES).sort((a, b) => b.length - a.length);

  for (const name of names) {
    if (
      raw === name ||
      raw === `${name}競輪場` ||
      raw.includes(name)
    ) {
      return name;
    }
  }

  return "";
}

function normalizeMeetings(date, items) {
  const seen = new Set();
  const result = [];

  for (const item of Array.isArray(items) ? items : []) {
    const itemDate = String(item?.date || date).replace(/\D/g, "").slice(0, 8);
    const venueCode = String(item?.venueCode || item?.code || "")
      .replace(/\D/g, "")
      .padStart(2, "0");
    const venueName = String(item?.venueName || item?.name || "").trim();

    if (itemDate !== date || !/^\d{2}$/.test(venueCode)) continue;
    if (venueCode === "32" || !venueName || seen.has(venueCode)) continue;

    const raceNumbers = normalizeRaceNumbers(item?.raceNumbers);

    result.push({
      date,
      venueCode,
      venueName,
      raceNumbers,
      races: Array.isArray(item?.races)
        ? item.races
            .map(r => ({
              raceNo: Number(r?.raceNo),
              deadline: String(r?.deadline || ""),
              startTime: String(r?.startTime || "")
            }))
            .filter(r => Number.isInteger(r.raceNo) && r.raceNo >= 1 && r.raceNo <= 12)
        : raceNumbers.map(raceNo => ({ raceNo, deadline: "", startTime: "" })),
      identityPassed: item?.identityPassed !== false,
      verifiedMeeting: item?.verifiedMeeting !== false,
      discoveredUrl: item?.discoveredUrl || "",
      discovery: item?.discovery || {
        ok: true,
        source: VERSION,
        links: { raceCards: [], odds: [], results: [], other: [] }
      }
    });

    seen.add(venueCode);
  }

  return result;
}

function normalizeRaceNumbers(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map(Number)
      .filter(n => Number.isInteger(n) && n >= 1 && n <= 12)
  )].sort((a, b) => a - b);
}

function finish(date, meetings, source, attempts) {
  const result = {
    ok: true,
    date,
    meetings,
    stale: false,
    diagnostics: {
      source: VERSION,
      sourceName: source,
      meetingCount: meetings.length,
      raceCount: meetings.reduce((sum, m) => sum + m.raceNumbers.length, 0),
      raceProbeCount: 0,
      raceProbeMode: "not-used-by-discover",
      attempts
    },
    checkedAt: new Date().toISOString()
  };

  CACHE.set(date, { savedAt: Date.now(), result });
  return json(200, result);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
