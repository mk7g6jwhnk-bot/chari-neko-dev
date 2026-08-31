import { inferLines } from "../../keirin/parser/line-parser.mjs";
import { runKeirinEngine } from "../../keirin/engine/keirin-engine.mjs";
import { derivePredictionRatings } from "../../public/prediction-ratings.mjs";
import { qualifyThickPredictionBets } from "../../public/purchase-funding.mjs";
import { applyRecentFormEvidence } from "../../keirin/recent-form/recent-form.mjs";
import { applyStartPowerEvidence } from "../../keirin/start-power/start-power.mjs";
import { applyKimariteAbilities } from "../../keirin/kimarite/kimarite-abilities.mjs";
import { attachRiderDbEvidence, loadRiderDB, summarizeRiderDbUsage } from "../../keirin/sports/rider-db-provider.mjs";
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
  const totalStarted=performance.now(),timing={requestStartedAt:new Date().toISOString()};
  const predictionRequestedAt = new Date().toISOString();
  const url = new URL(req.url);
  const date = url.searchParams.get("date") || "";
  const venueName = url.searchParams.get("venueName") || "競輪場";
  const raceNo = Number(url.searchParams.get("raceNo") || 0);
  const budget = Number(url.searchParams.get("budget") || 3000);
  const displayOnly = url.searchParams.get("display") === "1";
  const autoResearch = url.searchParams.get("autoResearch") === "1";
  const requestedScheduledStartAt = url.searchParams.get("scheduledStartAt") || "";
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
    const officialStarted=performance.now(),browserResult = await requestBrowserService(serviceBase, {
      date,
      venueCode,
      venueName,
      raceNo,
      requestType: autoResearch ? "auto_prediction" : "manual_prediction",
      requestId: `predict-${date}-${venueCode}-${raceNo}-${Date.now()}`
    });
    timing.officialFetchMs=roundMs(performance.now()-officialStarted);
    timing.queueWaitMs=Number(browserResult.data?.audit?.queueWaitMs??browserResult.data?.diagnostics?.queueWaitMs??0);
    timing.browserUsed=Boolean(browserResult.data?.diagnostics?.browserUsed??true);
    timing.officialCacheState=browserResult.data?.cacheAudit?.state||"MISS";
    timing.officialCacheAgeMs=browserResult.data?.cacheAudit?.ageMs??null;
    timing.officialStages=Object.fromEntries((browserResult.data?.diagnostics?.steps||[]).filter(step=>step?.step).map(step=>[step.step,Number(step.elapsedMs||0)]));
    timing.browserTotalMs=Number(browserResult.data?.diagnostics?.elapsedMs??browserResult.data?.audit?.elapsedMs??timing.officialFetchMs);

    if (!browserResult.ok) {
      console.log(JSON.stringify({event:"prediction_official_payload_rejected",raceKey:`${date}-${String(venueCode).padStart(2,"0")}-${raceNo}`,requestType:autoResearch?"auto_prediction":"manual_prediction",requestStartedAt:timing.requestStartedAt,source:browserResult.data?.source||browserResult.data?.cacheAudit?.source||null,cacheHit:browserResult.data?.cacheAudit?.state==="HIT",appErrorCode:browserResult.data?.errorCode||"OFFICIAL_RACE_FETCH_FAILED",endpointAudit:browserResult.data?.endpointAudit||[]}));
      return jsonResponse(browserResult.status || 502, {
        ok: false,
        errorCode: browserResult.data?.errorCode || "OFFICIAL_RACE_FETCH_FAILED",
        validationFailedField: browserResult.data?.validationFailedField || null,
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
    let riderDb;
    try {
      riderDb = loadRiderDB();
    } catch (error) {
      return jsonResponse(503, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        riderDbGate: true,
        requestAudit: { date, venueName, venueCode, raceNo }
      });
    }
    const predictionInputCutoffAt = new Date().toISOString();
    const selectedLineObservedAt = browserResult.data.lineSnapshotAudit?.observedAt;
    if (selectedLineObservedAt && Date.parse(selectedLineObservedAt) > Date.parse(predictionInputCutoffAt)) {
      throw new Error("公式ラインsnapshotの取得時刻が予想seal時刻を超えています");
    }
    const hydrationStarted=performance.now(),evidenceParticipants = attachRiderDbEvidence(officialParticipants, riderDb, participantContext);
    const participants = adaptParticipantsForPrediction(evidenceParticipants, participantContext);
    timing.participantHydrationMs=roundMs(performance.now()-hydrationStarted);
    const riderDbUsageAudit = summarizeRiderDbUsage(participants);
    if (participants.length < 5) {
      return jsonResponse(422, {
        ok: false,
        error: "出走選手変換後の人数が不足しています",
        officialData,
        participantCount: participants.length
      });
    }

    const lineText = buildLineText(officialLines);
    const line = raceCategory === "girls"
      ? resolveGirlsDynamicPositions({ participants })
      : resolveOfficialLines({ participants, officialLines, lineText });
    const race = {
      id: `${date}-${basic.venueName || venueName}-${basic.raceNo || raceNo}`,
      venue: basic.venueName || venueName,
      venueCode,
      date: normalizeDate(basic.date) || date,
      raceNo: Number(basic.raceNo || raceNo),
      raceName: basic.raceName || "",
      grade: basic.grade || "",
      className: basic.className || "",
      raceCategory,
      lineMode: raceCategory === "girls" ? "girls_dynamic" : "official_line",
      deadline: basic.deadline || "",
      startTime: basic.startTime || "",
      lineConfidence: line.confidence,
      participants: line.participants.map(p => ({...p,riderId:String(p.registration||p.riderId||"")})),
    };

    const odds = normalizeOfficialOdds(officialData.odds, participants.length);
    const venueProfile = officialData.venueProfile || basic.venueProfile || {};
    const officialDataObservedAt = browserResult.data.checkedAt || new Date().toISOString();
    const scheduledStartAt = requestedScheduledStartAt || scheduledAt(date, basic.startTime);
    const preSeal = autoResearch ? {
      raceKey: `${date}-${String(venueCode).padStart(2, "0")}-${raceNo}`,
      scheduledStartAt,
      predictionStartedAt: predictionRequestedAt,
      inputCutoffAt: officialDataObservedAt,
      participantIdentifiers: officialParticipants.map(item => ({ number:Number(item.number), registration:String(item.registration || item.riderId || "") })),
      lineSource: browserResult.data.lineSnapshotAudit?.lineSource || "unknown",
      lineSnapshotObservedAt: browserResult.data.lineSnapshotAudit?.lineSnapshotObservedAt || null,
      riderDbVersion: riderDb.schema_version || riderDb.version || null,
      riderDbGeneratedAt: riderDb.generated_at || riderDb.generatedAt || null,
      officialDataObservedAt
    } : null;
    if (preSeal) await persistPreSeal(serviceBase, preSeal);
    const engineStarted=performance.now(),prediction = runKeirinEngine({
      race,
      venueProfile,
      oddsByOrder: odds.complete ? odds.odds : {},
      budget
    });
    attachThickQualification(prediction);
    timing.engineTotalMs=roundMs(performance.now()-engineStarted);
    timing.riderScoringMs=Number(prediction.audit?.durationBreakdown?.riderScoringMs??null);
    timing.initiativeMs=Number(prediction.audit?.durationBreakdown?.initiativeMs??null);
    timing.branchesMs=Number(prediction.audit?.durationBreakdown?.branchesMs??null);
    timing.terminalsMs=Number(prediction.audit?.durationBreakdown?.terminalsMs??null);
    timing.purchaseMs=Number(prediction.audit?.durationBreakdown?.purchaseMs??null);
    timing.explanationMs=Number(prediction.audit?.durationBreakdown?.explanationMs??null);
    const lineSnapshotAudit = browserResult.data.lineSnapshotAudit || null;
    prediction.lineSnapshotAudit = lineSnapshotAudit ? {
      lineSource: lineSnapshotAudit.lineSource || lineSnapshotAudit.selectedSource || "unknown",
      lineSnapshotObservedAt: lineSnapshotAudit.lineSnapshotObservedAt || lineSnapshotAudit.observedAt || null,
      lineSnapshotPersistenceMode: lineSnapshotAudit.lineSnapshotPersistenceMode || "ephemeral",
      lineSnapshotRaceKey: lineSnapshotAudit.lineSnapshotRaceKey || null,
      lineSnapshotConfidence: lineSnapshotAudit.lineSnapshotConfidence || null
    } : {
      lineSource: "unknown",
      lineSnapshotObservedAt: null,
      lineSnapshotPersistenceMode: "ephemeral",
      lineSnapshotRaceKey: `${date}-${venueCode}-${raceNo}`,
      lineSnapshotConfidence: null
    };
    const predictionSealedAt = new Date().toISOString();

    timing.totalBeforeSerializationMs=roundMs(performance.now()-totalStarted);
    const fullPayload = {
      ok: prediction.audit.passed,
      race,
      odds,
      prediction,
      predictionRequestedAt,
      predictionSealedAt,
      preSeal,
      riderDbUsageAudit,
      lineSnapshotAudit,
      officialData,
      browserAudit: browserResult.data.audit || null,
      dataQuality: {
        lineConfidence: line.confidence,
        lineMode: raceCategory === "girls" ? "girls_dynamic" : "official_line",
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
          [item.sprintPower, item.finishPower, item.trackingSkill].some(value => Number.isFinite(Number(value)) && value !== null && Math.abs(Number(value) - 5) > 0.000001)
        ).length,
        missingKimariteAbilityCount: participants.filter(item =>
          [item.sprintPower, item.finishPower, item.trackingSkill].some(value => value === null || value === undefined)
        ).length
      },
      warnings: [
        ...line.warnings,
        Object.keys(odds.odds).length ? null : "オッズ未取得・高配当判定保留"
      ].filter(Boolean),
      checkedAt: new Date().toISOString()
      ,durationBreakdown:timing
    };
    if(!displayOnly)return jsonResponse(200,fullPayload);
    const serializationStarted=performance.now(),displayPayload=buildDisplayPredictionPayload(fullPayload);
    timing.serializationMs=roundMs(performance.now()-serializationStarted);
    displayPayload.durationBreakdown=timing;
    displayPayload.payloadMode="DISPLAY_PREDICTION_PAYLOAD";
    displayPayload.fullAuditAvailable=Boolean(autoResearch);
    displayPayload.displayPayloadHash=await sha256Json(displayPayload);
    const displayValidation=validateDisplayPredictionPayload(displayPayload,{date,venueCode,raceNo});
    if(!displayValidation.passed)return jsonResponse(500,{ok:false,error:"DISPLAY_PREDICTION_PAYLOAD_INCOMPLETE",errorCode:"DISPLAY_PREDICTION_PAYLOAD_INCOMPLETE",validationFailedField:displayValidation.validationFailedField,requestAudit:{date,venueName,venueCode,raceNo,payloadMode:displayPayload.payloadMode,participantCount:displayValidation.participantCount}});
    return jsonResponse(200,displayPayload);
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      requestAudit: { date, venueName, venueCode, raceNo }
    });
  }
}
function roundMs(value){return Math.round(Number(value||0)*100)/100}

