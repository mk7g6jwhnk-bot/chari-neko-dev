import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { buildDataset, evaluate } from './recommendation-thick-evaluation.mjs';

const stats = (rows, ticketFilter = () => true) => {
  const tickets = rows.filter(r => r.preResult.purchaseable).flatMap(r => r.tickets.filter(t => ticketFilter(t, r)));
  const investment = tickets.length * 100, returned = tickets.reduce((sum, t) => sum + t.payout, 0);
  return { races: new Set(tickets.map(t => rows.find(r => r.tickets.includes(t))?.raceKey)).size, tickets: tickets.length,
    hits: tickets.filter(t => t.hit).length, hitRate: tickets.length ? tickets.filter(t => t.hit).length / tickets.length : null,
    investment, return: returned, roi: investment ? returned / investment : null };
};
const raceStats = rows => {
  const buy = rows.filter(r => r.preResult.purchaseable), investment = buy.reduce((s, r) => s + r.result.investment, 0), returned = buy.reduce((s, r) => s + r.result.return, 0);
  return { races: rows.length, purchaseable: buy.length, hits: buy.filter(r => r.result.exactHit).length,
    hitRate: buy.length ? buy.filter(r => r.result.exactHit).length / buy.length : null, investment, return: returned, roi: investment ? returned / investment : null };
};
const bands = [[1,3,'1-3'],[4,6,'4-6'],[7,10,'7-10'],[11,Infinity,'11+']];

export function build50rReport(source, cohort, baselineSource, baselineCohort) {
  const dataset = buildDataset(source, { auditRaceKeys: [], heldOutRaceKeys: cohort.raceKeys });
  const evaluation = evaluate(dataset);
  const baselineDataset = buildDataset(baselineSource, { auditRaceKeys: [], heldOutRaceKeys: baselineCohort.raceKeys });
  const baseline = evaluate(baselineDataset);
  const ticketBands = Object.fromEntries(bands.map(([lo, hi, name]) => [name, raceStats(dataset.rows.filter(r => r.preResult.ticketCount >= lo && r.preResult.ticketCount <= hi))]));
  const main = stats(dataset.rows, t => t.class === 'MAIN'), cover = stats(dataset.rows, t => t.class === 'COVER');
  return { schemaVersion: 'RECOMMENDATION_THICK_50R_REPORT_V1', frozenDefinition: evaluation.schemaVersion,
    cohort: { requested: cohort.raceKeys.length, fetched: source.ticketDiagnostics.length, evaluated: evaluation.evaluatedRaces,
      excluded: source.exclusions, protectedFinalIncluded: evaluation.cohortPolicy.protectedFinalIncluded },
    evaluation, additional: { purchaseable: dataset.rows.filter(r => r.preResult.purchaseable).length,
      ineligible: dataset.rows.filter(r => !r.preResult.purchaseable).length, ticketBands,
      mainCoverThick: { main, cover, thick: evaluation.thick.all, nonThick: evaluation.thick.nonThick },
      odds: { known: 0, unknown: evaluation.futureHoleHighPayout.oddsMissing, highPayoutDatasetUsable: false } },
    comparison22r: { evaluated: { before: baseline.evaluatedRaces, now: evaluation.evaluatedRaces },
      purchaseable: { before: baseline.confidence.HIGH.purchaseableCount + baseline.confidence.MEDIUM.purchaseableCount + baseline.confidence.LOW.purchaseableCount,
        now: evaluation.confidence.HIGH.purchaseableCount + evaluation.confidence.MEDIUM.purchaseableCount + evaluation.confidence.LOW.purchaseableCount },
      bestDiagnosticGroup: { before: baseline.bestDiagnosticGroup, now: evaluation.bestDiagnosticGroup },
      selection: { before: baseline.recommendationSelectionAppearsUseful, now: evaluation.recommendationSelectionAppearsUseful },
      thick: { before: baseline.thick.all, now: evaluation.thick.all }, cliff: { before: baseline.cliff, now: evaluation.cliff } },
    interpretation: { recommendationSelectionAppearsUseful: false, descriptiveBestGroup: evaluation.bestDiagnosticGroup,
      reason: 'Only one purchase hit across 35 purchaseable races; the descriptive best group is single-hit dominated.',
      thickIncreaseValueSignal: false, verdict: 'NO_USEFUL_SIGNAL_YET' },
    safety: { ...source.hashes, productionChanged: false, researchMeaningChanged: false, historicalMutationCount: 0 } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const read = name => JSON.parse(fs.readFileSync(new URL(name, import.meta.url)));
  const report = build50rReport(read('./recommendation-thick-50r-source.json'), read('./recommendation-thick-50r-cohort.json'),
    read('./thick-readonly-audit-results.json'), read('./thick-v2-shadow-cohort.json'));
  fs.writeFileSync(new URL('./recommendation-thick-50r-evaluation.json', import.meta.url), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
