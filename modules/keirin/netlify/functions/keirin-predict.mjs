import { inferLines } from "../../keirin/parser/line-parser.mjs";
import { runKeirinEngine } from "../../keirin/engine/keirin-engine.mjs";
import { jsonResponse } from "../../keirin/parser/utils.mjs";

const VENUE_CODE_BY_NAME = {
  函館: "11", 青森: "12", いわき平: "13", 弥彦: "21", 前橋: "22",
  取手: "23", 宇都宮: "24", 大宮: "25", 西武園: "26", 京王閣: "27",
  立川: "28", 松戸: "31", 千葉: "32", 川崎: "34", 平塚: "35",
  小田原: "36", 伊東: "37", 静岡: "38", 名古屋: "42", 岐阜: "43",
  大垣: "44", 豊橋: "45", 富山: "46", 松阪: "47", 四日市: "48",
  福井: "51", 奈良: "53", 向日町: "54", 和歌山: "55", 岸和田: "56",
  玉野: "61", 広島: "62", 防府: "63", 高松: "71", 小松島: "73",
  高知: "74", 松山: "75", 小倉: "81", 久留米: "83", 武雄: "84",
  佐世保: "85", 別府: "86", 熊本: "87"
};

export default async function handler(req) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date") || "";
  const venueName = url.searchParams.get("venueName") || "競輪場";
  const raceNo = Number(url.searchParams.get("raceNo") || 0);
  const budget = Number(url.searchParams.get("budget") || 3000);
  const raceCardUrl = url.searchParams.get("raceCardUrl") || "";
  const venueCode =
    url.searchParams.get("venueCode") ||
    readVenueCode(raceCardUrl) ||
    VENUE_CODE_BY_NAME[venueName] ||
    "";

  if (!/^\d{8}$/.test(date) || !raceNo || !venueCode) {
    return jsonResponse(400, {
      ok: false,
      error: "競輪ブラウザ取得に必要な日付・会場コード・R番号が不足しています",
      requestAudit: { date, venueName, venueCode, raceNo }
    });
  }

  const serviceBase = String(process.env.KEIRIN_BROWSER_SERVICE_URL || "")
    .trim()
    .replace(/\/$/, "");

  if (!serviceBase) {
    return jsonResponse(500, {
      ok: false,
      error: "KEIRIN_BROWSER_SERVICE_URLが設定されていません"
    });
  }

  try {
    const browserResult = await requestBrowserService(serviceBase, {
      date,
      venueCode,
      venueName,
      raceNo
    });

    if (!browserResult.ok) {
      return jsonResponse(browserResult.status || 502, {
        ok: false,
        error: browserResult.data?.error || "競輪公式データ取得失敗",
        browserService: browserResult.data,
        requestAudit: { date, venueName, venueCode, raceNo }
      });
    }

    const officialData = browserResult.data.officialData || {};
    const basic = officialData.basic || {};
    const officialParticipants = Array.isArray(officialData.participants)
      ? officialData.participants
      : [];
    const officialLines = Array.isArray(officialData.lines)
      ? officialData.lines
      : [];

    const participants = officialParticipants.map(adaptParticipant);
    if (participants.length < 5) {
      return jsonResponse(422, {
        ok: false,
        error: "出走選手変換後の人数が不足しています",
        officialData,
        participantCount: participants.length
      });
    }

    const lineText = buildLineText(officialLines);
    const line = inferLines({ participants, lineText });
    const race = {
      id: `${date}-${basic.venueName || venueName}-${basic.raceNo || raceNo}`,
      venue: basic.venueName || venueName,
      venueCode,
      date: normalizeDate(basic.date) || date,
      raceNo: Number(basic.raceNo || raceNo),
      raceName: basic.raceName || "",
      grade: basic.grade || "",
      className: basic.className || "",
      deadline: basic.deadline || "",
      startTime: basic.startTime || "",
      lineConfidence: line.confidence,
      participants: line.participants
    };

    const odds = { ok: false, odds: {}, diagnostics: { source: "未接続" } };
    const prediction = runKeirinEngine({
      race,
      oddsByOrder: odds.odds,
      budget
    });

    return jsonResponse(200, {
      ok: prediction.audit.passed,
      race,
      odds,
      prediction,
      officialData,
      browserAudit: browserResult.data.audit || null,
      dataQuality: {
        lineConfidence: line.confidence,
        oddsAvailable: false,
        participantCount: participants.length,
        browserVersion: browserResult.data.diagnostics?.version || null
      },
      warnings: [
        ...line.warnings,
        "オッズ未取得・購入判断保留"
      ].filter(Boolean),
      checkedAt: new Date().toISOString()
    });
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      requestAudit: { date, venueName, venueCode, raceNo }
    });
  }
}

