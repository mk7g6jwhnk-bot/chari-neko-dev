import RIDER_DB from "../../data/rider-db.json" with { type: "json" };

function registration(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits ? digits.padStart(6, "0").slice(-6) : "";
}

function eligible(record) {
  return Boolean(
    record &&
    record.officialIdConfirmed === true &&
    record.metadata?.quality_status === "success" &&
    record.metadata?.stale?.any !== true &&
    Number(record.metadata?.sample_size ?? record.recent_4_months?.starts) > 0
  );
}

export function loadRiderDB() {
  return RIDER_DB;
}

export function attachRiderDbEvidence(participants = [], riderDb = RIDER_DB, context = {}) {
  const riders = riderDb?.riders || {};
  return (Array.isArray(participants) ? participants : []).map(participant => {
    const id = registration(participant?.registration ?? participant?.riderId);
    const record = riders[id];
    const freshnessAudit = evaluateRiderDbFreshness(record, context);
    const audit = {
      registration: id,
      matched: Boolean(record),
      identityPassed: record?.officialIdConfirmed === true,
      stale: record?.metadata?.stale?.any === true,
      sampleSize: Number(record?.metadata?.sample_size ?? record?.recent_4_months?.starts) || 0,
      period: record?.metadata?.period || null,
      retrievedAt: record?.metadata?.retrieved_at || null,
      confidence: record?.metadata?.confidence || null,
      qualityStatus: record?.metadata?.quality_status || null,
      missingFields: record?.metadata?.missing_fields || [],
      freshnessAudit,
      adopted: false,
      reason: !record ? "registration-not-found" : !eligible(record) ? "record-not-production-eligible" : null
    };
    const target = String(context.raceDate || "").replace(/\D/g, "").slice(0, 8);
    const targetTime = target.length === 8
      ? Date.parse(`${target.slice(0, 4)}-${target.slice(4, 6)}-${target.slice(6, 8)}T${context.raceStartTime || "23:59"}:00+09:00`)
      : Number.NaN;
    const officialFetchedAt = Date.parse(participant?.officialProfile?.fetchedAt || "");
    const currentOfficialUsable = participant?.officialProfile?.identityPassed === true &&
      (!Number.isFinite(targetTime) || !Number.isFinite(officialFetchedAt) || officialFetchedAt <= targetTime);
    if (!eligible(record) || currentOfficialUsable) {
      return {
        ...participant,
        riderDbAudit: {
          ...audit,
          reason: audit.reason || "current-race-official-profile-preferred"
        }
      };
    }

    const recent = record.recent_4_months || {};
    const methods = record.winning_method_share_among_top2 || {};
    return {
      ...participant,
      officialProfile: {
        identityPassed: true,
        registration: id,
        fetchedAt: record.metadata?.retrieved_at || null,
        sourceType: "RIDER-DB-OFFICIAL-ROLLING-4M",
        sourcePath: record.metadata?.sources?.[1] || record.metadata?.sources?.[0] || null,
        ridingStyle: record.declaredStyle || null,
        currentScore: recent.race_points ?? null,
        recent4MonthScore: recent.race_points ?? null,
        officialTotalStarts: recent.starts ?? record.metadata?.sample_size ?? null,
        backCount: recent.back ?? null,
        homeCount: recent.home ?? null,
        winRate: recent.official_first_rate ?? null,
        quinellaRate: recent.official_top2_rate ?? null,
        trioRate: recent.official_top3_rate ?? null,
        rateUnit: "percent",
        winningStyleRates: {
          escape: methods.escape ?? null,
          makuri: methods.sprint ?? null,
          difference: methods.pass ?? null,
          mark: methods.mark ?? null
        },
        scoreHistory: []
      },
      riderDbAudit: { ...audit, adopted: true, reason: "official-race-profile-unavailable" }
    };
  });
}

