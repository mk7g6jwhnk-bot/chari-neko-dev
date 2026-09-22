import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_BASE = 'https://chari-neko-dev.netlify.app/.netlify/functions';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sealedResultHash = value => value?.resultHash || hash(value?.officialResult ?? null);
const order = value => (Array.isArray(value) ? value : String(value || '').match(/\d+/g) || []).map(Number).join('-');
const cls = ticket => ticket?.betClass || ticket?.category || null;

async function getJson(base, name, raceKey, fetchImpl) {
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetchImpl(`${base}/${name}?raceKey=${encodeURIComponent(raceKey)}`, {
        headers: { accept: 'application/json' }, signal: AbortSignal.timeout(60000)
      });
      if (!response.ok) throw Error(`HTTP_${response.status}`);
      return await response.json();
    } catch (error) {
      last = error;
      if (attempt < 2) await sleep(250 * (attempt + 1));
    }
  }
  throw last;
}

function compact(predictionResponse, resultResponse) {
  const prediction = predictionResponse.predictionPayload?.prediction || {};
  const race = predictionResponse.predictionPayload?.race || predictionResponse.predictionPayload?.targetRace || {};
  const lifecycle = prediction.purchase?.audit?.terminalLifecycleAudit || prediction.audit?.purchaseAudit?.terminalLifecycleAudit;
  const lifecycleRows = Array.isArray(lifecycle) ? lifecycle : lifecycle?.rows || [];
  const lifecycleByOrder = new Map(lifecycleRows.map(row => [order(row.order), row]));
  const terminals = (prediction.terminals || []).map((terminal, index) => {
    const key = order(terminal.order || terminal.terminal);
    const life = lifecycleByOrder.get(key) || {};
    return {
      order: key,
      probability: Number(terminal.probability) || 0,
      terminalGlobalRank: terminal.terminalGlobalRank ?? index + 1,
      terminalFamilyRank: terminal.terminalFamilyRank ?? null,
      terminalPairRank: terminal.terminalPairRank ?? null,
      scenarioFamilyRank: terminal.scenarioFamilyRank ?? null,
      branchRank: terminal.branchRank ?? null,
      representativeTerminal: terminal.representativeTerminal === true,
      firstFamilyNaturalEligible: terminal.firstFamilyNaturalEligible === true,
      secondFamilyNaturalEligible: terminal.secondFamilyNaturalEligible === true,
      thirdFamilyNaturalEligible: terminal.thirdFamilyNaturalEligible === true,
      purchaseStatus: terminal.purchaseStatus ?? life.purchaseStatus ?? null,
      purchaseRejectCode: terminal.purchaseRejectCode ?? life.purchaseRejectCode ?? null,
      purchaseReason: terminal.purchaseReason ?? life.purchaseReason ?? null,
      betClass: terminal.betClass ?? life.betClass ?? null,
      thick: terminal.thickQualified === true || terminal.qualification === 'THICK_PREDICTION_QUALIFIED',
      dominantBranchId: terminal.dominantBranchId ?? life.dominantBranchId ?? null,
      terminalScore: Number.isFinite(Number(terminal.terminalScore)) ? Number(terminal.terminalScore) : null,
      relativeProbability: Number.isFinite(Number(terminal.relativeProbability)) ? Number(terminal.relativeProbability) : null,
      evidenceScore: Number.isFinite(Number(terminal.evidenceScore)) ? Number(terminal.evidenceScore) : null,
      scenarioFamilySupport: Number.isFinite(Number(terminal.scenarioFamilySupport)) ? Number(terminal.scenarioFamilySupport) : null,
      scenarioFamilyProbability: Number.isFinite(Number(terminal.scenarioFamilyProbability)) ? Number(terminal.scenarioFamilyProbability) : null,
      relativeConditionPenalty: Number.isFinite(Number(terminal.relativeConditionPenalty)) ? Number(terminal.relativeConditionPenalty) : null,
      branchContributions: terminal.branchContributions || [],
      decisionRatios: terminal.decisionRatios || null,
      conditionalScores: terminal.conditionalScores || null,
      relativeConditionTrace: terminal.relativeConditionTrace || null,
      pairNaturalConvergenceScore: Number.isFinite(Number(terminal.pairNaturalConvergenceScore)) ? Number(terminal.pairNaturalConvergenceScore) : null,
      pairScenarioCoherence: Number.isFinite(Number(terminal.pairScenarioCoherence)) ? Number(terminal.pairScenarioCoherence) : null,
      secondFamilyRelativeToBest: Number.isFinite(Number(terminal.secondFamilyRelativeToBest)) ? Number(terminal.secondFamilyRelativeToBest) : null,
      thirdFamilyRelativeToBest: Number.isFinite(Number(terminal.thirdFamilyRelativeToBest)) ? Number(terminal.thirdFamilyRelativeToBest) : null,
      naturalConvergenceScore: Number.isFinite(Number(terminal.naturalConvergenceScore)) ? Number(terminal.naturalConvergenceScore) : null,
      pairNaturalPositionEligible: terminal.pairNaturalPositionEligible === true,
      familyNaturalPositionEligible: terminal.familyNaturalPositionEligible === true,
      purchaseRank: Number.isFinite(Number(terminal.purchaseRank)) ? Number(terminal.purchaseRank) : null
    };
  });
  const plan = prediction.canonicalPurchasePlan?.standardTickets || prediction.standardPurchasePlan || prediction.purchasePlan || [];
  const referencePlan = prediction.referencePurchasePlan || [];
  const purchaseEligibility = prediction.purchaseEligibility || prediction.purchase?.purchaseEligibility || {};
  const purchaseAudit = prediction.purchase?.audit || prediction.audit?.purchaseAudit || {};
  return {
    raceKey: predictionResponse.raceKey,
    predictionSealedAt: predictionResponse.predictionSealedAt,
    resultObservedAt: resultResponse.resultObservedAt,
    hashes: { predictionHash: predictionResponse.predictionHash, inputHash: predictionResponse.inputHash, resultHash: sealedResultHash(resultResponse),
      purchaseHash: hash(resultResponse.purchaseEvaluation) },
    integrity: { predictionStatus: predictionResponse.integrityStatus, resultValid: resultResponse.integrityValid,
      temporalValid: Date.parse(predictionResponse.predictionSealedAt) < Date.parse(resultResponse.resultObservedAt) },
    result: { status: resultResponse.officialResult?.status, finishOrder: resultResponse.officialResult?.finishOrder || [], payout: resultResponse.officialResult?.payout ?? null },
    purchase: { eligibility: resultResponse.purchaseEvaluation?.purchaseEligibility || purchaseEligibility.state || null,
      reasonCode: purchaseEligibility.reasonCode || prediction.noBetReason || prediction.purchase?.noBetReason || resultResponse.purchaseEvaluation?.exclusionReason || null,
      canPurchase: purchaseEligibility.canPurchase === true,
      budget: Number.isFinite(Number(purchaseEligibility.budget ?? purchaseAudit.budget)) ? Number(purchaseEligibility.budget ?? purchaseAudit.budget) : null,
      naturalCandidateCount: Number.isFinite(Number(purchaseAudit.purchaseCandidateCountBeforeCompression ?? purchaseAudit.adoptedTerminalCount)) ? Number(purchaseAudit.purchaseCandidateCountBeforeCompression ?? purchaseAudit.adoptedTerminalCount) : null,
      requiredNaturalClusterBudget: Number.isFinite(Number(purchaseAudit.requiredNaturalClusterBudget)) ? Number(purchaseAudit.requiredNaturalClusterBudget) : null,
      tickets: plan.map(ticket => ({ order: order(ticket.order || ticket.combination), class: cls(ticket),
        thick: ticket.thickQualified === true || ticket.qualification === 'THICK_PREDICTION_QUALIFIED' })),
      referenceTickets: referencePlan.map(ticket => ({ order: order(ticket.order || ticket.combination), class: cls(ticket), thick: false })) },
    prediction: { participantNumbers: (prediction.scored || []).map(row => Number(row.number)).filter(Number.isFinite),
      structureInput: { raceType: String(race.raceCategory || prediction.raceCategory || 'standard').toUpperCase(), fieldSize: (prediction.scored || race.participants || []).length,
        lineDataAvailable: race.lineDataAvailable === true || prediction.lineDataAvailable === true || (prediction.lines || []).some(line => (line.members || []).length > 1),
        reason: race.lineDataReason || prediction.lineDataReason || null,
        lines: (prediction.lines || []).map(line => ({ type: line.type || null, members: (line.members || []).map(member => Number(member.number || member.id)).filter(Number.isFinite) })) },
      riderScores: (prediction.scored || []).map(row => ({ riderId: row.registration || row.riderId || row.id || null, number: Number(row.number), name: row.name || null,
        score: Number(row.roleScores?.first), scoreSource: 'prediction.scored[].roleScores.first', scoreTrace: row.scoreTrace || null })).filter(row => Number.isFinite(row.number) && Number.isFinite(row.score)), terminals }
  };
}

