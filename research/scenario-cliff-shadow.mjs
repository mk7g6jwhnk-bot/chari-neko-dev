import configJson from "./scenario-cliff-shadow-config.json" with { type: "json" };

export const VERSION = "SCENARIO_CLIFF_PURCHASE_SHADOW_V1";
export const DEFAULT_CONFIG = Object.freeze(configJson);
const NATURAL_CODES = new Set(["ADOPTED", "THIRD_VARIANT_AMBIGUITY", "THIRD_VARIANT_BOUNDARY"]);
const RESULT_KEYS = new Set(["result", "finishOrder", "payout", "hit", "return", "roi", "actual"]);

export function boundaryScores(values, options = {}) {
  const scores = values.map(finite).filter(Number.isFinite).sort((a, b) => b - a);
  if (scores.length < 2) return [];
  const range = Math.max(scores[0] - scores.at(-1), Math.abs(scores[0]) * 0.01, 1e-12);
  const gaps = scores.slice(0, -1).map((value, index) => Math.max(0, value - scores[index + 1]));
  return gaps.map((gap, index) => {
    const above = scores.slice(0, index + 1), below = scores.slice(index + 1);
    const before = index ? gaps.slice(0, index) : [];
    const after = gaps.slice(index + 1);
    const localBaseline = median([...before.slice(-2), ...after.slice(0, 2)]) || 0;
    const relativeGap = gap / Math.max(Math.abs(scores[index]), 1e-12);
    const separation = gap / range;
    const densityContrast = gap / Math.max(localBaseline, range * 0.08);
    const upperConsistency = consistency(above, range);
    const lowerConsistency = consistency(below, range);
    const boundaryScore = clamp(.38 * separation + .27 * clamp(densityContrast / 3) + .18 * upperConsistency + .17 * lowerConsistency);
    return { index, keep: index + 1, upper: scores[index], lower: scores[index + 1], gap, relativeGap, boundaryScore, separation, densityContrast, upperConsistency, lowerConsistency };
  });
}

export function selectNaturalBoundary(rows, rule = DEFAULT_CONFIG.terminalBoundary, scoreKey = "relativeScore") {
  const sorted = [...rows].sort((a, b) => finite(b[scoreKey], -Infinity) - finite(a[scoreKey], -Infinity) || ticketKey(a).localeCompare(ticketKey(b), "en"));
  const candidates = boundaryScores(sorted.map(row => row[scoreKey])).filter(item => item.keep >= (rule.minimumItemsAbove || 1) && sorted.length - item.keep >= (rule.minimumItemsBelow || 1));
  const best = candidates.sort((a, b) => b.boundaryScore - a.boundaryScore || b.gap - a.gap)[0] || null;
  const detected = Boolean(best && best.boundaryScore >= rule.minimumScore && best.relativeGap >= rule.minimumRelativeGap);
  return { rows: detected ? sorted.slice(0, best.keep) : sorted, boundary: best, detected, forced: false };
}

