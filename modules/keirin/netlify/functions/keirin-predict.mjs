import { inferLines } from "../../keirin/parser/line-parser.mjs";
import { runKeirinEngine } from "../../keirin/engine/keirin-engine.mjs";
import { jsonResponse } from "../../keirin/parser/utils.mjs";

export default async function handler(req) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date") || "";
  const venueCode = String(url.searchParams.get("venueCode") || "").padStart(2, "0");
  const venueName = url.searchParams.get("venueName") || "競輪場";
  const raceNo = Number(url.searchParams.get("raceNo") || 0);
  const budget = Number(url.searchParams.get("budget") || 3000);
  const serviceBase = String(process.env.KEIRIN_BROWSER_SERVICE_URL || "").replace(/\/+$/, "");

  if (!/^\d{8}$/.test(date)) {
    return jsonResponse(400, { ok: false, error: "日付形式不正" });
  }
  if (!/^\d{2}$/.test(venueCode)) {
    return jsonResponse(400, { ok: false, error: "会場コード不正" });
  }
  if (!Number.isInteger(raceNo) || raceNo < 1 || raceNo > 12) {
    return jsonResponse(400, { ok: false, error: "レース番号不正" });
  }
  if (!serviceBase) {
    return jsonResponse(500, {
      ok: false,
      error: "KEIRIN_BROWSER_SERVICE_URLが設定されていません"
    });
  }

  const query = new URLSearchParams({
    date,
    venueCode,
    venueName,
    raceNo: String(raceNo)
  });

  try {
    const response = await fetch(`${serviceBase}/keirin/race?${query}`, {
      headers: {
        accept: "application/json",
        "user-agent": "ChariNekoNetlifyAdapter/1.0.2"
      },
      cache: "no-store"
    });

    const text = await response.text();
    let official;
    try {
      official = JSON.parse(text);
    } catch {
      return jsonResponse(502, {
        ok: false,
        error: "競輪取得サービスの応答がJSONではありません",
        preview: text.slice(0, 300)
      });
    }

    if (!response.ok || !official?.ok) {
      return jsonResponse(response.status || 502, {
        ok: false,
        error: official?.error || "競輪公式データ取得失敗",
        browserService: official
      });
    }

    const adapted = adaptOfficialData({
      officialData: official.officialData,
      requested: { date, venueCode, venueName, raceNo }
    });

    if (!adapted.ok) {
      return jsonResponse(422, {
        ok: false,
        error: adapted.error,
        adapted,
        browserServiceAudit: official.audit,
        browserServiceDiagnostics: official.diagnostics
      });
    }

    const line = inferLines({
      participants: adapted.race.participants,
      lineText: adapted.lineText
    });

    const race = {
      ...adapted.race,
      lineConfidence: line.confidence,
      participants: line.participants
    };

    const odds = {
      ok: false,
      odds: {},
      diagnostics: {
        source: "browser-service",
        note: "オッズJSONは未接続"
      }
    };

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
      officialData: official.officialData,
      browserServiceAudit: official.audit,
      dataQuality: {
        lineConfidence: line.confidence,
        oddsAvailable: false,
        participantCount: race.participants.length,
        identityPassed: official.audit?.identityPassed === true
      },
      warnings: [
        ...line.warnings,
        "オッズ未取得・購入判断保留"
      ],
      checkedAt: new Date().toISOString()
    });
  } catch (error) {
    return jsonResponse(502, {
      ok: false,
      error: error instanceof Error
        ? `競輪取得サービス接続失敗: ${error.message}`
        : "競輪取得サービス接続失敗"
    });
  }
}

