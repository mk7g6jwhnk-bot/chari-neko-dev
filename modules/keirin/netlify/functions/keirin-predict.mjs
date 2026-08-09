import { inferLines } from "../../keirin/parser/line-parser.mjs";
import { runKeirinEngine } from "../../keirin/engine/keirin-engine.mjs";
import { applyRecentFormEvidence } from "../../keirin/recent-form/recent-form.mjs";
import { applyStartPowerEvidence } from "../../keirin/start-power/start-power.mjs";
import { applyKimariteAbilities } from "../../keirin/kimarite/kimarite-abilities.mjs";
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
    const rawOfficialParticipants = Array.isArray(officialData.participants)
      ? officialData.participants
      : [];
    const officialParticipants = hydrateParticipantEvidence(
      rawOfficialParticipants,
      officialData,
      browserResult.data
    );
    const officialLines = Array.isArray(officialData.lines)
      ? officialData.lines
      : [];

    const raceCategory = detectRaceCategory({ basic, participants: officialParticipants });
    const participantContext = {
      raceDate: normalizeDate(basic.date) || date,
      raceStartTime: basic.startTime || "",
      venueCode: String(venueCode).padStart(2, "0"),
      raceNo: Number(basic.raceNo || raceNo),
      raceCategory
    };
    const participants = adaptParticipantsForPrediction(officialParticipants, participantContext);
    if (participants.length < 5) {
      return jsonResponse(422, {
        ok: false,
        error: "出走選手変換後の人数が不足しています",
        officialData,
        participantCount: participants.length
      });
    }

    const lineText = buildLineText(officialLines);
    const line = resolveOfficialLines({ participants, officialLines, lineText });
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

    const odds = normalizeOfficialOdds(officialData.odds);
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
        lineSource: line.source || null,
        officialLineItemCount: officialLines.length,
        officialLineText: lineText,
        oddsAvailable: Object.keys(odds.odds).length > 0,
        participantCount: participants.length,
        browserVersion: browserResult.data.diagnostics?.version || null,
        officialProfileEvidenceCount: participants.filter(item => item.officialProfileEvidence?.identityPassed === true).length,
        officialKimariteEvidenceCount: participants.filter(item => item.officialKimariteEvidence?.identityPassed === true).length,
        nonNeutralRecentFormCount: participants.filter(item => Math.abs(Number(item.recentForm) - 5) > 0.000001).length,
        nonNeutralStartPowerCount: participants.filter(item => Math.abs(Number(item.startPower) - 5) > 0.000001).length,
        nonNeutralKimariteAbilityCount: participants.filter(item =>
          [item.sprintPower, item.finishPower, item.trackingSkill].some(value => Math.abs(Number(value) - 5) > 0.000001)
        ).length
      },
      warnings: [
        ...line.warnings,
        Object.keys(odds.odds).length ? null : "オッズ未取得・高配当判定保留"
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
    `${base}/keirin/race?${query}`
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


export function hydrateParticipantEvidence(items, officialData = {}, browserData = {}) {
  const profileIndex = buildEvidenceIndex([
    officialData.officialProfiles, officialData.profiles, officialData.participantProfiles,
    browserData.officialProfiles, browserData.profiles, browserData.participantProfiles
  ]);
  const kimariteIndex = buildEvidenceIndex([
    officialData.officialKimariteCounts, officialData.kimariteCounts, officialData.participantKimariteCounts,
    browserData.officialKimariteCounts, browserData.kimariteCounts, browserData.participantKimariteCounts
  ]);

  return (Array.isArray(items) ? items : []).map(item => {
    const registration = normalizeRegistration(item.registration);
    const profile = firstEvidence([
      item.officialProfile, item.profile, item.profileEvidence, item.racerProfile,
      profileIndex.get(registration)
    ]);
    const kimarite = firstEvidence([
      item.officialKimariteCounts, item.kimariteCounts, item.kimariteEvidence, item.jsj068,
      kimariteIndex.get(registration)
    ]);
    return {
      ...item,
      officialProfile: canonicalProfileEnvelope(profile, item, registration),
      officialKimariteCounts: canonicalKimariteEnvelope(kimarite, item, registration),
      officialTotalStarts: item.officialTotalStarts ?? profile?.officialTotalStarts ?? profile?.data?.officialTotalStarts ?? null
    };
  });
}

function buildEvidenceIndex(containers) {
  const index = new Map();
  for (const container of containers) {
    if (!container) continue;
    const values = Array.isArray(container)
      ? container
      : typeof container === "object"
        ? Object.entries(container).map(([key, value]) => ({ key, value }))
        : [];
    for (const entry of values) {
      const value = entry?.value ?? entry;
      if (!value || typeof value !== "object") continue;
      const registration = normalizeRegistration(
        value.registration ?? value.requestedRegistration ?? value.snum ?? value.data?.registration ?? entry?.key
      );
      if (registration && registration !== "000000") index.set(registration, value);
    }
  }
  return index;
}

function firstEvidence(candidates) {
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    if (candidate.data && typeof candidate.data === "object") return { ...candidate, ...candidate.data, ...pickEnvelope(candidate) };
    if (candidate.profile && typeof candidate.profile === "object") return { ...candidate, ...candidate.profile, ...pickEnvelope(candidate) };
    if (candidate.counts && typeof candidate.counts === "object") return { ...candidate, ...candidate.counts, ...pickEnvelope(candidate) };
    return candidate;
  }
  return null;
}

