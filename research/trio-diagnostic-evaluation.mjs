import fs from 'node:fs';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const CANDIDATE_CODES = new Set(['ADOPTED', 'THIRD_VARIANT_AMBIGUITY', 'THIRD_VARIANT_BOUNDARY']);
const nums = value => (Array.isArray(value) ? value : String(value || '').match(/\d+/g) || []).map(Number);
export const trioKey = value => nums(value).slice(0, 3).sort((a, b) => a - b).join('-');
const orderKey = value => nums(value).slice(0, 3).join('-');
const meaningful = terminal => terminal.representativeTerminal === true || CANDIDATE_CODES.has(terminal.purchaseRejectCode);
const ratio = (n, d) => d ? n / d : null;
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const at = (sorted.length - 1) * p, lo = Math.floor(at), hi = Math.ceil(at);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
};

export function aggregateTrios(terminals) {
  const map = new Map();
  for (const terminal of terminals || []) {
    const key = trioKey(terminal.order);
    if (!key || key.split('-').length !== 3) continue;
    const item = map.get(key) || { key, strongestTerminalScore: 0, terminalOrders: new Set(), meaningfulOrders: new Set(), meaningfulScenarioSupports: new Set(), meaningful: false };
    item.strongestTerminalScore = Math.max(item.strongestTerminalScore, Number(terminal.probability) || 0);
    item.terminalOrders.add(orderKey(terminal.order));
    if (meaningful(terminal)) {
      item.meaningful = true;
      item.meaningfulOrders.add(orderKey(terminal.order));
      // A branch is counted at most once. Missing branch identifiers are not invented.
      if (terminal.dominantBranchId) item.meaningfulScenarioSupports.add(terminal.dominantBranchId);
    }
    map.set(key, item);
  }
  return [...map.values()].map(item => ({ key: item.key, strongestTerminalScore: item.strongestTerminalScore,
    terminalOrderCount: item.terminalOrders.size, meaningfulOrderCount: item.meaningfulOrders.size,
    meaningfulScenarioSupportCount: item.meaningfulScenarioSupports.size, meaningful: item.meaningful }))
    .sort((a, b) => b.strongestTerminalScore - a.strongestTerminalScore || a.key.localeCompare(b.key, 'en'))
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

const purchaseTrios = (tickets, category = null, thickOnly = false) => new Set((tickets || [])
  .filter(ticket => (!category || ticket.class === category) && (!thickOnly || ticket.thick === true)).map(ticket => trioKey(ticket.order)));

function diagnoseRace(row, lowTicket) {
  const actualOrder = orderKey(row.result.finishOrder), actualTrio = trioKey(row.result.finishOrder);
  const trios = aggregateTrios(row.prediction.terminals);
  const actual = trios.find(trio => trio.key === actualTrio);
  const meaningfulTrios = trios.filter(trio => trio.meaningful);
  const tickets = row.purchase.tickets || [];
  const all = purchaseTrios(tickets), main = purchaseTrios(tickets, 'MAIN'), cover = purchaseTrios(tickets, 'COVER'), thick = purchaseTrios(tickets, null, true);
  const exactPurchased = tickets.some(ticket => orderKey(ticket.order) === actualOrder);
  const purchasedTrio = all.has(actualTrio), meaningfulTrio = actual?.meaningful === true;
  const actualSet = new Set(nums(row.result.finishOrder));
  const maxMeaningfulOverlap = meaningfulTrios.reduce((max, trio) => Math.max(max, nums(trio.key).filter(n => actualSet.has(n)).length), 0);
  let category = 'F_UNCLASSIFIABLE';
  if (actualTrio && actualOrder.split('-').length === 3) {
    if (exactPurchased) category = 'A_TRIFECTA_HIT';
    else if (purchasedTrio) category = 'B_TRIO_WOULD_HIT';
    else if (meaningfulTrio) category = 'C_INTERNAL_TRIO_ONLY';
    else if (maxMeaningfulOverlap >= 2) category = 'D_TWO_OF_THREE_ONLY';
    else category = 'E_TRIO_UPSTREAM_MISS';
  }
  const reverse = nums(row.result.finishOrder); [reverse[0], reverse[1]] = [reverse[1], reverse[0]];
  const exactReversePurchased = tickets.some(ticket => orderKey(ticket.order) === reverse.join('-'));
  return { raceKey: row.raceKey, actualOrder, actualTrio, lowTicket, trifectaHit: exactPurchased,
    trio: { generated: Boolean(actual), meaningful: meaningfulTrio, rank: actual?.rank ?? null,
      highRank: actual != null && actual.rank <= 10, candidateCount: meaningfulTrios.length,
      strongestTerminalScore: actual?.strongestTerminalScore ?? null, meaningfulScenarioSupportCount: actual?.meaningfulScenarioSupportCount ?? 0 },
    purchase: { eligibility: row.purchase.eligibility, uniqueTrios: all.size, hit: purchasedTrio,
      mainUniqueTrios: main.size, mainHit: main.has(actualTrio), coverUniqueTrios: cover.size, coverHit: cover.has(actualTrio),
      thickUniqueTrios: thick.size, thickHit: thick.has(actualTrio) },
    ordering: { sameThreeWrongOrder: !exactPurchased && purchasedTrio, reverse12SameThird: !exactPurchased && exactReversePurchased,
      otherPermutation: !exactPurchased && purchasedTrio && !exactReversePurchased,
      meaningfulButOutsidePurchase: meaningfulTrio && !purchasedTrio },
    maxMeaningfulOverlap, category };
}

function summarize(rows) {
  const count = fn => rows.filter(fn).length;
  const candidateCounts = rows.map(row => row.trio.candidateCount);
  return { races: rows.length, trifectaHits: count(row => row.trifectaHit), exactTrioGenerated: count(row => row.trio.generated),
    exactTrioGeneratedRate: ratio(count(row => row.trio.generated), rows.length), meaningfulExactTrio: count(row => row.trio.meaningful),
    meaningfulExactTrioRate: ratio(count(row => row.trio.meaningful), rows.length), top1: count(row => row.trio.rank === 1),
    top3: count(row => row.trio.rank != null && row.trio.rank <= 3), top5: count(row => row.trio.rank != null && row.trio.rank <= 5),
    top10: count(row => row.trio.rank != null && row.trio.rank <= 10), outsideTop10: count(row => row.trio.rank != null && row.trio.rank > 10),
    missing: count(row => !row.trio.generated), purchaseDerivedTrioHitRaces: count(row => row.purchase.hit),
    trifectaMissTrioHit: count(row => !row.trifectaHit && row.purchase.hit), internalTrioOnly: count(row => row.category === 'C_INTERNAL_TRIO_ONLY'),
    twoOfThreeOnly: count(row => row.category === 'D_TWO_OF_THREE_ONLY'), upstreamTrioMiss: count(row => row.category === 'E_TRIO_UPSTREAM_MISS'),
    categories: Object.fromEntries(['A_TRIFECTA_HIT','B_TRIO_WOULD_HIT','C_INTERNAL_TRIO_ONLY','D_TWO_OF_THREE_ONLY','E_TRIO_UPSTREAM_MISS','F_UNCLASSIFIABLE'].map(name => [name, count(row => row.category === name)])),
    ordering: { sameThreeWrongOrder: count(row => row.ordering.sameThreeWrongOrder), reverse12SameThird: count(row => row.ordering.reverse12SameThird),
      otherPermutation: count(row => row.ordering.otherPermutation), meaningfulButOutsidePurchase: count(row => row.ordering.meaningfulButOutsidePurchase) },
    trioCandidates: { average: candidateCounts.length ? candidateCounts.reduce((a, b) => a + b, 0) / candidateCounts.length : null,
      median: percentile(candidateCounts, .5), p90: percentile(candidateCounts, .9) } };
}

function ticketClassSummary(rows, field, hitField) {
  return { uniqueTrioTickets: rows.reduce((sum, row) => sum + row.purchase[field], 0), trioHitRaces: rows.filter(row => row.purchase[hitField]).length };
}

export function evaluateTrioDiagnostic(source, cohort, { lowTicketRaceKeys = [] } = {}) {
  const lowSet = new Set(lowTicketRaceKeys), sourceKeys = source.rows.map(row => row.raceKey), cohortKeys = cohort.raceKeys;
  const duplicate = sourceKeys.length - new Set(sourceKeys).size;
  const cohortExactMatch = JSON.stringify(sourceKeys) === JSON.stringify(cohortKeys);
  const rows = source.rows.map(row => diagnoseRace(row, lowSet.has(row.raceKey)));
  const hashMismatches = Object.values(source.hashes || {}).reduce((sum, n) => sum + n, 0);
  const resultAvailable = source.rows.filter(row => row.result.status === 'confirmed').length;
  const main = ticketClassSummary(rows, 'mainUniqueTrios', 'mainHit');
  const cover = ticketClassSummary(rows, 'coverUniqueTrios', 'coverHit');
  const combined = ticketClassSummary(rows, 'uniqueTrios', 'hit');
  const thick = ticketClassSummary(rows, 'thickUniqueTrios', 'thickHit');
  const p3Keys = new Set(source.rows.filter(row => {
    const actual = new Set(nums(row.result.finishOrder));
    const riders = new Set((row.prediction.terminals || []).filter(meaningful).flatMap(t => nums(t.order)));
    return [...actual].every(n => riders.has(n));
  }).map(row => row.raceKey));
  const summary = summarize(rows), lowTicket = summarize(rows.filter(row => row.lowTicket));
  const verdict = summary.meaningfulExactTrioRate >= .5 || summary.trifectaMissTrioHit >= 10 ? 'TRIO_SIGNAL_STRONG_ENOUGH_TO_STUDY'
    : summary.meaningfulExactTrioRate >= .3 || summary.trifectaMissTrioHit >= 5 ? 'TRIO_SIGNAL_PROMISING' : 'TRIO_SIGNAL_WEAK';
  return { schemaVersion: 'TRIO_DIAGNOSTIC_V1', verdict,
    definition: { actualTrio: 'confirmed top-three riders sorted ascending', trioScore: 'maximum saved pre-result terminal probability among permutations',
      meaningful: 'at least one representative terminal or existing natural purchase candidate code', technicalDuplicateHandling: 'permutation dedup; strongest score; branch support counted once',
      naturalBoundary: 'DATA_NOT_AVAILABLE; no new threshold introduced', resultAwareScoring: false },
    cohort: { expected: cohortKeys.length, rows: sourceKeys.length, exactMatch: cohortExactMatch, orderMatch: cohortExactMatch,
      keyHash: hash(sourceKeys), expectedKeyHash: hash(cohortKeys), duplicate, resultAvailable, protectedFinal: cohort.protectedFinalIncluded || 0 },
    integrity: { ...source.hashes, mismatchTotal: hashMismatches, sealedResultMismatch: source.hashes?.sealedResultMismatch || 0,
      historicalMutation: 0, resultAwareScoreCreation: 0, payoutInference: 0 },
    summary, p3Relation: { p3Races: p3Keys.size, p3AndMeaningfulExactTrio: rows.filter(row => p3Keys.has(row.raceKey) && row.trio.meaningful).length },
    candidateSets: { allMeaningful: { hitRaces: summary.meaningfulExactTrio, tickets: rows.reduce((n, row) => n + row.trio.candidateCount, 0) },
      naturalBoundary: 'DATA_NOT_AVAILABLE', purchaseDerived: combined, lowTicketPurchaseDerived: ticketClassSummary(rows.filter(row => row.lowTicket), 'uniqueTrios', 'hit') },
    lowTicket, actualPurchase: { main, cover, combined }, thick: { ...thick,
      trifectaWrongOrderButTrioCorrect: rows.filter(row => row.purchase.thickHit && !row.trifectaHit).length,
      twoOfThreeOnly: source.rows.reduce((total, row) => { const actual = new Set(nums(row.result.finishOrder)); return total + [...purchaseTrios(row.purchase.tickets, null, true)].filter(key => nums(key).filter(n => actual.has(n)).length === 2).length; }, 0),
      worse: source.rows.reduce((total, row) => { const actual = new Set(nums(row.result.finishOrder)); return total + [...purchaseTrios(row.purchase.tickets, null, true)].filter(key => nums(key).filter(n => actual.has(n)).length < 2).length; }, 0) },
    payout: { status: 'DATA_NOT_AVAILABLE', reason: 'sealed source contains trifecta payout only; official trio payout is absent', investment: null, return: null, roi: null },
    suitabilityObservations: { p3ButOrderingWeak: rows.filter(row => p3Keys.has(row.raceKey) && !row.trifectaHit).length,
      exactTrioMeaningfulButPurchaseOutside: rows.filter(row => row.ordering.meaningfulButOutsidePurchase).length,
      multipleMeaningfulPermutations: rows.filter(row => row.trio.meaningful && (aggregateTrios(source.rows.find(x => x.raceKey === row.raceKey).prediction.terminals).find(t => t.key === row.actualTrio)?.meaningfulOrderCount || 0) > 1).length },
    rows, safety: { productionPredictionChanged: false, productionPurchaseChanged: false, tuningPerformed: false, historicalMutationCount: 0 } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const source = JSON.parse(fs.readFileSync(process.argv[2] || new URL('./prediction-distance-100r-source.json', import.meta.url)));
  const cohort = JSON.parse(fs.readFileSync(process.argv[3] || new URL('./recommendation-thick-100r-cohort.json', import.meta.url)));
  const recommendation = JSON.parse(fs.readFileSync(process.argv[4] || new URL('./recommendation-thick-100r-source.json', import.meta.url)));
  const lowTicketRaceKeys = recommendation.ticketDiagnostics.filter(row => row.inConfirmedCohort && row.canPurchase === true && row.mainTickets.length <= 3).map(row => row.raceKey);
  const report = evaluateTrioDiagnostic(source, cohort, { lowTicketRaceKeys });
  const jsonTarget = process.argv[5] || new URL('./trio-diagnostic-100r-evaluation.json', import.meta.url);
  const csvTarget = process.argv[6] || new URL('./trio-diagnostic-100r-races.csv', import.meta.url);
  fs.writeFileSync(jsonTarget, `${JSON.stringify(report, null, 2)}\n`);
  const columns = ['raceKey','actualOrder','actualTrio','lowTicket','trifectaHit','trioGenerated','trioMeaningful','trioRank','candidateCount','purchaseTrioHit','mainTrioHit','coverTrioHit','thickTrioHit','sameThreeWrongOrder','category'];
  const records = report.rows.map(r => [r.raceKey,r.actualOrder,r.actualTrio,r.lowTicket,r.trifectaHit,r.trio.generated,r.trio.meaningful,r.trio.rank,r.trio.candidateCount,r.purchase.hit,r.purchase.mainHit,r.purchase.coverHit,r.purchase.thickHit,r.ordering.sameThreeWrongOrder,r.category]);
  fs.writeFileSync(csvTarget, `${[columns, ...records].map(row => row.map(v => `"${String(v ?? '').replaceAll('"','""')}"`).join(',')).join('\n')}\n`);
  console.log(JSON.stringify({ verdict: report.verdict, cohort: report.cohort, integrity: report.integrity, summary: report.summary, lowTicket: report.lowTicket, purchase: report.actualPurchase, thick: report.thick, payout: report.payout }, null, 2));
}
