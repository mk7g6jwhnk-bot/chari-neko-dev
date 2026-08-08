import { chromium } from "playwright";
import { extractOfficialResult } from "./keirin-result.mjs";

const BASE = "https://keirin.jp";
const TYPES = ["JSJ035", "JSJ036", "JSJ037"];


async function waitForPageStable(page, timeout = 5000) {
  await page.waitForLoadState("domcontentloaded", { timeout }).catch(() => {});
  await page.waitForFunction(
    () => document.readyState === "interactive" || document.readyState === "complete",
    null,
    { timeout }
  ).catch(() => {});
}

async function safeEvaluate(page, pageFunction, arg) {
  let lastError = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await waitForPageStable(page, 4000);
      return arg === undefined
        ? await page.evaluate(pageFunction)
        : await page.evaluate(pageFunction, arg);
    } catch (error) {
      lastError = error;
      const message = String(error?.message || error || "");
      const navigationRace =
        message.includes("Execution context was destroyed") ||
        message.includes("Cannot find context") ||
        message.includes("most likely because of a navigation");

      if (!navigationRace || attempt >= 1) throw error;
      await page.waitForLoadState("domcontentloaded", { timeout: 6000 }).catch(() => {});
      await page.waitForTimeout(350);
    }
  }

  throw lastError;
}