async function requestBrowserService(base, params) {
  const query = new URLSearchParams({
    date: params.date,
    venueCode: params.venueCode,
    venueName: params.venueName,
    raceNo: String(params.raceNo)
  });

  const candidates = [
    `${base}/keirin/race?${query}`,
    `${base}/keirin?${query}`,
    `${base}/api/keirin?${query}`,
    `${base}/race?${query}`,
    `${base}/fetch?${query}`
  ];

  const attempts = [];
  for (const endpoint of candidates) {
    try {
      const response = await fetch(endpoint, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(120000)
      });
      const text = await response.text();
      let data = null;
      try { data = JSON.parse(text); } catch {}

      attempts.push({
        endpoint: endpoint.replace(base, ""),
        status: response.status,
        parsed: data !== null
      });

      if (data && (data.officialData || data.ok === false)) {
        return {
          ok: response.ok && data.ok !== false,
          status: response.status,
          data: { ...data, endpointAudit: attempts }
        };
      }
    } catch (error) {
      attempts.push({
        endpoint: endpoint.replace(base, ""),
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    ok: false,
    status: 502,
    data: {
      ok: false,
      error: "競輪ブラウザサービスの取得エンドポイントを確認できません",
      endpointAudit: attempts
    }
  };
}

function adaptParticipant(item) {
  const number = Number(item.number || 0);
  const score = finite(item.score, 5);
  const escape = finite(item.escapeCount, 0);
  const makuri = finite(item.makuriCount, 0);
  const difference = finite(item.differenceCount, 0);
  const mark = finite(item.markCount, 0);
  const back = finite(item.backCount, 0);
  const activity = escape + makuri + difference + mark;

  return {
    number,
    name: item.name || `${number}番車`,
    registration: item.registration || "",
    prefecture: item.prefecture || "",
    className: item.className || "",
    style: item.style || "",
    officialScore: item.score ?? null,
    recentForm: clamp(4.5 + score / 25),
    startPower: clamp(4 + escape * 0.45 + back * 0.08),
    sprintPower: clamp(4 + makuri * 0.55 + score / 40),
    stamina: clamp(4 + back * 0.12 + escape * 0.25),
    attackTiming: clamp(4 + (escape + makuri) * 0.35),
    trackingSkill: clamp(4 + (difference + mark) * 0.35),
    finishPower: clamp(4 + difference * 0.5 + score / 35),
    lineTrust: clamp(activity ? 5 + mark * 0.2 : 5),
    venueSuitability: 5,
    sourceType: item.sourceType || null,
    sourcePath: item.sourcePath || null
  };
}

function buildLineText(lines) {
  if (!lines.length) return null;
  return [...lines]
    .sort((a, b) => Number(a.position || a.order) - Number(b.position || b.order))
    .map(item => String(item.number || ""))
    .filter(Boolean)
    .join("");
}

function readVenueCode(value) {
  if (!value) return "";
  try {
    const parsed = new URL(value);
    for (const key of ["jocd", "jcd", "bkcd", "venueCode"]) {
      const code = parsed.searchParams.get(key);
      if (code) return code.padStart(2, "0");
    }
  } catch {}
  return "";
}

function normalizeDate(value) {
  return String(value || "").replace(/\D/g, "");
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min = 0, max = 10) {
  return Math.min(max, Math.max(min, value));
}