function pickEnvelope(value) {
  return {
    identityPassed: value.identityPassed,
    targetIdentityPassed: value.targetIdentityPassed,
    registration: value.registration ?? value.requestedRegistration,
    requestedRegistration: value.requestedRegistration,
    fetchedAt: value.fetchedAt,
    sourceType: value.sourceType,
    sourcePath: value.sourcePath,
    target: value.target
  };
}

function canonicalProfileEnvelope(profile, participant, registration) {
  if (!profile || typeof profile !== "object") return null;
  const returnedRegistration = normalizeRegistration(profile.registration ?? profile.requestedRegistration ?? profile.snum ?? registration);
  if (registration && returnedRegistration !== registration) return null;
  const participantIdentityPassed = participant.identityPassed === true || participant.profileIdentityPassed === true;
  return {
    ...profile,
    registration: returnedRegistration,
    identityPassed: profile.identityPassed === true || (profile.identityPassed == null && participantIdentityPassed)
  };
}

function canonicalKimariteEnvelope(evidence, participant, registration) {
  if (!evidence || typeof evidence !== "object") return null;
  const returnedRegistration = normalizeRegistration(evidence.registration ?? evidence.requestedRegistration ?? evidence.snum ?? registration);
  if (registration && returnedRegistration !== registration) return null;
  const participantIdentityPassed = participant.identityPassed === true || participant.kimariteIdentityPassed === true;
  const targetIdentityPassed = evidence.targetIdentityPassed === true || (evidence.targetIdentityPassed == null && participant.targetIdentityPassed === true);
  return {
    ...evidence,
    registration: returnedRegistration,
    identityPassed: evidence.identityPassed === true || (evidence.identityPassed == null && participantIdentityPassed),
    targetIdentityPassed
  };
}

export function adaptParticipantsForPrediction(items, context = {}) {
  const adapted = (Array.isArray(items) ? items : []).map(item => adaptParticipant(item, context));
  const withRecent = applyRecentFormEvidence(adapted);
  return withRecent.map(applyKimariteAbilities);
}

export function adaptParticipant(item, context = {}) {
  const number = Number(item.number || 0);
  const registration = normalizeRegistration(item.registration);
  const officialProfileEvidence = normalizeOfficialProfileEvidence(item.officialProfile, registration, context);
  const officialKimariteEvidence = normalizeOfficialKimariteEvidence(item.officialKimariteCounts, registration, context);
  const participant = {
    id: String(number),
    number,
    name: item.name || `${number}番車`,
    registration,
    prefecture: item.prefecture || "",
    className: item.className || "",
    style: item.style || "",
    raceCategory: context.raceCategory || "unknown",
    officialScore: nullableNumber(item.score),
    officialProfileEvidence,
    officialKimariteEvidence,
    officialTotalStarts: nullableNumber(item.officialTotalStarts ?? item.officialProfile?.officialTotalStarts),
    sparseSampleFlag: Number(item.officialTotalStarts ?? item.officialProfile?.officialTotalStarts) <= 10,
    officialForeignFlag: item.officialForeignFlag === true || item.officialProfile?.officialForeignFlag === true,
    recentForm: 5,
    recentFormEvidence: { value: 5, confidence: "low", inputsUsed: [], missingInputs: ["official-profile"] },
    startPower: 5,
    startPowerEvidence: null,
    sprintPower: 5,
    stamina: 5,
    attackTiming: 5,
    trackingSkill: 5,
    finishPower: 5,
    lineTrust: 5,
    venueSuitability: 5,
    sourceType: item.sourceType || null,
    sourcePath: item.sourcePath || null
  };
  return applyStartPowerEvidence([participant])[0];
}

export function detectRaceCategory({ basic = {}, participants = [] } = {}) {
  const text = [
    basic.className, basic.raceName, basic.grade,
    ...participants.map(item => item.className)
  ].filter(Boolean).join(" ");
  if (/(ガールズ|女子|Ｌ級|L級|ガ予|ガ決)/i.test(text)) return "girls";
  return text.trim() ? "standard" : "unknown";
}

