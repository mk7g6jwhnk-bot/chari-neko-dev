import configJson from "./scenario-cliff-shadow-config.json" with { type: "json" };

export const VERSION = "SCENARIO_CLIFF_PURCHASE_SHADOW_V1";
export const VERSION_V2 = "SCENARIO_CLIFF_PURCHASE_SHADOW_V2";
export const VERSION_V3 = "SCENARIO_CLIFF_PURCHASE_SHADOW_V3";
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

export function buildScenarioCliffShadowV2(record, config = DEFAULT_CONFIG) {
  const prediction = sealedPrediction(record), rawRows = allLifecycleRows(prediction), lifecycle = lifecycleRows(prediction);
  const missingnessAudit = auditMissingnessV2(prediction, lifecycle), scenarios = scoreScenarios(lifecycle, prediction, config, true);
  const scenarioDecision = selectScenarioSetV2(scenarios, config);
  const scenarioSelections = scenarioDecision.rows.map(scenario => ({ scenario, selection: selectScenarioTerminalsV2(scenario, config) }));
  const beforeMerge = scenarioSelections.flatMap(({ scenario, selection }) => selection.rows.map(row => ({ ...row, scenarioSupport: supportRef(scenario) })));
  const exactMergedBeforeScenarioConsolidation = mergeExactTickets(beforeMerge), consolidated = consolidateNearDuplicateScenarios(scenarioDecision.rows, config);
  const exactMerged = remapConsolidatedScenarioSupport(exactMergedBeforeScenarioConsolidation, consolidated), allocated = allocateNaturalScenarioSet(exactMerged, consolidated.rows, config);
  const criticalMissing = missingnessAudit.some(item => item.classification === "CRITICAL" && item.missing);
  const eligibility = criticalMissing
    ? { state: "INELIGIBLE", canPurchase: false, reason: "CRITICAL_DATA_MISSING" }
    : allocated.length > config.maximumTickets
      ? { state: "INELIGIBLE", canPurchase: false, reason: "NATURAL_SELECTION_EXCEEDS_CAP" }
      : { state: "PURCHASEABLE", canPurchase: true, reason: null };
  const classified = classifyTickets(allocated, consolidated.rows, config, eligibility.canPurchase), warnings = [];
  if (eligibility.canPurchase && classified.length >= config.manyTickets) warnings.push("MANY_TICKETS");
  if (eligibility.canPurchase && hasImpactfulPartialMissing(missingnessAudit)) warnings.push("PARTIAL_DATA_MISSING");
  const compositeOdds = compositeMarketPrice(classified);
  if (eligibility.canPurchase && compositeOdds !== null && compositeOdds < config.lowOddsComposite) warnings.push("LOW_ODDS_VALUE");
  const stageOrders = {
    raw: rawRows.map(ticketKey).filter(Boolean), natural: lifecycle.map(ticketKey).filter(Boolean), scenarioCliff: scenarioDecision.rows.flatMap(s => s.terminals.map(ticketKey)),
    terminalCliff: scenarioSelections.flatMap(x => x.selection.rows.map(ticketKey)), mergeBefore: beforeMerge.map(ticketKey), exactMerge: exactMerged.map(ticketKey),
    nearConsolidation: exactMerged.map(ticketKey), allocation: allocated.map(ticketKey), final: classified.map(ticketKey)
  };
  return {
    version: VERSION_V2, mode: "RESEARCH_ONLY_SHADOW", raceKey: record?.raceKey || prediction?.raceKey || null, configVersion: config.version,
    predictionContinues: true, scenarios: scenarios.map(stripTerminals), selectedScenarioIds: consolidated.rows.map(x => x.scenarioId),
    scenarioBoundary: { ...stripRows(scenarioDecision), singletonCliffRelaxed: scenarioDecision.singletonCliffRelaxed },
    terminalBoundaries: scenarioSelections.map(({ scenario, selection }) => ({ scenarioId: scenario.scenarioId, ...stripRows(selection), noCliffRetention: !selection.detected })),
    naturalTicketCount: allocated.length, tickets: eligibility.canPurchase ? classified : [], purchaseEligibility: eligibility, warnings, missingnessAudit,
    scenarioConcentration: concentration(scenarios), raceConfidence: raceConfidence(consolidated.rows, missingnessAudit, config),
    hooks: { exacta: pairHook(classified), trio: trioHook(classified), productionConnected: false },
    flow: {
      rawScenarioCount: scenarios.length, strongScenarioCandidateCount: scenarioDecision.supportedCount, scenarioCliffCount: scenarioDecision.rows.length,
      rawTerminalCount: rawRows.length, naturalTerminalCount: lifecycle.length, terminalCliffCount: stageOrders.terminalCliff.length,
      preMergeTicketCount: beforeMerge.length, exactMergeTicketCount: exactMergedBeforeScenarioConsolidation.length, nearConsolidationTicketCount: exactMerged.length,
      allocatedTicketCount: allocated.length, mainCount: classified.filter(x => x.category === "MAIN").length, coverCount: classified.filter(x => x.category === "COVER").length,
      finalPurchaseCount: classified.length, eligible: eligibility.canPurchase, reason: eligibility.reason, nearDuplicateScenariosMerged: consolidated.mergedCount,
      stageOrders
    },
    audit: { technicalScenarioDuplicates: scenarios.reduce((n, row) => n + row.technicalDuplicateCount, 0), duplicateTicketMerges: beforeMerge.length - exactMerged.length, nearDuplicateScenarioMerges: consolidated.mergedCount, resultFieldsUsed: [] }
  };
}

