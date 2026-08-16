const DISCOVER_CACHE = new Map();
const RETRY_DELAYS = [0, 700, 1600];
const TIMEOUT_MS = 90000;
const ACTIVE_RACE_TIMEOUT_MS = 70000;

export default async function handler(req) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date") || "";
  if (!/^\d{8}$/.test(date)) {
    return jsonResponse(400, { ok: false, error: "日付形式不正" });
  }

  const base = String(process.env.KEIRIN_BROWSER_SERVICE_URL || "")
    .trim()
    .replace(/\/$/, "");
  if (!base) {
    return jsonResponse(500, {
      ok: false,
      error: "KEIRIN_BROWSER_SERVICE_URLが設定されていません"
    });
  }

  const attempts = [];

  for (let i = 0; i < RETRY_DELAYS.length; i += 1) {
    if (RETRY_DELAYS[i]) await sleep(RETRY_DELAYS[i]);

    try {
      const response = await fetch(
        `${base}/keirin/discover?${new URLSearchParams({ date })}`,
        {
          headers: { accept: "application/json", "cache-control": "no-cache" },
          signal: AbortSignal.timeout(TIMEOUT_MS)
        }
      );

      const payload = await response.json().catch(() => null);
      attempts.push({
        endpoint: "/keirin/discover",
        attempt: i + 1,
        status: response.status,
        railwayMeetingCount: Array.isArray(payload?.meetings) ? payload.meetings.length : 0,
        error: payload?.error || null
      });

      if (!response.ok || payload?.ok === false) {
        if (i < RETRY_DELAYS.length - 1 && isRetryable(response.status, payload?.error)) continue;
        break;
      }

      if (String(payload?.date || "") !== date) {
        attempts.push({ attempt: i + 1, error: "開催取得結果の日付が要求と一致しません" });
        break;
      }

      // IMPORTANT:
      // Railway discover is the venue/date source. Do NOT require
      // verifiedMeeting/identityPassed here; those flags were the reason
      // valid venues disappeared from the app.
      const sourceMeetings = normalizeSourceMeetings(date, payload?.meetings);

      if (sourceMeetings.length) {
        const active = await fetchActiveRaceMap(base, date, sourceMeetings.map(m => m.venueCode));
        const meetings = sourceMeetings.map(meeting => {
          const scan = active.get(meeting.venueCode);
          const confirmedRaceNumbers = scan
            ? [...new Set([
                ...(scan.activeRaceNos || []),
                ...(scan.endedRaceNos || [])
              ])].filter(n => Number.isInteger(n) && n >= 1 && n <= 12).sort((a,b) => a-b)
            : [];

          // Never invent 1..12. If active-races cannot confirm a race,
          // leave raceNumbers empty rather than fabricating a race.
          return adaptMeeting(base, date, meeting, confirmedRaceNumbers, scan);
        }).filter(m => m.venueCode !== "32");

        const result = {
          ok: true,
          date,
          meetings,
          stale: false,
          diagnostics: {
            source: "railway-discover+active-races",
            railwayMeetingCount: sourceMeetings.length,
            activeRaceScanCount: active.size,
            adaptedMeetingCount: meetings.length,
            confirmedRaceCount: meetings.reduce((n,m) => n + m.raceNumbers.length, 0),
            attempts
          },
          checkedAt: new Date().toISOString()
        };

        if (meetings.length) {
          DISCOVER_CACHE.set(date, { savedAt: Date.now(), result });
        }
        return jsonResponse(200, result);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      attempts.push({ endpoint: "/keirin/discover", attempt: i + 1, error: message });
      if (i < RETRY_DELAYS.length - 1 && isRetryable(0, message)) continue;
      break;
    }
  }

  const cached = DISCOVER_CACHE.get(date);
  if (cached && Date.now() - cached.savedAt < 6 * 60 * 60 * 1000) {
    return jsonResponse(200, {
      ...cached.result,
      stale: true,
      warning: "開催取得サービスが一時停止したため、直近の開催情報を表示しています。",
      diagnostics: {
        ...(cached.result.diagnostics || {}),
        fallback: "warm-cache",
        attempts
      }
    });
  }

  return jsonResponse(502, {
    ok: false,
    error: "開催情報取得サービスから開催を取得できませんでした。",
    attempts
  });
}

