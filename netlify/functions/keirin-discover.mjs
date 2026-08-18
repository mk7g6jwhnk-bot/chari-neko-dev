import { load as loadHtml } from "cheerio";

const CACHE = new Map();
const RETRIES = [0, 700, 1600];
const VERSION = "keirin-discover-v8-official-schedule-race-probe";

const VENUE_CODES = {
  函館:"11", 青森:"12", いわき平:"13", 弥彦:"21", 前橋:"22", 取手:"23", 宇都宮:"24",
  大宮:"25", 西武園:"26", 京王閣:"27", 立川:"28", 松戸:"31", 千葉:"32", 川崎:"34",
  平塚:"35", 小田原:"36", 伊東:"37", 静岡:"38", 名古屋:"42", 岐阜:"43", 大垣:"44",
  豊橋:"45", 富山:"46", 松阪:"47", 四日市:"48", 福井:"51", 奈良:"53", 向日町:"54",
  和歌山:"55", 岸和田:"56", 玉野:"61", 広島:"62", 防府:"63", 高松:"71",
  小松島:"73", 高知:"74", 松山:"75", 小倉:"81", 久留米:"83", 武雄:"84",
  佐世保:"85", 別府:"86", 熊本:"87"
};

export default async function handler(req) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date") || "";

  if (!/^\d{8}$/.test(date)) {
    return jsonResponse(400, { ok: false, error: "日付形式不正" });
  }

  const base = String(process.env.KEIRIN_BROWSER_SERVICE_URL || "")
    .trim()
    .replace(/\/$/, "");

  const attempts = [];
  let railwayMeetings = [];

  if (base) {
    for (let i = 0; i < RETRIES.length; i += 1) {
      if (RETRIES[i]) await sleep(RETRIES[i]);

      try {
        const response = await fetch(
          `${base}/keirin/discover?${new URLSearchParams({ date })}`,
          {
            headers: { accept: "application/json", "cache-control": "no-cache" },
            signal: AbortSignal.timeout(90000)
          }
        );

        const payload = await response.json().catch(() => null);
        railwayMeetings = Array.isArray(payload?.meetings) ? payload.meetings : [];

        attempts.push({
          stage: "railway-discover",
          attempt: i + 1,
          status: response.status,
          meetingCount: railwayMeetings.length,
          error: payload?.error || null
        });

        if (
          response.ok &&
          payload?.ok !== false &&
          String(payload?.date || date) === date
        ) {
          break;
        }

        if (i < RETRIES.length - 1 && isRetryable(response.status, payload?.error)) {
          continue;
        }
      } catch (error) {
        attempts.push({
          stage: "railway-discover",
          attempt: i + 1,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  } else {
    attempts.push({ stage: "railway-discover", error: "KEIRIN_BROWSER_SERVICE_URL未設定" });
  }

  /*
   * Railway discoverが「200だが0件」でも、ここで終了しない。
   * KEIRIN.JP公式開催日程から開催会場を再取得する。
   */
  let source = normalizeMeetings(date, railwayMeetings);
  let sourceName = "railway-discover";

  if (!source.length) {
    try {
      source = await discoverOfficialSchedule(date, attempts);
      sourceName = "keirin-jp-official-schedule";
    } catch (error) {
      attempts.push({
        stage: "official-schedule",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /*
   * R番号がRailway discoverから来ていない場合は、
   * /keirin/race を実際に叩いてRの存在を確認する。
   * 1〜12を無条件で採用しない。
   */
  const meetings = [];

  for (const meeting of source) {
    let raceNumbers = normalizeRaceNumbers(meeting.raceNumbers);

    if (!raceNumbers.length && base) {
      raceNumbers = [];
      for (let raceNo = 1; raceNo <= 12; raceNo += 1) {
        const confirmed = await probeRace(
          base,
          date,
          meeting.venueCode,
          meeting.venueName,
          raceNo,
          attempts
        );
        if (confirmed) raceNumbers.push(raceNo);
      }
    }

    if (!raceNumbers.length) continue;

    meetings.push({
      date,
      venueCode: meeting.venueCode,
      venueName: meeting.venueName,
      raceNumbers,
      races: Array.isArray(meeting.races) && meeting.races.length
        ? meeting.races
            .map((race) => ({
              raceNo: Number(race?.raceNo),
              deadline: String(race?.deadline || ""),
              startTime: String(race?.startTime || "")
            }))
            .filter((race) => Number.isInteger(race.raceNo))
        : raceNumbers.map((raceNo) => ({
            raceNo,
            deadline: "",
            startTime: ""
          })),
      identityPassed: true,
      verifiedMeeting: true,
      discoveredUrl: `${base}/keirin/race?${new URLSearchParams({
        date,
        venueCode: meeting.venueCode,
        venueName: meeting.venueName,
        raceNo: String(raceNumbers[0])
      })}`,
      discovery: {
        ok: true,
        source: VERSION,
        sourceName,
        links: {
          raceCards: [],
          odds: [],
          results: [],
          other: [{
            text: "公式出走表",
            context: `${meeting.venueName} ${date}`,
            url: `${base}/keirin/race?${new URLSearchParams({
              date,
              venueCode: meeting.venueCode,
              venueName: meeting.venueName,
              raceNo: String(raceNumbers[0])
            })}`
          }]
        }
      }
    });
  }

  if (meetings.length) {
    const result = {
      ok: true,
      date,
      meetings,
      stale: false,
      diagnostics: {
        source: VERSION,
        sourceName,
        railwayMeetingCount: railwayMeetings.length,
        meetingCount: meetings.length,
        raceCount: meetings.reduce((sum, meeting) => sum + meeting.raceNumbers.length, 0),
        attempts
      },
      checkedAt: new Date().toISOString()
    };

    CACHE.set(date, { savedAt: Date.now(), result });
    return jsonResponse(200, result);
  }

  const cached = CACHE.get(date);
  if (cached && Date.now() - cached.savedAt < 6 * 60 * 60 * 1000) {
    return jsonResponse(200, {
      ...cached.result,
      stale: true,
      warning: "開催取得に失敗したため、直近の取得結果を表示しています。",
      diagnostics: {
        ...(cached.result.diagnostics || {}),
        fallback: "warm-cache",
        attempts
      }
    });
  }

  return jsonResponse(200, {
    ok: true,
    date,
    meetings: [],
    stale: true,
    warning: "指定日の開催を確認できませんでした。",
    diagnostics: {
      source: VERSION,
      railwayMeetingCount: railwayMeetings.length,
      attempts
    },
    checkedAt: new Date().toISOString()
  });
}

function normalizeMeetings(date, items) {
  const seen = new Set();
  const meetings = [];

  for (const item of Array.isArray(items) ? items : []) {
    const itemDate = String(item?.date || date).replace(/\D/g, "").slice(0, 8);
    const venueCode = String(item?.venueCode || item?.code || "")
      .replace(/\D/g, "")
      .padStart(2, "0");
    const venueName = String(item?.venueName || item?.name || "").trim();

    if (itemDate !== date) continue;
    if (!/^\d{2}$/.test(venueCode)) continue;
    if (venueCode === "32") continue;
    if (!venueName || seen.has(venueCode)) continue;

    meetings.push({
      date,
      venueCode,
      venueName,
      raceNumbers: normalizeRaceNumbers(item?.raceNumbers),
      races: Array.isArray(item?.races) ? item.races : []
    });

    seen.add(venueCode);
  }

  return meetings;
}

async function discoverOfficialSchedule(date, attempts) {
  const year = date.slice(0, 4);
  const month = date.slice(4, 6);
  const day = Number(date.slice(6, 8));

  const scheduleUrl = `https://www.keirin.jp/pc/raceschedule?${new URLSearchParams({
    scym: month,
    scyy: year
  })}`;

  const response = await fetch(scheduleUrl, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "ChariNeko/keirin-discover-v8"
    },
    signal: AbortSignal.timeout(20000)
  });

  if (!response.ok) {
    throw new Error(`KEIRIN.JP開催日程 HTTP ${response.status}`);
  }

  const html = await response.text();
  const $ = loadHtml(html);
  const meetings = [];
  const seen = new Set();

  $("tr").each((_index, tr) => {
    const cells = $(tr).children("th,td");
    if (cells.length < day + 1) return;

    const rawName = $(cells[0]).text().replace(/\s+/g, "").trim();
    const venueName = Object.keys(VENUE_CODES).find(
      (name) =>
        rawName === name ||
        rawName === `${name}競輪場` ||
        rawName.includes(name)
    );

    if (!venueName) return;

    const target = cells.eq(day);
    const active =
      target.find("img,a").length > 0 ||
      target.text().replace(/\s+/g, "").length > 0;

    if (!active) return;

    const venueCode = VENUE_CODES[venueName];
    if (venueCode === "32" || seen.has(venueCode)) return;

    meetings.push({
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
    venueCount: meetings.length,
    scheduleUrl
  });

  return meetings;
}

async function probeRace(base, date, venueCode, venueName, raceNo, attempts) {
  try {
    const response = await fetch(
      `${base}/keirin/race?${new URLSearchParams({
        date,
        venueCode,
        venueName,
        raceNo: String(raceNo)
      })}`,
      {
        headers: { accept: "application/json", "cache-control": "no-cache" },
        signal: AbortSignal.timeout(25000)
      }
    );

    const data = await response.json().catch(() => null);
    const participants = Array.isArray(data?.officialData?.participants)
      ? data.officialData.participants.length
      : 0;

    const ok =
      response.ok &&
      data?.ok !== false &&
      participants >= 5;

    attempts.push({
      stage: "race-probe",
      venueCode,
      raceNo,
      status: response.status,
      participantCount: participants,
      confirmed: ok
    });

    return ok;
  } catch (error) {
    attempts.push({
      stage: "race-probe",
      venueCode,
      raceNo,
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

function normalizeRaceNumbers(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= 12)
  )].sort((a, b) => a - b);
}

function isRetryable(status, message) {
  return (
    status === 0 ||
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status >= 500 ||
    /timeout|timed out|socket|fetch failed|target closed|browser|navigation|temporar/i.test(
      String(message || "")
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
      "cache-control": "no-store"
    }
  });
}