export function buildScenarioCliffShadow(record, config = DEFAULT_CONFIG) {
  const prediction = sealedPrediction(record);
  const lifecycle = lifecycleRows(prediction);
  const missingnessAudit = auditMissingness(prediction, lifecycle);
  const scenarios = scoreScenarios(lifecycle, prediction, config);
  const scenarioBoundary = selectNaturalBoundary(scenarios, config.scenarioBoundary, "scenarioRelativeScore");
  const selectedScenarios = scenarioBoundary.rows;
  const terminalSelections = selectedScenarios.map(scenario => ({ scenario, selection: selectNaturalBoundary(scenario.terminals, config.terminalBoundary, "terminalRelativeScore") }));
  const merged = mergeExactTickets(terminalSelections.flatMap(({ scenario, selection }) => selection.rows.map(row => ({ ...row, scenarioSupport: supportRef(scenario) }))));
  const criticalMissing = missingnessAudit.some(item => item.classification === "CRITICAL" && item.missing);
  const eligibility = criticalMissing
    ? { state: "INELIGIBLE", canPurchase: false, reason: "CRITICAL_DATA_MISSING" }
    : merged.length > config.maximumTickets
      ? { state: "INELIGIBLE", canPurchase: false, reason: "NATURAL_SELECTION_EXCEEDS_CAP" }
      : { state: "PURCHASEABLE", canPurchase: true, reason: null };
  const classified = classifyTickets(merged, selectedScenarios, config, eligibility.canPurchase);
  const warnings = [];
  if (eligibility.canPurchase && classified.length >= config.manyTickets) warnings.push("MANY_TICKETS");
  if (eligibility.canPurchase && hasPartialMissing(missingnessAudit)) warnings.push("PARTIAL_DATA_MISSING");
  const compositeOdds = compositeMarketPrice(classified);
  if (eligibility.canPurchase && compositeOdds !== null && compositeOdds < config.lowOddsComposite) warnings.push("LOW_ODDS_VALUE");
  const confidence = raceConfidence(selectedScenarios, missingnessAudit, config);
  return {
    version: VERSION, mode: "RESEARCH_ONLY_SHADOW", raceKey: record?.raceKey || prediction?.raceKey || null,
    configVersion: config.version, predictionContinues: true, scenarioBoundary: stripRows(scenarioBoundary),
    scenarios: scenarios.map(stripTerminals), selectedScenarioIds: selectedScenarios.map(row => row.scenarioId),
    terminalBoundaries: terminalSelections.map(({ scenario, selection }) => ({ scenarioId: scenario.scenarioId, ...stripRows(selection) })),
    naturalTicketCount: merged.length, tickets: eligibility.canPurchase ? classified : [], purchaseEligibility: eligibility,
    warnings, missingnessAudit, scenarioConcentration: concentration(scenarios), raceConfidence: confidence,
    hooks: { exacta: pairHook(classified), trio: trioHook(classified), productionConnected: false },
    audit: { lifecycleRows: lifecycle.length, technicalScenarioDuplicates: scenarios.reduce((n, row) => n + row.technicalDuplicateCount, 0), duplicateTicketMerges: merged.reduce((n, row) => n + Math.max(0, row.supportingScenarios.length - 1), 0), resultFieldsUsed: [] }
  };
}

export function evaluateScenarioCliffShadow(records, config = DEFAULT_CONFIG) {
  const safe = (records || []).filter(record => !isProtected(record));
  const races = safe.map(record => {
    const candidate = buildScenarioCliffShadow(record, config), control = controlPlan(record), finish = confirmedFinish(record), generated = allLifecycleRows(sealedPrediction(record));
    return { raceKey: record.raceKey, candidate, control, finish, generatedCorrect: Boolean(finish && generated.some(row => ticketKey(row) === finish.join("-"))), naturalCorrect: Boolean(finish && lifecycleRows(sealedPrediction(record)).some(row => ticketKey(row) === finish.join("-"))), payout: finish ? finite(record?.result?.result?.payout ?? record?.result?.payout, 0) : null };
  });
  return { version: VERSION, readOnly: true, productionWriteAllowed: false, protectedExcluded: (records || []).length - safe.length, cohortSize: races.length, control: summarize(races, "control"), candidate: summarize(races, "candidate"), warnings: countValues(races.flatMap(row => row.candidate.warnings)), ineligibleReasons: countValues(races.map(row => row.candidate.purchaseEligibility.reason).filter(Boolean)), duplicateScenarioSupportDetected: races.reduce((n, row) => n + row.candidate.audit.technicalScenarioDuplicates, 0), races: races.map(compactRace) };
}

function scoreScenarios(rows, prediction, config) {
  const groups = new Map();
  for (const row of rows) {
    const provenance = provenanceFor(row, prediction);
    const identity = independentIdentity(row, provenance);
    if (!groups.has(identity)) groups.set(identity, { scenarioId: identity, evidenceFingerprint: evidenceFingerprint(row, provenance), rows: [], fingerprints: new Set(), technicalDuplicateCount: 0 });
    const group = groups.get(identity), fingerprint = evidenceFingerprint(row, provenance);
    if (group.fingerprints.has(fingerprint)) group.technicalDuplicateCount += 1;
    else group.fingerprints.add(fingerprint);
    group.rows.push(row);
  }
  const scored = [...groups.values()].map(group => {
    const terminals = group.rows.map(row => scoreTerminal(row, config));
    const best = Math.max(0, ...terminals.map(row => row.terminalRelativeScore));
    const mass = terminals.reduce((sum, row) => sum + Math.max(0, row.terminalRelativeScore), 0);
    const supports = unique(group.rows.flatMap(row => supportEvidence(row)));
    const counters = unique(group.rows.flatMap(row => counterEvidence(row)));
    const unknownEvidenceCount = group.rows.reduce((n, row) => n + countUnknown(row), 0);
    const scenarioRelativeScore = best * .65 + (mass / Math.max(terminals.length, 1)) * .35;
    return { scenarioId: group.scenarioId, scenarioRelativeScore, supportEvidence: supports, counterEvidence: counters, independentSupportCount: supports.length, unknownEvidenceCount, scenarioScoreBreakdown: { strongestTerminal: best, meanTerminal: mass / Math.max(terminals.length, 1), duplicatePenalty: 0 }, terminalCount: terminals.length, technicalDuplicateCount: group.technicalDuplicateCount, terminals };
  }).sort((a, b) => b.scenarioRelativeScore - a.scenarioRelativeScore || a.scenarioId.localeCompare(b.scenarioId, "en"));
  return scored.map((row, index) => ({ ...row, scenarioRank: index + 1 }));
}

