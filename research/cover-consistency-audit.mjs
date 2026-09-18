import fs from 'node:fs';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const normalizedTickets = tickets => (tickets || []).map(ticket => ({ order: ticket.order, category: ticket.category || ticket.class, thick: ticket.thick === true }))
  .sort((a, b) => a.order.localeCompare(b.order, 'en') || a.category.localeCompare(b.category, 'en'));

export function auditCoverConsistency(recommendation, distance, diagnosis) {
  const recommendationKeys = recommendation.cohort.raceKeys, distanceKeys = distance.cohort.raceKeys;
  const recommendationByRace = new Map(recommendation.ticketDiagnostics.map(row => [row.raceKey, row]));
  const distanceByRace = new Map(distance.rows.map(row => [row.raceKey, row]));
  const keyDifferences = [...new Set([...recommendationKeys, ...distanceKeys])].filter(key => !recommendationKeys.includes(key) || !distanceKeys.includes(key));
  const snapshotMismatches = [], planMismatches = [];
  for (const raceKey of recommendationKeys) {
    const recommendationHash = recommendation.snapshotHashes?.[raceKey]?.predictionHash;
    const distanceHash = distanceByRace.get(raceKey)?.hashes?.predictionHash;
    if (recommendationHash !== distanceHash) snapshotMismatches.push({ raceKey, recommendationHash, distanceHash });
    const recommendationPlan = normalizedTickets(recommendationByRace.get(raceKey)?.tickets);
    const distancePlan = normalizedTickets(distanceByRace.get(raceKey)?.purchase?.tickets);
    if (hash(recommendationPlan) !== hash(distancePlan)) planMismatches.push({ raceKey, recommendationPlanHash: hash(recommendationPlan), distancePlanHash: hash(distancePlan) });
  }
  const eligibleRows = distance.rows.filter(row => row.purchase.eligibility === 'PURCHASE_ALLOWED');
  const actualTickets = eligibleRows.flatMap(row => row.purchase.tickets.map(ticket => ({ ...ticket, raceKey: row.raceKey,
    actualOrder: row.result.finishOrder.join('-'), payout: row.result.payout, predictionHash: row.hashes.predictionHash,
    purchasePayloadHash: row.hashes.purchaseHash })));
  const hits = actualTickets.filter(ticket => ticket.order === ticket.actualOrder);
  const detail = ticket => {
    const row = distanceByRace.get(ticket.raceKey), diagnosed = diagnosis.races.find(race => race.raceKey === ticket.raceKey);
    return { raceKey: ticket.raceKey, actualResult: ticket.actualOrder, exactWinningTicket: ticket.order,
      predictionTerminal: diagnosed.terminal, purchaseCandidateStatus: diagnosed.terminal.purchaseCandidate,
      finalPurchaseClassification: ticket.class, main: ticket.class === 'MAIN', cover: ticket.class === 'COVER', thick: ticket.thick,
      actualPurchased: true, sourceFile: 'research/prediction-distance-100r-source.json',
      sourceField: 'rows[].purchase.tickets[].class', predictionSealHash: ticket.predictionHash,
      purchasePayloadHash: ticket.purchasePayloadHash, payout: ticket.payout };
  };
  const byClass = category => actualTickets.filter(ticket => ticket.class === category);
  const hitsByClass = category => hits.filter(ticket => ticket.class === category);
  return { schemaVersion: 'COVER_CONSISTENCY_AUDIT_V1', classification: 'A_21249DC_EVALUATION_CLASSIFICATION_BUG',
    rootCause: 'recommendation-thick-100r-fetch retained only MAIN tickets and recommendation-thick-evaluation hard-coded every retained ticket as MAIN; final sealed COVER tickets were omitted.',
    cohort: { same: keyDifferences.length === 0 && recommendationKeys.every((key, index) => distanceKeys[index] === key), raceCount: recommendationKeys.length,
      temporalOrderSame: recommendationKeys.every((key, index) => distanceKeys[index] === key), keyDifferences, recommendationExcluded: recommendation.exclusions.length,
      distanceExcluded: distance.exclusions.length, protectedFinal: recommendation.cohort.protectedFinalIncluded || 0,
      duplicates: recommendationKeys.length - new Set(recommendationKeys).size, resultAvailable: distance.rows.filter(row => row.result.status === 'confirmed').length },
    snapshot: { same: snapshotMismatches.length === 0 && planMismatches.length === 0, predictionSealMismatches: snapshotMismatches,
      purchasePlanMismatches: planMismatches, source: 'keirin-saved-prediction-detail predictionPayload.prediction.canonicalPurchasePlan.standardTickets',
      classificationSource: 'saved ticket betClass/category; no inferred candidate classification' },
    corrected: { purchaseable: eligibleRows.length, ineligible: distance.rows.length - eligibleRows.length,
      main: { tickets: byClass('MAIN').length, hits: hitsByClass('MAIN').length },
      cover: { tickets: byClass('COVER').length, hits: hitsByClass('COVER').length },
      thick: { tickets: actualTickets.filter(ticket => ticket.thick).length, hits: hits.filter(ticket => ticket.thick).length },
      total: { tickets: actualTickets.length, hits: hits.length } },
    coverHits: hitsByClass('COVER').map(detail), mainHits: hitsByClass('MAIN').map(detail),
    integrity: { predictionMismatch: distance.hashes.predictionMismatch, purchaseMismatch: distance.hashes.purchaseMismatch,
      sealedResultMismatch: distance.hashes.sealedResultMismatch, historicalMutation: 0, productionChanged: false } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const read = path => JSON.parse(fs.readFileSync(path));
  const report = auditCoverConsistency(read(process.argv[2] || new URL('./recommendation-thick-100r-source.json', import.meta.url)),
    read(process.argv[3] || new URL('./prediction-distance-100r-source.json', import.meta.url)),
    read(process.argv[4] || new URL('./prediction-distance-100r-evaluation.json', import.meta.url)));
  const target = process.argv[5] || new URL('./cover-consistency-audit.json', import.meta.url);
  fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}
