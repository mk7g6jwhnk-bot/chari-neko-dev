/**
 * Initiative assessment is a prediction-stage decision.
 *
 * Contract:
 * scored -> initiativeAssessment -> branches
 *
 * It does not delete candidates and it does not decide purchases.
 * It uses only pre-branch evidence so that a later branch score cannot silently
 * redefine who was assessed as the primary initiative candidate.
 */
const clamp = (v, min = 0, max = 10) => Math.min(max, Math.max(min, Number(v) || 0));
const finite = v => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));

export function assessInitiative({ scored = [], lines = [], raceCategory = "standard" } = {}) {
  const riders = Array.isArray(scored) ? scored : [];
  const lineRows = Array.isArray(lines) ? lines : [];

  const lineById = new Map(lineRows.map(line => [String(line.id), line]));
  const lineMembers = new Map();

  for (const rider of riders) {
    const id = String(rider?.lineId || `unknown-${rider?.number ?? "x"}`);
    if (!lineMembers.has(id)) lineMembers.set(id, []);
    lineMembers.get(id).push(rider);
  }

  const candidates = riders.map(rider => {
    const lineId = String(rider?.lineId || `unknown-${rider?.number ?? "x"}`);
    const members = lineMembers.get(lineId) || [rider];
    const leader = members.find(x => Number(x?.lineOrder ?? x?.linePosition) === 1) || rider;

    const role = String(rider?.role || "");
    const firstScore = Number(rider?.roleScores?.first);
    const escape = Number(rider?.riderEvaluationV2?.firstMechanisms?.escape);
    const makuri = Number(rider?.riderEvaluationV2?.firstMechanisms?.makuri);
    const recent = Number(rider?.recentForm);
    const start = Number(rider?.startPower);
    const stamina = Number(rider?.stamina);

    // Only riders who can plausibly initiate are ranked as initiative candidates.
    // The engine still keeps every rider in `candidates`; this is not a filter on branches.
    const initiationAbility = averageFinite([
      finite(firstScore) ? firstScore : null,
      finite(escape) ? escape : null,
      finite(makuri) ? makuri : null
    ], 5);

    const startComponent = finite(start) ? start : 5;
    const recentComponent = finite(recent) ? recent : 5;
    const staminaComponent = finite(stamina) ? stamina : 5;

    const roleBonus =
      role === "自力" ? 1.20 :
      role === "単騎" ? 0.55 :
      role === "番手" ? -0.90 :
      role === "三番手" ? -1.25 : 0;

    const leaderBonus = Number(rider?.number) === Number(leader?.number) ? 0.45 : 0;

    const lineSize = members.length;
    const lineSizeBonus = Math.min(0.45, Math.max(0, lineSize - 1) * 0.15);

    const scoreGapEvidence = Number(rider?.officialScoreGapToFieldMean);
    const scoreGapBonus = finite(scoreGapEvidence)
      ? clamp(scoreGapEvidence / 8, -0.8, 0.8)
      : 0;

    const initiativeScore = clamp(
      initiationAbility * 0.46 +
      startComponent * 0.20 +
      recentComponent * 0.10 +
      staminaComponent * 0.08 +
      roleBonus +
      leaderBonus +
      lineSizeBonus +
      scoreGapBonus
    );

    return {
      riderNumber: Number(rider?.number),
      lineId,
      lineSize,
      role,
      initiativeScore,
      components: {
        initiationAbility,
        start: startComponent,
        recent: recentComponent,
        stamina: staminaComponent,
        roleBonus,
        leaderBonus,
        lineSizeBonus,
        scoreGapBonus
      },
      officialScore: finite(rider?.officialScore) ? Number(rider.officialScore) : null,
      officialScoreGapToFieldMean: finite(rider?.officialScoreGapToFieldMean)
        ? Number(rider.officialScoreGapToFieldMean)
        : null,
      evidence: {
        firstMechanismAvailable: finite(firstScore) || finite(escape) || finite(makuri),
        startAvailable: finite(start),
        recentAvailable: finite(recent),
        staminaAvailable: finite(stamina),
        lineKnown: !lineId.startsWith("unknown-"),
        lineSource: lineById.has(lineId) ? "race.lines" : "participant.lineId"
      }
    };
  });

  const sorted = [...candidates].sort((a, b) =>
    b.initiativeScore - a.initiativeScore ||
    Number(a.riderNumber) - Number(b.riderNumber)
  );

  const top = sorted[0] || null;
  const second = sorted[1] || null;

  return {
    version: "INITIATIVE-ASSESSMENT-1.0",
    raceCategory,
    candidates,
    ranking: sorted.map((row, index) => ({
      rank: index + 1,
      riderNumber: row.riderNumber,
      lineId: row.lineId,
      initiativeScore: row.initiativeScore
    })),
    top: top ? {
      riderNumber: top.riderNumber,
      lineId: top.lineId,
      initiativeScore: top.initiativeScore
    } : null,
    marginToSecond: top && second ? top.initiativeScore - second.initiativeScore : null,
    policy: "INITIATIVE_IS_ASSESSED_BEFORE_BRANCH_GENERATION_AND_IS_NOT_A_PURCHASE_DECISION"
  };
}

function averageFinite(values, fallback = 5) {
  const xs = values.filter(finite).map(Number);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : fallback;
}