function scoreTerminal(row, config) {
  rejectResultLeakage(row);
  const order = normalizeOrder(row.order || row.combination);
  const model = firstFinite(row.terminalModelWeight, row.normalizedWeight, row.probability, row.modelWeight);
  const natural = firstFinite(row.naturalConvergenceScore, row.scenarioCoherence);
  const branchFit = firstFinite(row.branchFit, row.withinBranchFit);
  const pair = firstFinite(row.pairRelativeScore, row.secondFamilyRelativeToBest, reciprocalRank(row.pairRank));
  const third = firstFinite(row.thirdConditionalScore, row.thirdFamilyRelativeToBest, row.thirdVariantRelativeToBest, reciprocalRank(row.thirdRank));
  const components = { model, natural, branchFit, pair, third };
  const available = Object.entries(components).filter(([, value]) => Number.isFinite(value));
  const weightSum = available.reduce((sum, [key]) => sum + config.scoreWeights[key], 0);
  const terminalRelativeScore = weightSum ? available.reduce((sum, [key, value]) => sum + config.scoreWeights[key] * normalizeScore(value), 0) / weightSum : 0;
  return { order, firstRelativeScore: firstFinite(row.firstRelativeScore, reciprocalRank(row.firstRank), reciprocalRank(row.derivedFirstMassRank)), pairRelativeScore: pair, thirdConditionalScore: third, terminalRelativeScore, terminalScoreBreakdown: components, odds: finite(row.odds), original: row };
}

function mergeExactTickets(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = ticketKey(row); if (!key) continue;
    if (!map.has(key)) map.set(key, { ...row, supportingScenarios: [], scenarioIndependenceKeys: new Set() });
    const item = map.get(key), support = row.scenarioSupport;
    if (!item.scenarioIndependenceKeys.has(support.independenceKey)) { item.scenarioIndependenceKeys.add(support.independenceKey); item.supportingScenarios.push(support); }
    item.terminalRelativeScore = Math.max(item.terminalRelativeScore, row.terminalRelativeScore);
  }
  return [...map.values()].map(row => ({ ...row, scenarioIndependenceKeys: [...row.scenarioIndependenceKeys], independentScenarioSupportCount: row.scenarioIndependenceKeys.size })).sort((a, b) => b.terminalRelativeScore - a.terminalRelativeScore || ticketKey(a).localeCompare(ticketKey(b), "en"));
}

function classifyTickets(rows, scenarios, config, enabled) {
  if (!enabled) return [];
  const mainId = scenarios[0]?.scenarioId;
  const classified = rows.map(row => ({ ...row, category: row.supportingScenarios.some(s => s.scenarioId === mainId) ? "MAIN" : "COVER", highPayout: Number.isFinite(row.odds) && row.odds >= 100 && row.terminalRelativeScore >= .5, isThick: false, thickGroup: "NONE", thickBoundaryScore: null, thickReason: "NO_CLEAR_BOUNDARY" }));
  for (const category of ["MAIN", "COVER"]) {
    const group = classified.filter(row => row.category === category);
    const boundary = selectNaturalBoundary(group, config.thickBoundary, "terminalRelativeScore");
    if (!boundary.detected) continue;
    const thick = new Set(boundary.rows.map(ticketKey));
    for (const row of classified) if (row.category === category && thick.has(ticketKey(row))) { row.isThick = true; row.thickGroup = category; row.thickBoundaryScore = boundary.boundary.boundaryScore; row.thickReason = "CATEGORY_RELATIVE_CLIFF"; }
  }
  return classified;
}