export function buildDisplayPredictionPayload(payload={}){
  const prediction=payload.prediction||{},selected=[...(prediction.purchasePlan||[])].map(compactPurchaseRow);
  const displayRatingInputs=buildDisplayRatingInputs(payload);
  const selectedOrders=new Set(selected.map(item=>normalizeOrderKey(item?.order||item?.combination)));
  const compactTerminals=(prediction.terminals||[]).filter(item=>selectedOrders.has(normalizeOrderKey(item?.order||item?.combination))).map(item=>({order:item.order||item.combination,probability:item.probability??null,betClass:item.betClass||null,purchaseStatus:item.purchaseStatus||null,dominantBranchId:item.dominantBranchId||item.branchId||null,dominantBranchLabel:item.dominantBranchLabel||item.branchLabel||null,naturalConvergenceScore:item.naturalConvergenceScore??null,nodeConditionalProbability:item.nodeConditionalProbability??null,terminalGlobalRank:item.terminalGlobalRank??null,terminalFamilyRank:item.terminalFamilyRank??null,terminalPairRank:item.terminalPairRank??null}));
  const compactAudit={passed:prediction.audit?.passed!==false,probabilitySum:prediction.audit?.probabilitySum??null,terminalCount:prediction.audit?.terminalCount??null,lineFallbackAudit:prediction.audit?.lineFallbackAudit||null,predictionBoundaryAudit:prediction.audit?.predictionBoundaryAudit||null,predictionPurchaseBoundaryAudit:prediction.audit?.predictionPurchaseBoundaryAudit||null,selectionBoundaryAudit:prediction.audit?.selectionBoundaryAudit||null,purchaseDistributionAudit:prediction.audit?.purchaseDistributionAudit||null,purchaseRegime:prediction.audit?.purchaseRegime||null};
  const compactRace={...(payload.race||{}),participants:(payload.race?.participants||[]).map(compactParticipant)};
  return {ok:payload.ok,race:compactRace,odds:payload.odds,prediction:{engineVersion:prediction.engineVersion,lineConfidence:prediction.lineConfidence,scored:(prediction.scored||[]).map(compactScoredRider),predictionExplanation:prediction.predictionExplanation||prediction.prediction?.explanation||null,terminals:compactTerminals,purchasePlan:selected,standardPurchasePlan:(prediction.standardPurchasePlan||[]).map(compactPurchaseRow),referencePurchasePlan:(prediction.referencePurchasePlan||[]).map(compactPurchaseRow),recommendationLabel:prediction.recommendationLabel||"",noBet:Boolean(prediction.noBet),noBetReason:prediction.noBetReason||null,purchaseEligibility:prediction.purchaseEligibility||prediction.audit?.purchaseEligibility||null,displayRatingInputs,audit:compactAudit,lineSnapshotAudit:prediction.lineSnapshotAudit||null},predictionRequestedAt:payload.predictionRequestedAt,predictionSealedAt:payload.predictionSealedAt,preSeal:payload.preSeal||null,riderDbUsageAudit:payload.riderDbUsageAudit||null,lineSnapshotAudit:payload.lineSnapshotAudit||null,dataQuality:payload.dataQuality||null,warnings:payload.warnings||[],checkedAt:payload.checkedAt,durationBreakdown:payload.durationBreakdown};
}

