import { parseKeirinTrifectaOddsHtml } from "../../parser/odds-parser.mjs";
import { inferLines } from "../../parser/line-parser.mjs";
import { runKeirinEngine } from "../../engine/keirin-engine.mjs";
import { applyRecentFormEvidence } from "../../recent-form/recent-form.mjs";
import { applyStartPowerEvidence } from "../../start-power/start-power.mjs";
import { jsonResponse } from "../../parser/utils.mjs";
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
        lineStore: lineResolution.storeName,
        lineCacheKey: lineResolution.cacheKey,
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

  const candidates = [
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
  const context = arguments[1] && typeof arguments[1] === "object"
    ? arguments[1]
    : {};
  const number = Number(item.number || 0);
  const registration = normalizeRegistration(item.registration);
  const legacyOfficialMetrics = {
    score: nullableNumber(item.score),
    escapeCount: nullableNumber(item.escapeCount),
    makuriCount: nullableNumber(item.makuriCount),
    differenceCount: nullableNumber(item.differenceCount),
    markCount: nullableNumber(item.markCount),
    backCount: nullableNumber(item.backCount),
    sourceType: item.sourceType || null,
    sourcePath: item.sourcePath || null,
    fieldSources: Object.fromEntries([
      "score", "escapeCount", "makuriCount", "differenceCount", "markCount", "backCount"
    ].map(field => [field, {
      sourceType: item.sourceType || null,
      sourcePath: item.sourcePath ? `${item.sourcePath}.${field}` : null
    }]))
  };
  const profileResult = normalizeOfficialProfile(item.officialProfile, registration, context);
  const officialKimariteEvidence = normalizeOfficialKimariteEvidence(item.officialKimariteCounts, registration, context);
  const officialRecentResults = normalizeOfficialRecentResults(item, context);
  const score = legacyOfficialMetrics.score;
  const escape = legacyOfficialMetrics.escapeCount;
  const makuri = legacyOfficialMetrics.makuriCount;
  const difference = legacyOfficialMetrics.differenceCount;
  const mark = legacyOfficialMetrics.markCount;
  const back = legacyOfficialMetrics.backCount;
  const officialTotalStarts = nullableNumber(
    item.officialTotalStarts ?? item.officialProfile?.officialTotalStarts
  );
  const sparseSampleFlag = item.sparseSampleFlag === true ||
    item.officialProfile?.sparseSampleFlag === true || officialTotalStarts === 0;
  const officialForeignFlag = item.officialForeignFlag === true ||
    item.officialProfile?.officialForeignFlag === true;

  const participant = {
    id: String(number),
    number,
    name: item.name || `${number}番車`,
    registration,
    prefecture: item.prefecture || "",
    className: item.className || "",
    style: item.style || "",
    raceCategory: context.raceCategory || detectRaceCategory({ participants: [item] }),
    officialScore: score,
    legacyOfficialMetrics,
    officialProfileEvidence: profileResult.profile,
    officialProfileStatus: profileResult.status,
    officialKimariteEvidence,
    officialRecentResults,
    officialTotalStarts,
    sparseSampleFlag,
    officialForeignFlag,
    recentForm: 5,
    recentFormEvidence: {
      value: 5,
      confidence: "low",
      inputsUsed: [],
      missingInputs: ["race-context"],
      baselineVersion: null
    },
    startPower: 5,
    startPowerEvidence: null,
    sprintPower: makuri === null || score === null ? 5 : clamp(4 + makuri * 0.55 + score / 40),
    stamina: back === null || escape === null ? 5 : clamp(4 + back * 0.12 + escape * 0.25),
    attackTiming: escape === null || makuri === null ? 5 : clamp(4 + (escape + makuri) * 0.35),
    trackingSkill: difference === null || mark === null ? 5 : clamp(4 + (difference + mark) * 0.35),
    finishPower: difference === null || score === null ? 5 : clamp(4 + difference * 0.5 + score / 35),
    lineTrust: [escape, makuri, difference, mark].some(value => value === null)
      ? 5
      : clamp(escape + makuri + difference + mark ? 5 + mark * 0.2 : 5),
    venueSuitability: 5,
    sourceType: item.sourceType || null,
    sourcePath: item.sourcePath || null
  };
  return applyStartPowerEvidence([participant])[0];
}

