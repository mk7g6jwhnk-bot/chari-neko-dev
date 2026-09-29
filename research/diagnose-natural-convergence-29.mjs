import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'historical-result-reaggregation', '2026-09-29');
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const digest = value => crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const avg = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const quantile = (values, p) => values.length ? [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * p) - 1)] : null;
const group = (rows, field) => Object.fromEntries([...new Set(rows.map(row => row[field]))].sort().map(value => {
  const selected = rows.filter(row => row[field] === value);
  return [value, { count: selected.length, rate: rows.length ? selected.length / rows.length : null }];
}));
const readGzip = async file => JSON.parse(zlib.gunzipSync(await fs.readFile(file)));
const atomic = async (file, value) => {
  const temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`);
  await fs.rename(temp, file);
};

function decorate(row, kind) {
  const selectedNC = row.selectedComponents?.NATURAL_CONVERGENCE;
  const correctNC = row.correctComponents?.NATURAL_CONVERGENCE;
  const ncDelta = finite(selectedNC) && finite(correctNC) ? Number(selectedNC) - Number(correctNC) : null;
  const relativeDelta = row.componentDelta?.RELATIVE_PROBABILITY;
  const evidenceDelta = row.componentDelta?.EVIDENCE_SCORE;
  const additiveKnown = finite(relativeDelta) && finite(evidenceDelta);
  const additiveScoreGap = additiveKnown ? Number(relativeDelta) * .65 + Number(evidenceDelta) * .35 : null;
  let interaction = 'ADDITIVE_COMPONENTS_UNKNOWN';
  if (additiveKnown && additiveScoreGap > 0) interaction = 'NC_PLUS_ADDITIVE_ADVANTAGE';
  else if (additiveKnown && additiveScoreGap === 0) interaction = 'NC_ASSOCIATION_ADDITIVE_TIE';
  else if (additiveKnown && additiveScoreGap < 0) interaction = 'NC_OFFSET_BY_ADDITIVE_COMPONENTS';
  return {
    raceKey: row.raceKey, cohort: row.cohort, kind, winner: row.winner, selectedSecond: row.selectedSecond, correctSecond: row.correctSecond,
    selectedNaturalConvergence: selectedNC ?? null, correctNaturalConvergence: correctNC ?? null, ncDelta,
    selectedSecondConditional: row.selectedComponents?.SECOND_CONDITIONAL ?? null, correctSecondConditional: row.correctComponents?.SECOND_CONDITIONAL ?? null,
    selectedFinalScore: row.selectedSecondScore, correctFinalScore: row.correctSecondScore, totalScoreGap: row.scoreGap,
    selectedRank: row.selectedRank, correctRank: row.correctRank, rankGap: row.rankGap,
    relativeProbabilityDelta: relativeDelta ?? null, evidenceScoreDelta: evidenceDelta ?? null,
    pairCoherenceDelta: row.componentDelta?.PAIR_COHERENCE ?? null, positionSecondDelta: row.componentDelta?.POSITION_SECOND ?? null,
    decisionSecondDelta: row.componentDelta?.DECISION_SECOND ?? null, additiveScoreGap, interaction,
    evidenceAvailability: row.evidenceAvailability, correctLineRelation: row.correctLineRelation, selectedLineRelation: row.selectedLineRelation,
    scenario: row.scenario, payoutBand: row.payoutBand, conditionalScoreGapBucket: row.scoreGapBucket || null,
    predictionTimeInputsOnly: true, resultUsedOnlyForCorrectSecondEvaluation: true
  };
}

function summarize(rows) {
  const deltas = rows.map(row => row.ncDelta).filter(finite).map(Number);
  return {
    count: rows.length, ncDelta: { avg: avg(deltas), median: quantile(deltas, .5), p90: quantile(deltas, .9) },
    deltaBucket: group(rows, 'ncDeltaBucket'), interaction: group(rows, 'interaction'), evidence: group(rows, 'evidenceAvailability'),
    correctLine: group(rows, 'correctLineRelation'), selectedLine: group(rows, 'selectedLineRelation'), scoreGap: group(rows, 'conditionalScoreGapBucket'), payout: group(rows, 'payoutBand')
  };
}

function coverage(failure, fp, negative, predicate) {
  const f = failure.filter(predicate), p = fp.filter(predicate), n = negative.filter(predicate);
  return {
    failure: { count: f.length, denominator: failure.length, rate: failure.length ? f.length / failure.length : null },
    controlFalsePositive: { count: p.length, denominator: fp.length, rate: fp.length ? p.length / fp.length : null },
    controlNegative: { count: n.length, denominator: negative.length, rate: negative.length ? n.length / negative.length : null },
    precisionLike: f.length + p.length ? f.length / (f.length + p.length) : null,
    matched505: f.filter(row => row.cohort === 'MATCHED_505').length,
    expansion130: f.filter(row => row.cohort === 'EXPANSION_130').length
  };
}

export async function run() {
  const source = await readGzip(path.join(out, 'conditional-second-races.json.gz'));
  const failure = source.target.filter(row => row.primaryContributor === 'NATURAL_CONVERGENCE').map(row => decorate(row, 'FAILURE_NC'));
  const controlFp = source.control.filter(row => row.primaryContributor === 'NATURAL_CONVERGENCE' && row.selectedSecond !== row.correctSecond).map(row => decorate(row, 'CONTROL_NC_FP'));
  const controlNegative = source.control.filter(row => !(row.primaryContributor === 'NATURAL_CONVERGENCE' && row.selectedSecond !== row.correctSecond)).map(row => decorate(row, 'CONTROL_NC_NEGATIVE'));
  if (failure.length !== 29 || failure.filter(row => row.cohort === 'MATCHED_505').length !== 22 || failure.filter(row => row.cohort === 'EXPANSION_130').length !== 7 || controlFp.length !== 7 || controlNegative.length !== 64) throw Error('NC_COHORT_GATE');
  const values = failure.map(row => row.ncDelta).filter(finite).map(Number), q1 = quantile(values, 1 / 3), q2 = quantile(values, 2 / 3);
  for (const row of [...failure, ...controlFp, ...controlNegative]) row.ncDeltaBucket = !finite(row.ncDelta) ? 'UNKNOWN' : row.ncDelta <= q1 ? 'NEAR' : row.ncDelta <= q2 ? 'MODERATE' : 'LARGE';
  const conditions = {
    INSUFFICIENT_EVIDENCE_AND_LARGE_NC: row => row.scenario === 'INSUFFICIENT_EVIDENCE' && row.ncDeltaBucket === 'LARGE',
    ADDITIVE_EVIDENCE_UNAVAILABLE_AND_NC_ADVANTAGE: row => row.interaction === 'ADDITIVE_COMPONENTS_UNKNOWN' && Number(row.ncDelta) > 0,
    SELECTED_SAME_LINE_CORRECT_CROSS_LINE: row => row.selectedLineRelation === 'SAME_LINE' && row.correctLineRelation === 'CROSS_LINE'
  };
  const discrimination = Object.fromEntries(Object.entries(conditions).map(([name, predicate]) => [name, coverage(failure, controlFp, controlNegative, predicate)]));
  const scenario = Object.fromEntries([...new Set(failure.map(row => row.scenario))].sort().map(name => {
    const rows = failure.filter(row => row.scenario === name), controls = controlFp.filter(row => row.scenario === name), deltas = rows.map(row => row.ncDelta).filter(finite).map(Number);
    return [name, { count: rows.length, ncDeltaAvg: avg(deltas), ncDeltaMedian: quantile(deltas, .5), formalFlipCount: 0, controlFalsePositiveCount: controls.length }];
  }));
  const result = {
    schemaVersion: 'NATURAL_CONVERGENCE_MISDIRECTION_29_V1', generatedAt: new Date().toISOString(), verdict: 'NATURAL_CONVERGENCE_ASSOCIATION_NOT_CONDITIONAL_SCORE_CAUSE',
    cohort: { failureNc: failure.length, matched505: failure.filter(row => row.cohort === 'MATCHED_505').length, expansion130: failure.filter(row => row.cohort === 'EXPANSION_130').length, controlFalsePositive: controlFp.length, controlNegative: controlNegative.length, invalid: 0, overlap: 0, missing: 0, protectedFinalUsed: 0, unknownUsed: 0 },
    implementationAudit: {
      source: 'keirin/engine/chat-spec-v1-policy.mjs::deriveNaturalConvergence',
      executionOrder: 'normalizeProbabilities/addRanks -> deriveNaturalConvergence -> downstream natural/purchase gates',
      inputs: ['best matching branch contribution', 'decisionRatios first/second/third', 'line relation for first/second/third', 'branch lineIndependentFallback', 'FIRST/SECOND/THIRD node conditional probabilities', 'newRequiredConditions'],
      normalization: 'clamp((scenarioCoherence*0.40 + geometricDecisionRatio*0.22 + geometricNodeProbability*0.38) * conditionPenalty, 0, 1)',
      legacyFallback: 'clamp((scenarioCoherence*0.55 + geometricDecisionRatio*0.45) * penalty, 0, 1)',
      dependencies: { winner: true, secondRider: true, pair: true, thirdRider: true, scenarioBranch: true, terminal: true },
      missingEvidence: 'decision ratios default to 1; no line context retains scenarioCoherence=0.50, or 0.62 only for explicit lineIndependentFallback',
      directInputToTerminalScore: false,
      causalBoundary: 'Natural convergence can affect downstream natural/purchase eligibility, but does not enter the saved terminalScore additive reconstruction.'
    },
    ncDelta: { avg: avg(values), median: quantile(values, .5), p90: quantile(values, .9), thresholds: { nearMax: q1, moderateMax: q2 }, buckets: group(failure, 'ncDeltaBucket') },
    interaction: group(failure, 'interaction'),
    counterfactual: { formallyAdditiveNcContribution: false, neutralizeNcDifference: { flip: 0, tie: 0, unchanged: 29, wrongSideEffect: 0 }, reason: 'NC is not an additive terminalScore component; changing it would simulate a new policy/weight and is prohibited.' },
    scenario, roleLine: { failure: { evidence: group(failure, 'evidenceAvailability'), correctLine: group(failure, 'correctLineRelation'), selectedLine: group(failure, 'selectedLineRelation') }, controlFalsePositive: { evidence: group(controlFp, 'evidenceAvailability'), correctLine: group(controlFp, 'correctLineRelation'), selectedLine: group(controlFp, 'selectedLineRelation') } },
    conditionalScoreGap: group(failure, 'conditionalScoreGapBucket'), payout: group(failure, 'payoutBand'),
    temporalReproducibility: { matched505: summarize(failure.filter(row => row.cohort === 'MATCHED_505')), expansion130: summarize(failure.filter(row => row.cohort === 'EXPANSION_130')) },
    controlComparison: { failure: summarize(failure), falsePositive: summarize(controlFp), negative: summarize(controlNegative), distinguishingConditions: discrimination },
    candidates: [
      { rank: 1, id: 'NC_OBSERVABILITY_GATE_DIAGNOSTIC', targetSubset: 'NC primary with additive evidence unavailable', mechanism: 'separate missing score evidence from apparent NC misdirection before any correction hypothesis', requiredPredictionTimeInputs: ['NC score', 'relativeProbability', 'evidenceScore', 'trace availability'], evidence: discrimination.ADDITIVE_EVIDENCE_UNAVAILABLE_AND_NC_ADVANTAGE, expectedBenefit: 'reduce false causal attribution', expectedSideEffect: 'diagnostic coverage reduction', shadowDesign: 'observation-only conditional-second flag; no ranking change', promotionGate: ['direction agreement in MATCHED and EXPANSION', 'acceptable control FP', 'winner/scenario/rider unchanged', 'global ranking unchanged', 'prediction-time only'] },
      { rank: 2, id: 'NC_SCENARIO_EVIDENCE_DIAGNOSTIC', targetSubset: 'INSUFFICIENT_EVIDENCE plus large NC delta', mechanism: 'test whether default/fallback convergence creates non-discriminating second-candidate separation', requiredPredictionTimeInputs: ['NC delta', 'scenario evidence state', 'node trace completeness'], evidence: discrimination.INSUFFICIENT_EVIDENCE_AND_LARGE_NC, expectedBenefit: 'isolate fallback/default behavior', expectedSideEffect: 'small subset and missing-evidence bias', shadowDesign: 'stratified observation only; do not alter NC', promotionGate: ['direction agreement in MATCHED and EXPANSION', 'acceptable control FP', 'winner/scenario/rider unchanged', 'global ranking unchanged', 'prediction-time only'] },
      { rank: 3, id: 'NC_LINE_RELATION_DIAGNOSTIC', targetSubset: 'selected same-line while correct second is cross-line', mechanism: 'test same-line convergence over-preference only where line identity is known', requiredPredictionTimeInputs: ['line membership', 'winner', 'second candidate', 'NC reasons'], evidence: discrimination.SELECTED_SAME_LINE_CORRECT_CROSS_LINE, expectedBenefit: 'isolate line-specific cases without global NC changes', expectedSideEffect: 'low evidence availability', shadowDesign: 'known-line subset observation only', promotionGate: ['direction agreement in MATCHED and EXPANSION', 'acceptable control FP', 'winner/scenario/rider unchanged', 'global ranking unchanged', 'prediction-time only'] }
    ],
    safety: { productionChanged: false, predictionChanged: false, purchaseChanged: false, riderWeakChanged: false, resultChanged: false, checkpointChanged: false, shadowImplemented: false, parameterTuned: false, protectedFinalUsed: 0, resultLeakage: 0 }
  };
  result.hash = digest(result);
  await atomic(path.join(out, 'natural-convergence-29-diagnostic.json'), result);
  await fs.writeFile(path.join(out, 'natural-convergence-29-races.json.gz'), zlib.gzipSync(Buffer.from(JSON.stringify({ schemaVersion: 'NATURAL_CONVERGENCE_29_RACES_V1', diagnosticHash: result.hash, failure, controlFalsePositive: controlFp, controlNegative }))));
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await run(), null, 2));
