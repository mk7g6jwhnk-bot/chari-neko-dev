import { inferLines } from "../../keirin/parser/line-parser.mjs";
import { parseKeirinTrifectaOddsHtml } from "../../keirin/parser/odds-parser.mjs";
import { runKeirinEngine } from "../../keirin/engine/keirin-engine.mjs";
import { jsonResponse } from "../../keirin/parser/utils.mjs";
import { createNetlifyOfficialLineStore, resolveOfficialLines } from "../lib/keirin-official-line-store.mjs";

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
  return handleKeirinPredict(req);
}

export async function handleKeirinPredict(req, { officialLineStore } = {}) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date") || "";
  const venueName = url.searchParams.get("venueName") || "競輪場";
  const raceNo = Number(url.searchParams.get("raceNo") || 0);
  const budget = Number(url.searchParams.get("budget") || 3000);
  const raceCardUrl = url.searchParams.get("raceCardUrl") || "";
  const oddsUrl = url.searchParams.get("oddsUrl") || "";
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
    const currentOfficialLines = Array.isArray(officialData.lines)
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

    const browserAudit = browserResult.data.audit || {};
    const lineResolution = await resolveOfficialLines({
      request: { date, venueCode, raceNo },
      identity: {
        identityPassed: browserAudit.identityPassed === true,
        date: normalizeDate(basic.date || browserAudit.actual?.date),
        venueCode: browserAudit.expected?.venueCode || "",
        raceNo: Number(basic.raceNo || browserAudit.actual?.raceNo || 0)
      },
      currentLines: currentOfficialLines,
      venueName: basic.venueName || venueName,
      buildLineText,
      store: officialLineStore || createNetlifyOfficialLineStore()
    });
    const officialLines = lineResolution.lines;
    const lineText = lineResolution.lineText;
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

    const browserOdds = normalizeBrowserOdds(officialData.odds);
    const htmlOdds = browserOdds.ok
      ? null
      : await fetchOddsFromUrl(oddsUrl, { date, venueName, venueCode, raceNo });
    const odds = browserOdds.ok
      ? browserOdds
      : htmlOdds || browserOdds;
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
      lineText,
      lineSource: lineResolution.lineSource,
      lineFetchedAt: lineResolution.fetchedAt,
      browserAudit: browserResult.data.audit || null,
      dataQuality: {
        lineConfidence: line.confidence,
        lineSource: lineResolution.lineSource,
        lineFetchedAt: lineResolution.fetchedAt,
        effectiveLineCount: officialLines.length,
        oddsAvailable: odds.ok,
        participantCount: participants.length,
        browserVersion: browserResult.data.diagnostics?.version || null
      },
      warnings: [
        ...line.warnings,
        lineResolution.lineSource === "cached-official" ? "取得済み公式ラインを使用" : null,
        lineResolution.storageWarning,
        !odds.ok ? "オッズ未取得・購入判断保留" : null
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

  const endpoint = `${base}/keirin/race?${query}`;
  const startedAt = Date.now();

  try {
    const response = await fetch(endpoint, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(45000)
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {}

    if (!text) {
      return {
        ok: false,
        status: response.status || 502,
        data: {
          ok: false,
          error: "競輪ブラウザサービスから空の応答が返りました",
          endpointAudit: [{ endpoint: "/keirin/race", status: response.status, elapsedMs: Date.now() - startedAt }]
        }
      };
    }

    if (data) {
      return {
        ok: response.ok && data.ok !== false,
        status: response.status,
        data: {
          ...data,
          endpointAudit: [{ endpoint: "/keirin/race", status: response.status, parsed: true, elapsedMs: Date.now() - startedAt }]
        }
      };
    }

    return {
      ok: false,
      status: response.status || 502,
      data: {
        ok: false,
        error: "競輪ブラウザサービスの応答をJSONとして読み取れませんでした",
        responsePreview: text.slice(0, 300),
        endpointAudit: [{ endpoint: "/keirin/race", status: response.status, parsed: false, elapsedMs: Date.now() - startedAt }]
      }
    };
  } catch (error) {
    const timedOut = error instanceof Error && /timeout|abort/i.test(error.message);
    return {
      ok: false,
      status: 504,
      data: {
        ok: false,
        error: timedOut
          ? "競輪公式データ取得が45秒以内に完了しませんでした"
          : "競輪ブラウザサービスへの接続に失敗しました",
        detail: error instanceof Error ? error.message : String(error),
        endpointAudit: [{ endpoint: "/keirin/race", elapsedMs: Date.now() - startedAt }]
      }
    };
  }
}

function normalizeBrowserOdds(value) {
  const raw = value && typeof value === "object" ? value : {};
  const sourceOdds = raw.odds && typeof raw.odds === "object" ? raw.odds : {};
  const odds = {};
  for (const [key, oddValue] of Object.entries(sourceOdds)) {
    const match = String(key).match(/^([1-9])-([1-9])-([1-9])$/);
    const odd = Number(oddValue);
    if (!match || new Set(match.slice(1)).size !== 3) continue;
    if (!Number.isFinite(odd) || odd <= 1) continue;
    odds[key] = odd;
  }
  return {
    ok: Object.keys(odds).length > 0,
    odds,
    diagnostics: {
      ...(raw.diagnostics || {}),
      source: raw.diagnostics?.source || "browser-official-json",
      parsedCount: Object.keys(odds).length
    }
  };
}

async function fetchOddsFromUrl(oddsUrl, context) {
  if (!oddsUrl) {
    return { ok: false, odds: {}, diagnostics: { source: "odds-url-missing" } };
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(oddsUrl);
  } catch {
    return { ok: false, odds: {}, diagnostics: { source: "odds-url-invalid" } };
  }

  if (!/(^|\.)keirin\.jp$/i.test(parsedUrl.hostname)) {
    return { ok: false, odds: {}, diagnostics: { source: "odds-url-domain-rejected" } };
  }

  try {
    const response = await fetch(parsedUrl, {
      redirect: "follow",
      headers: {
        accept: "text/html,application/xhtml+xml",
        "accept-language": "ja",
        "user-agent": "Mozilla/5.0 (compatible; ChariNekoDev/0.5; personal-use)"
      },
      signal: AbortSignal.timeout(30000)
    });
    const html = await response.text();
    if (!response.ok) {
      return {
        ok: false,
        odds: {},
        diagnostics: { source: "odds-url-http", status: response.status }
      };
    }
    const result = parseKeirinTrifectaOddsHtml(html, {
      ...context,
      sourceUrl: parsedUrl.toString()
    });
    return {
      ...result,
      diagnostics: {
        ...result.diagnostics,
        source: "discovered-odds-html",
        status: response.status
      }
    };
  } catch (error) {
    return {
      ok: false,
      odds: {},
      diagnostics: {
        source: "odds-url-fetch-error",
        error: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

export function adaptParticipant(item) {
  const number = Number(item.number || 0);
  const score = finite(item.score, 5);
  const escape = finite(item.escapeCount, 0);
  const makuri = finite(item.makuriCount, 0);
  const difference = finite(item.differenceCount, 0);
  const mark = finite(item.markCount, 0);
  const back = finite(item.backCount, 0);
  const activity = escape + makuri + difference + mark;

  return {
    id: String(number),
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

export function buildLineText(lines) {
  if (!lines.length) return null;
  const ordered = [...lines]
    .map(item => ({
      number: Number(item.number),
      position: Number(item.position || item.order)
    }))
    .filter(item => item.number >= 1 && item.number <= 9 && Number.isFinite(item.position))
    .sort((a, b) => a.position - b.position);
  const groups = [];
  let group = [];
  let previousPosition = null;
  for (const item of ordered) {
    if (previousPosition !== null && item.position > previousPosition + 1) {
      groups.push(group);
      group = [];
    }
    group.push(String(item.number));
    previousPosition = item.position;
  }
  if (group.length) groups.push(group);
  return groups.map(items => items.join("")).join(" ") || null;
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