export function adaptParticipantsForPrediction(items, context = {}) {
  const adapted = (Array.isArray(items) ? items : []).map(item => adaptParticipant(item, context));
  return applyRecentFormEvidence(adapted);
}

function normalizeOfficialKimariteEvidence(evidence, registration, context) {
  const rejected = (status, reason, source = {}) => ({status,reason,identityPassed:evidence?.identityPassed===true,targetIdentityPassed:evidence?.targetIdentityPassed===true,registration:registration||null,target:{date:normalizeDate(context.raceDate)||null,venueCode:normalizeVenueCode(context.venueCode)||null,raceNo:normalizeRaceNo(context.raceNo)||null},fetchedAt:evidence?.fetchedAt||null,sourceType:evidence?.sourceType||null,sourcePath:evidence?.sourcePath||null,nige:null,makuri:null,sasi:null,mark:null,totalQuinellaCount:null,fieldSources:{},...source});
  if(!evidence||typeof evidence!=="object")return rejected("missing","official-kimarite-counts-missing");
  if(evidence.identityPassed!==true)return rejected("identity_mismatch","identity-failed");
  if(evidence.targetIdentityPassed!==true)return rejected("target_mismatch","target-identity-failed");
  const requestedRegistration=normalizeRegistration(evidence.requestedRegistration),responseRegistration=normalizeRegistration(evidence.registration);
  if(!registration||requestedRegistration!==registration||responseRegistration!==registration)return rejected("identity_mismatch","registration-mismatch");
  const target={date:normalizeDate(evidence.date),venueCode:normalizeVenueCode(evidence.venueCode),raceNo:normalizeRaceNo(evidence.raceNo)},expectedTarget={date:normalizeDate(context.raceDate),venueCode:normalizeVenueCode(context.venueCode),raceNo:normalizeRaceNo(context.raceNo)};
  if(!target.date||!target.venueCode||!target.raceNo||target.date!==expectedTarget.date||target.venueCode!==expectedTarget.venueCode||target.raceNo!==expectedTarget.raceNo)return rejected("target_mismatch","race-target-mismatch",{target});
  if(evidence.sourceType!=="JSJ068"||!evidence.sourcePath)return rejected("unavailable","source-invalid",{target});
  if(!evidence.fetchedAt||!Number.isFinite(Date.parse(evidence.fetchedAt)))return rejected("unavailable","fetched-at-invalid",{target});
  const temporal=validateEvidenceTime(evidence.fetchedAt,context);if(!temporal.ok)return rejected("future_source",temporal.reason,{target});
  const groups={};for(const key of ["nige","makuri","sasi","mark"]){const group=evidence[key],firstCount=nullableNonNegativeInteger(group?.firstCount),secondCount=nullableNonNegativeInteger(group?.secondCount),totalCount=nullableNonNegativeInteger(group?.totalCount);if(firstCount===null||secondCount===null||totalCount===null||firstCount+secondCount!==totalCount)return rejected("invalid_counts",`${key}-counts-invalid`,{target});groups[key]={firstCount,secondCount,totalCount}}
  const totalQuinellaCount=nullableNonNegativeInteger(evidence.totalQuinellaCount),calculatedTotal=Object.values(groups).reduce((sum,group)=>sum+group.totalCount,0);if(totalQuinellaCount===null||totalQuinellaCount!==calculatedTotal)return rejected("invalid_counts","total-quinella-count-invalid",{target});
  const source={sourceType:"JSJ068",sourcePath:String(evidence.sourcePath)};return{status:"adopted",reason:null,identityPassed:true,targetIdentityPassed:true,registration,target,fetchedAt:String(evidence.fetchedAt),...source,...groups,totalQuinellaCount,fieldSources:{nige:{...source,officialField:"nige"},makuri:{...source,officialField:"makuri"},sasi:{...source,officialField:"sasi"},mark:{...source,officialField:"mark"},totalQuinellaCount:{...source,officialField:"totalQuinellaCount"}}};
}

