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

export function build100rReport(source, cohort, baseline50) {
  const dataset = buildDataset(source, { auditRaceKeys: [], heldOutRaceKeys: cohort.raceKeys });
  const evaluation = evaluate(dataset);
  const ticketBands = Object.fromEntries(bands.map(([lo, hi, name]) => [name, raceStats(dataset.rows.filter(r => r.preResult.ticketCount >= lo && r.preResult.ticketCount <= hi))]));
  const main = stats(dataset.rows, t => t.class === 'MAIN'), cover = stats(dataset.rows, t => t.class === 'COVER');
  const useful = evaluation.recommendationSelectionAppearsUseful === 'DESCRIPTIVE_YES' && main.hits >= 3;
  const thickSignal = evaluation.thick.all.hits >= 3 && evaluation.thick.all.roi > evaluation.thick.nonThick.roi;
  const verdict = useful ? 'USEFUL_SIGNAL_EMERGING' : thickSignal ? 'PROMISING_BUT_MORE_DATA' : baseline50.interpretation.verdict === 'NO_USEFUL_SIGNAL_YET' ? 'NO_USEFUL_SIGNAL_YET' : 'SIGNAL_DISAPPEARED';
  return { schemaVersion: 'RECOMMENDATION_THICK_100R_REPORT_V1', frozenDefinition: evaluation.schemaVersion,
    cohort: { requested: cohort.raceKeys.length, fetched: source.ticketDiagnostics.length, evaluated: evaluation.evaluatedRaces,
      excluded: source.exclusions, protectedFinalIncluded: evaluation.cohortPolicy.protectedFinalIncluded },
    evaluation, additional: { purchaseable: dataset.rows.filter(r => r.preResult.purchaseable).length,
      ineligible: dataset.rows.filter(r => !r.preResult.purchaseable).length, ticketBands,
      mainCoverThick: { main, cover, thick: evaluation.thick.all, nonThick: evaluation.thick.nonThick },
      odds: { known: 0, unknown: evaluation.futureHoleHighPayout.oddsMissing, highPayoutDatasetUsable: false } },
    comparison50r: { evaluated: { before: baseline50.cohort.evaluated, now: evaluation.evaluatedRaces },
      purchaseable: { before: baseline50.additional.purchaseable, now: dataset.rows.filter(r => r.preResult.purchaseable).length },
      bestDiagnosticGroup: { before: baseline50.interpretation.descriptiveBestGroup, now: evaluation.bestDiagnosticGroup },
      selection: { before: baseline50.interpretation.recommendationSelectionAppearsUseful, now: useful },
      thick: { before: baseline50.evaluation.thick.all, now: evaluation.thick.all },
      cliff: { before: baseline50.evaluation.cliff, now: evaluation.cliff } },
    interpretation: { recommendationSelectionAppearsUseful: useful, descriptiveBestGroup: evaluation.bestDiagnosticGroup,
      thickIncreaseValueSignal: thickSignal, verdict,
      tuningDecision: useful || thickSignal ? 'B_MORE_DATA_BEFORE_TUNING' : 'C_KEEP_FIXED_AND_COLLECT_MORE' },
    safety: { ...source.hashes, productionChanged: false, researchMeaningChanged: false, historicalMutationCount: 0 } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const read = name => JSON.parse(fs.readFileSync(new URL(name, import.meta.url)));
  const report = build100rReport(read('./recommendation-thick-100r-source.json'), read('./recommendation-thick-100r-cohort.json'), read('./recommendation-thick-50r-evaluation.json'));
  fs.writeFileSync(new URL('./recommendation-thick-100r-evaluation.json', import.meta.url), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