export function evaluateRiderDbFreshness(record, context = {}, policy = { maxAgeDays: 30 }) {
  const raceDate = String(context.raceDate || "").replace(/\D/g, "").slice(0, 8);
  const raceAt = /^\d{8}$/.test(raceDate) ? Date.parse(`${raceDate.slice(0,4)}-${raceDate.slice(4,6)}-${raceDate.slice(6,8)}T23:59:59+09:00`) : Number.NaN;
  const observedAt = parseSourceTime(record?.metadata?.recent_updated_at) || parseSourceTime(record?.metadata?.retrieved_at);
  const ageDays = Number.isFinite(raceAt) && Number.isFinite(observedAt) ? (raceAt-observedAt)/86400000 : null;
  const shadowStale = ageDays === null ? null : ageDays > policy.maxAgeDays;
  return { mode:"SHADOW_AUDIT_ONLY", sourceObservedAt:Number.isFinite(observedAt)?new Date(observedAt).toISOString():null, coveragePeriodEnd:record?.metadata?.recent_updated_at||null, raceDate:raceDate||null, freshnessPolicy:{...policy}, ageDays:ageDays===null?null:Number(ageDays.toFixed(3)), shadowStale, staleReason:shadowStale?`SOURCE_OLDER_THAN_${policy.maxAgeDays}_DAYS`:ageDays===null?"SOURCE_TIMESTAMP_UNAVAILABLE":null, productionEligibilityChanged:false };
}

export function summarizeRiderDbUsage(participants = []) {
  const audits=participants.map(x=>x?.riderDbAudit).filter(Boolean),rejected=audits.filter(x=>x.matched&&!x.adopted&&x.reason!=="current-race-official-profile-preferred");
  return { type:"RIDER_DB_USAGE_AUDIT",participantsCount:participants.length,registrationMatchCount:audits.filter(x=>x.matched).length,liveOfficialProfileUsedCount:audits.filter(x=>x.reason==="current-race-official-profile-preferred").length,dbFallbackUsedCount:audits.filter(x=>x.adopted).length,dbRejectedCount:rejected.length,rejectReasons:Object.fromEntries([...new Set(rejected.map(x=>x.reason))].map(reason=>[reason,rejected.filter(x=>x.reason===reason).length])),staleRejectionCount:rejected.filter(x=>x.stale).length,partialOrMediumConfidenceRejectionCount:rejected.filter(x=>x.qualityStatus==="partial"||x.confidence==="medium").length,sampleInsufficientCount:rejected.filter(x=>x.sampleSize<=0).length,missingFieldCount:audits.filter(x=>x.missingFields?.length).length,identityMismatchCount:rejected.filter(x=>!x.identityPassed).length,shadowFreshnessWouldRejectCount:audits.filter(x=>x.freshnessAudit?.shadowStale===true).length,productionEligibilityChanged:false };
}

function parseSourceTime(value){if(!value)return Number.NaN;const normalized=String(value).replace(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}:\d{2})$/,"$1-$2-$3T$4:00+09:00");return Date.parse(normalized)}

export function buildRaceRiderDB(participants = []) {
  const out = {};

  for (const participant of Array.isArray(participants) ? participants : []) {
    const id = String(
      participant?.riderId ??
      participant?.registration ??
      participant?.id ??
      ""
    ).trim();

    if (!id) {
      throw new Error(`RIDER_INPUT_ID_MISSING:${participant?.number ?? "unknown"}`);
    }

    const profile = participant?.officialProfileEvidence;
    const kimarite = participant?.officialKimariteEvidence;

    out[id] = {
      ...participant,
      ...(profile && typeof profile === "object" ? {
        officialProfileEvidence: profile
      } : {}),
      ...(kimarite && typeof kimarite === "object" ? {
        officialKimariteEvidence: kimarite
      } : {}),
      riderId: id,
      source: "OFFICIAL_RACE_FETCH",
      sourcePolicy: "CURRENT_RACE_DATA_ONLY",
      riderDbRequired: false
    };
  }

  return out;
}
