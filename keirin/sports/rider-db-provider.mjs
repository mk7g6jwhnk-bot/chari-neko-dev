// Compatibility adapter only.
//
// Prediction MUST use the information fetched for the current race.
// This module intentionally does NOT read RiderDB files, environment variables,
// or external rider databases. The old DB gate caused valid official race data
// to be rejected when a separate DB was absent.

export function loadRiderDB() {
  // Kept only for backwards-compatible imports. It is no longer part of
  // prediction input or validation.
  return null;
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