function normalizeOfficialProfileEvidence(profile, registration, context) {
  if (!profile || typeof profile !== "object") return null;
  if (profile.identityPassed !== true) return null;
  if (registration && normalizeRegistration(profile.registration) !== registration) return null;
  if (!notAfterTarget(profile.fetchedAt, context)) return null;
  return {
    identityPassed: true,
    registration,
    fetchedAt: profile.fetchedAt || null,
    sourceType: profile.sourceType || "official-profile",
    sourcePath: profile.sourcePath || null,
    ridingStyle: profile.ridingStyle ?? null,
    currentScore: nullableNumber(profile.currentScore),
    recent4MonthScore: nullableNumber(profile.recent4MonthScore),
    officialTotalStarts: nullableNonNegativeInteger(profile.officialTotalStarts ?? context.officialTotalStarts),
    backCount: nullableNumber(profile.backCount),
    homeCount: nullableNumber(profile.homeCount),
    winRate: nullableNumber(profile.winRate),
    quinellaRate: nullableNumber(profile.quinellaRate),
    trioRate: nullableNumber(profile.trioRate),
    rateUnit: profile.rateUnit || null,
    winningStyleRates: {
      escape: nullableNumber(profile.winningStyleRates?.escape),
      makuri: nullableNumber(profile.winningStyleRates?.makuri),
      difference: nullableNumber(profile.winningStyleRates?.difference),
      mark: nullableNumber(profile.winningStyleRates?.mark)
    },
    scoreHistory: Array.isArray(profile.scoreHistory) ? profile.scoreHistory : []
  };
}

function normalizeOfficialKimariteEvidence(evidence, registration, context) {
  if (!evidence || typeof evidence !== "object") return null;
  if (evidence.identityPassed !== true || evidence.targetIdentityPassed !== true) return null;
  if (registration && normalizeRegistration(evidence.registration ?? evidence.requestedRegistration) !== registration) return null;
  const target = evidence.target || {};
  if (target.date && normalizeDate(target.date) !== normalizeDate(context.raceDate)) return null;
  if (target.venueCode && String(target.venueCode).padStart(2, "0") !== String(context.venueCode).padStart(2, "0")) return null;
  if (target.raceNo && Number(target.raceNo) !== Number(context.raceNo)) return null;
  if (!notAfterTarget(evidence.fetchedAt, context)) return null;
  const result = {
    status: "verified",
    identityPassed: true,
    targetIdentityPassed: true,
    registration,
    sourceType: evidence.sourceType || "JSJ068",
    sourcePath: evidence.sourcePath || null,
    fetchedAt: evidence.fetchedAt || null,
    totalQuinellaCount: nullableNonNegativeInteger(evidence.totalQuinellaCount)
  };
  for (const key of ["nige", "makuri", "sasi", "mark"]) {
    const row = evidence[key];
    if (!row || typeof row !== "object") { result[key] = null; continue; }
    const F_Cnt = nullableNonNegativeInteger(row.F_Cnt ?? row.first);
    const S_Cnt = nullableNonNegativeInteger(row.S_Cnt ?? row.second);
    const Sum_Cnt = nullableNonNegativeInteger(row.Sum_Cnt ?? row.sum ?? row.total);
    result[key] = F_Cnt !== null && S_Cnt !== null && Sum_Cnt !== null && F_Cnt + S_Cnt === Sum_Cnt
      ? { F_Cnt, S_Cnt, Sum_Cnt } : null;
  }
  return result;
}

function notAfterTarget(fetchedAt, context) {
  if (!fetchedAt) return true;
  const fetched = Date.parse(fetchedAt);
  if (!Number.isFinite(fetched)) return false;
  const date = normalizeDate(context.raceDate);
  if (!/^\d{8}$/.test(date)) return true;
  const time = String(context.raceStartTime || "23:59").match(/(\d{1,2}):(\d{2})/);
  const hh = time ? Number(time[1]) : 23, mm = time ? Number(time[2]) : 59;
  const target = Date.parse(`${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}T${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}:00+09:00`);
  return !Number.isFinite(target) || fetched <= target;
}

function normalizeRegistration(value) { return String(value ?? "").replace(/\D/g, "").padStart(6, "0").slice(-6); }
function nullableNumber(value) { if (value === null || value === undefined || value === "") return null; const n = Number(value); return Number.isFinite(n) ? n : null; }
function nullableNonNegativeInteger(value) { const n = nullableNumber(value); return n !== null && Number.isSafeInteger(n) && n >= 0 ? n : null; }