function raceConfidence(scenarios, missingness, config) {
  if (!scenarios.length) return { level: 1, raw: 0, components: { firstAgreement: 0, pairAgreement: 0, thirdAgreement: 0, scenarioStability: 0, missingPenalty: 1 } };
  const top = scenarios.slice(0, Math.min(3, scenarios.length));
  const best = top.map(s => s.terminals[0]).filter(Boolean), firstAgreement = agreement(best.map(x => x.order?.[0])), pairAgreement = agreement(best.map(x => x.order?.slice(0, 2).join("-"))), thirdAgreement = agreement(best.map(x => x.order?.[2]));
  const scenarioStability = .45 * firstAgreement + .35 * pairAgreement + .20 * thirdAgreement;
  const missingPenalty = missingness.filter(x => x.missing).reduce((n, x) => n + ({ CRITICAL: .35, IMPORTANT: .12, AUXILIARY: .04 }[x.classification] || 0), 0);
  const raw = clamp(scenarioStability - Math.min(.6, missingPenalty));
  const t = config.confidence, level = raw >= t.high ? 5 : raw >= t.mediumHigh ? 4 : raw >= t.medium ? 3 : raw >= t.low ? 2 : 1;
  return { level, raw, components: { firstAgreement, pairAgreement, thirdAgreement, scenarioStability, missingPenalty } };
}

function auditMissingness(prediction, rows) {
  const hasRows = rows.length > 0, hasScenario = rows.some(row => row.dominantBranchId || row.scenarioProvenanceId), hasModel = rows.some(row => [row.terminalModelWeight, row.normalizedWeight, row.probability, row.modelWeight].some(Number.isFinite)), hasRoles = rows.some(row => Number.isFinite(Number(row.branchFit ?? row.withinBranchFit ?? row.scenarioCoherence)));
  return [
    { field: "terminalLifecycle", classification: "CRITICAL", missing: !hasRows, affectedScope: "terminal generation" },
    { field: "scenarioIdentity", classification: "CRITICAL", missing: !hasScenario, affectedScope: "scenario selection" },
    { field: "modelSupport", classification: "IMPORTANT", missing: !hasModel, affectedScope: "relative scoring" },
    { field: "roleExecutionSupport", classification: "IMPORTANT", missing: !hasRoles, affectedScope: "scenario evidence" },
    { field: "marketOdds", classification: "AUXILIARY", missing: !rows.some(row => Number.isFinite(Number(row.odds))), affectedScope: "odds value warning only" }
  ];
}

