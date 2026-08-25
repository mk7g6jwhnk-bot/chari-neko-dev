import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const RIDER_DB = require("../../data/rider-db.json");

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
    const audit = {
      registration: id,
      matched: Boolean(record),
      identityPassed: record?.officialIdConfirmed === true,
      stale: record?.metadata?.stale?.any === true,
      sampleSize: Number(record?.metadata?.sample_size ?? record?.recent_4_months?.starts) || 0,
      period: record?.metadata?.period || null,
      retrievedAt: record?.metadata?.retrieved_at || null,
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