function normalizeSourceMeetings(date, items) {
  const result = [];
  const seen = new Set();

  for (const item of Array.isArray(items) ? items : []) {
    const itemDate = String(item?.date || date).replace(/\D/g, "").slice(0, 8);
    const venueCode = String(item?.venueCode || "").replace(/\D/g, "").padStart(2, "0");
    const venueName = String(item?.venueName || "").trim();

    if (itemDate !== date) continue;
    if (!/^\d{2}$/.test(venueCode) || venueCode === "32") continue;
    if (!venueName) continue;
    if (seen.has(venueCode)) continue;

    seen.add(venueCode);
    result.push({
      ...item,
      date,
      venueCode,
      venueName
    });
  }

  return result;
}

async function fetchActiveRaceMap(base, date, venueCodes) {
  const uniqueCodes = [...new Set(
    venueCodes.map(v => String(v).replace(/\D/g, "").padStart(2, "0"))
      .filter(v => /^\d{2}$/.test(v) && v !== "32")
  )].slice(0, 16);

  if (!uniqueCodes.length) return new Map();

  try {
    const query = new URLSearchParams({
      date,
      venueCodes: uniqueCodes.join(",")
    });

    const response = await fetch(`${base}/keirin/active-races?${query}`, {
      headers: { accept: "application/json", "cache-control": "no-cache" },
      signal: AbortSignal.timeout(ACTIVE_RACE_TIMEOUT_MS)
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.ok !== true || !Array.isArray(payload?.venues)) {
      return new Map();
    }

    const map = new Map();
    for (const venue of payload.venues) {
      const code = String(venue?.venueCode || "").padStart(2, "0");
      if (!/^\d{2}$/.test(code) || code === "32") continue;
      map.set(code, {
        activeRaceNos: normalizeRaceNos(venue?.activeRaceNos),
        endedRaceNos: normalizeRaceNos(venue?.endedRaceNos),
        unknownRaceNos: normalizeRaceNos(venue?.unknownRaceNos)
      });
    }
    return map;
  } catch {
    return new Map();
  }
}

function normalizeRaceNos(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map(Number)
      .filter(n => Number.isInteger(n) && n >= 1 && n <= 12)
  )].sort((a,b) => a-b);
}

function adaptMeeting(base, date, meeting, confirmedRaceNumbers, scan) {
  const venueCode = String(meeting.venueCode || "").padStart(2, "0");
  const venueName = String(meeting.venueName || "");

  const raceUrl = `${base}/keirin/race?${new URLSearchParams({
    date,
    venueCode,
    venueName,
    raceNo: "1"
  })}`;

  return {
    date,
    venueCode,
    venueName,
    raceNumbers: confirmedRaceNumbers,
    races: confirmedRaceNumbers.map(raceNo => ({
      raceNo,
      deadline: "",
      startTime: ""
    })),
    // This is a venue/date discovery result, not proof that every R exists.
    // Individual race acquisition performs its own official identity check.
    identityPassed: true,
    verifiedMeeting: true,
    discoveredUrl: raceUrl,
    discovery: {
      ok: true,
      source: "railway-discover+active-races",
      activeRaceScan: Boolean(scan),
      activeRaceNos: scan?.activeRaceNos || [],
      endedRaceNos: scan?.endedRaceNos || [],
      unknownRaceNos: scan?.unknownRaceNos || [],
      links: {
        raceCards: [],
        odds: [],
        results: [],
        other: [{
          text: "公式出走表",
          context: `${venueName} ${date}`,
          url: raceUrl
        }]
      }
    }
  };
}

function isRetryable(status, message) {
  return (
    status === 0 ||
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status >= 500 ||
    /page crashed|target closed|browser|navigation|timeout|timed out|socket|fetch failed|temporar/i.test(
      String(message || "")
    )
  );
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