function buildDisplayRatingInputs(payload={}){
  const prediction=payload.prediction||{},standard=prediction.standardPurchasePlan||[],rating=derivePredictionRatings({
    noBet:Boolean(prediction.noBet),purchaseEligibility:prediction.purchaseEligibility||prediction.audit?.purchaseEligibility||null,
    betSelections:standard.map(item=>({...item,category:item.betClass})),abilitiesUsed:prediction.scored||[],branches:prediction.branches||[],
    targetRace:payload.race||{},predictionOutput:{audit:prediction.audit||{},lineConfidence:prediction.lineConfidence||payload.race?.lineConfidence||null,lineMode:payload.race?.lineMode||payload.dataQuality?.lineMode||null}
  }),diagnostics=rating.diagnostics||{};
  const adopted=Array.isArray(prediction.audit?.adoptedTerminalAudit)?prediction.audit.adoptedTerminalAudit:null,evaluatedCount=adopted?adopted.filter(item=>Number.isFinite(Number(item?.expectedValueIndex??item?.valueIndex))&&Number(item?.expectedValueIndex??item?.valueIndex)>0).length:null;
  return{version:"DISPLAY-RATING-INPUTS-1.1",terminalProbabilitySum:finiteRatingValue(prediction.audit?.terminalProbabilitySum),top3Mass:finiteRatingValue(prediction.audit?.top3Mass),top5Mass:finiteRatingValue(prediction.audit?.top5Mass),branchConcentrationRaw:finiteRatingValue(diagnostics.branchConcentrationRaw),terminalConcentrationRaw:finiteRatingValue(diagnostics.terminalConcentrationRaw),familyConcentration:compactFamilyConcentration(diagnostics.familyConcentration),oddsEvaluation:{adoptedCandidateCount:adopted?.length??null,evaluatedCount,totalCandidateCount:standard.length,allOddsEvaluated:Boolean(diagnostics.allOddsEvaluated),maxExpectedValueIndex:finiteRatingValue(diagnostics.maxExpectedValue)},massStatus:diagnostics.massStatus||null,availability:{branchConcentrationRaw:Number.isFinite(Number(diagnostics.branchConcentrationRaw)),terminalConcentrationRaw:Number.isFinite(Number(diagnostics.terminalConcentrationRaw)),familyConcentration:Number(diagnostics.familyConcentration?.familyCount)>0,oddsEvaluation:Boolean(adopted),massStatus:Boolean(diagnostics.massStatus)}};
}
function finiteRatingValue(value){if(value===null||value===undefined||value==="")return null;const number=Number(value);return Number.isFinite(number)?number:null}
function compactFamilyConcentration(value={}){const keys=["familyCount","mainFamilyCount","coverFamilyCount","topFamilyShare","top2FamilyShare","mainFamilyShare","familySupportTop","familySupportTop2"];return Object.fromEntries(keys.filter(key=>value?.[key]!==undefined).map(key=>[key,value[key]]))}
function attachThickQualification(prediction={}){const plan=Array.isArray(prediction.standardPurchasePlan)?prediction.standardPurchasePlan:[],eligible=new Map(qualifyThickPredictionBets({betSelections:plan.map(row=>({...row,category:row.betClass})),purchaseEligibility:prediction.purchaseEligibility||prediction.audit?.purchaseEligibility,noBet:prediction.noBet,noBetReason:prediction.noBetReason}).map(row=>[normalizeOrderKey(row.order),row]));prediction.standardPurchasePlan=plan.map(row=>{const qualified=eligible.get(normalizeOrderKey(row.order));return qualified?{...row,thickQualified:true,predictionQualificationScore:qualified.predictionQualificationScore}:row})}
function compactPurchaseRow(item={}){const keys=["order","combination","betClass","stake","odds","purchaseStatus","purchaseReason","reason","probability","probabilityShare","expectedValueIndex","globalRank","familyRank","pairRank","firstFamilyNumber","firstFamilyTier","firstFamilyProbability","firstFamilyProbabilityShare","secondFamilyRelativeToBest","thirdFamilyRelativeToBest","decisionRatios","evidenceSummary","highPayoutAttribute","highPayoutAttributeLabel","chatForecastRole","directMainBranchSupport","branchHeadMatched","naturalConvergenceScore","naturalConvergenceLevel","naturalConvergenceReasons","extraConditionCount","relativeConditionCount","relativeConditionPenalty","relativeConditionTrace","probabilitySeparationPolicy","scenarioCoherence","nodeConditionalProbability","dominantBranchId","dominantBranchLabel","dominantBranchPriority","branchLabel","coverParentOrder","coverParentType","orphanCover","scenarioExplanation","explanationContext","thickQualified","predictionQualificationScore","fundingPriorityScore","originatingScenarioFamily","scenarioFamilyLabel","scenarioFamilyRank","scenarioFamilySupport","scenarioFamilyProbability","primaryBranch","supportingBranches","head","second","third","mainCoverClassification","mainDifferenceReason"];return Object.fromEntries(keys.filter(key=>item[key]!==undefined).map(key=>[key,item[key]]))}
function compactParticipant(item={}){const keys=["number","name","registration","riderId","sourceType","sourcePath","className","prefecture","lineId","line","linePosition","lineOrder","role","lineStatus"];return Object.fromEntries(keys.filter(key=>item[key]!==undefined).map(key=>[key,item[key]]))}
export function validateDisplayPredictionPayload(payload={},requested={}){const race=payload.race||{},participants=Array.isArray(race.participants)?race.participants:[],identity=validateOfficialRaceIdentity({date:race.date,venueCode:race.venueCode,raceNo:race.raceNo},requested),complete=participants.length>=5&&participants.every(x=>Number.isInteger(Number(x.number))&&String(x.name||"").trim()&&String(x.registration||x.riderId||"").trim());return{passed:identity.passed&&complete,participantCount:participants.length,validationFailedField:!identity.passed?`race.${Object.entries(identity.checks).find(([,v])=>!v)?.[0]||"identity"}`:!complete?"race.participants.summary":null}}
function compactScoredRider(item={}){const keys=["number","recentForm","startPower","startPowerEvidence","sprintPower","finishPower","trackingSkill","kimariteAbilityEvidence","abilityMissingAudit","roleScores","riderEvaluationV2"];return Object.fromEntries(keys.filter(key=>item[key]!==undefined).map(key=>[key,item[key]]))}
function normalizeOrderKey(value){return(Array.isArray(value)?value:String(value||"").match(/\d+/g)||[]).map(Number).slice(0,3).join("-")}
async function sha256Json(value){const bytes=new TextEncoder().encode(JSON.stringify(value));const digest=await crypto.subtle.digest("SHA-256",bytes);return[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("")}

async function persistPreSeal(serviceBase, preSeal) {
  const response = await fetch(`${serviceBase}/keirin/auto-research/preseal`, {
    method:"POST",
    headers:{"content-type":"application/json",...(process.env.AUTO_RESEARCH_CALLBACK_SECRET?{"x-auto-research-secret":process.env.AUTO_RESEARCH_CALLBACK_SECRET}:{})},
    body:JSON.stringify(preSeal),
    signal:AbortSignal.timeout(10000)
  });
  if(!response.ok)throw new Error(`PRE_SEALED persistence failed: HTTP ${response.status}`);
}

function scheduledAt(date, startTime) {
  const day=String(date||"").replace(/\D/g,"");const match=String(startTime||"").match(/(\d{1,2}):(\d{2})/);
  return /^\d{8}$/.test(day)&&match?`${day.slice(0,4)}-${day.slice(4,6)}-${day.slice(6,8)}T${match[1].padStart(2,"0")}:${match[2]}:00+09:00`:null;
}

export function validateOfficialRaceIdentity(basic = {}, params = {}) {
  const returnedDate = normalizeDate(basic.date);
  const rawVenue = basic.venueCode || basic.jocd || basic.jcd || "";
  const returnedVenue = rawVenue ? String(rawVenue).padStart(2, "0") : "";
  const returnedRaceNo = Number(basic.raceNo);
  const returnedVenueName = String(basic.venueName || "").replace(/[\s　]/g, "");
  const requestedVenueName = String(params.venueName || "").replace(/[\s　]/g, "");
  const checks = {
    date: Boolean(returnedDate) && returnedDate === normalizeDate(params.date),
    venueCode: returnedVenue
      ? returnedVenue === String(params.venueCode || "").padStart(2, "0")
      : Boolean(returnedVenueName && requestedVenueName && returnedVenueName === requestedVenueName),
    raceNo: Number.isFinite(returnedRaceNo) && returnedRaceNo === Number(params.raceNo)
  };
  return { passed: Object.values(checks).every(Boolean), checks };
}

async function requestBrowserService(base, params) {
  const query = new URLSearchParams({
    date: params.date,
    venueCode: params.venueCode,
    venueName: params.venueName,
    raceNo: String(params.raceNo),
    requestType: params.requestType || "manual_prediction",
    requestId: params.requestId || "",
    ...(params.raceCardUrl ? { raceCardUrl: params.raceCardUrl } : {})
  });

  // 個別予想は公式Rページの取得が本体。previewを先に挟むと、
  // preview側で薄い応答/タイムアウトになった時点で本予想まで到達しない。
  // screening-batch/result と同じく、RailwayのChromium取得に十分な時間を与える。
  const endpoint = `${base}/keirin/race?${query}`;
  const attempts = [];
  const startedAt = Date.now();
  // Netlify's production function is terminated at about 55 seconds.  A
  // healthy Railway browser job can legitimately take more than 30 seconds
  // while another browser job finishes.  Aborting that request at 30 seconds
  // starts a duplicate job and consumes the rest of the function lifetime.
  // Give the original job one continuous window and only retry responses that
  // fail early enough to leave useful time inside the same function request.
  const totalBudgetMs = 50000;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const remaining = totalBudgetMs - (Date.now() - startedAt);
    if (remaining < 6000) break;

    const timeoutMs = Math.min(
      attempt === 1 ? 46000 : 12000,
      remaining - 1200
    );

    try {
      const response = await fetch(endpoint, {
        headers: {
          accept: "application/json",
          "cache-control": "no-cache"
        },
        signal: AbortSignal.timeout(Math.max(5000, timeoutMs))
      });

      const text = await response.text();
      let data = null;
      try { data = JSON.parse(text); } catch {}

      const officialData = data?.officialData || {};
      const participantCount = Array.isArray(officialData.participants)
        ? officialData.participants.length
        : 0;
      const raceIdentityAudit = validateOfficialRaceIdentity(officialData.basic, params);
      const hasUsableRaceData = Boolean(
        officialData.basic &&
        participantCount >= 5 && participantCount <= 9 &&
        raceIdentityAudit.passed
      );

      attempts.push({
        endpoint: "/keirin/race",
        attempt,
        status: response.status,
        contentType: response.headers.get("content-type") || null,
        bodyLength: new TextEncoder().encode(text).byteLength,
        parsed: data !== null,
        topLevelKeys: data && typeof data === "object" ? Object.keys(data) : [],
        participantCount,
        hasUsableRaceData,
        officialProfileEvidenceCount: Array.isArray(officialData.participants) ? officialData.participants.filter(x => x?.officialProfile?.identityPassed === true || x?.officialProfileEvidence?.identityPassed === true).length : 0,
        lineDataCount: Array.isArray(officialData.lines) ? officialData.lines.length : 0,
        raceIdentityAudit,
        source: data?.cacheAudit?.source || null,
        cacheHit: data?.cacheAudit?.state === "HIT",
        payloadMode: data?.payloadMode || null,
        error: data?.error || null,
        elapsedMs: Date.now() - startedAt
      });

      if (response.ok && data?.ok !== false && hasUsableRaceData) {
        return {
          ok: true,
          status: response.status,
          data: {
            ...data,
            endpointAudit: attempts,
            diagnostics: {
              ...(data.diagnostics || {}),
              predictionFetchPath: "/keirin/race",
              fallbackUsed: false
            }
          }
        };
      }

      const retryable =
        response.status >= 500 ||
        response.status === 429 ||
        /page crashed|target closed|browser|navigation|timeout|timed out|execution context|temporar|upstream|socket|fetch failed/i
          .test(String(data?.error || ""));

      if (attempt < 2 && retryable && Date.now() - startedAt < totalBudgetMs - 5000) {
        await sleep(500);
        continue;
      }

      if (response.ok && !hasUsableRaceData && attempt < 2) {
        await sleep(500);
        continue;
      }

      return {
        ok: false,
        status: response.status || 502,
        data: {
          ok: false,
          errorCode: !raceIdentityAudit.passed ? "RACE_IDENTITY_MISMATCH" : "OFFICIAL_RACE_PAYLOAD_INCOMPLETE",
          validationFailedField: !raceIdentityAudit.passed ? Object.entries(raceIdentityAudit.checks).find(([, value]) => !value)?.[0] || "raceIdentity" : "officialData.participants",
          error: data?.error ||
            (hasUsableRaceData
              ? `競輪ブラウザサービスが予想データを返しましたが処理に失敗しました（HTTP ${response.status}）`
              : `競輪ブラウザサービスから出走表を取得できませんでした（HTTP ${response.status}）`),
          endpointAudit: attempts
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      attempts.push({
        endpoint: "/keirin/race",
        attempt,
        error: message,
        elapsedMs: Date.now() - startedAt
      });

      if (attempt < 2 && Date.now() - startedAt < totalBudgetMs - 5000) {
        await sleep(500);
        continue;
      }

      return {
        ok: false,
        status: 502,
        data: {
          ok: false,
          error: /timeout|timed out|abort/i.test(message)
            ? "公式予想データ取得が時間内に完了しませんでした。"
            : "競輪ブラウザサービスへ接続できませんでした。",
          endpointAudit: attempts
        }
      };
    }
  }

  return {
    ok: false,
    status: 502,
    data: {
      ok: false,
      error: "競輪ブラウザサービスの再試行でも出走表を取得できませんでした。",
      endpointAudit: attempts
    }
  };
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }


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
      item.officialProfile, item.profile, item.profileEvidence, item.officialProfileEvidence, item.racerProfile,
      profileIndex.get(registration),
      inlineParticipantProfile(item, registration)
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

function inlineParticipantProfile(item, registration) {
  if (!item || typeof item !== "object" || item.identityPassed !== true) return null;
  const hasProfileField = [
    item.officialTotalStarts, item.backCount, item.homeCount, item.currentScore,
    item.recent4MonthScore, item.winningStyleRates, item.ridingStyle
  ].some(value => value !== null && value !== undefined);
  if (!hasProfileField) return null;
  return {
    registration: normalizeRegistration(item.registration ?? registration),
    requestedRegistration: normalizeRegistration(item.requestedRegistration ?? registration),
    identityPassed: true,
    fetchedAt: item.fetchedAt ?? item.profileFetchedAt ?? null,
    sourceType: item.sourceType || "official-race-participant",
    sourcePath: item.sourcePath || null,
    ridingStyle: item.ridingStyle ?? item.style ?? null,
    currentScore: item.currentScore ?? item.score ?? null,
    recent4MonthScore: item.recent4MonthScore ?? null,
    officialTotalStarts: item.officialTotalStarts ?? null,
    backCount: item.backCount ?? null,
    homeCount: item.homeCount ?? null,
    winRate: item.winRate ?? null,
    quinellaRate: item.quinellaRate ?? null,
    trioRate: item.trioRate ?? null,
    winningStyleRates: item.winningStyleRates ?? null
  };
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
  
  return {
    ...profile,
    registration: returnedRegistration,
    identityPassed: profile.identityPassed === true
  };
}

function canonicalKimariteEnvelope(evidence, participant, registration) {
  if (!evidence || typeof evidence !== "object") return null;
  const returnedRegistration = normalizeRegistration(evidence.registration ?? evidence.requestedRegistration ?? evidence.snum ?? registration);
  if (registration && returnedRegistration !== registration) return null;
  
  const targetIdentityPassed = evidence.targetIdentityPassed === true;
  return {
    ...evidence,
    registration: returnedRegistration,
    identityPassed: evidence.identityPassed === true,
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
    officialScore: nullableNumber(
      item.score ??
      item.officialScore ??
      item.currentScore ??
      item.officialProfileEvidence?.currentScore ??
      item.officialProfile?.currentScore
    ),
    officialProfileEvidence,
    officialKimariteEvidence,
    officialTotalStarts: nullableNumber(item.officialTotalStarts ?? item.officialProfile?.officialTotalStarts),
    sparseSampleFlag: Number(item.officialTotalStarts ?? item.officialProfile?.officialTotalStarts) <= 10,
    officialForeignFlag: item.officialForeignFlag === true || item.officialProfile?.officialForeignFlag === true,
    riderDbAudit: item.riderDbAudit || null,
    recentForm: 5,
    recentFormEvidence: { value: 5, confidence: "low", inputsUsed: [], missingInputs: ["official-profile"] },
    startPower: null,
    startPowerEvidence: null,
    sprintPower: null,
    stamina: 5,
    attackTiming: 5,
    trackingSkill: null,
    finishPower: null,
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
  if (profile.registration != null && !/^\d{6}$/.test(String(profile.registration).trim())) return null;
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
  const evidenceRegistration = evidence.registration ?? evidence.requestedRegistration;
  if (evidenceRegistration != null && !/^\d{6}$/.test(String(evidenceRegistration).trim())) return null;
  if (registration && normalizeRegistration(evidenceRegistration) !== registration) return null;
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
  if (!fetchedAt) return false;
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

export function resolveOfficialLines({ participants, officialLines, lineText }) {
  // The official line text is the canonical front-to-back order.
  // JSJ036 `position` is useful for grouping/identity checks, but treating its numeric
  // position as race-order can reverse leader/bante roles on some cards.
  // Prefer the verified text representation whenever it covers the race sufficiently.
  if (lineText) {
    const parsed = inferLines({ participants, lineText });
    if (parsed?.confidence === "高") {
      return {
        ...parsed,
        source: "公式JSJ036並び表記・順序監査",
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
        source: "公式JSJ036位置・順序監査",
        confidence: "高",
        warnings: []
      };
    }
  }

  return inferLines({ participants, lineText });
}

function groupOfficialLineItems(items) {
  const withLineId = items.filter(item => lineIdentity(item));
  if (withLineId.length === items.length) {
    const groups = new Map();
    for (const item of items) {
      const key = lineIdentity(item);
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

function lineIdentity(item) {
  const explicit = String(item?.lineId ?? item?.groupId ?? "").trim();
  if (explicit) return explicit.toLowerCase().replace(/\s+/g, "-");
  const className = String(item?.className ?? "").trim();
  if (/^(?:line|group)[-_ ]?\d+$/i.test(className)) return className.toLowerCase().replace(/[ _]+/g, "-");
  if (/^\d+$/.test(className)) return `line-${className}`;
  return null;
}

function resolveGirlsDynamicPositions({ participants }) {
  return {
    participants: participants.map(item => ({
      ...item,
      lineId: `girls-${item.number}`,
      lineOrder: 1,
      role: "単騎",
      lineStatus: "ガールズ・固定ラインなし"
    })),
    source: "ガールズ専用・固定ライン不使用",
    confidence: "高",
    warnings: []
  };
}

export function buildLineText(lines) {
  if (!lines.length) return null;

  const withLineId = lines.filter(item => lineIdentity(item));
  if (withLineId.length === lines.length) {
    const groups = new Map();
    for (const item of lines) {
      const key = lineIdentity(item);
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

function normalizeOfficialOdds(raw, participantCount = 7) {
  if (!raw || typeof raw !== "object") return { ok: false, odds: {}, diagnostics: { source: "未取得" } };
  const source = raw.odds && typeof raw.odds === "object" ? raw.odds : raw.oddsByOrder && typeof raw.oddsByOrder === "object" ? raw.oddsByOrder : {};
  const odds = {};
  for (const [key, value] of Object.entries(source)) {
    const normalizedKey = String(key).replace(/[^1-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    const numeric = Number(value);
    if (/^[1-9]-[1-9]-[1-9]$/.test(normalizedKey) && Number.isFinite(numeric) && numeric > 1) odds[normalizedKey] = numeric;
  }
  const n = Number(participantCount);
  const expectedCombinationCount = Number.isInteger(n) && n >= 3 ? n * (n - 1) * (n - 2) : 0;
  const complete = Object.keys(odds).length === expectedCombinationCount;
  return {
    ok: complete,
    complete,
    odds: complete ? odds : {},
    diagnostics: {
      ...(raw.diagnostics || { source: raw.sourceType || "officialData.odds" }),
      validCount: Object.keys(odds).length,
      expectedCombinationCount,
      complete
    }
  };
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
