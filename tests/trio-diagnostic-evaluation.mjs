import assert from 'node:assert/strict';
import fs from 'node:fs';
import { aggregateTrios, evaluateTrioDiagnostic, trioKey } from '../research/trio-diagnostic-evaluation.mjs';

assert.equal(trioKey('5-2-7'), '2-5-7');
assert.equal(trioKey('7-5-2'), '2-5-7');
const dedup = aggregateTrios([
  { order: '5-2-7', probability: .2, representativeTerminal: true, dominantBranchId: 'A' },
  { order: '2-7-5', probability: .3, representativeTerminal: true, dominantBranchId: 'A' },
  { order: '7-5-2', probability: .1, purchaseRejectCode: 'ADOPTED', dominantBranchId: 'B' }
]);
assert.equal(dedup.length, 1);
assert.equal(dedup[0].strongestTerminalScore, .3);
assert.equal(dedup[0].meaningfulScenarioSupportCount, 2);
assert.equal(dedup[0].meaningfulOrderCount, 3);

const source = JSON.parse(fs.readFileSync(new URL('../research/prediction-distance-100r-source.json', import.meta.url)));
const cohort = JSON.parse(fs.readFileSync(new URL('../research/recommendation-thick-100r-cohort.json', import.meta.url)));
const recommendation = JSON.parse(fs.readFileSync(new URL('../research/recommendation-thick-100r-source.json', import.meta.url)));
const lowTicketRaceKeys = recommendation.ticketDiagnostics.filter(row => row.inConfirmedCohort && row.canPurchase === true && row.mainTickets.length <= 3).map(row => row.raceKey);
const report = evaluateTrioDiagnostic(source, cohort, { lowTicketRaceKeys });
assert.equal(report.cohort.exactMatch, true);
assert.equal(report.cohort.rows, 100);
assert.equal(report.cohort.duplicate, 0);
assert.equal(report.cohort.resultAvailable, 100);
assert.equal(report.cohort.protectedFinal, 0);
assert.equal(report.integrity.mismatchTotal, 0);
assert.equal(report.integrity.sealedResultMismatch, 0);
assert.equal(report.integrity.historicalMutation, 0);
assert.equal(report.integrity.resultAwareScoreCreation, 0);
assert.equal(report.integrity.payoutInference, 0);
assert.equal(report.lowTicket.races, 56);
assert.deepEqual(report.actualPurchase.main, { uniqueTrioTickets: 178, trioHitRaces: 13 });
assert.deepEqual(report.actualPurchase.cover, { uniqueTrioTickets: 146, trioHitRaces: 6 });
assert.deepEqual(report.actualPurchase.combined, { uniqueTrioTickets: 275, trioHitRaces: 16 });
assert.equal(Object.values(report.summary.categories).reduce((sum, count) => sum + count, 0), 100);
assert.equal(report.summary.trifectaMissTrioHit, 9);
assert.equal(report.summary.meaningfulExactTrio, 51);
assert.equal(report.summary.top1, 13);
assert.equal(report.summary.top3, 31);
assert.equal(report.summary.top5, 44);
assert.equal(report.payout.status, 'DATA_NOT_AVAILABLE');
assert.equal(report.safety.productionPredictionChanged, false);
assert.equal(report.safety.productionPurchaseChanged, false);
assert.equal(report.safety.tuningPerformed, false);
assert.equal(report.summary.categories.A_TRIFECTA_HIT, 7);
assert.equal(report.summary.trifectaHits, 7);
console.log('trio-diagnostic-evaluation: PASS');