function summarize(races, kind) {
  const plans = races.map(row => kind === "control" ? row.control : row.candidate.tickets), counts = plans.map(x => x.length), confirmed = races.filter(row => row.finish), hits = confirmed.filter(row => (kind === "control" ? row.control : row.candidate.tickets).some(ticket => ticketKey(ticket) === row.finish.join("-"))), investment = confirmed.reduce((sum, row) => sum + (kind === "control" ? row.control.length : row.candidate.tickets.length) * 100, 0), returned = hits.reduce((sum, row) => sum + row.payout, 0);
  const candidate = kind === "candidate";
  const tailHits = hits.filter(row => row.payout >= 10000), topPayout = hits.length ? Math.max(...hits.map(row => row.payout)) : null;
  return { raceCount: races.length, confirmedRaceCount: confirmed.length, purchaseableRaceCount: candidate ? races.filter(r => r.candidate.purchaseEligibility.canPurchase).length : races.filter(r => r.control.length).length, ineligibleRaceCount: candidate ? races.filter(r => !r.candidate.purchaseEligibility.canPurchase).length : 0, ticketDistribution: distribution(counts), exactHits: hits.length, generatedCorrectTerminal: confirmed.filter(r => r.generatedCorrect).length, naturalBoundaryCorrectTerminal: confirmed.filter(r => r.naturalCorrect).length, correctTerminalSurvived: hits.length, investment, return: returned, roi: investment ? returned / investment : null, highPayoutCapture: { hitsAtLeast10000: tailHits.length, returnAtLeast10000: tailHits.reduce((sum, row) => sum + row.payout, 0), topPayout }, mainHits: candidate ? hits.filter(r => r.candidate.tickets.some(t => ticketKey(t) === r.finish.join("-") && t.category === "MAIN")).length : null, coverHits: candidate ? hits.filter(r => r.candidate.tickets.some(t => ticketKey(t) === r.finish.join("-") && t.category === "COVER")).length : null, thickHits: candidate ? hits.filter(r => r.candidate.tickets.some(t => ticketKey(t) === r.finish.join("-") && t.isThick)).length : null, categories: candidate ? countValues(plans.flatMap(x => x.map(t => t.category))) : {}, thickTickets: candidate ? plans.flatMap(x => x).filter(t => t.isThick).length : null, scenarioCount: candidate ? distribution(races.map(r => r.candidate.scenarios.length)) : null, confidence: candidate ? countValues(races.map(r => String(r.candidate.raceConfidence.level))) : null, over20Ineligible: candidate ? races.filter(r => r.candidate.purchaseEligibility.reason === "NATURAL_SELECTION_EXCEEDS_CAP").length : null };
}
function controlPlan(record) { return unique((sealedPrediction(record)?.standardPurchasePlan || []).map(row => ({ ...row, order: normalizeOrder(row.order || row.combination) })).filter(row => row.order)); }
function lifecycleRows(prediction) { const value = prediction?.purchase?.audit?.terminalLifecycleAudit || prediction?.audit?.purchaseAudit?.terminalLifecycleAudit || prediction?.audit?.terminalLifecycleAudit; const rows = Array.isArray(value) ? value : value?.rows; return (Array.isArray(rows) ? rows : []).filter(row => NATURAL_CODES.has(String(row.purchaseRejectCode || "ADOPTED"))); }
function allLifecycleRows(prediction) { const value = prediction?.purchase?.audit?.terminalLifecycleAudit || prediction?.audit?.purchaseAudit?.terminalLifecycleAudit || prediction?.audit?.terminalLifecycleAudit; const rows = Array.isArray(value) ? value : value?.rows; return Array.isArray(rows) ? rows : []; }
function sealedPrediction(record) { const value = record?.sealed?.researchPrediction || record?.prediction || record?.researchPrediction || {}; return value?.prediction?.performanceSchemaVersion === "PURCHASE_PERFORMANCE_V2" ? value.prediction : value; }
function provenanceFor(row, prediction) { return prediction?.scenarioProvenances?.[row.scenarioProvenanceId] || {}; }
function independentIdentity(row, provenance) { const branch = String(provenance.branchType || row.scenarioFamilyId || row.dominantBranchId || "UNKNOWN").toUpperCase(); const initiative = String(provenance.initiativeLineId || row.initiativeFamily || "UNKNOWN").toUpperCase(); return `${branch}|${initiative}`; }
function evidenceFingerprint(row, provenance) { return JSON.stringify([independentIdentity(row, provenance), provenance.firstSecondRelation || row.firstSecondRelation || "UNKNOWN", normalizeOrder(row.order)?.slice(0, 2)]); }
function supportEvidence(row) { const out = []; if (Number.isFinite(Number(row.branchFit))) out.push("BRANCH_FIT"); if (Number.isFinite(Number(row.naturalConvergenceScore))) out.push("NATURAL_CONVERGENCE"); if (row.scenarioProvenanceId) out.push("SEALED_SCENARIO_PROVENANCE"); return out; }
function counterEvidence(row) { return unique([...(row.counterEvidence || []), ...(row.purchaseFailures || row.failures || [])].map(String)); }
function countUnknown(row) { return Object.values(row).filter(value => value === "UNKNOWN" || value === null).length; }
function supportRef(scenario) { return { scenarioId: scenario.scenarioId, independenceKey: scenario.scenarioId, scenarioRank: scenario.scenarioRank, scenarioRelativeScore: scenario.scenarioRelativeScore }; }
function concentration(rows) { const total = rows.reduce((n, x) => n + x.scenarioRelativeScore, 0); const shares = rows.map(x => total ? x.scenarioRelativeScore / total : 0); return { top1: shares[0] || 0, top2: (shares[0] || 0) + (shares[1] || 0), level: shares[0] >= .6 ? "HIGH" : (shares[0] || 0) + (shares[1] || 0) >= .7 ? "MEDIUM" : "LOW" }; }
function pairHook(rows) { const groups = new Map(); for (const row of rows) { const key = row.order?.slice(0, 2).join("-"); if (!key) continue; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row); } return [...groups].map(([pair, tickets]) => ({ pair, pairRelativeScore: Math.max(...tickets.map(x => finite(x.pairRelativeScore, 0))), thirdDispersion: tickets.length, eligibleForFutureExactaResearch: tickets.length > 1 })).sort((a, b) => b.pairRelativeScore - a.pairRelativeScore); }
function trioHook(rows) { const groups = new Map(); for (const row of rows) { const key = [...(row.order || [])].sort((a, b) => a - b).join("-"); if (!key) continue; groups.set(key, (groups.get(key) || 0) + 1); } return [...groups].filter(([, permutations]) => permutations > 1).map(([trio, permutations]) => ({ trio, permutations, researchOnly: true })); }
function compositeMarketPrice(rows) { const odds = rows.map(x => finite(x.odds)).filter(x => x > 0); if (odds.length !== rows.length || !odds.length) return null; const inv = odds.reduce((n, value) => n + 1 / value, 0); return inv ? 1 / inv : null; }
function hasPartialMissing(rows) { return rows.some(x => x.missing && x.classification !== "CRITICAL"); }
function confirmedFinish(record) { const result = record?.result?.result || record?.result; if (String(result?.status).toLowerCase() !== "confirmed") return null; const order = normalizeOrder(result?.finishOrder); return order?.length === 3 ? order : null; }
function isProtected(record) { return [record?.sequence, record?.recordNumber, record?.comparisonNumber, record?.validationIndex, record?.sealed?.sequence].some(value => Number.isFinite(Number(value)) && Number(value) >= 403 && Number(value) <= 502); }
function rejectResultLeakage(row) { for (const key of Object.keys(row || {})) if (RESULT_KEYS.has(key)) throw new Error(`result-aware terminal field prohibited: ${key}`); }
function normalizeOrder(value) { const values = (Array.isArray(value) ? value : String(value || "").match(/\d+/g) || []).map(Number).slice(0, 3); return values.length === 3 && new Set(values).size === 3 ? values : null; }
function ticketKey(row) { return normalizeOrder(row?.order || row?.combination)?.join("-") || ""; }
function firstFinite(...values) { for (const value of values) if (Number.isFinite(Number(value))) return Number(value); return null; }
function reciprocalRank(value) { const n = Number(value); return Number.isFinite(n) && n > 0 ? 1 / n : null; }
function normalizeScore(value) { const n = Number(value); return Number.isFinite(n) ? n < 0 ? 0 : n > 1 ? n / (1 + n) : n : null; }
function consistency(values, range) { if (values.length < 2) return 1; return 1 - clamp((Math.max(...values) - Math.min(...values)) / range); }
function agreement(values) { if (!values.length) return 0; const counts = countValues(values); return Math.max(...Object.values(counts)) / values.length; }
function stripRows(value) { return { detected: value.detected, boundary: value.boundary, selectedCount: value.rows.length, forced: value.forced }; }
function stripTerminals(value) { return { ...value, terminals: value.terminals.map(({ original, ...row }) => row) }; }
function compactRace(row) { return { raceKey: row.raceKey, controlTickets: row.control.length, candidateTickets: row.candidate.tickets.length, naturalTicketCount: row.candidate.naturalTicketCount, purchaseEligibility: row.candidate.purchaseEligibility, warnings: row.candidate.warnings, exactHitControl: Boolean(row.finish && row.control.some(t => ticketKey(t) === row.finish.join("-"))), exactHitCandidate: Boolean(row.finish && row.candidate.tickets.some(t => ticketKey(t) === row.finish.join("-"))), payout: row.finish ? row.payout : null, scenarioCount: row.candidate.scenarios.length, confidence: row.candidate.raceConfidence, duplicates: row.candidate.audit } }
function distribution(values) { return { mean: mean(values), median: quantile(values, .5), p90: quantile(values, .9), max: values.length ? Math.max(...values) : null, sixOrLess: values.filter(x => x <= 6).length, sevenTo10: values.filter(x => x >= 7 && x <= 10).length, elevenTo15: values.filter(x => x >= 11 && x <= 15).length, sixteenTo20: values.filter(x => x >= 16 && x <= 20).length, over20: values.filter(x => x > 20).length }; }
function countValues(values) { return values.reduce((out, value) => (out[value] = (out[value] || 0) + 1, out), {}); }
function unique(values) { return [...new Set(values)]; }
function median(values) { return quantile(values, .5); }
function quantile(values, p) { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b), i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); }
function mean(values) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null; }
function finite(value, fallback = null) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function clamp(value) { return Math.max(0, Math.min(1, value)); }