function adaptOfficialData({ officialData, requested }) {
  const basic = officialData?.basic || {};
  const sourceParticipants = Array.isArray(officialData?.participants)
    ? officialData.participants
    : [];
  const lines = Array.isArray(officialData?.lines)
    ? officialData.lines
    : [];

  const actualVenue = String(basic.venueName || basic.venue || "");
  const actualDate = String(basic.date || "").replace(/\D/g, "");
  const actualRaceNo = Number(basic.raceNo || 0);

  if (
    actualVenue !== requested.venueName ||
    actualDate !== requested.date ||
    actualRaceNo !== requested.raceNo
  ) {
    return {
      ok: false,
      error: "公式データの会場・日付・R番号が選択内容と一致しません",
      expected: requested,
      actual: {
        venueName: actualVenue,
        date: actualDate,
        raceNo: actualRaceNo
      }
    };
  }

  const participants = sourceParticipants
    .map(adaptParticipant)
    .filter(Boolean)
    .sort((a, b) => a.number - b.number);

  if (participants.length < 5 || participants.length > 9) {
    return {
      ok: false,
      error: "出走選手数の監査に合格しません",
      participantCount: participants.length,
      sourceParticipants
    };
  }

  const numbers = participants.map(item => item.number);
  if (new Set(numbers).size !== numbers.length) {
    return {
      ok: false,
      error: "車番重複を検出しました",
      numbers
    };
  }

  return {
    ok: true,
    lineText: buildLineText(lines, numbers),
    race: {
      id: `${requested.date}-${requested.venueCode}-${requested.raceNo}`,
      venue: actualVenue,
      venueCode: requested.venueCode,
      raceNo: actualRaceNo,
      date: actualDate,
      deadline: String(basic.deadline || "") || null,
      startTime: String(basic.startTime || "") || null,
      raceName: String(basic.raceName || ""),
      grade: String(basic.grade || ""),
      className: String(basic.className || ""),
      participants
    }
  };
}

function adaptParticipant(item) {
  const number = toNumber(item?.number);
  if (!Number.isInteger(number) || number < 1 || number > 9) {
    return null;
  }

  const score = nullableNumber(item.score);
  const escapeCount = nonNegative(item.escapeCount);
  const makuriCount = nonNegative(item.makuriCount);
  const differenceCount = nonNegative(item.differenceCount);
  const markCount = nonNegative(item.markCount);
  const backCount = nonNegative(item.backCount);

  return {
    id: `K${item.registration || number}`,
    number,
    name: String(item.name || `車番${number}`),
    registration: String(item.registration || "") || null,
    prefecture: String(item.prefecture || "") || null,
    className: String(item.className || "") || null,
    style: String(item.style || "") || null,
    score,
    recentForm: score === null ? 5 : clamp((score - 80) / 4),
    startPower: clamp(4 + backCount * 0.7 + escapeCount * 0.4),
    sprintPower: clamp(4 + makuriCount * 0.8),
    stamina: clamp(4 + backCount * 0.7 + escapeCount * 0.5),
    attackTiming: clamp(4 + Math.max(escapeCount, makuriCount) * 0.7),
    trackingSkill: clamp(4 + markCount * 0.8),
    finishPower: clamp(4 + differenceCount * 0.8 + markCount * 0.25),
    lineTrust: 5,
    venueSuitability: 5,
    officialCounts: {
      escapeCount,
      makuriCount,
      differenceCount,
      markCount,
      backCount
    }
  };
}

function buildLineText(lines, validNumbers) {
  if (!Array.isArray(lines) || !lines.length) return null;

  const valid = new Set(validNumbers);
  const normalized = lines
    .map(item => ({
      number: toNumber(item.number),
      order: toNumber(item.order) || 99,
      position: toNumber(item.position) || 99,
      group: String(item.className || "").trim()
    }))
    .filter(item => valid.has(item.number));

  if (normalized.length < Math.max(3, validNumbers.length - 2)) {
    return null;
  }

  const meaningfulGroups = new Set(
    normalized.map(item => item.group).filter(Boolean)
  );

  if (meaningfulGroups.size >= 2) {
    const grouped = new Map();
    for (const item of normalized) {
      const key = item.group || `solo-${item.number}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(item);
    }
    return [...grouped.values()]
      .map(group => group
        .sort((a, b) => a.position - b.position || a.order - b.order)
        .map(item => item.number)
        .join("-"))
      .join("|");
  }

  return null;
}

function clamp(value, min = 0, max = 10) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function nonNegative(value) {
  const number = nullableNumber(value);
  return number === null ? 0 : Math.max(0, number);
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) ? number : null;
}

function toNumber(value) {
  const number = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) ? number : 0;
}
