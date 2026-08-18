const CACHE = new Map();
const RETRIES = [0, 700, 1600];
const VERSION = "keirin-discover-v9-fast";
const TIMEOUT_MS = 30000;

export default async function handler(req) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date") || "";

  if (!/^\d{8}$/.test(date)) {
    return json(400, { ok: false, error: "日付形式不正" });
  }

  const base = String(process.env.KEIRIN_BROWSER_SERVICE_URL || "")
    .trim()
    .replace(/\/$/, "");

  if (!base) {
    return json(500, { ok: false, error: "KEIRIN_BROWSER_SERVICE_URLが設定されていません" });
  }

  const attempts = [];
  let railwayMeetings = [];

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
      if (i < RETRIES.length - 1 && retryable(response.status, payload?.error)) continue;
    } catch (error) {
      attempts.push({
        stage: "railway-discover",
        attempt: i + 1,
        error: error instanceof Error ? error.message : String(error)
      });
      if (i < RETRIES.length - 1) continue;
    }
  }

  /*
   * 開催一覧取得では /keirin/race を大量に叩かない。
   * Railway discover が返した開催情報を第一候補として即返す。
   */
  const meetings = normalizeMeetings(date, railwayMeetings);

  if (meetings.length) {
    return saveAndReturn(date, meetings, "railway-discover", attempts);
  }

  /*
   * Railway discover が0件の場合だけ、公式日程の軽量フォールバック。
   * R確認はここでは行わない。会場一覧を返すことを優先する。
   */
  try {
    const official = await officialScheduleFallback(date, attempts);
    if (official.length) {
      return saveAndReturn(date, official, "official-schedule-fallback", attempts);
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
      warning: "開催取得に失敗したため直近の取得結果を表示しています。",
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
    warning: "指定日の開催情報を取得できませんでした。",
    diagnostics: { source: VERSION, attempts },
    checkedAt: new Date().toISOString()
  });
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

async function officialScheduleFallback(date, attempts) {
  /*
   * 外部HTMLを重いブラウザ経由で取得しない。
   * Railway側がすでにdiscoverを実装しているため、
   * ここは設定された公式日程URLが存在する場合のみ軽量取得する。
   */
  const officialUrl = String(process.env.KEIRIN_OFFICIAL_SCHEDULE_URL || "").trim();
  if (!officialUrl) {
    attempts.push({
      stage: "official-schedule",
      skipped: true,
      reason: "KEIRIN_OFFICIAL_SCHEDULE_URL未設定"
    });
    return [];
  }

  const response = await fetch(
    `${officialUrl}${officialUrl.includes("?") ? "&" : "?"}${new URLSearchParams({ date })}`,
    {
      headers: { accept: "application/json", "cache-control": "no-cache" },
      signal: AbortSignal.timeout(10000)
    }
  );

  const payload = await response.json().catch(() => null);

  attempts.push({
    stage: "official-schedule",
    status: response.status,
    meetingCount: Array.isArray(payload?.meetings) ? payload.meetings.length : 0
  });

  return normalizeMeetings(date, payload?.meetings);
}

function normalizeRaceNumbers(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map(Number)
      .filter(n => Number.isInteger(n) && n >= 1 && n <= 12)
  )].sort((a, b) => a - b);
}

function saveAndReturn(date, meetings, source, attempts) {
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
      raceProbeMode: "disabled-in-discover",
      attempts
    },
    checkedAt: new Date().toISOString()
  };

  CACHE.set(date, { savedAt: Date.now(), result });
  return json(200, result);
}

function retryable(status, message) {
  return status === 0 || status === 408 || status === 425 || status === 429 ||
    status >= 500 || /timeout|socket|fetch failed|temporar/i.test(String(message || ""));
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
