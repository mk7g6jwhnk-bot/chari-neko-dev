const DISCOVER_CACHE = new Map();
const RETRY_DELAYS = [0, 700, 1600];

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
      error: "KEIRIN_BROWSER_SERVICE_URLが設定されていません",
    });
  }

  const attempts = [];

  for (let i = 0; i < RETRY_DELAYS.length; i += 1) {
    if (RETRY_DELAYS[i]) await sleep(RETRY_DELAYS[i]);

    try {
      const response = await fetch(
        `${base}/keirin/discover?${new URLSearchParams({ date })}`,
        {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(90000),
        },
      );

      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      attempts.push({
        attempt: i + 1,
        status: response.status,
        error: payload?.error || null,
      });

      if (!response.ok || payload?.ok === false) {
        if (
          i < RETRY_DELAYS.length - 1 &&
          isRetryable(response.status, payload?.error)
        ) {
          continue;
        }
        break;
      }

      if (String(payload?.date || "") !== date) {
        attempts.push({
          attempt: i + 1,
          error: "開催取得結果の日付が要求と一致しません",
        });
        break;
      }

      const meetings = (
        Array.isArray(payload?.meetings) ? payload.meetings : []
      )
        .filter(
          (meeting) =>
            String(meeting?.date || date) === date &&
            meeting?.identityPassed === true &&
            String(meeting?.venueCode || "") !== "32" &&
            Array.isArray(meeting?.raceNumbers) &&
            meeting.raceNumbers.length > 0,
        )
        .map((meeting) => adaptMeeting(base, date, meeting));

      const result = {
        ok: true,
        date,
        meetings,
        diagnostics: {
          source: "KEIRIN_BROWSER_SERVICE_URL",
          railwayMeetingCount: Array.isArray(payload?.meetings)
            ? payload.meetings.length
            : 0,
          adaptedMeetingCount: meetings.length,
          attempts,
        },
        checkedAt: new Date().toISOString(),
      };

      if (meetings.length) {
        DISCOVER_CACHE.set(date, { savedAt: Date.now(), result });
      }

      return jsonResponse(200, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      attempts.push({
        attempt: i + 1,
        error: message,
      });

      if (
        i < RETRY_DELAYS.length - 1 &&
        isRetryable(0, message)
      ) {
        continue;
      }
      break;
    }
  }

  const cached = DISCOVER_CACHE.get(date);

  if (cached && Date.now() - cached.savedAt < 6 * 60 * 60 * 1000) {
    return jsonResponse(200, {
      ...cached.result,
      stale: true,
      warning:
        "開催取得サービスが一時停止したため、直近の開催情報を表示しています。",
      diagnostics: {
        ...(cached.result.diagnostics || {}),
        fallback: "warm-cache",
        attempts,
      },
    });
  }

  return jsonResponse(502, {
    ok: false,
    error:
      "開催情報取得サービスが一時的に停止しています。数秒後に再試行してください。",
    attempts,
  });
}

function adaptMeeting(base, date, meeting) {
  const venueCode = String(meeting.venueCode || "").padStart(2, "0");
  const venueName = String(meeting.venueName || "");

  const raceUrl = `${base}/keirin/race?${new URLSearchParams({
    date,
    venueCode,
    venueName,
    raceNo: "1",
  })}`;

  return {
    date,
    venueCode,
    venueName,
    raceNumbers: meeting.raceNumbers
      .map(Number)
      .filter(Number.isInteger),
    races: Array.isArray(meeting.races)
      ? meeting.races
          .map((race) => ({
            raceNo: Number(race.raceNo),
            deadline: String(race.deadline || ""),
            startTime: String(race.startTime || ""),
          }))
          .filter((race) => Number.isInteger(race.raceNo))
      : [],
    identityPassed: true,
    verifiedMeeting: true,
    discoveredUrl: raceUrl,
    discovery: {
      ok: true,
      links: {
        raceCards: [],
        odds: [],
        results: [],
        other: [
          {
            text: "公式出走表",
            context: `${venueName} ${date}`,
            url: raceUrl,
          },
        ],
      },
      diagnostics: {
        source: "railway-adapter",
      },
    },
  };
}

function isRetryable(status, message) {
  return (
    status === 0 ||
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status >= 500 ||
    /page crashed|target closed|browser|navigation|timeout|timed out|socket|fetch failed/i.test(
      String(message || ""),
    )
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