export function detectRaceCategory({ basic = {}, participants = [] } = {}) {
  const text = [basic.className, basic.raceName, basic.grade, ...participants.map(item => item.className)].filter(Boolean).join(" ");
  if (/(ガールズ|女子|Ｌ級|L級|ガ予|ガ決)/i.test(text)) return "girls";
  if (text.trim()) return "standard";
  return "unknown";
}

function normalizeOfficialProfile(profile, registration, context) {
  const reject = reason => ({ profile: null, status: { adopted: false, reason } });
  if (!profile || typeof profile !== "object") return reject("profile-missing");
  if (profile.identityPassed !== true) return reject("identity-failed");
  if (!registration || normalizeRegistration(profile.registration) !== registration) return reject("registration-mismatch");
  if (!profile.sourceType || !profile.sourcePath) return reject("source-missing");
  if (!profile.fetchedAt) return reject("fetched-at-missing");
  const temporal = validateProfileTime(profile, context);
  if (!temporal.ok) return reject(temporal.reason);
  const source = { sourceType: String(profile.sourceType), sourcePath: String(profile.sourcePath) };
  const fields = ["currentScore", "recent4MonthScore", "backCount", "homeCount", "winRate", "quinellaRate", "trioRate"];
  const normalized = Object.fromEntries(fields.map(field => [field, nullableNumber(profile[field])]));
  const officialTotalStarts = nullableNonNegativeInteger(profile.officialTotalStarts);
  const winningStyleRates = Object.fromEntries(["escape", "makuri", "difference", "mark"].map(field => [field, nullableNumber(profile.winningStyleRates?.[field])]));
  const scoreHistory = Array.isArray(profile.scoreHistory) ? profile.scoreHistory.filter(entry => historyIsNotAfterRace(entry?.date, context.raceDate)&&normalizeRegistration(entry?.requestedRegistration)===registration).map((entry, index) => ({date:entry.date??null,venueName:entry.venueName??null,gradeName:entry.gradeName??null,recent4MonthScore:nullableNumber(entry.recent4MonthScore),currentTermScore:nullableNumber(entry.currentTermScore),sourceType:entry.sourceType||"JSJ067",sourcePath:entry.sourcePath||`scoreHistory[${index}]`,requestedRegistration:normalizeRegistration(entry.requestedRegistration)})) : [];
  return {profile:{identityPassed:true,registration,fetchedAt:String(profile.fetchedAt),sourceUpdatedAt:profile.sourceUpdatedAt||null,ridingStyle:nullableText(profile.ridingStyle),...normalized,officialTotalStarts,rateUnit:profile.rateUnit==="percent"?"percent":null,winningStyleRates,scoreHistory,...source,fieldSources:{...Object.fromEntries(fields.map(field=>[field,{...source,officialField:field}])),officialTotalStarts:{...source,officialField:"officialTotalStarts"},ridingStyle:{...source,officialField:"ridingStyle"},winningStyleRates:{...source,officialField:"winningStyleRates"},scoreHistory:{sourceType:"JSJ067",sourcePath:"scoreHistory"}}},status:{adopted:true,reason:null}};
}