export async function fetchKeirinOfficialData({ date, venueCode, venueName, raceNo, includeResult = false, includeEvidence = true }) {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });

  const context = await browser.newContext({
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    userAgent:
      "Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 " +
      "Chrome/122.0.0.0 Mobile Safari/537.36"
  });

  const page = await context.newPage();
  const diagnostics = {
    version: "0.4.6-navigation-safe",
    requested: { date, venueCode, venueName, raceNo },
    steps: []
  };

  const capturedOfficialJson = [];
  const capturedUrls = new Set();

  page.on("response", async response => {
    try {
      const url = response.url();

      if (
        !url.includes("/sp/json") ||
        capturedUrls.has(url)
      ) {
        return;
      }

      capturedUrls.add(url);
      const contentType =
        response.headers()["content-type"] || "";

      const text = await response.text();

      let data = null;

      try {
        data = JSON.parse(text);
      } catch {}

      capturedOfficialJson.push({
        url,
        status: response.status(),
        contentType,
        textLength: text.length,
        data,
        type: readQueryValue(url, "type"),
        encpLength: readQueryValue(url, "encp").length
      });
    } catch {}
  });

  try {
    const year = date.slice(0, 4);
    const month = date.slice(4, 6);
    const day = Number(date.slice(6, 8));

    const scheduleUrl =
      `${BASE}/pc/raceschedule?scyy=${encodeURIComponent(year)}` +
      `&scym=${encodeURIComponent(month)}`;

    await page.goto(scheduleUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    diagnostics.steps.push({
      step: "open-schedule",
      url: page.url(),
      title: await page.title()
    });

    const schedule = await openScheduleCell(page, {
      venueName,
      venueCode,
      day,
      date
    });

    diagnostics.steps.push({
      step: "open-schedule-cell",
      ...schedule,
      url: page.url(),
      title: await page.title()
    });

    if (!schedule.ok) {
      return {
        ok: false,
        error: "開催日程から対象会場の開催リンクを特定できません",
        diagnostics,
        pageSnapshot: await createPageSnapshot(page)
      };
    }

    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForTimeout(1200);

    const mobile = await moveToMobileRacePage(page, {
      venueName,
      venueCode
    });

    diagnostics.steps.push({
      step: "move-mobile",
      ...mobile,
      url: page.url(),
      title: await page.title()
    });

    const dateSelection = await selectRequestedDate(page, {
      date,
      venueName,
      venueCode
    });

    diagnostics.steps.push({
      step: "select-requested-date",
      ...dateSelection,
      url: page.url(),
      title: await page.title()
    });

    const raceSelection = await clickRace(page, {
      raceNo,
      venueName,
      date
    });

    diagnostics.steps.push({
      step: "select-race",
      ...raceSelection,
      url: page.url(),
      title: await page.title()
    });

    if (!raceSelection?.verified) {
      const error = new Error("指定Rの公式確認に失敗しました");
      error.diagnostics = {
        dateSelection,
        raceSelection,
        steps: diagnostics.steps
      };
      throw error;
    }

    const verifiedIdentity = {
      venueName: String(
        raceSelection.verification?.venueName || venueName || ""
      ),
      date: String(
        raceSelection.verification?.date || ""
      ),
      raceNo: Number(
        raceSelection.verification?.actualRaceNo || raceNo || 0
      )
    };

    /*
     * 選択したRのトークンは、この瞬間に正本として固定する。
     * 後続のタブ操作で公式ページが1Rへ戻っても上書きしない。
     */
    let encp = await safeEvaluate(page, () => {
      const el = document.querySelector("#hhEncSelR");
      return el && "value" in el ? String(el.value || "") : "";
    });

    diagnostics.steps.push({
      step: "freeze-selected-race-token",
      encpLength: encp.length,
      verifiedIdentity
    });

    /*
     * R選択後は公式ページを一切クリックしない。
     * 小田原などでタブ操作により選択Rや会場状態が変わるのを防ぐ。
     * 以後は固定済みencpを使ったJSON通信だけで取得する。
     */
    diagnostics.steps.push({
      step: "post-selection-ui",
      skipped: true,
      reason: "fixed-race-token-json-only"
    });

    if (!encp) {
      encp = await recoverToken(page);
    }

    diagnostics.steps.push({
      step: "read-token",
      encpLength: encp.length,
      source: raceSelection?.verified
        ? "selected-race-frozen-token"
        : "recovered-token"
    });

    if (!encp) {
      return {
        ok: false,
        error: "対象会場ページには到達しましたがhhEncSelRを取得できません",
        diagnostics,
        pageSnapshot: await createPageSnapshot(page)
      };
    }

    const jsonByType = {};

    if (includeResult) {
      const available = await safeEvaluate(page, raceNo => Boolean(
        Array.isArray(window.gResultRefundList) &&
        window.gResultRefundList[raceNo] === true &&
        window.rrController?.JSON_REQ_ID === "JSJ012"
      ), raceNo);
      const resultResponse = available ? page.waitForResponse(
        response => response.url().includes("/sp/json") && readQueryValue(response.url(), "type") === "JSJ012",
        { timeout: 15000 }
      ).catch(() => null) : Promise.resolve(null);
      const triggered = available && await safeEvaluate(page, ({ encp, raceNo }) => {
        if (typeof window.update !== "function") return false;
        window.update("PJ0326", encp, 1, raceNo);
        return true;
      }, { encp, raceNo });
      const response = triggered ? await resultResponse : null;
      let data = null;
      if (response) {
        try { data = await response.json(); } catch {}
      }
      jsonByType.JSJ012 = {
        status: response?.status() || 0,
        ok: Boolean(response?.ok() && data !== null),
        textLength: data ? JSON.stringify(data).length : 0,
        data
      };
      diagnostics.steps.push({
        step: "request-official-result",
        available,
        triggered,
        received: data !== null,
        status: response?.status() || 0
      });
    }

    const directTypes = [
      ...new Set([
        ...TYPES,
        "JSJ038"
      ])
    ];

    for (const type of directTypes) {
      jsonByType[type] = await safeEvaluate(page, 
        async ({ base, encp, type }) => {
          const response = await fetch(
            `${base}/sp/json?encp=${encodeURIComponent(encp)}` +
            `&type=${encodeURIComponent(type)}`,
            {
              credentials: "include",
              headers: { Accept: "application/json" }
            }
          );

          const text = await response.text();
          let data = null;

          try {
            data = JSON.parse(text);
          } catch {}

          return {
            status: response.status,
            ok: response.ok && data !== null,
            textLength: text.length,
            data
          };
        },
        { base: BASE, encp, type }
      );
    }

    const probedJsonByType = await probeOfficialJsonTypes(
      page,
      encp,
      {
        numbers: buildPrioritizedJsonTypeNumbers(),
        concurrency: 12,
        requestTimeoutMs: 1400,
        totalBudgetMs: 12000
      }
    );

    diagnostics.steps.push({
      step: "probe-official-json-types",
      attempted: probedJsonByType.attempted,
      successfulTypes: probedJsonByType.successfulTypes,
      participantCandidateTypes:
        probedJsonByType.participantCandidateTypes
    });

    const allOfficialJson = Object.fromEntries(
      Object.entries(jsonByType).map(([type, result]) => [type, result?.data])
    );

    for (const [type, result] of Object.entries(probedJsonByType.results)) {
      if (
        result?.data !== null &&
        result?.data !== undefined
      ) {
        allOfficialJson[type] = result.data;
      }
    }

    for (let index = 0; index < capturedOfficialJson.length; index += 1) {
      const captured = capturedOfficialJson[index];
      const key =
        captured.type ||
        `CAPTURED_${index + 1}`;

      if (
        captured.data !== null &&
        !Object.prototype.hasOwnProperty.call(allOfficialJson, key)
      ) {
        allOfficialJson[key] = captured.data;
      }
    }

    const verifiedBasicData =
      jsonByType.JSJ035?.data || null;

    const extractedBasic = verifiedBasicData
      ? extractBasicFromAll({ JSJ035: verifiedBasicData })
      : extractBasicFromAll(allOfficialJson);

    const basic = {
      ...extractedBasic,
      venueName: verifiedIdentity.venueName,
      date: verifiedIdentity.date || extractedBasic.date,
      raceNo: verifiedIdentity.raceNo
    };

    const filteredOfficialJson = filterOfficialJsonByRaceIdentity(
      allOfficialJson,
      verifiedIdentity
    );

    const lines = extractLinesFromAll(filteredOfficialJson);
    const odds = extractTrifectaOddsFromAll(filteredOfficialJson);
    const result = extractOfficialResult(
      filteredOfficialJson.JSJ012
        ? { JSJ012: filteredOfficialJson.JSJ012 }
        : filteredOfficialJson,
      { date, venueCode, venueName, raceNo, verifiedIdentity }
    );

    const directParticipantJson =
      filteredOfficialJson.JSJ038
        ? { JSJ038: filteredOfficialJson.JSJ038 }
        : filteredOfficialJson;

    const directParticipants =
      extractParticipantsFromAll(directParticipantJson);

    const participants = directParticipants.length >= 5
      ? directParticipants
      : extractParticipantsFromAll(filteredOfficialJson);

    const participantEvidence = includeEvidence
      ? await fetchOfficialParticipantEvidence(page, {
          encp, date, venueCode, venueName, raceNo, participants
        })
      : { byRegistration: {}, failures: [] };
    const participantsWithEvidence = participants.map(participant => {
      const registration = normalizeRegistration(participant.registration);
      const evidence = participantEvidence.byRegistration[registration] || {};
      return {
        ...participant,
        officialProfile: evidence.officialProfile || null,
        officialTotalStarts: evidence.officialProfile?.officialTotalStarts ?? null,
        officialKimariteCounts: evidence.officialKimariteCounts || null
      };
    });

    diagnostics.steps.push({
      step: "fetch-participant-evidence",
      profileCount: participantsWithEvidence.filter(item => item.officialProfile?.identityPassed === true).length,
      kimariteCount: participantsWithEvidence.filter(item => item.officialKimariteCounts?.identityPassed === true && item.officialKimariteCounts?.targetIdentityPassed === true).length,
      failures: participantEvidence.failures
    });

    const normalizedDate = String(basic.date || "").replace(/\D/g, "");
    const identityPassed =
      basic.venueName === venueName &&
      Number(basic.raceNo) === raceNo &&
      normalizedDate === date;

    const uniqueNumbers = new Set(participantsWithEvidence.map(x => x.number));

    const audit = {
      identityPassed,
      expected: { date, venueCode, venueName, raceNo },
      actual: {
        date: normalizedDate,
        venueName: basic.venueName,
        raceNo: basic.raceNo
      },
      participantCount: participantsWithEvidence.length,
      participantNumbers: participantsWithEvidence.map(x => x.number),
      uniqueParticipantNumbers: uniqueNumbers.size,
      lineCount: lines.length,
      trifectaOddsCount: Object.keys(odds.odds).length,
      resultStatus: result.status,
      resultSourceType: result.sourceType,
      oddsDiagnostics: odds.diagnostics,
      participantSources: participantsWithEvidence.map(item => ({
        number: item.number,
        sourceType: item.sourceType,
        sourcePath: item.sourcePath
      })),
      capturedJsonRequests: capturedOfficialJson.map(item => ({
        type: item.type,
        status: item.status,
        textLength: item.textLength,
        contentType: item.contentType,
        urlWithoutToken: removeQueryValue(item.url, "encp"),
        structure: inspectJsonStructure(item.data)
      })),
      probedJsonRequests: Object.fromEntries(
        Object.entries(probedJsonByType.results).map(([type, result]) => [
          type,
          {
            status: result.status,
            ok: result.ok,
            textLength: result.textLength,
            participantLikeCount: result.participantLikeCount,
            structure: inspectJsonStructure(result.data)
          }
        ])
      ),
      acceptedJsonTypes: Object.keys(filteredOfficialJson),
      rejectedJsonTypes: Object.keys(allOfficialJson).filter(
        type => !Object.prototype.hasOwnProperty.call(
          filteredOfficialJson,
          type
        )
      ),
      jsonStructures: Object.fromEntries(
        Object.entries(allOfficialJson).map(([type, data]) => [
          type,
          inspectJsonStructure(data)
        ])
      )
    };

    if (!identityPassed) {
      return {
        ok: false,
        error: "公式JSONの会場・日付・R番号が選択内容と一致しません",
        officialData: { basic, lines, participants: participantsWithEvidence, odds, result },
        audit,
        diagnostics
      };
    }

    if (
      participantsWithEvidence.length < 5 ||
      participantsWithEvidence.length > 9 ||
      uniqueNumbers.size !== participantsWithEvidence.length
    ) {
      return {
        ok: false,
        error: "出走選手監査に合格しません",
        officialData: { basic, lines, participants: participantsWithEvidence, odds, result },
        audit,
        diagnostics
      };
    }

    return {
      ok: true,
      officialData: { basic, lines, participants: participantsWithEvidence, odds, result },
      audit,
      diagnostics,
      checkedAt: new Date().toISOString()
    };
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}


async function fetchOfficialParticipantEvidence(page, { encp, date, venueCode, venueName, raceNo, participants }) {
  const byRegistration = {};
  const failures = [];
  const queue = (Array.isArray(participants) ? participants : [])
    .map(item => ({ ...item, registration: normalizeRegistration(item.registration) }))
    .filter(item => /^\d{6}$/.test(item.registration));

  let cursor = 0;
  const workers = Array.from({ length: Math.min(2, queue.length) }, async () => {
    while (cursor < queue.length) {
      const item = queue[cursor++];
      try {
        const evidence = await fetchOneParticipantEvidence(page, {
          encp, date, venueCode, venueName, raceNo,
          registration: item.registration,
          expectedName: item.name || ""
        });
        byRegistration[item.registration] = evidence;
      } catch (error) {
        failures.push({ registration: item.registration, error: String(error?.message || error) });
      }
    }
  });
  await Promise.all(workers);
  return { byRegistration, failures };
}

async function fetchOneParticipantEvidence(page, { encp, date, venueCode, venueName, raceNo, registration, expectedName }) {
  const fetchedAt = new Date().toISOString();
  const raw = await safeEvaluate(page, async ({ base, encp, registration }) => {
    const fetchJson = async (url, options = {}) => {
      try {
        const response = await fetch(url, { credentials: "include", ...options });
        const text = await response.text();
        let data = null;
        try { data = JSON.parse(text); } catch {}
        return { status: response.status, ok: response.ok, text, data, url: response.url };
      } catch (error) {
        return { status: 0, ok: false, text: "", data: null, error: String(error) };
      }
    };

    const profileUrl = `${base}/pc/racerprofile?snum=${encodeURIComponent(registration)}`;
    const profileResponse = await fetch(profileUrl, { credentials: "include" });
    const profileHtml = await profileResponse.text();

    const jsj067 = await fetchJson(`${base}/pc/json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        Accept: "application/json"
      },
      body: new URLSearchParams({ type: "JSJ067", snum: registration }).toString()
    });

    const jsj068 = await fetchJson(
      `${base}/pc/json?type=JSJ068&encp=${encodeURIComponent(encp)}` +
      `&snum=${encodeURIComponent(registration)}&skbn=1`,
      { headers: { Accept: "application/json" } }
    );

    return {
      profileStatus: profileResponse.status,
      profileHtml,
      jsj067: { status: jsj067.status, data: jsj067.data },
      jsj068: { status: jsj068.status, data: jsj068.data }
    };
  }, { base: BASE, encp, registration });

  const profile = parseOfficialProfileEvidence({
    registration, expectedName, fetchedAt,
    profileStatus: raw.profileStatus,
    profileHtml: raw.profileHtml,
    jsj067Status: raw.jsj067?.status,
    jsj067: raw.jsj067?.data
  });
  const kimarite = parseOfficialKimariteEvidence({
    registration, fetchedAt, date, venueCode, venueName, raceNo,
    data: raw.jsj068?.data
  });

  return { officialProfile: profile, officialKimariteCounts: kimarite };
}

function parseOfficialProfileEvidence({ registration, expectedName, fetchedAt, profileStatus, profileHtml, jsj067Status, jsj067 }) {
  const html = String(profileHtml || "");
  const text = decodeHtmlText(html);
  const jsonRegistration = findFirstScalar(jsj067, ["snum", "registration", "sensyuNo", "sensyuNum", "sensyuNumber"]);
  const htmlRegistration = findRegistrationInText(text);
  const returnedRegistration = normalizeRegistration(jsonRegistration || htmlRegistration || registration);
  const normalizedText = String(text || "").replace(/\s+/g, "");
  const normalizedName = String(expectedName || "").replace(/\s+/g, "");
  const profileReachable = Number(profileStatus) === 200 || Number(jsj067Status) === 200;
  const sourceIdentityObserved =
    normalizeRegistration(jsonRegistration) === registration ||
    normalizeRegistration(htmlRegistration) === registration ||
    (normalizedName && normalizedText.includes(normalizedName));
  const identityPassed = profileReachable && returnedRegistration === registration && Boolean(sourceIdentityObserved);

  const recent4MonthScore = firstNumber([
    findNumberNearLabel(text, ["直近4ヶ月", "直近４ヶ月"], ["競走得点", "得点"]),
    findDeepNumber(jsj067, ["recent4MonthScore", "recentScore", "tokuten4", "kyosoTokuten"])
  ]);
  const currentScore = firstNumber([
    findDeepNumber(jsj067, ["currentScore", "score", "tokuten", "kyosoTokuten"]),
    findNumberNearLabel(text, ["競走得点", "得点"], [])
  ]);
  const officialTotalStarts = firstInteger([
    findNumberNearLabel(text, ["総出走回数", "総出走"], []),
    findDeepNumber(jsj067, ["officialTotalStarts", "totalStarts", "syussoCnt", "soushusso"])
  ]);
  const backCount = firstInteger([
    findDeepNumber(jsj067, ["backCount", "bCount", "backCnt"]),
    findCompactStat(text, "B")
  ]);
  const homeCount = firstInteger([
    findDeepNumber(jsj067, ["homeCount", "hCount", "homeCnt"]),
    findCompactStat(text, "H")
  ]);
  const ridingStyle = evidenceFirstText([
    findDeepText(jsj067, ["ridingStyle", "style", "kyakusitu", "kyakushitsu"]),
    findTextNearLabel(text, ["脚質"], 12)
  ]);

  const winningStyleRates = {
    escape: firstNumber([findDeepNumber(jsj067, ["escapeRate", "nigeRate"]), findPercentNearLabel(text, ["逃げ"])]),
    makuri: firstNumber([findDeepNumber(jsj067, ["makuriRate"]), findPercentNearLabel(text, ["捲り", "まくり"])]),
    difference: firstNumber([findDeepNumber(jsj067, ["differenceRate", "sasiRate", "sashiRate"]), findPercentNearLabel(text, ["差し"])]),
    mark: firstNumber([findDeepNumber(jsj067, ["markRate"]), findPercentNearLabel(text, ["マーク"])] )
  };

  return {
    identityPassed,
    requestedRegistration: registration,
    registration: returnedRegistration,
    fetchedAt,
    sourceType: "official-profile",
    sourcePath: "/pc/racerprofile + JSJ067",
    ridingStyle,
    currentScore,
    recent4MonthScore,
    officialTotalStarts,
    backCount,
    homeCount,
    winRate: firstNumber([findDeepNumber(jsj067, ["winRate", "syoritu"]), findPercentNearLabel(text, ["勝率"])]),
    quinellaRate: firstNumber([findDeepNumber(jsj067, ["quinellaRate", "nirentairitu"]), findPercentNearLabel(text, ["2連対率", "２連対率"])]),
    trioRate: firstNumber([findDeepNumber(jsj067, ["trioRate", "sanrentairitu"]), findPercentNearLabel(text, ["3連対率", "３連対率"])]),
    rateUnit: "percent",
    winningStyleRates,
    scoreHistory: []
  };
}

function parseOfficialKimariteEvidence({ registration, fetchedAt, date, venueCode, venueName, raceNo, data }) {
  const row = findKimariteContainer(data);
  if (!row) return null;
  const parsed = {};
  for (const key of ["nige", "makuri", "sasi", "mark"]) {
    const src = row[key];
    const F_Cnt = nonNegativeInteger(src?.F_Cnt ?? src?.fCnt ?? src?.first);
    const S_Cnt = nonNegativeInteger(src?.S_Cnt ?? src?.sCnt ?? src?.second);
    const Sum_Cnt = nonNegativeInteger(src?.Sum_Cnt ?? src?.sumCnt ?? src?.sum ?? src?.total);
    if (F_Cnt === null || S_Cnt === null || Sum_Cnt === null || F_Cnt + S_Cnt !== Sum_Cnt) return null;
    parsed[key] = { F_Cnt, S_Cnt, Sum_Cnt };
  }
  const returnedRegistration = normalizeRegistration(
    findFirstScalar(data, ["snum", "registration", "sensyuNo", "sensyuNum"]) || registration
  );
  if (returnedRegistration !== registration) return null;
  return {
    status: "verified",
    identityPassed: true,
    targetIdentityPassed: true,
    requestedRegistration: registration,
    registration: returnedRegistration,
    fetchedAt,
    sourceType: "JSJ068",
    sourcePath: "/pc/json?type=JSJ068",
    target: { date, venueCode: String(venueCode).padStart(2, "0"), venueName, raceNo: Number(raceNo) },
    ...parsed,
    totalQuinellaCount: ["nige", "makuri", "sasi", "mark"].reduce((sum, key) => sum + parsed[key].Sum_Cnt, 0)
  };
}

function findKimariteContainer(value) {
  if (!value || typeof value !== "object") return null;
  if (["nige", "makuri", "sasi", "mark"].every(key => value[key] && typeof value[key] === "object")) return value;
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    const found = findKimariteContainer(child);
    if (found) return found;
  }
  return null;
}

function normalizeRegistration(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits ? digits.padStart(6, "0").slice(-6) : "";
}
function nonNegativeInteger(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}
function firstNumber(values) { for (const value of values) { const n = Number(value); if (value !== null && value !== undefined && value !== "" && Number.isFinite(n)) return n; } return null; }
function firstInteger(values) { for (const value of values) { const n = Number(value); if (value !== null && value !== undefined && value !== "" && Number.isSafeInteger(n) && n >= 0) return n; } return null; }
function evidenceFirstText(values) { for (const value of values) if (String(value ?? "").trim()) return String(value).trim(); return null; }
function decodeHtmlText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&#37;|&percnt;/gi, "%").replace(/\s+/g, " ").trim();
}
function findRegistrationInText(text) { const m = String(text || "").match(/(?:登録番号|登録No\.?|登録Ｎｏ\.?)\s*[:：]?\s*(\d{5,6})/i); return m?.[1] || ""; }
function findNumberNearLabel(text, labels, secondaryLabels = []) {
  const source = String(text || "");
  for (const label of labels) {
    const index = source.indexOf(label); if (index < 0) continue;
    let segment = source.slice(index, index + 180);
    if (secondaryLabels.length) {
      const secondary = secondaryLabels.find(item => segment.includes(item));
      if (secondary) segment = segment.slice(segment.indexOf(secondary));
    }
    const m = segment.match(/(-?\d+(?:\.\d+)?)/); if (m) return Number(m[1]);
  }
  return null;
}
function findPercentNearLabel(text, labels) {
  const source = String(text || "");
  for (const label of labels) {
    const index = source.indexOf(label); if (index < 0) continue;
    const m = source.slice(index, index + 80).match(/(\d+(?:\.\d+)?)\s*%/); if (m) return Number(m[1]);
  }
  return null;
}
function findCompactStat(text, letter) { const m = String(text || "").match(new RegExp(`(?:^|\\s)${letter}\\s*[:：]?\\s*(\\d+)(?:\\s|$)`, "i")); return m ? Number(m[1]) : null; }
function findTextNearLabel(text, labels, maxLen = 20) { const source = String(text || ""); for (const label of labels) { const i = source.indexOf(label); if (i < 0) continue; const rest = source.slice(i + label.length, i + label.length + maxLen).replace(/^\s*[:：]?\s*/, ""); const m = rest.match(/^([^\s|/]+)/); if (m) return m[1]; } return null; }
function findFirstScalar(value, keys) { for (const key of keys) { const found = findDeepScalar(value, key); if (found !== null && found !== undefined && found !== "") return found; } return null; }
function findDeepScalar(value, wantedKey) { if (!value || typeof value !== "object") return null; if (!Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, wantedKey) && ["string","number"].includes(typeof value[wantedKey])) return value[wantedKey]; for (const child of Array.isArray(value) ? value : Object.values(value)) { const found = findDeepScalar(child, wantedKey); if (found !== null && found !== undefined) return found; } return null; }
function findDeepNumber(value, keys) { return firstNumber(keys.map(key => findDeepScalar(value, key))); }
function findDeepText(value, keys) { return evidenceFirstText(keys.map(key => findDeepScalar(value, key))); }

export function fetchKeirinOfficialResult(params) {
  return fetchKeirinOfficialData({ ...params, includeResult: true, includeEvidence: false });
}

async function openScheduleCell(page, { venueName, venueCode, day, date }) {
  const result = await safeEvaluate(page, 
    ({ venueName, venueCode, day, date }) => {
      const norm = value =>
        String(value || "").replace(/\s+/g, "").trim();

      const rows = [...document.querySelectorAll("tr")];
      const rowCandidates = rows.map(tr => ({
        tr,
        cells: [...tr.querySelectorAll(":scope > th, :scope > td")]
      })).filter(item => item.cells.length >= 2);

      // 子孫に全会場表を含む外側trを除外し、先頭の直接セルだけで会場を確定する。
      const row = rowCandidates.find(({ cells }) =>
        [...cells[0].querySelectorAll("a[href]")].some(a => {
          try {
            const url = new URL(a.href, location.href);
            return ["jocd", "jcd", "bkcd"].some(key =>
              String(url.searchParams.get(key) || "").padStart(2, "0") === venueCode
            );
          } catch { return false; }
        })
      )?.tr || rowCandidates.find(({ cells }) =>
        norm(cells[0].textContent) === norm(venueName)
      )?.tr;

      if (!row) {
        return {
          ok: false,
          reason: "venue-row-not-found",
          venueName,
          venueCode,
          rowCount: rows.length
        };
      }

      const rawCells = [...row.querySelectorAll(":scope > th, :scope > td")];

      if (rawCells.length < 2) {
        return {
          ok: false,
          reason: "venue-row-has-no-date-cells",
          rowHtml: row.innerHTML.slice(0, 2000)
        };
      }

      /*
       * 先頭セルは競輪場名。
       * 開催期間は colspan="3" のように複数日を1セルにまとめる場合がある。
       * そのためDOM配列番号ではなく論理上の日付範囲を積算する。
       */
      let logicalDay = 1;
      let targetCell = null;
      let targetRange = null;
      const cellAudit = [];

      for (let index = 1; index < rawCells.length; index += 1) {
        const cell = rawCells[index];
        const colspan = Math.max(
          1,
          Number.parseInt(cell.getAttribute("colspan") || "1", 10) || 1
        );

        const startDay = logicalDay;
        const endDay = logicalDay + colspan - 1;

        cellAudit.push({
          index,
          startDay,
          endDay,
          colspan,
          text: norm(cell.textContent),
          html: cell.innerHTML.slice(0, 350)
        });

        if (day >= startDay && day <= endDay) {
          targetCell = cell;
          targetRange = {
            index,
            startDay,
            endDay,
            colspan
          };
          break;
        }

        logicalDay += colspan;
      }

      if (!targetCell) {
        return {
          ok: false,
          reason: "logical-date-cell-not-found",
          requestedDay: day,
          logicalDayReached: logicalDay,
          cellAudit
        };
      }

      const clickable =
        targetCell.querySelector(
          "a[href],button,input[type=submit],input[type=image],[onclick]"
        );

      if (clickable) {
        const href =
          clickable.href ||
          clickable.getAttribute("href") ||
          null;

        const onclick =
          clickable.getAttribute("onclick") ||
          null;

        clickable.click();

        return {
          ok: true,
          mode: "colspan-target-clickable",
          href,
          onclick,
          targetRange,
          targetHtml: targetCell.innerHTML.slice(0, 1200),
          cellAudit
        };
      }

      // imgだけがあり、親要素がクリック処理を持つケース。
      const image = targetCell.querySelector("img");

      if (image) {
        const clickableParent = image.closest(
          "a[href],button,[onclick],td[onclick]"
        );

        if (clickableParent) {
          const href =
            clickableParent.href ||
            clickableParent.getAttribute("href") ||
            null;

          const onclick =
            clickableParent.getAttribute("onclick") ||
            null;

          clickableParent.click();

          return {
            ok: true,
            mode: "colspan-image-parent-click",
            href,
            onclick,
            targetRange,
            targetHtml: targetCell.innerHTML.slice(0, 1200),
            cellAudit
          };
        }

        /*
         * イベントリスナーがJavaScriptから付与されており
         * onclick属性がHTMLに存在しないケースではセル自体をクリックする。
         */
        targetCell.click();

        return {
          ok: true,
          mode: "colspan-image-cell-click",
          targetRange,
          targetHtml: targetCell.innerHTML.slice(0, 1200),
          cellAudit
        };
      }

      /*
       * 対象日が結合セル内でも、リンクが会場行の別要素に置かれる場合がある。
       * 会場コードを含むレース関連リンクを行全体から検索する。
       */
      const rowLink = [...row.querySelectorAll("a[href]")].find(a => {
        const href = a.href || "";
        return (
          (
            href.includes(`jocd=${venueCode}`) ||
            href.includes(`jcd=${venueCode}`) ||
            href.includes(`bkcd=${venueCode}`)
          ) &&
          (
            href.includes(date) ||
            href.includes("race") ||
            href.includes("kaisai")
          )
        );
      });

      if (rowLink) {
        const href = rowLink.href;
        rowLink.click();

        return {
          ok: true,
          mode: "venue-row-race-link",
          href,
          targetRange,
          targetHtml: targetCell.innerHTML.slice(0, 1200),
          cellAudit
        };
      }

      return {
        ok: false,
        reason: "target-colspan-cell-not-clickable",
        targetRange,
        targetText: norm(targetCell.textContent),
        targetHtml: targetCell.innerHTML.slice(0, 2000),
        rowHtml: row.innerHTML.slice(0, 4000),
        cellAudit
      };
    },
    { venueName, venueCode, day, date }
  );

  if (result.ok) {
    await page.waitForTimeout(1500);
    await page.waitForLoadState("domcontentloaded").catch(() => {});
  }

  return result;
}

async function moveToMobileRacePage(page, { venueName, venueCode }) {
  /*
   * /sp/にいるだけでは目的会場へ到達済みとはみなさない。
   * 現在の公式JSONまたはページ表示で会場名を確認する。
   */
  const currentVenue = await safeEvaluate(page, async ({ base }) => {
    const tokenElement = document.querySelector("#hhEncSelR");
    const token =
      tokenElement && "value" in tokenElement
        ? String(tokenElement.value || "")
        : "";

    if (token) {
      try {
        const response = await fetch(
          `${base}/sp/json?encp=${encodeURIComponent(token)}` +
          "&type=JSJ035",
          {
            credentials: "include",
            headers: { Accept: "application/json" }
          }
        );

        const data = await response.json();
        const found = findVenue(data);

        if (found) {
          return { venueName: found, mode: "json" };
        }
      } catch {}
    }

    const bodyText = String(document.body?.innerText || "")
      .replace(/\s+/g, " ");

    return {
      venueName: "",
      bodyText: bodyText.slice(0, 2000),
      mode: "body"
    };

    function findVenue(value, visited = new Set()) {
      if (
        !value ||
        typeof value !== "object" ||
        visited.has(value)
      ) {
        return "";
      }

      visited.add(value);

      if (!Array.isArray(value)) {
        const name = value.joName || value.venueName;
        if (name) return String(name);
      }

      const children = Array.isArray(value)
        ? value
        : Object.values(value);

      for (const child of children) {
        const found = findVenue(child, visited);
        if (found) return found;
      }

      return "";
    }
  }, { base: BASE });

  if (
    currentVenue.venueName === venueName ||
    (
      !currentVenue.venueName &&
      currentVenue.bodyText?.includes(venueName)
    )
  ) {
    return {
      ok: true,
      mode: "already-correct-mobile-venue",
      currentVenue
    };
  }

  /*
   * 現在ページ内に目的会場のスマホ向けリンクがある場合は直接移動。
   */
  const mobileHref = await safeEvaluate(page, 
    ({ venueName, venueCode }) => {
      const norm = value =>
        String(value || "").replace(/\s+/g, "").trim();

      const candidates = [...document.querySelectorAll("a[href]")];

      const byCode = candidates.find(a => {
        const href = a.href || "";
        return (
          href.includes("/sp/") &&
          (
            href.includes(`jocd=${venueCode}`) ||
            href.includes(`jcd=${venueCode}`) ||
            href.includes(`bkcd=${venueCode}`)
          )
        );
      });

      if (byCode) return byCode.href;

      const byName = candidates.find(a => {
        const href = a.href || "";
        const text = norm(a.textContent);

        return (
          href.includes("/sp/") &&
          text.includes(norm(venueName))
        );
      });

      return byName ? byName.href : null;
    },
    { venueName, venueCode }
  );

  if (mobileHref) {
    await page.goto(mobileHref, {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    return {
      ok: true,
      mode: "venue-specific-mobile-link",
      mobileHref
    };
  }

  /*
   * 会場が違う場合は必ずスマホトップへ戻り、
   * 会場コードまたは会場名で対象リンクを選択する。
   */
  await page.goto(`${BASE}/sp/top`, {
    waitUntil: "domcontentloaded",
    timeout: 30000
  });

  const venueClick = await safeEvaluate(page, 
    ({ venueName, venueCode }) => {
      const norm = value =>
        String(value || "").replace(/\s+/g, "").trim();

      const links = [...document.querySelectorAll(
        "a[href],button,[onclick],[role=button]"
      )];

      const ranked = links
        .map(element => {
          const href = String(element.getAttribute("href") || "");
          const onclick = String(
            element.getAttribute("onclick") || ""
          );
          const text = norm(element.textContent);
          const searchable = `${href} ${onclick} ${text}`;

          let score = 0;

          if (
            href.includes(`jocd=${venueCode}`) ||
            href.includes(`jcd=${venueCode}`) ||
            href.includes(`bkcd=${venueCode}`) ||
            onclick.includes(`'${venueCode}'`) ||
            onclick.includes(`"${venueCode}"`)
          ) {
            score += 200;
          }

          if (text === norm(venueName)) score += 150;
          else if (text.includes(norm(venueName))) score += 100;

          const rect = element.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) score += 20;

          return { element, score, text, href, onclick };
        })
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score);

      const selected = ranked[0];
      if (!selected) {
        return {
          ok: false,
          reason: "venue-target-not-found",
          candidateCount: ranked.length
        };
      }

      const clickable =
        selected.element.closest(
          "a[href],button,[onclick],[role=button]"
        ) || selected.element;

      clickable.scrollIntoView({
        block: "center",
        inline: "center"
      });
      clickable.click();

      return {
        ok: true,
        text: selected.text,
        href: selected.href,
        onclick: selected.onclick
      };
    },
    { venueName, venueCode }
  );

  if (!venueClick.ok) {
    return {
      ok: false,
      mode: "mobile-target-not-found",
      currentVenue,
      venueClick
    };
  }

  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await page.waitForTimeout(1000);

  return {
    ok: true,
    mode: "mobile-top-verified-venue-click",
    currentVenue,
    venueClick
  };
}


async function selectRequestedDate(page, { date, venueName, venueCode }) {
  const wanted=String(date||"").replace(/\D/g,"").slice(0,8);
  if(!/^\d{8}$/.test(wanted))return{ok:false,clicked:false,reason:"invalid-requested-date"};
  const initial=await readCurrentIdentity(page);
  if(initial.venueName&&initial.venueName!==venueName)return{ok:false,clicked:false,reason:"venue-context-mismatch",expectedVenue:venueName,actualVenue:initial.venueName,initial};
  if(initial.normalizedDate===wanted&&initial.venueName===venueName)return{ok:true,clicked:false,mode:"already-correct-date",initial};
  const month=Number(wanted.slice(4,6)),day=Number(wanted.slice(6,8));
  const candidates=await safeEvaluate(page,({wanted,month,day,venueCode})=>{
    const norm=value=>String(value||"").replace(/\s+/g,"").trim();
    return [...document.querySelectorAll("a[href],button,[onclick],[role=button]")].map((element,domIndex)=>{
      const text=norm(element.textContent||element.getAttribute("aria-label")||element.getAttribute("title")||"");
      const href=String(element.getAttribute("href")||""),onclick=String(element.getAttribute("onclick")||"");
      const searchable=norm(`${text} ${href} ${onclick}`),digits=searchable.replace(/\D/g,"");
      const full=digits.includes(wanted)||searchable.includes(wanted);
      const short=new RegExp(`(^|\\D)0?${month}[\\/.-]0?${day}(\\D|$)`).test(text);
      if(!full&&!short)return null;
      const mentioned=[...searchable.matchAll(/(?:jocd|jcd|bkcd)[=:'"(]*([0-9]{1,2})/gi)].map(m=>m[1].padStart(2,"0"));
      if(mentioned.length&&!mentioned.includes(venueCode))return null;
      const rect=element.getBoundingClientRect(),style=getComputedStyle(element);
      if(rect.width<=0||rect.height<=0||style.display==="none"||style.visibility==="hidden")return null;
      return{domIndex,score:full?2:1,text,href,onclick,id:String(element.id||"")};
    }).filter(Boolean).sort((a,b)=>b.score-a.score||a.domIndex-b.domIndex);
  },{wanted,month,day,venueCode});
  const attempts=[];
  for(let index=0;index<candidates.length;index++){
    const clicked=await safeEvaluate(page,domIndex=>{
      const elements=[...document.querySelectorAll("a[href],button,[onclick],[role=button]")];
      const target=elements[domIndex];if(!target)return false;target.scrollIntoView?.({block:"center"});target.click();return true;
    },candidates[index].domIndex);
    if(!clicked)continue;
    await page.waitForLoadState("domcontentloaded").catch(()=>{});await page.waitForTimeout(800);
    const identity=await readCurrentIdentity(page);attempts.push({candidate:candidates[index],identity});
    if(identity.normalizedDate===wanted&&identity.venueName===venueName)return{ok:true,clicked:true,mode:"strict-date-identity-match",identity,attempts,candidateAudit:candidates};
  }
  return{ok:false,clicked:attempts.length>0,reason:"strict-date-target-not-found",expected:{date:wanted,venueName,venueCode},initial,final:await readCurrentIdentity(page),attempts,candidateAudit:candidates};
}

async function selectRequestedDateLegacy(page, { date, venueName, venueCode }) {
  const wanted = String(date || "").replace(/\D/g, "").slice(0, 8);
  if (!/^\d{8}$/.test(wanted)) {
    return { ok: false, clicked: false, reason: "invalid-requested-date" };
  }

  const initial = await readCurrentIdentity(page);
  if (initial.normalizedDate === wanted) {
    return {
      ok: true,
      clicked: false,
      mode: "already-correct-date",
      initial
    };
  }

  const year = wanted.slice(0, 4);
  const month = Number(wanted.slice(4, 6));
  const day = Number(wanted.slice(6, 8));
  const month2 = String(month).padStart(2, "0");
  const day2 = String(day).padStart(2, "0");

  const candidateAudit = await safeEvaluate(page, 
    ({ wanted, year, month, day, month2, day2, venueName, venueCode }) => {
      const normalize = value => String(value || "").replace(/\s+/g, "").trim();
      const patterns = [
        wanted,
        `${year}/${month2}/${day2}`,
        `${year}-${month2}-${day2}`,
        `${year}.${month2}.${day2}`,
        `${month2}/${day2}`,
        `${month}/${day}`,
        `${month2}-${day2}`,
        `${month}-${day}`,
        `${month}月${day}日`,
        `${month2}月${day2}日`,
        `${day}日`,
        String(day)
      ].map(normalize);

      return [...document.querySelectorAll(
        "a[href],button,input,[onclick],[role=button],option,label"
      )]
        .map((element, domIndex) => {
          const text = normalize(
            element.textContent ||
            element.getAttribute?.("value") ||
            element.getAttribute?.("aria-label") ||
            element.getAttribute?.("title") ||
            ""
          );
          const href = String(element.getAttribute?.("href") || "");
          const onclick = String(element.getAttribute?.("onclick") || "");
          const value = String(element.getAttribute?.("value") || "");
          const id = String(element.id || "");
          const className = String(element.className || "");
          const searchable = normalize(`${text} ${href} ${onclick} ${value}`);
          const digits = searchable.replace(/\D/g, "");

          let score = 0;
          if (digits.includes(wanted)) score += 600;
          if (searchable.includes(wanted)) score += 600;
          for (const pattern of patterns) {
            if (pattern && searchable.includes(pattern)) score += 120;
          }
          if (text === `${month}/${day}` || text === `${month2}/${day2}`) score += 350;
          if (text === String(day) || text === `${day}日`) score += 250;
          if (/date|day|kaisai|event|race|calendar/i.test(`${href} ${onclick} ${id} ${className}`)) score += 70;
          if (
            href.includes(`jocd=${venueCode}`) ||
            href.includes(`jcd=${venueCode}`) ||
            href.includes(`bkcd=${venueCode}`) ||
            onclick.includes(`'${venueCode}'`) ||
            onclick.includes(`"${venueCode}"`)
          ) score += 40;
          if (venueName && searchable.includes(normalize(venueName))) score += 30;

          const rect = element.getBoundingClientRect?.() || { width: 0, height: 0 };
          const style = getComputedStyle(element);
          const visible = rect.width > 0 && rect.height > 0 &&
            style.display !== "none" && style.visibility !== "hidden";
          if (visible) score += 30;

          return score > 0 ? {
            domIndex,
            score,
            text,
            href,
            onclick,
            value,
            tagName: element.tagName,
            id,
            className
          } : null;
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score)
        .slice(0, 40);
    },
    { wanted, year, month, day, month2, day2, venueName, venueCode }
  );

  const attempts = [];
  for (let index = 0; index < candidateAudit.length; index += 1) {
    const clicked = await safeEvaluate(page, 
      ({ candidateIndex, wanted, year, month, day, month2, day2, venueName, venueCode }) => {
        const normalize = value => String(value || "").replace(/\s+/g, "").trim();
        const patterns = [
          wanted, `${year}/${month2}/${day2}`, `${year}-${month2}-${day2}`,
          `${year}.${month2}.${day2}`, `${month2}/${day2}`, `${month}/${day}`,
          `${month2}-${day2}`, `${month}-${day}`, `${month}月${day}日`,
          `${month2}月${day2}日`, `${day}日`, String(day)
        ].map(normalize);

        const ranked = [...document.querySelectorAll(
          "a[href],button,input,[onclick],[role=button],option,label"
        )]
          .map(element => {
            const text = normalize(
              element.textContent || element.getAttribute?.("value") ||
              element.getAttribute?.("aria-label") || element.getAttribute?.("title") || ""
            );
            const href = String(element.getAttribute?.("href") || "");
            const onclick = String(element.getAttribute?.("onclick") || "");
            const value = String(element.getAttribute?.("value") || "");
            const id = String(element.id || "");
            const className = String(element.className || "");
            const searchable = normalize(`${text} ${href} ${onclick} ${value}`);
            const digits = searchable.replace(/\D/g, "");
            let score = 0;
            if (digits.includes(wanted)) score += 600;
            if (searchable.includes(wanted)) score += 600;
            for (const pattern of patterns) if (pattern && searchable.includes(pattern)) score += 120;
            if (text === `${month}/${day}` || text === `${month2}/${day2}`) score += 350;
            if (text === String(day) || text === `${day}日`) score += 250;
            if (/date|day|kaisai|event|race|calendar/i.test(`${href} ${onclick} ${id} ${className}`)) score += 70;
            if (href.includes(`jocd=${venueCode}`) || href.includes(`jcd=${venueCode}`) ||
                href.includes(`bkcd=${venueCode}`) || onclick.includes(`'${venueCode}'`) ||
                onclick.includes(`"${venueCode}"`)) score += 40;
            if (venueName && searchable.includes(normalize(venueName))) score += 30;
            const rect = element.getBoundingClientRect?.() || { width: 0, height: 0 };
            const style = getComputedStyle(element);
            if (rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden") score += 30;
            return score > 0 ? { element, score } : null;
          })
          .filter(Boolean)
          .sort((a, b) => b.score - a.score);

        const selected = ranked[candidateIndex]?.element;
        if (!selected) return false;
        if (selected.tagName === "OPTION") {
          const select = selected.closest("select");
          if (!select) return false;
          select.value = selected.value;
          select.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }
        const clickable = selected.closest("a[href],button,[onclick],[role=button],label") || selected;
        clickable.scrollIntoView?.({ block: "center", inline: "center" });
        clickable.click();
        return true;
      },
      { candidateIndex: index, wanted, year, month, day, month2, day2, venueName, venueCode }
    );

    if (!clicked) continue;
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForTimeout(1000);
    const identity = await readCurrentIdentity(page);
    attempts.push({ candidateIndex: index, candidate: candidateAudit[index], identity });
    if (identity.normalizedDate === wanted) {
      return {
        ok: true,
        clicked: true,
        mode: "date-candidate-click",
        candidateIndex: index,
        identity,
        attempts,
        candidateAudit
      };
    }
  }

  // 日付候補が見つからなくても、開催日程で会場と日付は確認済み。
  // ここでは処理を止めず、次のレース選択でトークン生成と日付確認を行う。
  return {
    ok: false,
    clicked: attempts.length > 0,
    continueToRaceSelection: true,
    reason: candidateAudit.length ? "date-candidates-did-not-match" : "date-candidate-not-found",
    expectedDate: wanted,
    initial,
    final: await readCurrentIdentity(page),
    attempts,
    candidateAudit
  };
}

async function readCurrentIdentity(page) {
  return safeEvaluate(page, async base => {
    const normalizeDate = value => String(value || "").replace(/[^0-9]/g, "").slice(0, 8);
    const tokenElement = document.querySelector("#hhEncSelR");
    const token = tokenElement && "value" in tokenElement ? String(tokenElement.value || "") : "";
    if (!token) return { raceNo: 0, venueName: "", date: "", normalizedDate: "", tokenLength: 0, reason: "token-empty" };
    try {
      const response = await fetch(`${base}/sp/json?encp=${encodeURIComponent(token)}&type=JSJ035`, { credentials: "include", headers: { Accept: "application/json" } });
      const data = await response.json();
      const find = (value, visited = new Set()) => {
        if (!value || typeof value !== "object" || visited.has(value)) return null;
        visited.add(value);
        if (!Array.isArray(value)) {
          const raceNo = value.selRaceNo ?? value.raceNo ?? value.rnum;
          if (raceNo !== undefined) return { raceNo: Number(raceNo || 0), venueName: String(value.joName ?? value.venueName ?? ""), date: String(value.txtEventDate ?? value.eventDate ?? "") };
        }
        for (const child of (Array.isArray(value) ? value : Object.values(value))) {
          const found = find(child, visited);
          if (found && found.raceNo > 0) return found;
        }
        return null;
      };
      const identity = find(data) || { raceNo: 0, venueName: "", date: "" };
      return { ...identity, normalizedDate: normalizeDate(identity.date), tokenLength: token.length, status: response.status };
    } catch (error) {
      return { raceNo: 0, venueName: "", date: "", normalizedDate: "", tokenLength: token.length, reason: error.message };
    }
  }, BASE);
}

async function clickRace(page, {
  raceNo,
  venueName,
  date
}) {
  const verifyCurrentRace = async mode => {
    const result = await safeEvaluate(page, 
      async ({
        base,
        expectedRaceNo,
        expectedVenueName,
        expectedDate
      }) => {
        const tokenElement = document.querySelector("#hhEncSelR");
        const token =
          tokenElement && "value" in tokenElement
            ? String(tokenElement.value || "")
            : "";

        if (!token) {
          return {
            ok: false,
            actualRaceNo: 0,
            tokenLength: 0,
            reason: "token-empty"
          };
        }

        try {
          const response = await fetch(
            `${base}/sp/json?encp=${encodeURIComponent(token)}` +
            "&type=JSJ035",
            {
              credentials: "include",
              headers: { Accept: "application/json" }
            }
          );

          const data = await response.json();
          const identity = findIdentity(data);

          const actualVenueName =
            String(identity.venueName || "").trim();
          const actualDate =
            normalizeDate(identity.date);
          const wantedDate =
            normalizeDate(expectedDate);

          const raceMatches =
            Number(identity.raceNo) === Number(expectedRaceNo);

          const venueMatches =
            !expectedVenueName ||
            actualVenueName === String(expectedVenueName).trim();

          const dateMatches =
            !wantedDate ||
            actualDate === wantedDate;

          return {
            ok:
              response.ok &&
              raceMatches &&
              venueMatches &&
              dateMatches,
            actualRaceNo: Number(identity.raceNo || 0),
            venueName: actualVenueName,
            date: String(identity.date || ""),
            normalizedDate: actualDate,
            expectedDate: wantedDate,
            raceMatches,
            venueMatches,
            dateMatches,
            tokenLength: token.length,
            status: response.status,
            reason:
              raceMatches && venueMatches && dateMatches
                ? ""
                : "identity-mismatch"
          };
        } catch (error) {
          return {
            ok: false,
            actualRaceNo: 0,
            tokenLength: token.length,
            reason: error.message
          };
        }

        function normalizeDate(value) {
          return String(value || "")
            .replace(/[^0-9]/g, "")
            .slice(0, 8);
        }

        function findIdentity(value, visited = new Set()) {
          if (
            !value ||
            typeof value !== "object" ||
            visited.has(value)
          ) {
            return {
              raceNo: 0,
              venueName: "",
              date: ""
            };
          }

          visited.add(value);

          if (!Array.isArray(value)) {
            const raceNo =
              value.selRaceNo ??
              value.raceNo ??
              value.rnum;

            if (raceNo !== undefined) {
              return {
                raceNo,
                venueName:
                  value.joName ??
                  value.venueName ??
                  "",
                date:
                  value.txtEventDate ??
                  value.eventDate ??
                  ""
              };
            }
          }

          const children = Array.isArray(value)
            ? value
            : Object.values(value);

          for (const child of children) {
            const found = findIdentity(child, visited);
            if (Number(found.raceNo) > 0) {
              return found;
            }
          }

          return {
            raceNo: 0,
            venueName: "",
            date: ""
          };
        }
      },
      {
        base: BASE,
        expectedRaceNo: raceNo,
        expectedVenueName: venueName,
        expectedDate: date
      }
    );

    return { mode, ...result };
  };

  /*
   * すでに目的のRが開かれている場合はクリックしない。
   * 1Rはこの経路になることが多い。
   */
  const initialVerification = await verifyCurrentRace("already-selected");
  if (initialVerification.ok) {
    return {
      clicked: false,
      verified: true,
      verification: initialVerification,
      candidateAudit: []
    };
  }

  const candidateAudit = await safeEvaluate(page, raceNo => {
    const normalize = value =>
      String(value || "").replace(/\s+/g, "").trim();

    const exactLabels = new Set([
      `${raceNo}R`,
      `${raceNo}Ｒ`,
      String(raceNo)
    ]);

    const all = [...document.querySelectorAll(
      "a,button,input,[onclick],[role=button]"
    )];

    return all
      .map((element, domIndex) => {
        const text = normalize(
          element.textContent ||
          element.getAttribute("value") ||
          element.getAttribute("aria-label") ||
          element.getAttribute("title") ||
          element.innerText ||
          ""
        );

        const onclick = String(element.getAttribute("onclick") || "");
        const href = String(element.getAttribute("href") || "");
        const id = String(element.id || "");
        const className = String(element.className || "");

        const exactText = exactLabels.has(text);
        const racePattern = new RegExp(
          `(^|\\D)${raceNo}\\s*[RＲ]($|\\D)`
        ).test(text);

        const scriptMentionsRace =
          new RegExp(`(^|\\D)${raceNo}($|\\D)`).test(onclick) ||
          new RegExp(`(^|\\D)${raceNo}($|\\D)`).test(href);

        if (!exactText && !racePattern && !scriptMentionsRace) {
          return null;
        }

        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const visible =
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden";

        let score = 0;
        if (visible) score += 100;
        if (exactText) score += 100;
        if (racePattern) score += 50;
        if (onclick) score += 30;
        if (href) score += 20;
        if (/race|rnum|sel/i.test(
          `${id} ${className} ${onclick} ${href}`
        )) {
          score += 20;
        }

        return {
          domIndex,
          score,
          text,
          tagName: element.tagName,
          id,
          className,
          onclick,
          href
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, 40);
  }, raceNo);

  const attempts = [];

  for (let index = 0; index < candidateAudit.length; index += 1) {
    const clicked = await safeEvaluate(page, 
      ({ raceNo, candidateIndex }) => {
        const normalize = value =>
          String(value || "").replace(/\s+/g, "").trim();

        const exactLabels = new Set([
          `${raceNo}R`,
          `${raceNo}Ｒ`,
          String(raceNo)
        ]);

        const ranked = [...document.querySelectorAll(
          "a,button,input,[onclick],[role=button]"
        )]
          .map(element => {
            const text = normalize(
              element.textContent ||
              element.getAttribute("value") ||
              element.getAttribute("aria-label") ||
              element.getAttribute("title") ||
              element.innerText ||
              ""
            );

            const onclick = String(
              element.getAttribute("onclick") || ""
            );
            const href = String(
              element.getAttribute("href") || ""
            );
            const id = String(element.id || "");
            const className = String(element.className || "");

            const exactText = exactLabels.has(text);
            const racePattern = new RegExp(
              `(^|\\D)${raceNo}\\s*[RＲ]($|\\D)`
            ).test(text);

            const scriptMentionsRace =
              new RegExp(`(^|\\D)${raceNo}($|\\D)`).test(onclick) ||
              new RegExp(`(^|\\D)${raceNo}($|\\D)`).test(href);

            if (
              !exactText &&
              !racePattern &&
              !scriptMentionsRace
            ) {
              return null;
            }

            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            const visible =
              rect.width > 0 &&
              rect.height > 0 &&
              style.display !== "none" &&
              style.visibility !== "hidden";

            let score = 0;
            if (visible) score += 100;
            if (exactText) score += 100;
            if (racePattern) score += 50;
            if (onclick) score += 30;
            if (href) score += 20;
            if (/race|rnum|sel/i.test(
              `${id} ${className} ${onclick} ${href}`
            )) {
              score += 20;
            }

            return { element, score };
          })
          .filter(Boolean)
          .sort((a, b) => b.score - a.score);

        const selected = ranked[candidateIndex]?.element;
        if (!selected) return false;

        const clickable =
          selected.closest(
            "a,button,[onclick],[role=button]"
          ) || selected;

        clickable.scrollIntoView({
          block: "center",
          inline: "center"
        });
        clickable.click();
        return true;
      },
      { raceNo, candidateIndex: index }
    );

    if (!clicked) continue;

    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForFunction(
  () => {
    const element = document.querySelector("#hhEncSelR");
    return Boolean(
      element &&
      "value" in element &&
      String(element.value || "").trim()
    );
  },
  null,
  { timeout: 5000 }
).catch(() => {});

    const verification = await verifyCurrentRace(
      `candidate-${index}`
    );

    attempts.push({
      candidateIndex: index,
      candidate: candidateAudit[index],
      verification
    });

    /*
     * トークンが変化しただけでは成功にしない。
     * JSJ035の実R番号が一致した場合だけ確定する。
     */
    if (verification.ok) {
      return {
        clicked: true,
        verified: true,
        candidateIndex: index,
        verification,
        attempts,
        candidateAudit
      };
    }
  }

  /*
   * 子要素ではなく親要素にイベントがある場合の探索。
   * 各深さをクリックして、その都度JSJ035で確認する。
   */
  for (let depth = 0; depth <= 6; depth += 1) {
    const clicked = await safeEvaluate(page, 
      ({ raceNo, depth }) => {
        const normalize = value =>
          String(value || "").replace(/\s+/g, "").trim();

        const targets = [...document.querySelectorAll("*")]
          .filter(element => {
            const own = normalize(
              element.textContent ||
              element.getAttribute?.("value") ||
              ""
            );

            return (
              own === `${raceNo}R` ||
              own === `${raceNo}Ｒ`
            );
          });

        const target = targets[0];
        if (!target) return false;

        let current = target;
        for (let step = 0; step < depth; step += 1) {
          current = current.parentElement;
          if (!current) return false;
        }

        current.scrollIntoView({
          block: "center",
          inline: "center"
        });
        current.click();
        return true;
      },
      { raceNo, depth }
    );

    if (!clicked) continue;

    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForFunction(
  () => {
    const element = document.querySelector("#hhEncSelR");
    return Boolean(
      element &&
      "value" in element &&
      String(element.value || "").trim()
    );
  },
  null,
  { timeout: 5000 }
).catch(() => {});

    const verification = await verifyCurrentRace(
      `parent-depth-${depth}`
    );

    attempts.push({
      parentDepth: depth,
      verification
    });

    if (verification.ok) {
      return {
        clicked: true,
        verified: true,
        mode: "parent-fallback",
        parentDepth: depth,
        verification,
        attempts,
        candidateAudit
      };
    }
  }

  return {
    clicked: attempts.length > 0,
    verified: false,
    attempts,
    candidateAudit
  };
}


async function probeOfficialJsonTypes(
  page,
  encp,
  {
    numbers,
    concurrency = 12,
    requestTimeoutMs = 1400,
    totalBudgetMs = 12000
  }
) {
  const attempted = [];
  const results = {};
  const successfulTypes = [];
  const participantCandidateTypes = [];
  const startedAt = Date.now();
  const queue = [...numbers];

  while (queue.length > 0 && Date.now() - startedAt < totalBudgetMs) {
    const batch = queue.splice(0, concurrency);
    const batchResults = await safeEvaluate(page, 
      async ({ base, encp, numbers, requestTimeoutMs }) => {
        return Promise.all(numbers.map(async number => {
          const type = `JSJ${String(number).padStart(3, "0")}`;
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
          try {
            const response = await fetch(
              `${base}/sp/json?encp=${encodeURIComponent(encp)}` +
              `&type=${encodeURIComponent(type)}`,
              {
                method: "GET",
                credentials: "include",
                headers: { Accept: "application/json" },
                signal: controller.signal
              }
            );
            const text = await response.text();
            let data = null;
            try { data = JSON.parse(text); } catch {}
            return {
              type,
              status: response.status,
              ok: response.ok && data !== null,
              textLength: text.length,
              data,
              participantLikeCount:
                data === null ? 0 : countParticipantLikeObjects(data)
            };
          } catch (error) {
            return {
              type,
              status: 0,
              ok: false,
              textLength: 0,
              data: null,
              participantLikeCount: 0,
              error: error instanceof Error ? error.message : String(error)
            };
          } finally {
            clearTimeout(timer);
          }
        }));

        function countParticipantLikeObjects(value) {
          const visited = new Set();
          let count = 0;
          walk(value);
          return count;

          function walk(current) {
            if (!current || typeof current !== "object" || visited.has(current)) return;
            visited.add(current);
            if (!Array.isArray(current)) {
              const hasNumber = ["syaban", "shaban", "carNo", "vehicleNo", "wakuNo", "ban"]
                .some(key => Object.prototype.hasOwnProperty.call(current, key));
              const hasIdentity = ["sensyuRegistNo", "senshuRegistNo", "registNo", "registrationNo", "sensyuName", "senshuName", "playerName"]
                .some(key => Object.prototype.hasOwnProperty.call(current, key));
              if (hasNumber && hasIdentity) count += 1;
            }
            for (const child of (Array.isArray(current) ? current : Object.values(current))) walk(child);
          }
        }
      },
      { base: BASE, encp, numbers: batch, requestTimeoutMs }
    );

    for (const result of batchResults) {
      attempted.push(result.type);
      results[result.type] = result;
      if (result.ok) successfulTypes.push(result.type);
      if (result.participantLikeCount > 0) participantCandidateTypes.push(result.type);
    }

    const hasParticipants = participantCandidateTypes.length > 0;
    const hasUsefulPayloads = successfulTypes.length >= 8;
    if (hasParticipants && hasUsefulPayloads && attempted.length >= 36) break;
  }

  return {
    attempted,
    results,
    successfulTypes,
    participantCandidateTypes,
    elapsedMs: Date.now() - startedAt,
    budgetExceeded: Date.now() - startedAt >= totalBudgetMs
  };
}

function buildPrioritizedJsonTypeNumbers() {
  const priority = [35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60];
  const secondary = [];
  for (let n = 1; n <= 90; n += 1) {
    if (!priority.includes(n)) secondary.push(n);
  }
  return [...priority, ...secondary];
}

async function triggerOfficialJsonRequests(page) {
  const labels = [
    "出走表",
    "選手情報",
    "競走得点",
    "予想",
    "並び予想",
    "オッズ",
    "直前情報"
  ];

  const clicked = [];

  for (const label of labels) {
    const targets = [
      page.getByText(label, { exact: true }).first(),
      page.getByRole("button", { name: label }).first(),
      page.getByRole("link", { name: label }).first()
    ];

    for (const target of targets) {
      if (await target.count()) {
        const visible = await target.isVisible().catch(() => false);

        if (!visible) continue;

        await target.click({
          timeout: 2500,
          force: true
        }).catch(() => {});

        clicked.push(label);
        await page.waitForTimeout(700);
        break;
      }
    }
  }

  const scriptClicks = await safeEvaluate(page, () => {
    const keywords = [
      "sensyu",
      "senshu",
      "member",
      "player",
      "syusso",
      "shusso"
    ];

    const elements = [...document.querySelectorAll(
      "a,button,[onclick],[role=button]"
    )];

    const clicked = [];

    for (const element of elements) {
      const searchable = [
        element.id,
        element.className,
        element.getAttribute("onclick"),
        element.getAttribute("href"),
        element.textContent
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (!keywords.some(keyword => searchable.includes(keyword))) {
        continue;
      }

      const rect = element.getBoundingClientRect();

      if (rect.width <= 0 || rect.height <= 0) {
        continue;
      }

      try {
        element.click();
        clicked.push({
          tag: element.tagName,
          id: element.id || null,
          text: String(element.textContent || "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 80)
        });
      } catch {}
    }

    return clicked.slice(0, 30);
  });

  return {
    labelClicks: clicked,
    scriptClicks
  };
}

function readQueryValue(url, key) {
  try {
    return new URL(url).searchParams.get(key) || "";
  } catch {
    return "";
  }
}

function removeQueryValue(url, key) {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete(key);
    return parsed.toString();
  } catch {
    return url;
  }
}

async function recoverToken(page) {
  return safeEvaluate(page, () => {
    const values = [];

    for (const el of document.querySelectorAll("input")) {
      const id = String(el.id || "");
      const name = String(el.name || "");
      const value = String(el.value || "");

      if ((/enc/i.test(id) || /enc/i.test(name)) && value.length >= 8) {
        values.push(value);
      }
    }

    for (const el of document.querySelectorAll("a[href],form[action],[onclick]")) {
      const raw = [
        el.getAttribute("href"),
        el.getAttribute("action"),
        el.getAttribute("onclick")
      ].filter(Boolean).join(" ");

      for (const match of raw.matchAll(/[?&]encp=([^&"' )]+)/gi)) {
        values.push(decodeURIComponent(match[1]));
      }
    }

    return values[0] || "";
  });
}

async function createPageSnapshot(page) {
  return {
    url: page.url(),
    title: await page.title(),
    hiddenInputs: await safeEvaluate(page, () =>
      [...document.querySelectorAll('input[type="hidden"]')]
        .map(el => ({
          id: el.id || null,
          name: el.name || null,
          valueLength: String(el.value || "").length
        }))
        .slice(0, 120)
    ),
    links: await safeEvaluate(page, () =>
      [...document.querySelectorAll("a[href]")]
        .map(a => ({
          text: String(a.textContent || "").replace(/\s+/g, " ").trim(),
          href: a.href
        }))
        .slice(0, 120)
    ),
    textPreview: (await page.locator("body").innerText().catch(() => ""))
      .replace(/\s+/g, " ")
      .slice(0, 1000)
  };
}


function filterOfficialJsonByRaceIdentity(allJson, expected) {
  const accepted = {};

  for (const [type, data] of Object.entries(allJson)) {
    const identity = extractIdentityFromJson(data);

    if (!identity.hasIdentity) {
      accepted[type] = data;
      continue;
    }

    if (identityMatchesExpected(identity, expected)) {
      accepted[type] = data;
    }
  }

  return accepted;
}

function extractIdentityFromJson(data) {
  const root = findObject(
    data,
    value =>
      hasAnyKey(value, [
        "joName",
        "venueName",
        "txtEventDate",
        "eventDate",
        "selRaceNo",
        "raceNo",
        "rnum"
      ])
  );

  if (!root) {
    return {
      hasIdentity: false,
      venueName: "",
      date: "",
      raceNo: 0
    };
  }

  const venueName = String(
    root.joName ||
    root.venueName ||
    ""
  ).trim();

  const date = normalizeRaceDate(
    root.txtEventDate ||
    root.eventDate ||
    root.kday ||
    ""
  );

  const raceNo = Number(
    root.selRaceNo ||
    root.raceNo ||
    root.rnum ||
    0
  );

  return {
    hasIdentity: Boolean(
      venueName ||
      date ||
      raceNo
    ),
    venueName,
    date,
    raceNo
  };
}

function identityMatchesExpected(actual, expected) {
  const expectedDate = normalizeRaceDate(expected.date);
  const actualDate = normalizeRaceDate(actual.date);

  const venueMatches =
    !actual.venueName ||
    !expected.venueName ||
    actual.venueName === expected.venueName;

  const dateMatches =
    !actualDate ||
    !expectedDate ||
    actualDate === expectedDate;

  const raceMatches =
    !actual.raceNo ||
    !expected.raceNo ||
    Number(actual.raceNo) === Number(expected.raceNo);

  return venueMatches && dateMatches && raceMatches;
}

function normalizeRaceDate(value) {
  return String(value || "")
    .replace(/[^\d]/g, "")
    .slice(0, 8);
}

function extractBasicFromAll(allJson) {
  for (const [type, data] of Object.entries(allJson)) {
    const root = findObject(
      data,
      value =>
        hasAnyKey(value, [
          "joName",
          "txtEventDate",
          "selRaceNo",
          "raceName",
          "aftBetTime"
        ])
    );

    if (!root) continue;

    const result = {
      sourceType: type,
      venueName: String(root.joName || root.joname || ""),
      date: String(root.txtEventDate || root.eventDate || root.kday || ""),
      raceNo: Number(root.selRaceNo || root.raceNo || root.rnum || 0),
      raceName: String(root.raceName || ""),
      grade: String(root.imgGradeAlt || root.grade || ""),
      className: String(root.syumoku || root.className || ""),
      deadline: String(root.aftBetTime || root.bfrBetTime || root.betTime || ""),
      startTime: String(
        root.aftStartTime || root.bfrStartTime || root.startTime || ""
      )
    };

    if (result.venueName || result.date || result.raceNo) {
      return result;
    }
  }

  return {
    sourceType: null,
    venueName: "",
    date: "",
    raceNo: 0,
    raceName: "",
    grade: "",
    className: "",
    deadline: "",
    startTime: ""
  };
}

function extractLinesFromAll(allJson) {
  for (const [type, data] of Object.entries(allJson)) {
    const candidates = [];
    collectLineCandidates(data, type, candidates, "$", new Set());
    const best = candidates
      .filter(items => items.length >= 5 && items.length <= 9)
      .sort((a, b) => lineCandidateScore(b) - lineCandidateScore(a))[0];
    if (best) return best;
  }
  return [];
}

function collectLineCandidates(value, sourceType, output, path, visited) {
  if (!value || typeof value !== "object" || visited.has(value)) return;
  visited.add(value);
  if (Array.isArray(value)) {
    const normalized = value.map((item, index) => normalizeLineItem(item, sourceType, index, `${path}[${index}]`)).filter(Boolean);
    if (normalized.length >= 5) output.push(normalized);
    value.forEach((item, index) => collectLineCandidates(item, sourceType, output, `${path}[${index}]`, visited));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (Array.isArray(child)) {
      const normalized = child.map((item, index) => normalizeLineItem(item, sourceType, index, `${path}.${key}[${index}]`)).filter(Boolean);
      if (normalized.length >= 5) output.push(normalized);
    }
    collectLineCandidates(child, sourceType, output, `${path}.${key}`, visited);
  }
}

function normalizeLineItem(item, sourceType, index, sourcePath) {
  if (item === null || item === undefined) return null;
  if (typeof item !== "object") {
    const number = Number(String(item).replace(/\D/g, ""));
    return number >= 1 && number <= 9 ? { sourceType, sourcePath, order:index+1, position:index+1, number, className:"" } : null;
  }
  const number = firstValidNumber([item.shaban,item.syaban,item.carNo,item.vehicleNo,item.ban,item.number,item.no]);
  if (number < 1 || number > 9) return null;
  return {
    sourceType,
    sourcePath,
    order: firstValidNumber([item.order,item.jun,item.rank,item.narabijun,index+1]) || index+1,
    position: firstValidNumber([item.ichi,item.position,item.pos,index+1]) || index+1,
    number,
    className: firstText([item.classname,item.className,item.lineName,item.groupName])
  };
}

function lineCandidateScore(items) {
  const unique = new Set(items.map(item => item.number)).size;
  const explicit = items.filter(item => item.className || item.position !== item.order).length;
  return unique * 10 + explicit;
}

function extractParticipantsFromAll(allJson) {
  /*
   * 公式JSONでは選手情報が必ずしも5〜9件の配列として
   * まとまっているとは限らない。
   *
   * JSON全体を再帰走査し、車番と選手識別情報を持つ
   * すべてのオブジェクトを候補として収集する。
   */
  const collected = [];

  for (const [sourceType, data] of Object.entries(allJson)) {
    collectParticipantObjects(
      data,
      sourceType,
      collected,
      "$",
      new Set()
    );
  }

  const byNumber = new Map();

  for (const participant of collected) {
    if (
      participant.number < 1 ||
      participant.number > 9
    ) {
      continue;
    }

    const existing = byNumber.get(participant.number);

    if (!existing) {
      byNumber.set(participant.number, participant);
      continue;
    }

    /*
     * 同じ車番が複数JSONにある場合、
     * 情報量の多い方を採用する。
     */
    if (
      participantCompleteness(participant) >
      participantCompleteness(existing)
    ) {
      byNumber.set(participant.number, participant);
    }
  }

  return [...byNumber.values()]
    .sort((a, b) => a.number - b.number);
}

function collectParticipantObjects(
  value,
  sourceType,
  output,
  path,
  visited
) {
  if (
    !value ||
    typeof value !== "object" ||
    visited.has(value)
  ) {
    return;
  }

  visited.add(value);

  if (!Array.isArray(value)) {
    const participant = normalizeParticipantObject(
      value,
      sourceType,
      path
    );

    if (participant) {
      output.push(participant);
    }
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectParticipantObjects(
        item,
        sourceType,
        output,
        `${path}[${index}]`,
        visited
      );
    });
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    collectParticipantObjects(
      child,
      sourceType,
      output,
      `${path}.${key}`,
      visited
    );
  }
}

function normalizeParticipantObject(item, sourceType, sourcePath) {
  const number = firstValidNumber([
    item.syaban,
    item.shaban,
    item.carNo,
    item.vehicleNo,
    item.wakuNo,
    item.ban
  ]);

  const registration = firstText([
    item.sensyuRegistNo,
    item.senshuRegistNo,
    item.registNo,
    item.registrationNo
  ]);

  const name = firstText([
    item.sensyuName,
    item.senshuName,
    item.playerName,
    item.name
  ]);

  /*
   * 車番だけの並び予想オブジェクトを選手として誤認しない。
   * 選手名または登録番号のどちらかを必須にする。
   */
  if (
    number < 1 ||
    number > 9 ||
    (!name && !registration)
  ) {
    return null;
  }

  return {
    sourceType,
    sourcePath,
    number,
    registration,
    name,
    prefecture: firstText([
      item.huken,
      item.prefecture,
      item.areaName
    ]),
    className: firstText([
      item.kyuhan,
      item.prevKyuhan,
      item.grade,
      item.className
    ]),
    style: firstText([
      item.kyakusitu,
      item.kyakushitsu,
      item.style
    ]),
    score: toNumber(
      item.heikinTokuten ??
      item.averageScore ??
      item.score
    ),
    escapeCount: toNumber(
      item.nigeCnt ??
      item.escapeCount
    ),
    makuriCount: toNumber(
      item.makuriCnt ??
      item.makuriCount
    ),
    differenceCount: toNumber(
      item.sasiCnt ??
      item.sashiCnt ??
      item.differenceCount
    ),
    markCount: toNumber(
      item.markCnt ??
      item.markCount
    ),
    backCount: toNumber(
      item.backCnt ??
      item.backCount
    )
  };
}

function participantCompleteness(participant) {
  return [
    participant.registration,
    participant.name,
    participant.prefecture,
    participant.className,
    participant.style,
    participant.score,
    participant.escapeCount,
    participant.makuriCount,
    participant.differenceCount,
    participant.markCount,
    participant.backCount
  ].filter(value =>
    value !== null &&
    value !== undefined &&
    value !== ""
  ).length;
}

function firstText(values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }

  return "";
}

function firstValidNumber(values) {
  for (const value of values) {
    const number = Number(
      String(value ?? "").replace(/[^\d.-]/g, "")
    );

    if (Number.isFinite(number)) {
      return number;
    }
  }

  return 0;
}

function normalizeParticipants(source, sourceType) {
  return source
    .map((item, index) =>
      normalizeParticipantObject(
        item,
        sourceType,
        `$[${index}]`
      )
    )
    .filter(Boolean)
    .sort((a, b) => a.number - b.number);
}

function findObject(value, predicate, visited = new Set()) {
  if (!value || typeof value !== "object" || visited.has(value)) {
    return null;
  }

  visited.add(value);

  if (!Array.isArray(value) && predicate(value)) {
    return value;
  }

  const children = Array.isArray(value)
    ? value
    : Object.values(value);

  for (const child of children) {
    const found = findObject(child, predicate, visited);
    if (found) return found;
  }

  return null;
}

function findArray(value, predicate, visited = new Set()) {
  if (!value || typeof value !== "object" || visited.has(value)) {
    return null;
  }

  visited.add(value);

  if (Array.isArray(value) && predicate(value)) {
    return value;
  }

  const children = Array.isArray(value)
    ? value
    : Object.values(value);

  for (const child of children) {
    const found = findArray(child, predicate, visited);
    if (found) return found;
  }

  return null;
}

function hasAnyKey(value, keys) {
  return Boolean(
    value &&
    typeof value === "object" &&
    keys.some(key => Object.prototype.hasOwnProperty.call(value, key))
  );
}


function extractTrifectaOddsFromAll(jsonByType) {
  const odds = {};
  const samples = [];
  const visited = new Set();

  for (const [sourceType, data] of Object.entries(jsonByType || {})) {
    walk(data, `$${sourceType}`, sourceType);
  }

  if (Object.keys(odds).length === 0) {
    for (const [sourceType, data] of Object.entries(jsonByType || {})) {
      tryStoreSerializedJson(data, sourceType);
    }
  }

  return {
    ok: Object.keys(odds).length > 0,
    odds,
    diagnostics: {
      source: "official-json-generic",
      parsedCount: Object.keys(odds).length,
      samples: samples.slice(0, 20)
    }
  };

  function walk(value, path, sourceType) {
    if (value === null || value === undefined) return;

    if (typeof value !== "object") return;
    if (visited.has(value)) return;
    visited.add(value);

    if (Array.isArray(value)) {
      tryStoreFlatOddsArray(value, path, sourceType);
      for (let index = 0; index < value.length; index += 1) {
        walk(value[index], `${path}[${index}]`, sourceType);
      }
      return;
    }

    tryStoreObject(value, path, sourceType);

    for (const [key, child] of Object.entries(value)) {
      const direct = parseCombinationKey(key);
      const odd = parseOddValue(child);
      if (direct && odd !== null) {
        store(direct, odd, `${path}.${key}`, sourceType, "mapping-key");
      }
      walk(child, `${path}.${key}`, sourceType);
    }
  }


  function tryStoreSerializedJson(data, sourceType) {
    let text = "";
    try { text = JSON.stringify(data); } catch { return; }
    const patterns = [
      /["']?([1-9])[-–ー>]([1-9])[-–ー>]([1-9])["']?\s*[:=,]\s*["']?(\d+(?:\.\d+)?)/g,
      /(?:kumiban|kumi|combination|order|renban|sanrentan)[^0-9]{0,20}([1-9])\D{0,3}([1-9])\D{0,3}([1-9]).{0,80}?(?:odds|odd|ratio|bairitsu|倍率)[^0-9]{0,10}(\d+(?:\.\d+)?)/gi
    ];
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        const order = match.slice(1,4).map(Number);
        const odd = Number(match[4]);
        if (validOrder(order) && Number.isFinite(odd) && odd > 1) {
          store(order, odd, "$serialized", sourceType, "serialized-regex");
        }
      }
    }
  }

  function tryStoreFlatOddsArray(value, path, sourceType) {
    // 3連単の全組合せは9車なら504通り、7車なら210通り。
    // 公式JSONが組番を省略してオッズだけを車番辞書順で返す形式にも対応する。
    const numeric = value.map(parseOddValue);
    const validCount = numeric.filter(item => item !== null).length;
    for (const fieldSize of [9, 8, 7, 6, 5]) {
      const orders = [];
      for (let first = 1; first <= fieldSize; first += 1) {
        for (let second = 1; second <= fieldSize; second += 1) {
          if (second === first) continue;
          for (let third = 1; third <= fieldSize; third += 1) {
            if (third === first || third === second) continue;
            orders.push([first, second, third]);
          }
        }
      }
      if (value.length !== orders.length || validCount < Math.floor(orders.length * 0.7)) continue;
      numeric.forEach((odd, index) => {
        if (odd !== null) store(orders[index], odd, `${path}[${index}]`, sourceType, "flat-array-lexicographic");
      });
      return;
    }
  }

  function tryStoreObject(value, path, sourceType) {
    const normalized = Object.fromEntries(
      Object.entries(value).map(([key, child]) => [normalizeKey(key), child])
    );

    const combination =
      pickCombination(normalized) ||
      pickThreePositions(normalized);
    const odd = pickOdd(normalized);

    if (combination && odd !== null) {
      store(combination, odd, path, sourceType, "object-fields");
    }
  }

  function pickCombination(value) {
    const keys = [
      "combination", "combo", "kumiban", "kumi", "bet", "order",
      "selectno", "selectnum", "combinationno", "betno", "number", "kumime", "kumiNo", "renban", "sanrentan"
    ];
    for (const key of keys) {
      if (!(key in value)) continue;
      const parsed = parseCombinationKey(value[key]);
      if (parsed) return parsed;
    }
    return null;
  }

  function pickThreePositions(value) {
    const groups = [
      ["first", "second", "third"],
      ["firstno", "secondno", "thirdno"],
      ["one", "two", "three"],
      ["rank1", "rank2", "rank3"],
      ["num1", "num2", "num3"],
      ["n1", "n2", "n3"],
      ["r1", "r2", "r3"],
      ["chaku1", "chaku2", "chaku3"],
      ["firstcar", "secondcar", "thirdcar"]
    ];
    for (const keys of groups) {
      if (!keys.every(key => key in value)) continue;
      const nums = keys.map(key => Number(String(value[key]).replace(/\D/g, "")));
      if (validOrder(nums)) return nums;
    }
    return null;
  }

  function pickOdd(value) {
    const keys = [
      "odds", "odd", "oddsvalue", "oddvalue", "ratio", "bairitsu",
      "ba率", "rate", "value", "payratio", "dividendratio", "od", "oddsnum", "oddsvalue1", "倍率"
    ];
    for (const key of keys) {
      if (!(key in value)) continue;
      const parsed = parseOddValue(value[key]);
      if (parsed !== null) return parsed;
    }
    return null;
  }

  function parseCombinationKey(value) {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    let match = text.match(/^([1-9])\s*[-–ー>]\s*([1-9])\s*[-–ー>]\s*([1-9])$/);
    if (!match) match = text.match(/^([1-9])([1-9])([1-9])$/);
    if (!match) return null;
    const nums = match.slice(1, 4).map(Number);
    return validOrder(nums) ? nums : null;
  }

  function parseOddValue(value) {
    if (value && typeof value === "object") return null;
    const text = String(value ?? "").replace(/,/g, "").trim();
    if (!/^\d+(?:\.\d+)?(?:倍)?$/.test(text)) return null;
    const number = Number(text.replace(/倍$/, ""));
    return Number.isFinite(number) && number > 1 && number < 1000000
      ? number
      : null;
  }

  function validOrder(nums) {
    return nums.length === 3 &&
      nums.every(number => Number.isInteger(number) && number >= 1 && number <= 9) &&
      new Set(nums).size === 3;
  }

  function store(order, odd, path, sourceType, mode) {
    const key = order.join("-");
    if (!(key in odds) || odd < odds[key]) odds[key] = odd;
    if (samples.length < 20) samples.push({ key, odd, path, sourceType, mode });
  }

  function normalizeKey(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9一-龠ぁ-んァ-ヶ]/g, "");
  }
}

function inspectJsonStructure(data) {
  if (data === null || data === undefined) {
    return { type: String(data), topKeys: [], arrays: [] };
  }

  const topKeys =
    data && typeof data === "object" && !Array.isArray(data)
      ? Object.keys(data).slice(0, 30)
      : [];

  const arrays = [];
  collectArraySummaries(data, arrays, "$", new Set());

  return {
    type: Array.isArray(data) ? "array" : typeof data,
    topKeys,
    arrays: arrays.slice(0, 30)
  };
}

function collectArraySummaries(value, output, path, visited) {
  if (!value || typeof value !== "object" || visited.has(value)) {
    return;
  }

  visited.add(value);

  if (Array.isArray(value)) {
    output.push({
      path,
      length: value.length,
      sampleKeys:
        value[0] && typeof value[0] === "object"
          ? Object.keys(value[0]).slice(0, 20)
          : []
    });

    value.forEach((item, index) => {
      collectArraySummaries(item, output, `${path}[${index}]`, visited);
    });
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    collectArraySummaries(child, output, `${path}.${key}`, visited);
  }
}

function toNumber(value) {
  const n = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}
