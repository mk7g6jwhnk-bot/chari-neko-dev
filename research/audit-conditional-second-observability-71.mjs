import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadValidationCohort } from './validation-cohort-source.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'historical-result-reaggregation', '2026-09-29');
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const hash = value => crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const order = value => (Array.isArray(value) ? value : String(value || '').match(/\d+/g) || []).map(Number).slice(0, 3);
const readGzip = async file => JSON.parse(zlib.gunzipSync(await fs.readFile(file)));
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const atomic = async (file, value) => { await fs.mkdir(path.dirname(file), { recursive: true }); const temp = `${file}.${process.pid}.tmp`; await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`); await fs.rename(temp, file); };
const grouped = (rows, field) => Object.fromEntries([...new Set(rows.map(row => row[field]))].sort().map(value => { const count = rows.filter(row => row[field] === value).length; return [value, { count, rate: rows.length ? count / rows.length : null }]; }));

async function fetchRows(keys, { loader = loadValidationCohort, chunkSize = 45 } = {}) {
  const rows = [], cache = path.join(out, 'observability-source');
  for (let offset = 0; offset < keys.length; offset += chunkSize) {
    const raceKeys = keys.slice(offset, offset + chunkSize), keyHash = hash(raceKeys), file = path.join(cache, `${String(offset / chunkSize + 1).padStart(3, '0')}.json`);
    let source = await read(file).catch(() => null);
    if (source?.keyHash !== keyHash) {
      const loaded = await loader({ cohort: { schemaVersion: 'CONDITIONAL_SECOND_OBSERVABILITY_V1', raceKeys, protectedFinalIncluded: 0 } });
      if (loaded.rows.length !== raceKeys.length || loaded.exclusions.length || Object.values(loaded.hashes || {}).some(Number)) throw Error(`SOURCE_GATE:${offset}`);
      source = { keyHash, raceKeys, rows: loaded.rows }; await atomic(file, source);
    }
    rows.push(...source.rows);
  }
  return rows;
}

function dominant(terminal) { return [...(terminal?.branchContributions || [])].sort((a, b) => (Number(b.probability) || 0) - (Number(a.probability) || 0) || String(a.branchId).localeCompare(String(b.branchId), 'en'))[0] || null; }

function terminalCoverage(terminal) {
  const branch = dominant(terminal), ratios = branch?.decisionRatios || terminal?.decisionRatios || {}, positions = branch?.positionScores || {};
  return {
    probability: finite(terminal?.probability), terminalScore: finite(terminal?.terminalScore), relativeProbability: finite(terminal?.relativeProbability), evidenceScore: finite(terminal?.evidenceScore),
    positionScores: ['first', 'second', 'third'].every(key => finite(positions[key])), decisionRatios: ['first', 'second', 'third'].every(key => finite(ratios[key])),
    branchProbability: finite(branch?.probability), branchWeightedScore: finite(branch?.weightedScore), conditionalSecond: finite(terminal?.conditionalScores?.secondConditionalScore ?? branch?.positionScores?.second),
    scenarioId: Boolean(terminal?.dominantBranchId || branch?.branchId), penalty: finite(terminal?.relativeConditionPenalty)
  };
}

function inspect(meta, row) {
  const winner = meta.winner, terminals = (row.prediction?.terminals || []).filter(terminal => order(terminal.order)[0] === winner), coverage = terminals.map(terminalCoverage);
  const reconstructed = terminals.filter(terminal => finite(terminal.relativeProbability) && finite(terminal.evidenceScore) && finite(terminal.terminalScore)).every(terminal => Math.abs(Number(terminal.terminalScore) - (Number(terminal.relativeProbability) * .65 + Number(terminal.evidenceScore) * .35)) <= 1e-9);
  const all = field => coverage.length > 0 && coverage.every(item => item[field]), any = field => coverage.some(item => item[field]);
  const status = all('terminalScore') && all('relativeProbability') && all('evidenceScore') && reconstructed ? 'FULLY_OBSERVABLE' : any('terminalScore') || any('probability') ? 'PARTIALLY_OBSERVABLE' : 'NOT_OBSERVABLE';
  const missing = {};
  for (const field of Object.keys(coverage[0] || {})) {
    const count = coverage.filter(item => !item[field]).length;
    if (!count) continue;
    const reason = ['relativeProbability', 'evidenceScore', 'positionScores', 'decisionRatios', 'branchProbability', 'branchWeightedScore', 'conditionalSecond'].includes(field) && all('terminalScore') ? 'COMPUTED_NOT_PERSISTED' : field === 'penalty' ? 'PERSISTED_ELSEWHERE_OR_NOT_COMPUTED' : 'NOT_RECONSTRUCTABLE';
    missing[field] = { missingTerminals: count, totalTerminals: coverage.length, reason };
  }
  const adoption = row.prediction?.riderSelectionAdoption || {}, trace = row.prediction?.terminalTrace || null;
  return {
    raceKey: meta.raceKey, kind: meta.kind, cohort: meta.cohort, winner, scenario: meta.scenario, payoutBand: meta.payoutBand,
    status, winnerCandidateTerminalCount: terminals.length, reconstructionMatched: reconstructed, fields: Object.fromEntries(Object.keys(coverage[0] || {}).map(field => [field, { complete: all(field), availableTerminals: coverage.filter(item => item[field]).length, totalTerminals: coverage.length }])), missing,
    version: { productionVersion: adoption.productionVersion || null, purchaseVersion: row.prediction?.purchaseVersion || null, baselineControlVersion: adoption.baselineControlVersion || null, parameterHash: adoption.parameterHash || null, traceSchemaVersion: trace?.schemaVersion || null, predictionSealedAt: row.predictionSealedAt || null, versionSufficientForReplay: Boolean(adoption.productionVersion && row.prediction?.purchaseVersion && adoption.parameterHash) },
    trace: { available: Boolean(trace), resultDataUsed: trace?.resultDataUsed ?? null, terminalCount: trace?.terminalCount ?? null }
  };
}

function missingSummary(rows) {
  const result = {};
  for (const row of rows) for (const [field, detail] of Object.entries(row.missing)) {
    const key = `${field}:${detail.reason}`; result[key] = (result[key] || 0) + 1;
  }
  return result;
}

function diagnoseFully(rows, sourceByKey) {
  const output = [];
  for (const audit of rows.filter(row => row.status === 'FULLY_OBSERVABLE')) {
    const source = sourceByKey.get(audit.raceKey), correctSecond = source.meta.correctSecond, candidates = new Map();
    for (const terminal of source.row.prediction.terminals || []) {
      const [first, second] = order(terminal.order); if (first !== audit.winner) continue;
      const score = Number(terminal.terminalScore), current = candidates.get(second);
      if (!current || score > current.score) candidates.set(second, { second, score, relative: Number(terminal.relativeProbability), evidence: Number(terminal.evidenceScore), order: order(terminal.order).join('-') });
    }
    const ranked = [...candidates.values()].sort((a, b) => b.score - a.score || b.relative - a.relative || a.order.localeCompare(b.order, 'en')).map((item, index) => ({ ...item, rank: index + 1 }));
    const selected = ranked[0], correct = ranked.find(item => item.second === correctSecond);
    if (!selected || !correct) continue;
    const gaps = { RELATIVE_PROBABILITY: (selected.relative - correct.relative) * .65, EVIDENCE_SCORE: (selected.evidence - correct.evidence) * .35 };
    const sorted = Object.entries(gaps).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    output.push({ raceKey: audit.raceKey, kind: audit.kind, cohort: audit.cohort, selectedSecond: selected.second, correctSecond, selectedScore: selected.score, correctScore: correct.score, scoreGap: selected.score - correct.score, rankGap: correct.rank - selected.rank, decisiveComponent: sorted[0][0], secondaryComponent: sorted[1][0], contributionGaps: gaps, deterministicReconstruction: true });
  }
  return output;
}

export async function run() {
  const source = await readGzip(path.join(out, 'conditional-second-races.json.gz'));
  const metas = [...source.target.map(row => ({ ...row, kind: 'FAILURE' })), ...source.control.map(row => ({ ...row, kind: 'CONTROL' }))];
  const fetched = await fetchRows(metas.map(row => row.raceKey)), byKey = new Map(fetched.map(row => [row.raceKey, row]));
  const audits = metas.map(meta => inspect(meta, byKey.get(meta.raceKey))), sourceByKey = new Map(metas.map(meta => [meta.raceKey, { meta, row: byKey.get(meta.raceKey) }]));
  const failure = audits.filter(row => row.kind === 'FAILURE'), control = audits.filter(row => row.kind === 'CONTROL'), diagnosis = diagnoseFully(audits, sourceByKey), failureDiagnosis = diagnosis.filter(row => row.kind === 'FAILURE'), controlDiagnosis = diagnosis.filter(row => row.kind === 'CONTROL');
  const componentLifecycle = [
    { component: 'raw terminal weighted score', computedAtPrediction: true, usedForRanking: true, sealed: 'PARTIAL(score/probability)', trace: 'NO_RAW_SUM', reconstructable: false, reason: 'branch score and all historical weighted contributions are not uniformly persisted' },
    { component: 'normalized probability', computedAtPrediction: true, usedForRanking: true, sealed: 'YES', trace: 'YES', reconstructable: true, reason: null },
    { component: 'relativeProbability', computedAtPrediction: true, usedForRanking: true, sealed: 'PARTIAL', trace: 'PARTIAL', reconstructable: 'ONLY_IF_MAX_PROBABILITY_AND_CANDIDATE_PROBABILITY_PERSIST', reason: 'tail terminal compaction' },
    { component: 'positionFit', computedAtPurchase: true, usedForRanking: 'via evidenceScore', sealed: 'PARTIAL', trace: 'INDIRECT', reconstructable: 'ONLY_WITH_ALL_POSITION_SCORES', reason: 'tail terminal compaction' },
    { component: 'positionBalance', computedAtPurchase: true, usedForRanking: 'via evidenceScore', sealed: 'PARTIAL', trace: 'INDIRECT', reconstructable: 'ONLY_WITH_ALL_POSITION_SCORES', reason: 'tail terminal compaction' },
    { component: 'decision ratio fit', computedAtPurchase: true, usedForRanking: 'via evidenceScore', sealed: 'PARTIAL', trace: 'INDIRECT', reconstructable: 'ONLY_WITH_ALL_DECISION_RATIOS', reason: 'tail terminal compaction' },
    { component: 'position evidence count', computedAtPurchase: true, usedForRanking: 'via evidenceScore', sealed: 'PARTIAL', trace: 'INDIRECT', reconstructable: 'ONLY_WITH_POSITION_EVIDENCE', reason: 'tail terminal compaction' },
    { component: 'evidenceScore', computedAtPurchase: true, usedForRanking: true, sealed: 'PARTIAL', trace: 'PARTIAL', reconstructable: 'ONLY_IF_ALL_FOUR_INPUTS_PERSIST', reason: 'tail terminal compaction' },
    { component: 'terminalScore', computedAtPurchase: true, usedForRanking: true, sealed: 'YES', trace: 'YES_WHEN_TRACE_AVAILABLE', reconstructable: true, reason: null },
    { component: 'NC/pair coherence/scenario/penalty', computedAtPurchase: true, usedForRanking: false, sealed: 'PARTIAL', trace: 'PARTIAL', reconstructable: false, reason: 'downstream gate/audit fields, not terminalScore sort inputs' }
  ];
  const decisive = rows => Object.fromEntries(['RELATIVE_PROBABILITY', 'EVIDENCE_SCORE'].map(name => [name, rows.filter(row => row.decisiveComponent === name).length]));
  const versions = Object.fromEntries([...new Set(audits.map(row => row.version.productionVersion || 'UNKNOWN'))].sort().map(version => [version, audits.filter(row => (row.version.productionVersion || 'UNKNOWN') === version).length]));
  const result = {
    schemaVersion: 'CONDITIONAL_SECOND_OBSERVABILITY_AUDIT_V1', generatedAt: new Date().toISOString(), verdict: 'OBSERVABILITY_INSUFFICIENT',
    cohort: { failure: failure.length, failureMatched505: metas.filter(row => row.kind === 'FAILURE' && row.cohort === 'MATCHED_505').length, failureExpansion130: metas.filter(row => row.kind === 'FAILURE' && row.cohort === 'EXPANSION_130').length, control: control.length, protectedFinalUsed: 0 },
    actualRankingPath: {
      prediction: ['positionScore = roleScore*0.72 + available ability geometric mean*0.28', 'conditionalScore = positionScore*compatibility.factor', 'FIRST/SECOND/THIRD ratios normalized inside branch', 'pathScore = firstRatio*secondRatio*thirdRatio', 'raw terminal score = sum(branchScore*pathScore)', 'probability = raw terminal score/sum(all terminal scores)'],
      purchase: ['relativeProbability = probability/maxProbability', 'positionFit = geometric mean(positionScores/10)', 'positionBalance = min(positionScores)/max(positionScores)', 'ratioFit = geometric mean(decisionRatios)', 'evidenceScore = 0.55*positionFit + 0.20*positionBalance + 0.15*ratioFit + 0.10*evidenceCount/3', 'terminalScore = 0.65*relativeProbability + 0.35*evidenceScore'],
      sortKey: ['terminalScore DESC', 'probability DESC', 'order lexicographic ASC'], fallback: ['missing evidence axes fall back to role score in positionScore', 'conditional compatibility is currently 1 unless logical contradiction', 'missing ratio contributes 0 in purchase evidence ratioFit through Number(value)||0', 'no result-time fallback'], tieBreak: 'probability DESC, then terminal order string ASC', normalization: ['within-branch conditional ratios', 'all-terminal probability normalization', 'max-terminal relativeProbability normalization'], excludedFromScoreSort: ['naturalConvergenceScore', 'pairNaturalConvergenceScore', 'pairScenarioCoherence', 'scenarioFamilySupport', 'relativeConditionPenalty', 'odds']
    },
    componentLifecycle,
    observability: { failure: grouped(failure, 'status'), control: grouped(control, 'status') },
    missingReasons: { failure: missingSummary(failure), control: missingSummary(control) },
    reconstruction: { safeRaceCount: diagnosis.length, failureSafe: failureDiagnosis.length, controlSafe: controlDiagnosis.length, unsafeRaceCount: audits.length - diagnosis.length, policy: 'sealed prediction-time fields only; no result-derived component reconstruction; no current-formula replay when version metadata is insufficient' },
    versionIntegrity: { versions, sufficientForReplay: audits.filter(row => row.version.versionSufficientForReplay).length, insufficientForReplay: audits.filter(row => !row.version.versionSufficientForReplay).length, limitation: 'productionVersion/parameterHash are not uniformly sealed; current code is not treated as historical code where metadata is absent' },
    causeDiagnosis: { observableFailureN: failureDiagnosis.length, observableControlN: controlDiagnosis.length, failurePrimary: decisive(failureDiagnosis), controlPrimary: decisive(controlDiagnosis), generalization: 'FULLY_OBSERVABLE subset only; do not extrapolate if version/scenario/cohort distributions differ' },
    bias: { failureByCohort: grouped(failure.filter(row => row.status === 'FULLY_OBSERVABLE'), 'cohort'), controlByCohort: grouped(control.filter(row => row.status === 'FULLY_OBSERVABLE'), 'cohort'), failureByScenario: grouped(failure.filter(row => row.status === 'FULLY_OBSERVABLE'), 'scenario'), controlByScenario: grouped(control.filter(row => row.status === 'FULLY_OBSERVABLE'), 'scenario'), failureByPayout: grouped(failure.filter(row => row.status === 'FULLY_OBSERVABLE'), 'payoutBand'), controlByPayout: grouped(control.filter(row => row.status === 'FULLY_OBSERVABLE'), 'payoutBand'), versions },
    futureTrace: {
      schema: 'WINNER_CONDITIONED_SECOND_RANK_TRACE_V1', diagnosticOnly: true,
      raceHeader: ['raceKey', 'predictionHash', 'predictionVersion', 'purchaseVersion', 'parameterHash', 'sealedAt', 'traceSchemaVersion'],
      perCandidate: ['winner rider number', 'second rider number', 'representative terminal id', 'raw terminal weighted score', 'normalized probability', 'max probability denominator', 'relativeProbability', 'positionFit', 'positionBalance', 'decisionRatioFit', 'positionEvidenceCount', 'evidenceScore', 'terminalScore', 'sort tuple', 'fallback reason', 'dominant scenario/branch id'],
      audit: ['candidate count', 'ranked second rider ids', 'tie-break reason', 'input hash', 'reconstruction hash', 'resultDataUsed=false'],
      estimatedOverhead: { jsonBytesPerRace: '2000-4000', gzipBytesPerRace: '800-1500', cpu: '<2ms expected; benchmark required', latency: 'negligible expected; benchmark required', storagePer1000R: '0.8-1.5MB gzip' },
      productionLogicImpact: 'NONE'
    },
    nextAction: 'IMPLEMENT_DIAGNOSTIC_ONLY_WINNER_CONDITIONED_SECOND_TRACE_THEN_COLLECT_NEW_TEMPORAL_COHORT',
    safety: { productionChanged: false, predictionChanged: false, purchaseChanged: false, riderWeakChanged: false, resultChanged: false, checkpointChanged: false, sealedPredictionMutation: 0, shadowImplemented: false, parameterTuned: false, protectedFinalUsed: 0, resultLeakage: 0 }
  };
  result.hash = hash(result);
  await atomic(path.join(out, 'conditional-second-observability-audit.json'), result);
  await fs.writeFile(path.join(out, 'conditional-second-observability-races.json.gz'), zlib.gzipSync(Buffer.from(JSON.stringify({ schemaVersion: 'CONDITIONAL_SECOND_OBSERVABILITY_RACES_V1', auditHash: result.hash, audits, diagnosis }))));
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await run(), null, 2));