function resolveOfficialLines({ participants, officialLines, lineText }) {
  // The official line text is the canonical front-to-back order.
  // JSJ036 `position` is useful for grouping/identity checks, but treating its numeric
  // position as race-order can reverse leader/bante roles on some cards.
  // Prefer the verified text representation whenever it covers the race sufficiently.
  if (lineText) {
    const parsed = inferLines({ participants, lineText });
    if (parsed?.confidence === "高") {
      return {
        ...parsed,
        source: "公式JSJ036並び表記",
        warnings: []
      };
    }
  }

  const validNumbers = new Set(participants.map(item => Number(item.number)).filter(number => number >= 1 && number <= 9));
  const uniqueItems = [];
  const seen = new Set();
  for (const item of Array.isArray(officialLines) ? officialLines : []) {
    const number = Number(item?.number);
    if (!validNumbers.has(number) || seen.has(number)) continue;
    const positionRaw = item?.position ?? item?.order;
    const position = Number(positionRaw);
    if (!Number.isFinite(position)) continue;
    seen.add(number);
    uniqueItems.push({ ...item, number, position });
  }

  if (uniqueItems.length >= Math.max(3, participants.length - 2)) {
    const grouped = groupOfficialLineItems(uniqueItems);
    const assignments = new Map();
    grouped.forEach((group, index) => {
      const lineId = String.fromCharCode(65 + index);
      group.forEach((item, lineIndex) => assignments.set(item.number, {
        lineId,
        lineOrder: lineIndex + 1,
        role: lineIndex === 0 ? "自力" : lineIndex === 1 ? "番手" : "三番手",
        lineStatus: "公式並び"
      }));
    });
    if (assignments.size >= Math.max(3, participants.length - 2)) {
      return {
        participants: participants.map(item => ({
          ...item,
          ...(assignments.get(Number(item.number)) || { lineId: "solo", lineOrder: 1, role: "単騎", lineStatus: "公式並び外" })
        })),
        source: "公式JSJ036位置",
        confidence: "高",
        warnings: []
      };
    }
  }

  return inferLines({ participants, lineText });
}

function groupOfficialLineItems(items) {
  const withLineId = items.filter(item => item.lineId != null && String(item.lineId).trim());
  if (withLineId.length === items.length) {
    const groups = new Map();
    for (const item of items) {
      const key = String(item.lineId);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    return [...groups.values()].map(group => group.sort((a, b) => a.position - b.position));
  }

  const sorted = [...items].sort((a, b) => a.position - b.position);
  const groups = [];
  let current = [];
  let previous = null;
  for (const item of sorted) {
    if (previous != null && item.position - previous > 1 && current.length) {
      groups.push(current);
      current = [];
    }
    current.push(item);
    previous = item.position;
  }
  if (current.length) groups.push(current);
  return groups;
}

function buildLineText(lines) {
  if (!lines.length) return null;

  const withLineId = lines.filter(item => item.lineId != null && String(item.lineId).trim());
  if (withLineId.length === lines.length) {
    const groups = new Map();
    for (const item of lines) {
      const key = String(item.lineId);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    return [...groups.values()]
      .map(group => group
        .sort((a, b) => Number(a.position || a.order || 99) - Number(b.position || b.order || 99))
        .map(item => String(item.number || ""))
        .filter(Boolean)
        .join(""))
      .filter(Boolean)
      .join(" ") || null;
  }

  const positioned = lines
    .filter(item => Number.isFinite(Number(item.position || item.order)))
    .sort((a, b) => Number(a.position || a.order) - Number(b.position || b.order));
  if (!positioned.length) return null;

  const groups = [];
  let current = [];
  let previous = null;
  for (const item of positioned) {
    const position = Number(item.position || item.order);
    if (previous != null && position - previous > 1 && current.length) {
      groups.push(current);
      current = [];
    }
    current.push(item);
    previous = position;
  }
  if (current.length) groups.push(current);
  return groups
    .map(group => group.map(item => String(item.number || "")).filter(Boolean).join(""))
    .filter(Boolean)
    .join(" ") || null;
}

function normalizeOfficialOdds(raw) {
  if (!raw || typeof raw !== "object") return { ok: false, odds: {}, diagnostics: { source: "未取得" } };
  const source = raw.odds && typeof raw.odds === "object" ? raw.odds : raw.oddsByOrder && typeof raw.oddsByOrder === "object" ? raw.oddsByOrder : {};
  const odds = {};
  for (const [key, value] of Object.entries(source)) {
    const normalizedKey = String(key).replace(/[^1-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    const numeric = Number(value);
    if (/^[1-9]-[1-9]-[1-9]$/.test(normalizedKey) && Number.isFinite(numeric) && numeric > 1) odds[normalizedKey] = numeric;
  }
  return { ok: Object.keys(odds).length > 0, odds, diagnostics: raw.diagnostics || { source: raw.sourceType || "officialData.odds" } };
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