export function scenarioTechnicalKey(row, prediction = {}) {
  const provenance = provenanceFor(row, prediction);
  return [provenance.branchId, row.dominantBranchId, row.scenarioProvenanceId].filter(Boolean).map(value => String(value).toUpperCase()).join("|") || "UNKNOWN";
}

export function scenarioSemanticKey(row, prediction = {}) {
  const provenance = provenanceFor(row, prediction);
  const field = (...values) => String(values.find(value => value !== null && value !== undefined && value !== "") || "UNKNOWN").toUpperCase();
  return [semanticBranch(provenance.branchType || row.scenarioFamilyId || row.dominantBranchId), field(provenance.initiativeLineId, provenance.initiativeFamily, row.initiativeFamily), field(provenance.attackOutcome, provenance.attackFamily, row.attackOutcome), field(provenance.banteResponse, row.banteResponse), field(provenance.lineTracking, provenance.lineState, row.lineTracking), field(provenance.otherLineSurvival, row.otherLineSurvival)].join("|");
}

export function buildScenarioCliffShadowV3(record, config = DEFAULT_CONFIG) {
  const prediction = sealedPrediction(record), raw = allLifecycleRows(prediction), currentNatural = lifecycleRows(prediction);
  const upstream = buildSemanticUpstreamV3(raw, currentNatural, prediction, config);
  const audit = prediction?.purchase?.audit || prediction?.audit?.purchaseAudit || prediction?.audit || {};
  const shadowPrediction = { ...prediction, purchase: { ...(prediction.purchase || {}), audit: { ...audit, terminalLifecycleAudit: upstream.rows.map(row => ({ ...row, purchaseRejectCode: "ADOPTED" })) } } };
  const selected = buildScenarioCliffShadowV2({ raceKey: record?.raceKey, prediction: shadowPrediction }, config);
  return { ...selected, version: VERSION_V3, upstream: { ...upstream.audit, finalSelectorInputCount: upstream.rows.length, finalPurchaseCount: selected.tickets.length }, flow: { ...selected.flow, rawTerminalCount: raw.length, naturalTerminalCount: upstream.rows.length, upstreamNaturalTerminalCount: upstream.rows.length }, audit: { ...selected.audit, ...upstream.duplicates, resultFieldsUsed: [] } };
}