export async function fetchPredictionDistanceSource({ cohort, baseUrl = DEFAULT_BASE, fetchImpl = fetch, concurrency = 4 } = {}) {
  if (!Array.isArray(cohort?.raceKeys) || !cohort.raceKeys.length) throw Error('COHORT_REQUIRED');
  if (new Set(cohort.raceKeys).size !== cohort.raceKeys.length) throw Error('DUPLICATE_COHORT_KEY');
  const rows = new Array(cohort.raceKeys.length), exclusions = [], hashes = { predictionMismatch: 0, purchaseMismatch: 0, sealedResultMismatch: 0 };
  let cursor = 0;
  async function worker() {
    while (cursor < cohort.raceKeys.length) {
      const index = cursor++, raceKey = cohort.raceKeys[index];
      try {
        const [prediction, result, predictionAgain, resultAgain] = await Promise.all([
          getJson(baseUrl, 'keirin-saved-prediction-detail', raceKey, fetchImpl),
          getJson(baseUrl, 'keirin-sealed-result', raceKey, fetchImpl),
          getJson(baseUrl, 'keirin-saved-prediction-detail', raceKey, fetchImpl),
          getJson(baseUrl, 'keirin-sealed-result', raceKey, fetchImpl)
        ]);
        if (prediction.raceKey !== raceKey || result.raceKey !== raceKey || prediction.predictionHash !== result.predictionHash || prediction.predictionHash !== predictionAgain.predictionHash) {
          hashes.predictionMismatch++; exclusions.push({ raceKey, reason: 'PREDICTION_HASH_MISMATCH' }); continue;
        }
        if (hash(result.purchaseEvaluation) !== hash(resultAgain.purchaseEvaluation)) {
          hashes.purchaseMismatch++; exclusions.push({ raceKey, reason: 'PURCHASE_HASH_MISMATCH' }); continue;
        }
        if (sealedResultHash(result) !== sealedResultHash(resultAgain)) {
          hashes.sealedResultMismatch++; exclusions.push({ raceKey, reason: 'SEALED_RESULT_MISMATCH' }); continue;
        }
        rows[index] = compact(prediction, result);
      } catch (error) {
        exclusions.push({ raceKey, reason: String(error?.message || error) });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(8, concurrency)) }, worker));
  return { schemaVersion: 'PREDICTION_DISTANCE_SOURCE_V1', cohort, cohortKeyHash: hash(cohort.raceKeys), hashes, exclusions,
    rows: rows.filter(Boolean), safety: { readOnly: true, resultAwareFeatureConstruction: false, productionWrite: 0, historicalMutation: 0 } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cohortPath = path.resolve(process.argv[2] || 'research/recommendation-thick-100r-cohort.json');
  const outputPath = path.resolve(process.argv[3] || 'research/prediction-distance-100r-source.json');
  const cohort = JSON.parse(await fs.readFile(cohortPath));
  const source = await fetchPredictionDistanceSource({ cohort });
  await fs.writeFile(outputPath, `${JSON.stringify(source)}\n`);
  console.log(JSON.stringify({ outputPath, rows: source.rows.length, exclusions: source.exclusions, hashes: source.hashes, cohortKeyHash: source.cohortKeyHash }, null, 2));
}