function normalizeOfficialRecentResults(item, context) {
  const sourceType=item.sourceType||null,sourcePath=item.sourcePath||null;
  const currentMeetingResults=normalizeResultList(item.currentMeetingResults,`${sourcePath||"participant"}.currentMeetingResults`,sourceType);
  const recentMeetingResults=Array.isArray(item.recentMeetingResults)?item.recentMeetingResults.map((meeting,index)=>{const meetingDate=normalizeHistoryDate(meeting?.meetingDate);const eligibleBeforeRace=Boolean(meetingDate&&context.raceDate&&meetingDate<=context.raceDate);return{meetingName:meeting?.meetingName??null,meetingDate:meeting?.meetingDate??null,eligibleBeforeRace,results:normalizeResultList(meeting?.results,meeting?.sourcePath||`${sourcePath||"participant"}.recentMeetingResults[${index}].results`,meeting?.sourceType||sourceType),sourceType:meeting?.sourceType||sourceType,sourcePath:meeting?.sourcePath||`${sourcePath||"participant"}.recentMeetingResults[${index}]`}}):[];
  return{currentMeetingResults,recentMeetingResults,usableCurrentMeetingResults:sourceType==="JSJ038"&&context.raceDate?currentMeetingResults:[],usableRecentMeetingResults:recentMeetingResults.filter(item=>item.eligibleBeforeRace),sourceType,sourcePath};
}

function normalizeResultList(results,basePath,sourceType){if(!Array.isArray(results))return[];return results.map((result,index)=>{const rawFinish=result?.rawFinish??null,text=rawFinish===null?"":String(rawFinish).trim();return{rawFinish,specialStatus:result?.specialStatus??(text&&!/^\d+$/.test(text)?text:null),backToriRaw:result?.backToriRaw??null,sourceType:result?.sourceType||sourceType,sourcePath:result?.sourcePath||`${basePath}[${index}]`}})}
function validateProfileTime(profile,context){const raceDate=normalizeDate(context.raceDate);if(!/^\d{8}$/.test(raceDate))return{ok:false,reason:"race-date-missing"};const sourceTime=Date.parse(profile.sourceUpdatedAt||profile.fetchedAt);if(!Number.isFinite(sourceTime))return{ok:false,reason:"source-time-invalid"};const time=String(context.raceStartTime||"").match(/(\d{1,2}):(\d{2})/),cutoff=Date.parse(`${raceDate.slice(0,4)}-${raceDate.slice(4,6)}-${raceDate.slice(6,8)}T${time?time[1].padStart(2,"0"):"23"}:${time?time[2]:"59"}:59+09:00`);return sourceTime<=cutoff?{ok:true,reason:null}:{ok:false,reason:"profile-from-future"}}
function validateEvidenceTime(fetchedAt,context){const raceDate=normalizeDate(context.raceDate);if(!/^\d{8}$/.test(raceDate))return{ok:false,reason:"race-date-missing"};const sourceTime=Date.parse(fetchedAt);if(!Number.isFinite(sourceTime))return{ok:false,reason:"source-time-invalid"};const time=String(context.raceStartTime||"").match(/(\d{1,2}):(\d{2})/),cutoff=Date.parse(`${raceDate.slice(0,4)}-${raceDate.slice(4,6)}-${raceDate.slice(6,8)}T${time?time[1].padStart(2,"0"):"23"}:${time?time[2]:"59"}:59+09:00`);return sourceTime<=cutoff?{ok:true,reason:null}:{ok:false,reason:"source-from-future"}}
function historyIsNotAfterRace(value,raceDate){const normalized=normalizeHistoryDate(value);return Boolean(normalized&&/^\d{8}$/.test(String(raceDate||""))&&normalized<=raceDate)}
function normalizeHistoryDate(value){const text=String(value||""),short=text.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);if(short)return`20${short[1]}${short[2]}${short[3]}`;const digits=text.replace(/\D/g,"");return digits.length===8?digits:""}
function normalizeRegistration(value){const digits=String(value??"").replace(/\D/g,"");return digits?digits.padStart(6,"0"):""}
function nullableText(value){const text=String(value??"").trim();return text&&text!=="-"?text:null}

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

function normalizeVenueCode(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits ? digits.padStart(2, "0").slice(-2) : "";
}

function normalizeRaceNo(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

function nullableNumber(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function nullableNonNegativeInteger(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text || !/^\d+$/.test(text)) return null;
  const number = Number(text);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function clamp(value, min = 0, max = 10) {
  return Math.min(max, Math.max(min, value));
}