export function evaluateScenarioCliffFourWay(records, config = DEFAULT_CONFIG) {
  const safe = (records || []).filter(record => !isProtected(record));
  const races = safe.map(record => { const prediction = sealedPrediction(record), finish = confirmedFinish(record), v3 = buildScenarioCliffShadowV3(record, config), finishKey = finish?.join("-"); return { raceKey: record.raceKey, control: controlPlan(record), v1: buildScenarioCliffShadow(record, config), v2: buildScenarioCliffShadowV2(record, config), v3, finish, generatedCorrect: Boolean(finishKey && allLifecycleRows(prediction).some(row => ticketKey(row) === finishKey)), naturalCorrect: Boolean(finishKey && lifecycleRows(prediction).some(row => ticketKey(row) === finishKey)), v3NaturalCorrect: Boolean(finishKey && v3.flow.stageOrders.natural.includes(finishKey)), payout: finish ? finite(record?.result?.result?.payout ?? record?.result?.payout, 0) : null }; });
  return { version: VERSION_V3, readOnly: true, productionWriteAllowed: false, cohortSize: races.length, protectedExcluded: (records || []).length - safe.length, control: summarizeThree(races, "control"), candidateV1: summarizeThree(races, "v1"), candidateV2: summarizeThree(races, "v2"), candidateV3: summarizeThree(races, "v3"), v2CapCauses: diagnoseCapCauses(races, "v2"), v3CapCauses: diagnoseCapCauses(races, "v3"), v2SmallCauses: diagnoseSmallCauses(races, "v2"), v3SmallCauses: diagnoseSmallCauses(races, "v3"), v3Warnings: countValues(races.flatMap(row => row.v3.warnings)), v3IneligibleReasons: countValues(races.map(row => row.v3.purchaseEligibility.reason).filter(Boolean)), v3Natural: distribution(races.map(row => row.v3.upstream.naturalTerminalCount)), v3SingleScenarioRaces: races.filter(row => row.v3.upstream.naturalScenarioCount === 1).length, semanticScenarioMerges: races.reduce((sum, row) => sum + row.v3.audit.semanticScenarioMerges, 0), technicalDuplicatesSuppressed: races.reduce((sum, row) => sum + row.v3.audit.technicalDuplicatesSuppressed, 0), technicalDuplicateObservations: races.reduce((sum, row) => sum + row.v3.audit.technicalDuplicateObservations, 0), races: races.map(row => ({ ...compactThreeRace(row), v3Tickets: row.v3.tickets.length, v3Eligibility: row.v3.purchaseEligibility, v3Upstream: row.v3.upstream, v3NaturalCorrect: row.v3NaturalCorrect, exactHitV3: Boolean(row.finish && row.v3.tickets.some(x => ticketKey(x) === row.finish.join("-"))) })) };
}

function buildSemanticUpstreamV3(rawRows, currentRows, prediction, config) {
  const valid = rawRows.filter(row => ticketKey(row)), technical = new Set(valid.map(row => scenarioTechnicalKey(row, prediction))), semantic = new Set(valid.map(row => scenarioSemanticKey(row, prediction)));
  const scenarios = scoreScenarios(valid, prediction, config, true, row => scenarioSemanticKey(row, prediction)), scenarioDecision = selectScenarioSetV2(scenarios, config), hierarchical = [];
  for (const scenario of scenarioDecision.rows) {
    const firsts = groupCandidates(scenario.terminals, row => String(row.order[0]), row => firstKnownFinite(row.firstRelativeScore, row.terminalRelativeScore), config.scenarioBoundary);
    for (const first of firsts.rows) {
      const pairs = groupCandidates(first.items, row => row.order.slice(0, 2).join("-"), row => firstKnownFinite(row.pairRelativeScore, row.terminalRelativeScore), config.terminalBoundary);
      for (const pair of pairs.rows) hierarchical.push(...selectNaturalBoundary(pair.items, config.terminalBoundary, "terminalRelativeScore").rows.map(row => row.original));
    }
  }
  const current = uniqueByTicket(currentRows), hierarchicalRows = uniqueByTicket(hierarchical), proposed = uniqueByTicket([...current, ...hierarchicalRows]);
  const useProposed = proposed.length > current.length && proposed.length <= config.maximumTickets && current.length <= 3, rows = useProposed ? proposed : current;
  const firsts = new Set(valid.map(row => normalizeOrder(row.order)?.[0]).filter(Number.isFinite)), pairs = new Set(valid.map(row => normalizeOrder(row.order)?.slice(0, 2).join("-")).filter(Boolean)), thirds = new Set(valid.map(row => normalizeOrder(row.order)?.[2]).filter(Number.isFinite)), byScenario = countValues(rows.map(row => scenarioSemanticKey(row, prediction))), merged = Math.max(0, technical.size - semantic.size);
  const duplicateObservations = scenarios.reduce((sum, scenario) => sum + scenario.technicalDuplicateCount, 0);
  return { rows, audit: { rawBranchCount: new Set(valid.map(row => String(row.dominantBranchId || "UNKNOWN"))).size, rawProvenanceCount: new Set(valid.map(row => String(row.scenarioProvenanceId || "UNKNOWN"))).size, technicalScenarioCount: technical.size, semanticScenarioCount: semantic.size, scenarioFamilyCountBefore: technical.size, scenarioFamilyCountAfter: semantic.size, firstCandidateCount: firsts.size, pairCandidateCount: pairs.size, thirdCandidateCount: thirds.size, rawTerminalCount: valid.length, currentNaturalTerminalCount: current.length, proposedNaturalTerminalCount: proposed.length, naturalTerminalCount: rows.length, naturalScenarioCount: Object.keys(byScenario).length, terminalsPerScenario: byScenario, semanticScenarioDiversity: valid.length ? semantic.size / valid.length : 0, technicalDuplicationRatio: technical.size ? merged / technical.size : 0, thirdDispersion: pairs.size ? valid.length / pairs.size : 0, source: useProposed ? "INDEPENDENT_HIERARCHICAL_REEVALUATION" : "EXPLOSION_GUARD_CURRENT_NATURAL", earlyThirdPruning: false }, duplicates: { semanticScenarioMerges: merged, technicalDuplicatesSuppressed: merged, technicalDuplicateObservations: duplicateObservations, technicalDuplicationRatio: technical.size ? merged / technical.size : 0 } };
}

