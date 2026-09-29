import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadValidationCohort } from './validation-cohort-source.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'historical-result-reaggregation', '2026-09-29');
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const digest = value => crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const atomic = async (file, value) => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`);
  await fs.rename(temp, file);
};
const nums = value => (Array.isArray(value) ? value : String(value || '').match(/\d+/g) || []).map(Number).slice(0, 3);
const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const n = value => finite(value) ? Number(value) : null;
const quantile = (values, p) => values.length ? [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * p) - 1)] : null;
const avg = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const rates = (rows, field) => Object.fromEntries([...new Set(rows.map(row => row[field]))].sort().map(value => {
  const count = rows.filter(row => row[field] === value).length;
  return [value, { count, rate: rows.length ? count / rows.length : null }];
}));

async function loadDailyRows() {
  const matched = new Set((await read(path.join(out, 'matched-505-racekeys.json'))).raceKeys);
  const expansion = new Set((await read(path.join(out, 'expansion-130.json'))).raceKeys);
  const rows = [];
  for (const date of await fs.readdir(path.join(out, 'daily'))) {
    const summary = await read(path.join(out, 'daily', date, 'summary.json'));
    for (const row of summary.daily?.distance?.races || []) {
      rows.push({ ...row, cohort: matched.has(row.raceKey) ? 'MATCHED_505' : expansion.has(row.raceKey) ? 'EXPANSION_130' : 'INVALID' });
    }
  }
  if (rows.length !== 635 || new Set(rows.map(row => row.raceKey)).size !== 635 || rows.some(row => row.cohort === 'INVALID')) throw Error('CANONICAL_635_GATE');
  return rows;
}

function deterministicControl(rows, cohort, count) {
  return rows.filter(row => row.cohort === cohort && row.winner?.meaningful === true && row.pair?.meaningful === true)
    .sort((a, b) => digest(a.raceKey).localeCompare(digest(b.raceKey))).slice(0, count);
}

async function cohorts() {
  const all = await loadDailyRows();
  const prior = JSON.parse(zlib.gunzipSync(await fs.readFile(path.join(out, 'pair-failure-races.json.gz'))));
  const targetKeys = new Set(prior.rows.filter(row => row.primary === 'CONDITIONAL_PAIR_SCORING_FAILURE').map(row => row.raceKey));
  const target = all.filter(row => targetKeys.has(row.raceKey));
  const control = [...deterministicControl(all, 'MATCHED_505', 59), ...deterministicControl(all, 'EXPANSION_130', 12)];
  if (target.length !== 71 || target.filter(row => row.cohort === 'MATCHED_505').length !== 59 || target.filter(row => row.cohort === 'EXPANSION_130').length !== 12) throw Error('TARGET_71_GATE');
  if (control.length !== 71 || new Set([...target, ...control].map(row => row.raceKey)).size !== 142) throw Error('CONTROL_71_GATE');
  return { target, control };
}

async function fetchRows(keys, { loader = loadValidationCohort, chunkSize = 45 } = {}) {
  const rows = [], cache = path.join(out, 'conditional-second-source');
  for (let offset = 0; offset < keys.length; offset += chunkSize) {
    const raceKeys = keys.slice(offset, offset + chunkSize), keyHash = digest(raceKeys);
    const file = path.join(cache, `${String(offset / chunkSize + 1).padStart(3, '0')}.json`);
    let source = await read(file).catch(() => null);
    if (source?.keyHash !== keyHash) {
      const loaded = await loader({ cohort: { schemaVersion: 'CONDITIONAL_SECOND_DIAGNOSTIC_V1', raceKeys, protectedFinalIncluded: 0 } });
      if (loaded.rows.length !== raceKeys.length || loaded.exclusions.length || Object.values(loaded.hashes || {}).some(Number)) throw Error(`SOURCE_GATE:${offset}`);
      source = { keyHash, raceKeys, rows: loaded.rows };
      await atomic(file, source);
    }
    rows.push(...source.rows);
  }
  return rows;
}

function dominant(terminal) {
  return [...(terminal?.branchContributions || [])].sort((a, b) => (Number(b.weightedScore) || Number(b.probability) || 0) - (Number(a.weightedScore) || Number(a.probability) || 0))[0] || {};
}

function components(terminal) {
  const branch = dominant(terminal), compatibility = terminal?.conditionalEvaluation?.second || branch?.conditionalEvaluation?.second || {};
  return {
    SECOND_CONDITIONAL: n(terminal?.conditionalScores?.secondConditionalScore ?? branch?.positionScores?.second),
    PAIR_DIRECTION: n(terminal?.pairNaturalConvergenceScore),
    PAIR_COHERENCE: n(terminal?.pairScenarioCoherence),
    SECOND_RELATIVE: n(terminal?.secondFamilyRelativeToBest),
    PAIR_COMPATIBILITY: n(compatibility?.factor),
    POSITION_SECOND: n(branch?.positionScores?.second),
    DECISION_SECOND: n(terminal?.decisionRatios?.second ?? branch?.decisionRatios?.second),
    SCENARIO_SUPPORT: n(terminal?.scenarioFamilySupport),
    SCENARIO_PROBABILITY: n(terminal?.scenarioFamilyProbability),
    CONDITION_PENALTY: n(terminal?.relativeConditionPenalty),
    NATURAL_CONVERGENCE: n(terminal?.naturalConvergenceScore),
    RELATIVE_PROBABILITY: n(terminal?.relativeProbability),
    EVIDENCE_SCORE: n(terminal?.evidenceScore)
  };
}

function pairCandidates(row, winner) {
  const groups = new Map();
  for (const terminal of row.prediction?.terminals || []) {
    const order = nums(terminal.order);
    if (order[0] !== winner) continue;
    const score = n(terminal.terminalScore ?? terminal.probability);
    if (!groups.has(order[1])) groups.set(order[1], []);
    groups.get(order[1]).push({ terminal, score, rank: n(terminal.terminalPairRank ?? terminal.terminalGlobalRank) });
  }
  const candidates = [...groups.entries()].map(([second, terminals]) => {
    terminals.sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity) || (a.rank ?? Infinity) - (b.rank ?? Infinity));
    const best = terminals[0];
    return { second, score: best.score, sourceTerminalPairRank: Math.min(...terminals.map(item => item.rank ?? Infinity)), terminal: best.terminal, components: components(best.terminal) };
  }).sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity) || a.second - b.second);
  return candidates.map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}

function evidenceAvailability(terminal) {
  const branch = dominant(terminal), evidence = branch.positionEvidence || {};
  const values = [evidence.first, evidence.second].filter(Boolean);
  return values.length === 2 ? 'KNOWN' : values.length === 1 ? 'PARTIAL' : 'UNKNOWN';
}

function lineRelation(row, winner, second) {
  const lines = row.prediction?.structureInput?.lines || [];
  if (!row.prediction?.structureInput?.lineDataAvailable || !lines.length) return 'UNKNOWN';
  const firstLine = lines.find(line => (line.members || []).includes(winner));
  const secondLine = lines.find(line => (line.members || []).includes(second));
  if (!firstLine || !secondLine) return 'UNKNOWN';
  return firstLine === secondLine ? 'SAME_LINE' : 'CROSS_LINE';
}

function inspect(base, source, kind) {
  const finish = nums(source.result?.finishOrder), [winner, correctSecond] = finish, candidates = pairCandidates(source, winner);
  const correct = candidates.find(row => row.second === correctSecond), selected = candidates[0];
  const valid = base.winner?.meaningful === true && base.pair?.generated === true && correct && selected && finish.length === 3 && (kind === 'CONTROL' || (base.primaryCause === 'PAIR_ORDER_MISS' && base.pair?.rank <= 20));
  const componentDelta = Object.fromEntries(Object.keys(correct?.components || {}).map(name => [name, finite(selected?.components?.[name]) && finite(correct?.components?.[name]) ? selected.components[name] - correct.components[name] : null]));
  const correctScore = correct?.score ?? null, selectedScore = selected?.score ?? null;
  return {
    raceKey: base.raceKey, cohort: base.cohort, kind, valid: Boolean(valid), invalidReason: valid ? null : 'CONDITIONAL_LAYER_PRECONDITION_FAILED',
    winner, selectedSecond: selected?.second ?? null, correctSecond, selectedSecondScore: selectedScore, correctSecondScore: correctScore,
    scoreGap: finite(selectedScore) && finite(correctScore) ? selectedScore - correctScore : null,
    selectedRank: selected?.rank ?? null, correctRank: correct?.rank ?? null,
    rankGap: finite(correct?.rank) && finite(selected?.rank) ? correct.rank - selected.rank : null,
    correctComponents: correct?.components || {}, selectedComponents: selected?.components || {}, componentDelta,
    evidenceAvailability: evidenceAvailability(correct?.terminal), correctLineRelation: lineRelation(source, winner, correctSecond),
    selectedLineRelation: lineRelation(source, winner, selected?.second), scenario: dominant(correct?.terminal)?.branchType || base.scenario || 'UNKNOWN',
    payout: n(source.result?.payout), payoutBand: Number(source.result?.payout) <= 3000 ? 'LOW' : Number(source.result?.payout) <= 10000 ? 'MEDIUM' : 'HIGH',
    predictionTimeOnlyComponents: true, resultUsedOnlyForEvaluationLabel: true
  };
}

function standardDeviations(rows) {
  const names = Object.keys(rows[0]?.componentDelta || {}), result = {};
  for (const name of names) {
    const values = rows.flatMap(row => [row.correctComponents[name], row.selectedComponents[name]]).filter(finite).map(Number);
    const mean = avg(values), variance = values.length ? avg(values.map(value => (value - mean) ** 2)) : null;
    result[name] = variance === null ? null : Math.sqrt(variance);
  }
  return result;
}

function attribute(rows) {
  const scales = standardDeviations(rows);
  for (const row of rows) {
    const scored = Object.entries(row.componentDelta).filter(([, value]) => finite(value)).map(([name, value]) => ({ name, delta: value, normalized: scales[name] > 0 ? value / scales[name] : null })).filter(item => finite(item.normalized) && item.normalized > 0).sort((a, b) => b.normalized - a.normalized || a.name.localeCompare(b.name));
    row.primaryContributor = scored[0]?.name || 'UNKNOWN_CAUSE';
    row.secondaryContributor = scored[1]?.name || null;
  }
  return scales;
}

function summarize(rows) {
  return { count: rows.length, scoreGap: { avg: avg(rows.map(row => row.scoreGap).filter(finite).map(Number)), median: quantile(rows.map(row => row.scoreGap).filter(finite).map(Number), .5) }, primaryContributor: rates(rows, 'primaryContributor'), evidenceAvailability: rates(rows, 'evidenceAvailability'), correctLineRelation: rates(rows, 'correctLineRelation'), selectedLineRelation: rates(rows, 'selectedLineRelation'), scenario: rates(rows, 'scenario'), payout: rates(rows, 'payoutBand') };
}

function counterfactual(rows) {
  const evaluable = rows.filter(row => finite(row.selectedComponents.RELATIVE_PROBABILITY) && finite(row.correctComponents.RELATIVE_PROBABILITY) && finite(row.selectedComponents.EVIDENCE_SCORE) && finite(row.correctComponents.EVIDENCE_SCORE));
  const evaluate = mode => evaluable.filter(row => {
    const relativeGap = row.selectedComponents.RELATIVE_PROBABILITY - row.correctComponents.RELATIVE_PROBABILITY;
    const evidenceGap = row.selectedComponents.EVIDENCE_SCORE - row.correctComponents.EVIDENCE_SCORE;
    const gap = mode === 'REMOVE_RELATIVE_PROBABILITY' ? .35 * evidenceGap : .65 * relativeGap;
    return gap <= 0;
  }).length;
  return {
    formula: 'terminalScore = relativeProbability*0.65 + evidenceScore*0.35', evaluable: evaluable.length,
    REMOVE_RELATIVE_PROBABILITY: { correctedOrder: evaluate('REMOVE_RELATIVE_PROBABILITY') },
    REMOVE_EVIDENCE_SCORE: { correctedOrder: evaluate('REMOVE_EVIDENCE_SCORE') },
    otherComponents: 'DIAGNOSTIC_ONLY_NOT_ADDITIVE_NO_COUNTERFACTUAL_WEIGHT_SEARCH'
  };
}

export async function run() {
  const { target, control } = await cohorts(), base = [...target, ...control], fetched = await fetchRows(base.map(row => row.raceKey)), byKey = new Map(fetched.map(row => [row.raceKey, row]));
  const targetRows = target.map(row => inspect(row, byKey.get(row.raceKey), 'FAILURE'));
  const controlRows = control.map(row => inspect(row, byKey.get(row.raceKey), 'CONTROL'));
  const invalid = targetRows.filter(row => !row.valid), valid = targetRows.filter(row => row.valid), validControl = controlRows.filter(row => row.valid);
  const scales = attribute(valid); attribute(validControl);
  const gaps = valid.map(row => Math.max(0, Number(row.scoreGap) || 0)), q1 = quantile(gaps, 1 / 3), q2 = quantile(gaps, 2 / 3);
  for (const row of valid) row.scoreGapBucket = row.scoreGap <= q1 ? 'NEAR_TIE' : row.scoreGap <= q2 ? 'MODERATE_GAP' : 'LARGE_GAP';
  const contributorNames = [...new Set(valid.map(row => row.primaryContributor))];
  const controlFalsePositive = Object.fromEntries(contributorNames.sort().map(name => {
    const flagged = validControl.filter(row => row.primaryContributor === name && row.selectedSecond !== row.correctSecond).length;
    return [name, { count: flagged, denominator: validControl.length, rate: validControl.length ? flagged / validControl.length : null }];
  }));
  const result = {
    schemaVersion: 'CONDITIONAL_SECOND_DIAGNOSTIC_71_V1', generatedAt: new Date().toISOString(), verdict: invalid.length ? 'CONDITIONAL_SECOND_DIAGNOSTIC_WITH_INVALID' : 'CONDITIONAL_SECOND_CAUSE_DIAGNOSIS_READY',
    cohort: { total: targetRows.length, matched505: targetRows.filter(row => row.cohort === 'MATCHED_505').length, expansion130: targetRows.filter(row => row.cohort === 'EXPANSION_130').length, invalid: invalid.length, overlap: 0, missing: 0, protectedFinalUsed: 0, unknownUsed: 0 },
    preconditions: { winnerMeaningful: target.filter(row => row.winner?.meaningful).length, winnerFailure: target.filter(row => !row.winner?.meaningful).length, correctPairGenerated: target.filter(row => row.pair?.generated).length, scenarioPrimaryFailure: target.filter(row => row.category === 'E_UPSTREAM_MISS').length },
    components: { additiveScoreFormula: ['RELATIVE_PROBABILITY:0.65', 'EVIDENCE_SCORE:0.35'], diagnosticOnly: ['SECOND_CONDITIONAL', 'PAIR_DIRECTION', 'PAIR_COHERENCE', 'SECOND_RELATIVE', 'PAIR_COMPATIBILITY', 'POSITION_SECOND', 'DECISION_SECOND', 'SCENARIO_SUPPORT', 'SCENARIO_PROBABILITY', 'CONDITION_PENALTY', 'NATURAL_CONVERGENCE'], attributionNormalizationStdDev: scales },
    scoreGap: { thresholds: { nearTieMax: q1, moderateGapMax: q2 }, buckets: rates(valid, 'scoreGapBucket'), avg: avg(gaps), median: quantile(gaps, .5), p90: quantile(gaps, .9) },
    attribution: { full: rates(valid, 'primaryContributor'), matched505: rates(valid.filter(row => row.cohort === 'MATCHED_505'), 'primaryContributor'), expansion130: rates(valid.filter(row => row.cohort === 'EXPANSION_130'), 'primaryContributor'), unknown: valid.filter(row => row.primaryContributor === 'UNKNOWN_CAUSE').length },
    roleLine: { evidence: rates(valid, 'evidenceAvailability'), correctSecond: rates(valid, 'correctLineRelation'), selectedSecond: rates(valid, 'selectedLineRelation') },
    scenario: rates(valid, 'scenario'), scenarioDetail: Object.fromEntries([...new Set(valid.map(row => row.scenario))].sort().map(name => [name, summarize(valid.filter(row => row.scenario === name))])),
    payout: rates(valid, 'payoutBand'), reproducibility: { matched505: summarize(valid.filter(row => row.cohort === 'MATCHED_505')), expansion130: summarize(valid.filter(row => row.cohort === 'EXPANSION_130')) },
    counterfactual: counterfactual(valid), control: { selection: 'TEMPORAL_SAFE_PAIR_MEANINGFUL_DETERMINISTIC_59_12', total: controlRows.length, valid: validControl.length, invalid: controlRows.length - validControl.length, falsePositiveByContributor: controlFalsePositive },
    candidates: [], safety: { productionChanged: false, predictionRegenerated: false, purchaseChanged: false, riderWeakChanged: false, resultChanged: false, checkpointChanged: false, shadowImplemented: false, parameterTuned: false, protectedFinalUsed: 0, resultLeakage: 0 }
  };
  const ranked = Object.entries(result.attribution.full).filter(([name]) => name !== 'UNKNOWN_CAUSE').map(([name, summary]) => ({ name, ...summary, matched: result.attribution.matched505[name]?.count || 0, expansion: result.attribution.expansion130[name]?.count || 0, controlFalsePositive: result.control.falsePositiveByContributor[name]?.rate ?? null })).filter(row => row.matched > 0 && row.expansion > 0).sort((a, b) => (b.count * (1 - (b.controlFalsePositive ?? 1))) - (a.count * (1 - (a.controlFalsePositive ?? 1))) || b.count - a.count).slice(0, 3);
  result.candidates = ranked.map((row, index) => ({ rank: index + 1, id: `${row.name}_CONDITIONAL_SECOND_DIAGNOSTIC`, targetSubtype: row.name, targetCount: row.count, mechanism: 'selected second exceeds correct second on the saved prediction-time component after winner/scenario are fixed', requiredInputs: [row.name, 'winner-fixed pair candidates', 'saved scenario/line evidence'], evidenceAvailability: result.roleLine.evidence, matched505: row.matched, expansion130: row.expansion, controlFalsePositiveRate: row.controlFalsePositive, expectedBenefit: 'isolate conditional second ordering without global terminal changes', likelySideEffect: 'may disturb correct pair ordering if signal is not selective', shadowTestDesign: 'future single-component frozen diagnostic; no parameter search and no production connection' }));
  result.hash = digest(result);
  await atomic(path.join(out, 'conditional-second-diagnostic.json'), result);
  await fs.writeFile(path.join(out, 'conditional-second-races.json.gz'), zlib.gzipSync(Buffer.from(JSON.stringify({ schemaVersion: 'CONDITIONAL_SECOND_RACES_V1', diagnosticHash: result.hash, target: targetRows, control: controlRows }))));
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await run();
  console.log(JSON.stringify(result, null, 2));
}