function groupCandidates(rows, keyFn, scoreFn, rule) { const groups = new Map(); for (const row of rows) { const key = keyFn(row); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row); } return selectNaturalBoundary([...groups].map(([key, items]) => ({ key, items, score: Math.max(...items.map(item => finite(scoreFn(item), 0))) })), rule, "score"); }
function semanticBranch(value) { const raw = String(value || "UNKNOWN").toUpperCase(); if (/^LEAD(?:ER)?(?:[-_:]|$)/.test(raw)) return "LEADER_HOLD"; if (/^BANTE(?:[-_:]|$)/.test(raw)) return "BANTE_SASHI"; if (/^MAKURI(?:[-_:]|$)/.test(raw)) return "MAKURI_SUCCESS"; if (/BATTLE/.test(raw)) return "LEAD_BATTLE"; if (/SEPARAT|COLLAPSE/.test(raw)) return "LINE_SEPARATION"; if (/OTHER/.test(raw)) return "OTHER_LINE_SURVIVAL"; return raw; }

export function evaluateScenarioCliffThreeWay(records, config = DEFAULT_CONFIG) {
  const safe = (records || []).filter(record => !isProtected(record));
  const races = safe.map(record => {
    const v1 = buildScenarioCliffShadow(record, config), v2 = buildScenarioCliffShadowV2(record, config), control = controlPlan(record), finish = confirmedFinish(record), prediction = sealedPrediction(record);
    return { raceKey: record.raceKey, control, v1, v2, finish, generatedCorrect: Boolean(finish && allLifecycleRows(prediction).some(row => ticketKey(row) === finish.join("-"))), naturalCorrect: Boolean(finish && lifecycleRows(prediction).some(row => ticketKey(row) === finish.join("-"))), payout: finish ? finite(record?.result?.result?.payout ?? record?.result?.payout, 0) : null };
  });
  return {
    version: VERSION_V2, readOnly: true, productionWriteAllowed: false, cohortSize: races.length, protectedExcluded: (records || []).length - safe.length,
    control: summarizeThree(races, "control"), candidateV1: summarizeThree(races, "v1"), candidateV2: summarizeThree(races, "v2"),
    v1CapCauses: diagnoseCapCauses(races, "v1"), v2CapCauses: diagnoseCapCauses(races, "v2"), v1SmallCauses: diagnoseSmallCauses(races, "v1"), v2SmallCauses: diagnoseSmallCauses(races, "v2"),
    v2Warnings: countValues(races.flatMap(row => row.v2.warnings)), v2IneligibleReasons: countValues(races.map(row => row.v2.purchaseEligibility.reason).filter(Boolean)),
    v2Flow: summarizeFlows(races.map(row => row.v2.flow)), races: races.map(compactThreeRace)
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

function selectScenarioSetV2(scenarios, config) {
  const top = scenarios[0]?.scenarioRelativeScore || 0, supported = scenarios.filter(row => !top || row.scenarioRelativeScore / top >= config.v2.scenarioSupportFloor);
  const cliff = selectNaturalBoundary(supported, config.scenarioBoundary, "scenarioRelativeScore");
  const singleton = cliff.detected && cliff.rows.length === 1;
  const strongSingleton = singleton && cliff.boundary.boundaryScore >= config.v2.strongSingletonBoundaryScore && cliff.boundary.relativeGap >= config.v2.strongSingletonRelativeGap;
  const rows = singleton && !strongSingleton ? supported : cliff.rows;
  return { ...cliff, rows, supportedCount: supported.length, singletonCliffRelaxed: singleton && !strongSingleton };
}

function selectScenarioTerminalsV2(scenario, config) {
  const rows = scenario.terminals, byPair = new Map();
  for (const row of rows) { const key = row.order?.slice(0, 2).join("-"); if (!byPair.has(key)) byPair.set(key, []); byPair.get(key).push(row); }
  const pairs = [...byPair].map(([pair, terminals]) => ({ pair, terminals, score: Math.max(...terminals.map(row => finite(row.pairRelativeScore, row.terminalRelativeScore))) })).sort((a, b) => b.score - a.score || a.pair.localeCompare(b.pair, "en"));
  const topPair = pairs[0]?.score || 0, supportedPairs = pairs.filter(pair => !topPair || pair.score / topPair >= config.v2.pairSupportFloor);
  const selected = supportedPairs.flatMap(pair => selectNaturalBoundary(pair.terminals, config.terminalBoundary, "terminalRelativeScore").rows);
  const whole = selectNaturalBoundary(rows, config.terminalBoundary, "terminalRelativeScore");
  return { ...whole, rows: uniqueByTicket(selected), pairCountBefore: pairs.length, pairCountAfter: supportedPairs.length, noCliffMultipleRetention: !whole.detected && selected.length > 1 };
}

function consolidateNearDuplicateScenarios(scenarios, config) {
  const kept = [], mergedInto = new Map();
  for (const scenario of scenarios) {
    const target = kept.find(other => scenarioFamilyBase(other.scenarioId) === scenarioFamilyBase(scenario.scenarioId) && jaccard(other.terminals.map(ticketKey), scenario.terminals.map(ticketKey)) >= config.v2.nearDuplicateOverlap);
    if (!target) kept.push({ ...scenario, terminals: [...scenario.terminals], consolidatedScenarioIds: [scenario.scenarioId] });
    else {
      target.terminals = uniqueByTicket([...target.terminals, ...scenario.terminals]); target.consolidatedScenarioIds.push(scenario.scenarioId);
      target.scenarioRelativeScore = Math.max(target.scenarioRelativeScore, scenario.scenarioRelativeScore); mergedInto.set(scenario.scenarioId, target.scenarioId);
    }
  }
  return { rows: kept, mergedCount: mergedInto.size, mergedInto: Object.fromEntries(mergedInto) };
}

function remapConsolidatedScenarioSupport(tickets, consolidated) {
  return tickets.map(ticket => {
    const supports = new Map();
    for (const support of ticket.supportingScenarios) {
      const scenarioId = consolidated.mergedInto[support.scenarioId] || support.scenarioId;
      if (!supports.has(scenarioId)) supports.set(scenarioId, { ...support, scenarioId, independenceKey: scenarioId });
    }
    const supportingScenarios = [...supports.values()];
    return { ...ticket, supportingScenarios, scenarioIndependenceKeys: supportingScenarios.map(x => x.independenceKey), independentScenarioSupportCount: supportingScenarios.length };
  });
}

function allocateNaturalScenarioSet(tickets, scenarios, config) {
  if (!tickets.length) return [];
  const topScenario = scenarios[0]?.scenarioRelativeScore || 0;
  const allowed = new Set(scenarios.filter((scenario, index) => index === 0 || !topScenario || scenario.scenarioRelativeScore / topScenario >= config.v2.weakScenarioTailFloor).map(row => row.scenarioId));
  return tickets.filter(ticket => ticket.supportingScenarios.some(support => allowed.has(support.scenarioId)));
}

function summarizeThree(races, kind) {
  const plan = row => kind === "control" ? row.control : row[kind].tickets;
  const counts = races.map(row => plan(row).length), confirmed = races.filter(row => row.finish), hits = confirmed.filter(row => plan(row).some(ticket => ticketKey(ticket) === row.finish.join("-")));
  const investment = confirmed.reduce((sum, row) => sum + plan(row).length * 100, 0), returned = hits.reduce((sum, row) => sum + row.payout, 0), candidate = kind !== "control";
  return {
    raceCount: races.length, purchaseable: candidate ? races.filter(row => row[kind].purchaseEligibility.canPurchase).length : races.filter(row => row.control.length).length,
    ineligible: candidate ? races.filter(row => !row[kind].purchaseEligibility.canPurchase).length : 0, ticketDistribution: { ...distribution(counts), oneTo3: counts.filter(x => x >= 1 && x <= 3).length, fourTo6: counts.filter(x => x >= 4 && x <= 6).length },
    exactHits: hits.length, generatedCorrectTerminal: confirmed.filter(row => row.generatedCorrect).length, naturalCorrectSurvived: confirmed.filter(row => kind === "v3" ? row.v3NaturalCorrect : row.naturalCorrect).length, finalCorrectSurvived: hits.length,
    investment, return: returned, roi: investment ? returned / investment : null,
    mainTickets: candidate ? races.flatMap(row => row[kind].tickets).filter(x => x.category === "MAIN").length : null,
    coverTickets: candidate ? races.flatMap(row => row[kind].tickets).filter(x => x.category === "COVER").length : null,
    thickTickets: candidate ? races.flatMap(row => row[kind].tickets).filter(x => x.isThick).length : null,
    mainHits: candidate ? hits.filter(row => row[kind].tickets.some(x => ticketKey(x) === row.finish.join("-") && x.category === "MAIN")).length : null,
    coverHits: candidate ? hits.filter(row => row[kind].tickets.some(x => ticketKey(x) === row.finish.join("-") && x.category === "COVER")).length : null,
    thickHits: candidate ? hits.filter(row => row[kind].tickets.some(x => ticketKey(x) === row.finish.join("-") && x.isThick)).length : null,
    capIneligible: candidate ? races.filter(row => row[kind].purchaseEligibility.reason === "NATURAL_SELECTION_EXCEEDS_CAP").length : null,
    warnings: candidate ? countValues(races.flatMap(row => row[kind].warnings)) : {}, highPayoutCapture: { hitsAtLeast10000: hits.filter(row => row.payout >= 10000).length, returnAtLeast10000: hits.filter(row => row.payout >= 10000).reduce((sum, row) => sum + row.payout, 0), largestPayout: hits.length ? Math.max(...hits.map(row => row.payout)) : null },
    duplicateMerges: candidate ? races.reduce((sum, row) => sum + Number(row[kind].audit.duplicateTicketMerges || 0), 0) : null,
    nearDuplicateScenarioMerges: kind === "v2" ? races.reduce((sum, row) => sum + row.v2.audit.nearDuplicateScenarioMerges, 0) : null
  };
}

function diagnoseCapCauses(races, kind) {
  const buckets = { MANY_SCENARIOS: 0, MANY_TERMINALS_PER_SCENARIO: 0, TECHNICAL_NEAR_DUPLICATES: 0, PRE_EXACT_MERGE_ONLY: 0, WEAK_SCENARIO_CLIFF: 0, WEAK_TERMINAL_CLIFF: 0, NO_SCENARIO_ALLOCATION: 0, OTHER: 0 };
  for (const row of races.filter(row => row[kind].purchaseEligibility.reason === "NATURAL_SELECTION_EXCEEDS_CAP")) {
    const candidate = row[kind], scenarios = candidate.scenarios || [], matched = new Set();
    if (scenarios.length >= 5) matched.add("MANY_SCENARIOS");
    if (scenarios.some(s => s.terminalCount >= 12)) matched.add("MANY_TERMINALS_PER_SCENARIO");
    if (candidate.audit.technicalScenarioDuplicates > 0) matched.add("TECHNICAL_NEAR_DUPLICATES");
    if (candidate.audit.duplicateTicketMerges > 0 && candidate.naturalTicketCount <= 20) matched.add("PRE_EXACT_MERGE_ONLY");
    if (!candidate.scenarioBoundary.detected) matched.add("WEAK_SCENARIO_CLIFF");
    if ((candidate.terminalBoundaries || []).some(x => !x.detected)) matched.add("WEAK_TERMINAL_CLIFF");
    if (kind === "v1") matched.add("NO_SCENARIO_ALLOCATION");
    if (!matched.size) matched.add("OTHER");
    for (const key of matched) buckets[key] += 1;
  }
  return buckets;
}

function diagnoseSmallCauses(races, kind) {
  const buckets = { STRONG_SCENARIO_CLIFF: 0, STRONG_TERMINAL_CLIFF: 0, STRONGEST_SCENARIO_ONLY: 0, MAIN_CLASSIFICATION_DROP: 0, COVER_STRUCTURALLY_ABSENT: 0, MERGE_CONSOLIDATION: 0, CAP_PROCESS: 0, NATURALLY_SMALL: 0 };
  for (const row of races.filter(row => { const n = row[kind].tickets.length; return n >= 1 && n <= 3; })) {
    const candidate = row[kind];
    if (candidate.scenarioBoundary.detected) buckets.STRONG_SCENARIO_CLIFF += 1;
    if ((candidate.terminalBoundaries || []).some(x => x.detected)) buckets.STRONG_TERMINAL_CLIFF += 1;
    if (candidate.selectedScenarioIds.length === 1) buckets.STRONGEST_SCENARIO_ONLY += 1;
    if (!candidate.tickets.some(x => x.category === "COVER")) buckets.COVER_STRUCTURALLY_ABSENT += 1;
    if (candidate.audit.duplicateTicketMerges > 0) buckets.MERGE_CONSOLIDATION += 1;
    if (candidate.naturalTicketCount <= 3) buckets.NATURALLY_SMALL += 1;
  }
  return buckets;
}

function summarizeFlows(flows) { const keys = ["rawScenarioCount", "strongScenarioCandidateCount", "scenarioCliffCount", "rawTerminalCount", "naturalTerminalCount", "terminalCliffCount", "preMergeTicketCount", "exactMergeTicketCount", "nearConsolidationTicketCount", "allocatedTicketCount", "mainCount", "coverCount", "finalPurchaseCount"]; return Object.fromEntries(keys.map(key => [key, distribution(flows.map(flow => Number(flow[key] || 0)))])); }
function compactThreeRace(row) { const survive = candidate => { const key = row.finish?.join("-"); return key ? Object.fromEntries(Object.entries(candidate.flow?.stageOrders || {}).map(([stage, orders]) => [stage, orders.includes(key)])) : {}; }; return { raceKey: row.raceKey, controlTickets: row.control.length, v1Tickets: row.v1.tickets.length, v2Tickets: row.v2.tickets.length, v1Eligibility: row.v1.purchaseEligibility, v2Eligibility: row.v2.purchaseEligibility, v2Flow: { ...row.v2.flow, stageOrders: undefined }, correctSurvivalV2: survive(row.v2), exactHitControl: Boolean(row.finish && row.control.some(x => ticketKey(x) === row.finish.join("-"))), exactHitV1: Boolean(row.finish && row.v1.tickets.some(x => ticketKey(x) === row.finish.join("-"))), exactHitV2: Boolean(row.finish && row.v2.tickets.some(x => ticketKey(x) === row.finish.join("-"))), payout: row.payout }; }

function scoreScenarios(rows, prediction, config, preserveUnknown = false, identityFn = null) {
  const groups = new Map();
  for (const row of rows) {
    const provenance = provenanceFor(row, prediction);
    const identity = identityFn ? identityFn(row, provenance) : independentIdentity(row, provenance);
    if (!groups.has(identity)) groups.set(identity, { scenarioId: identity, evidenceFingerprint: evidenceFingerprint(row, provenance), rows: [], fingerprints: new Set(), technicalDuplicateCount: 0 });
    const group = groups.get(identity), fingerprint = evidenceFingerprint(row, provenance);
    if (group.fingerprints.has(fingerprint)) group.technicalDuplicateCount += 1;
    else group.fingerprints.add(fingerprint);
    group.rows.push(row);
  }
  const scored = [...groups.values()].map(group => {
    const terminals = group.rows.map(row => scoreTerminal(row, config, preserveUnknown));
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

function scoreTerminal(row, config, preserveUnknown = false) {
  rejectResultLeakage(row);
  const order = normalizeOrder(row.order || row.combination);
  const pick = preserveUnknown ? firstKnownFinite : firstFinite;
  const model = pick(row.terminalModelWeight, row.normalizedWeight, row.probability, row.modelWeight);
  const natural = pick(row.naturalConvergenceScore, row.scenarioCoherence);
  const branchFit = pick(row.branchFit, row.withinBranchFit);
  const pair = pick(row.pairRelativeScore, row.secondFamilyRelativeToBest, reciprocalRank(row.pairRank));
  const third = pick(row.thirdConditionalScore, row.thirdFamilyRelativeToBest, row.thirdVariantRelativeToBest, reciprocalRank(row.thirdRank));
  const components = { model, natural, branchFit, pair, third };
  const available = Object.entries(components).filter(([, value]) => Number.isFinite(value));
  const weightSum = available.reduce((sum, [key]) => sum + config.scoreWeights[key], 0);
  const terminalRelativeScore = weightSum ? available.reduce((sum, [key, value]) => sum + config.scoreWeights[key] * normalizeScore(value), 0) / weightSum : 0;
  return { order, firstRelativeScore: pick(row.firstRelativeScore, reciprocalRank(row.firstRank), reciprocalRank(row.derivedFirstMassRank)), pairRelativeScore: pair, thirdConditionalScore: third, terminalRelativeScore, terminalScoreBreakdown: components, odds: preserveUnknown ? knownFinite(row.odds) : finite(row.odds), original: row };
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
  const hasRows = rows.length > 0, hasScenario = rows.some(row => row.dominantBranchId || row.scenarioProvenanceId), hasModel = rows.some(row => [row.terminalModelWeight, row.normalizedWeight, row.probability, row.modelWeight].some(isKnownFinite)), hasRoles = rows.some(row => isKnownFinite(row.branchFit ?? row.withinBranchFit ?? row.scenarioCoherence));
  return [
    { field: "terminalLifecycle", classification: "CRITICAL", missing: !hasRows, affectedScope: "terminal generation" },
    { field: "scenarioIdentity", classification: "CRITICAL", missing: !hasScenario, affectedScope: "scenario selection" },
    { field: "modelSupport", classification: "IMPORTANT", missing: !hasModel, affectedScope: "relative scoring" },
    { field: "roleExecutionSupport", classification: "IMPORTANT", missing: !hasRoles, affectedScope: "scenario evidence" },
    { field: "marketOdds", classification: "AUXILIARY", missing: !rows.some(row => Number.isFinite(Number(row.odds))), affectedScope: "odds value warning only" }
  ];
}
function auditMissingnessV2(prediction, rows) {
  const base = auditMissingness(prediction, rows), modelAvailable = !base.find(item => item.field === "modelSupport")?.missing, naturalAvailable = rows.some(row => isKnownFinite(row.naturalConvergenceScore)), roleAvailable = !base.find(item => item.field === "roleExecutionSupport")?.missing;
  return base.map(item => {
    if (item.field === "marketOdds") return { ...item, warningEligible: false, impact: "AUXILIARY_ONLY" };
    if (item.field === "roleExecutionSupport" && item.missing && modelAvailable && naturalAvailable) return { ...item, classification: "AUXILIARY", warningEligible: false, impact: "REDUNDANT_WITH_MODEL_AND_NATURAL_SUPPORT" };
    if (item.field === "modelSupport" && item.missing && naturalAvailable && roleAvailable) return { ...item, classification: "AUXILIARY", warningEligible: false, impact: "REDUNDANT_WITH_NATURAL_AND_ROLE_SUPPORT" };
    return { ...item, warningEligible: item.classification === "IMPORTANT", impact: item.classification === "CRITICAL" ? "PURCHASE_BLOCKING" : item.classification === "IMPORTANT" ? "PURCHASE_DECISION_MATERIAL" : "DIAGNOSTIC_ONLY" };
  });
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
function hasImpactfulPartialMissing(rows) { return rows.some(x => x.missing && x.classification === "IMPORTANT" && x.warningEligible !== false); }
function confirmedFinish(record) { const result = record?.result?.result || record?.result; if (String(result?.status).toLowerCase() !== "confirmed") return null; const order = normalizeOrder(result?.finishOrder); return order?.length === 3 ? order : null; }
function isProtected(record) { return [record?.sequence, record?.recordNumber, record?.comparisonNumber, record?.validationIndex, record?.sealed?.sequence].some(value => Number.isFinite(Number(value)) && Number(value) >= 403 && Number(value) <= 502); }
function rejectResultLeakage(row) { for (const key of Object.keys(row || {})) if (RESULT_KEYS.has(key)) throw new Error(`result-aware terminal field prohibited: ${key}`); }
function normalizeOrder(value) { const values = (Array.isArray(value) ? value : String(value || "").match(/\d+/g) || []).map(Number).slice(0, 3); return values.length === 3 && new Set(values).size === 3 ? values : null; }
function ticketKey(row) { return normalizeOrder(row?.order || row?.combination)?.join("-") || ""; }
function firstFinite(...values) { for (const value of values) if (Number.isFinite(Number(value))) return Number(value); return null; }
function firstKnownFinite(...values) { for (const value of values) if (isKnownFinite(value)) return Number(value); return null; }
function knownFinite(value) { return isKnownFinite(value) ? Number(value) : null; }
function isKnownFinite(value) { return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)); }
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
function uniqueByTicket(values) { const map = new Map(); for (const value of values) { const key = ticketKey(value); if (key && !map.has(key)) map.set(key, value); } return [...map.values()]; }
function scenarioFamilyBase(value) { return String(value || "UNKNOWN").split("|")[0].replace(/[-_:](?:LINE)?[A-Z0-9]+$/i, ""); }
function jaccard(left, right) { const a = new Set(left), b = new Set(right), union = new Set([...a, ...b]); if (!union.size) return 0; let overlap = 0; for (const value of a) if (b.has(value)) overlap += 1; return overlap / union.size; }
function median(values) { return quantile(values, .5); }
function quantile(values, p) { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b), i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); }
function mean(values) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null; }
function finite(value, fallback = null) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function clamp(value) { return Math.max(0, Math.min(1, value)); }
