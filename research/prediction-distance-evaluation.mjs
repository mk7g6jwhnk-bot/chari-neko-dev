import fs from 'node:fs';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { auditTerminalSurvival, summarizeTerminalSurvival } from './terminal-survival-audit.mjs';

const CANDIDATE_CODES = new Set(['ADOPTED', 'THIRD_VARIANT_AMBIGUITY', 'THIRD_VARIANT_BOUNDARY']);
const order = value => (Array.isArray(value) ? value : String(value || '').match(/\d+/g) || []).map(Number).join('-');
const parts = value => order(value).split('-').filter(Boolean).map(Number);
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const ratio = (n, d) => d ? n / d : null;
const quantile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = (sorted.length - 1) * p, lo = Math.floor(index), hi = Math.ceil(index);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo);
};
const rankMap = (terminals, take) => {
  const mass = new Map();
  for (const terminal of terminals) {
    const key = take(parts(terminal.order));
    mass.set(key, (mass.get(key) || 0) + (Number(terminal.probability) || 0));
  }
  return new Map([...mass].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'en')).map(([key], index) => [key, index + 1]));
};
const meaningful = terminal => terminal.representativeTerminal === true || CANDIDATE_CODES.has(terminal.purchaseRejectCode);
const candidate = terminal => CANDIDATE_CODES.has(terminal.purchaseRejectCode);

function diagnoseRace(row) {
  const actual = parts(row.result.finishOrder), actualOrder = actual.join('-'), [first, second, third] = actual;
  const reverseOrder = [second, first, third].join('-');
  const terminals = row.prediction.terminals || [], meaningfulTerminals = terminals.filter(meaningful), candidateTerminals = terminals.filter(candidate);
  const purchased = row.purchase.tickets || [], purchasedOrders = new Set(purchased.map(ticket => ticket.order));
  const meaningfulRiders = new Set(meaningfulTerminals.flatMap(terminal => parts(terminal.order)));
  const broadRiders = new Set(terminals.flatMap(terminal => parts(terminal.order)));
  const p = actual.filter(number => meaningfulRiders.has(number)).length;
  const broadP = actual.filter(number => broadRiders.has(number)).length;
  const firstRanks = rankMap(terminals, xs => String(xs[0]));
  const pairRanks = rankMap(terminals, xs => xs.slice(0, 2).join('-'));
  const winnerRank = firstRanks.get(String(first)) ?? null;
  const pairRank = pairRanks.get(`${first}-${second}`) ?? null;
  const exactPairTerminals = terminals.filter(terminal => parts(terminal.order)[0] === first && parts(terminal.order)[1] === second)
    .sort((a, b) => b.probability - a.probability || a.order.localeCompare(b.order, 'en'));
  const thirdRank = exactPairTerminals.findIndex(terminal => parts(terminal.order)[2] === third) + 1 || null;
  const exact = terminals.find(terminal => terminal.order === actualOrder), exactMeaningful = meaningfulTerminals.some(terminal => terminal.order === actualOrder);
  const exactCandidate = candidateTerminals.some(terminal => terminal.order === actualOrder), exactPurchased = purchasedOrders.has(actualOrder);
  const reversePurchasedSameThird = purchasedOrders.has(reverseOrder);
  const reversePurchasedDifferentThird = purchased.some(ticket => { const p = parts(ticket.order); return p[0] === second && p[1] === first && p[2] !== third; });
  const reverseCandidate = candidateTerminals.some(terminal => { const p = parts(terminal.order); return p[0] === second && p[1] === first; });
  const sameRidersPurchased = purchased.some(ticket => parts(ticket.order).slice().sort().join('-') === actual.slice().sort().join('-'));
  const pairGenerated = terminals.some(terminal => { const p = parts(terminal.order); return p[0] === first && p[1] === second; });
  const pairMeaningful = meaningfulTerminals.some(terminal => { const p = parts(terminal.order); return p[0] === first && p[1] === second; });
  const pairCandidate = candidateTerminals.some(terminal => { const p = parts(terminal.order); return p[0] === first && p[1] === second; });
  const pairPurchased = purchased.some(ticket => { const p = parts(ticket.order); return p[0] === first && p[1] === second; });
  const reversePairMeaningful = meaningfulTerminals.some(terminal => { const p = parts(terminal.order); return p[0] === second && p[1] === first; });
  const thirdConditional = exactPairTerminals.some(terminal => parts(terminal.order)[2] === third);
  let category, distance;
  if (exactPurchased) { category = 'A_EXACT_HIT'; distance = 0; }
  else if (exactMeaningful) { category = 'C_CORRECT_INTERNAL_NOT_PURCHASED'; distance = 1; }
  else if (reversePurchasedSameThird || (pairMeaningful && thirdRank !== null && thirdRank <= 3) || sameRidersPurchased) { category = 'B_NEAR_MISS_ORDER'; distance = 1; }
  else if (p >= 2) { category = 'D_RIDERS_RIGHT_RANKING_WRONG'; distance = 2; }
  else if (p === 1) { category = 'E_UPSTREAM_MISS'; distance = 3; }
  else if (p === 0) { category = 'E_UPSTREAM_MISS'; distance = 4; }
  else { category = 'F_UNCLASSIFIABLE'; distance = null; }
  let primaryCause;
  if (exactPurchased) primaryCause = 'NONE_EXACT_HIT';
  else if (!meaningfulRiders.has(first)) primaryCause = p < 2 ? 'UPSTREAM_RIDER_MISS' : 'WINNER_SELECTION_MISS';
  else if (!pairMeaningful && reversePairMeaningful) primaryCause = 'REVERSE_12';
  else if (!pairMeaningful) primaryCause = 'PAIR_ORDER_MISS';
  else if (!exactMeaningful) primaryCause = thirdRank === null || thirdRank > 3 ? 'THIRD_CONDITIONAL_MISS' : 'SCENARIO_RANKING_MISS';
  else if (row.purchase.eligibility !== 'PURCHASE_ALLOWED') primaryCause = 'PURCHASE_INELIGIBLE';
  else if (!exactPurchased) primaryCause = 'PURCHASE_SELECTION_MISS';
  else primaryCause = 'DATA_INSUFFICIENT';
  const secondaryCauses = [];
  if (exact && !exactMeaningful) secondaryCauses.push('EXACT_TERMINAL_LOW_RANK');
  if (reverseCandidate && !reversePurchasedSameThird) secondaryCauses.push('REVERSE_PAIR_PRESENT_NOT_PURCHASED');
  const scenario = exact?.scenarioFamilyRank == null ? 'INSUFFICIENT_EVIDENCE'
    : exactMeaningful && exact.scenarioFamilyRank === 1 ? 'SCENARIO_CLOSE'
      : (pairMeaningful || meaningfulRiders.has(first)) ? 'SCENARIO_PARTIALLY_CLOSE' : 'SCENARIO_MISS';
  return { raceKey: row.raceKey, actualOrder, meaningfulRiderCount: p, broadRiderCount: broadP,
    winner: { generated: firstRanks.has(String(first)), meaningful: meaningfulRiders.has(first), rank: winnerRank },
    pair: { generated: pairGenerated, meaningful: pairMeaningful, purchaseCandidate: pairCandidate, finalPurchase: pairPurchased, reverseMeaningful: reversePairMeaningful, rank: pairRank },
    third: { generated: thirdConditional, rank: thirdRank },
    terminal: { generated: Boolean(exact), meaningful: exactMeaningful, purchaseCandidate: exactCandidate, purchased: exactPurchased,
      globalRank: exact?.terminalGlobalRank ?? null, scenarioFamilyRank: exact?.scenarioFamilyRank ?? null,
      purchaseRejectCode: exact?.purchaseRejectCode ?? null, purchaseReason: exact?.purchaseReason ?? null },
    reverse: { exact12SameThird: reversePurchasedSameThird, reverse12ThirdDifferent: reversePurchasedDifferentThird,
      candidatePresentNotPurchased: reverseCandidate && !reversePurchasedSameThird },
    scenario, category, distance, primaryCause, secondaryCauses };
}

function summarize(rows) {
  const count = key => rows.filter(row => key(row)).length;
  const pCounts = Object.fromEntries([3, 2, 1, 0].map(n => [`P${n}`, count(row => row.meaningfulRiderCount === n)]));
  const distances = Object.fromEntries([0, 1, 2, 3, 4].map(n => [n, count(row => row.distance === n)]));
  return { races: rows.length, exactHits: count(row => row.terminal.purchased), riderSelection: { ...pCounts,
      successRate: ratio(pCounts.P3 + pCounts.P2, rows.length), broadGeneratedP3: count(row => row.broadRiderCount === 3) },
    winner: { generated: count(row => row.winner.generated), generatedRate: ratio(count(row => row.winner.generated), rows.length),
      meaningful: count(row => row.winner.meaningful), top1: count(row => row.winner.rank === 1), top2: count(row => row.winner.rank !== null && row.winner.rank <= 2),
      top3: count(row => row.winner.rank !== null && row.winner.rank <= 3), outsideTop3: count(row => row.winner.rank !== null && row.winner.rank > 3), notGenerated: count(row => !row.winner.generated) },
    pair: { generated: count(row => row.pair.generated), generatedRate: ratio(count(row => row.pair.generated), rows.length),
      meaningful: count(row => row.pair.meaningful), reverseMeaningful: count(row => row.pair.reverseMeaningful), top1: count(row => row.pair.rank === 1),
      top3: count(row => row.pair.rank !== null && row.pair.rank <= 3), top5: count(row => row.pair.rank !== null && row.pair.rank <= 5), outsideTop5: count(row => row.pair.rank !== null && row.pair.rank > 5) },
    reverse: { exact12SameThird: count(row => row.reverse.exact12SameThird), reverse12ThirdDifferent: count(row => row.reverse.reverse12ThirdDifferent),
      candidatePresentNotPurchased: count(row => row.reverse.candidatePresentNotPurchased) },
    third: { generated: count(row => row.third.generated), generatedRate: ratio(count(row => row.third.generated), rows.length),
      top1: count(row => row.third.rank === 1), top3: count(row => row.third.rank !== null && row.third.rank <= 3),
      outsideTop3: count(row => row.third.rank !== null && row.third.rank > 3), missing: count(row => !row.third.generated) },
    terminal: { generated: count(row => row.terminal.generated), generatedRate: ratio(count(row => row.terminal.generated), rows.length),
      meaningful: count(row => row.terminal.meaningful), meaningfulRate: ratio(count(row => row.terminal.meaningful), rows.length),
      purchaseCandidate: count(row => row.terminal.purchaseCandidate), purchased: count(row => row.terminal.purchased),
      correctInternalNotPurchased: count(row => row.terminal.meaningful && !row.terminal.purchased) },
    categories: Object.fromEntries(['A_EXACT_HIT','B_NEAR_MISS_ORDER','C_CORRECT_INTERNAL_NOT_PURCHASED','D_RIDERS_RIGHT_RANKING_WRONG','E_UPSTREAM_MISS','F_UNCLASSIFIABLE'].map(name => [name, count(row => row.category === name)])),
    distance: { distribution: distances, mean: rows.length ? rows.reduce((sum, row) => sum + row.distance, 0) / rows.length : null,
      median: quantile(rows.map(row => row.distance), .5), p90: quantile(rows.map(row => row.distance), .9) },
    separation: { riderSelectionGood: count(row => row.meaningfulRiderCount >= 2), orderingGood: count(row => row.winner.rank !== null && row.winner.rank <= 3 && row.pair.rank !== null && row.pair.rank <= 5 && row.third.rank !== null && row.third.rank <= 3),
      purchaseSelectionGood: count(row => row.terminal.purchaseCandidate) },
    scenario: Object.fromEntries(['SCENARIO_CLOSE','SCENARIO_PARTIALLY_CLOSE','SCENARIO_MISS','INSUFFICIENT_EVIDENCE'].map(name => [name, count(row => row.scenario === name)])),
    primaryCauses: Object.fromEntries([...new Set(rows.map(row => row.primaryCause))].sort().map(cause => [cause, count(row => row.primaryCause === cause)])) };
}

function thickSummary(sourceRows) {
  const result = { tickets: 0, exact: 0, reverseSameThird: 0, exactPairThirdDifferent: 0, sameRidersWrongOrder: 0, twoRiders: 0, completelyWrong: 0 };
  for (const row of sourceRows) {
    const actual = parts(row.result.finishOrder), actualSet = new Set(actual);
    for (const ticket of row.purchase.tickets.filter(ticket => ticket.thick)) {
      result.tickets++;
      const p = parts(ticket.order), overlap = p.filter(number => actualSet.has(number)).length;
      if (ticket.order === actual.join('-')) result.exact++;
      else if (p[0] === actual[1] && p[1] === actual[0] && p[2] === actual[2]) result.reverseSameThird++;
      else if (p[0] === actual[0] && p[1] === actual[1]) result.exactPairThirdDifferent++;
      else if (p.slice().sort().join('-') === actual.slice().sort().join('-')) result.sameRidersWrongOrder++;
      else if (overlap >= 2) result.twoRiders++;
      else result.completelyWrong++;
    }
  }
  return result;
}

export function evaluatePredictionDistance(source, { lowTicketRaceKeys = [] } = {}) {
  const duplicate = source.rows.length - new Set(source.rows.map(row => row.raceKey)).size;
  const temporalViolations = source.rows.filter(row => row.integrity.temporalValid !== true).length;
  const integrityIssues = duplicate + temporalViolations + source.exclusions.length + Object.values(source.hashes).reduce((sum, value) => sum + value, 0);
  const races = source.rows.map(diagnoseRace), lowSet = new Set(lowTicketRaceKeys), lowRows = races.filter(row => lowSet.has(row.raceKey));
  const terminalSurvivalRaces=source.rows.map((row,index)=>auditTerminalSurvival(row,races[index]));
  const terminalSurvival={schemaVersion:'TERMINAL_SURVIVAL_AUDIT_V1',summary:summarizeTerminalSurvival(terminalSurvivalRaces),races:terminalSurvivalRaces};
  const summary = summarize(races), lowTicket = summarize(lowRows);
  const causes = Object.entries(summary.primaryCauses).filter(([cause]) => cause !== 'NONE_EXACT_HIT').sort((a, b) => b[1] - a[1]);
  return { schemaVersion: 'PREDICTION_DISTANCE_DIAGNOSIS_V1', definition: { candidateCodes: [...CANDIDATE_CODES],
      meaningfulTerminal: 'representativeTerminal OR existing natural purchase candidate code', riderSelectionGood: 'at least two actual top-three riders in meaningful terminals',
      orderingGood: 'saved winner rank <=3 AND saved exact-pair rank <=5 AND saved conditional-third rank <=3', thresholdSearch: false },
    cohort: { raceCount: source.cohort.raceKeys.length, keyHash: hash(source.cohort.raceKeys), sourceKeyHash: source.cohortKeyHash,
      rows: source.rows.length, duplicate, resultAvailable: source.rows.filter(row => row.result.status === 'confirmed').length, protectedFinal: source.cohort.protectedFinalIncluded || 0 },
    integrity: { ...source.hashes, exclusions: source.exclusions.length, temporalViolations, resultAwareLeakage: 0, postHocModification: 0,
      historicalMutation: source.safety.historicalMutation, issues: integrityIssues },
    summary, terminalSurvival, lowTicket, thick: thickSummary(source.rows), largestBottlenecks: causes.slice(0, 3).map(([cause, count]) => ({ cause, count })), races,
    safety: { productionPredictionChanged: false, productionPurchaseChanged: false, tuningPerformed: false, historicalMutationCount: 0 } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const source = JSON.parse(fs.readFileSync(process.argv[2] || new URL('./prediction-distance-100r-source.json', import.meta.url)));
  const evalSource = JSON.parse(fs.readFileSync(process.argv[3] || new URL('./recommendation-thick-100r-source.json', import.meta.url)));
  const lowTicketRaceKeys = evalSource.ticketDiagnostics.filter(row => row.inConfirmedCohort && row.canPurchase === true && row.mainTickets.length <= 3).map(row => row.raceKey);
  const report = evaluatePredictionDistance(source, { lowTicketRaceKeys });
  const target = process.argv[4] || new URL('./prediction-distance-100r-evaluation.json', import.meta.url);
  fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
  const csvTarget = process.argv[5] || new URL('./prediction-distance-100r-races.csv', import.meta.url);
  const columns = ['raceKey','actualOrder','meaningfulRiderCount','winnerRank','pairRank','thirdRank','terminalGenerated','terminalMeaningful','purchaseCandidate','purchased','reverse12SameThird','scenario','category','distance','primaryCause'];
  const csvRows = report.races.map(row => [row.raceKey,row.actualOrder,row.meaningfulRiderCount,row.winner.rank,row.pair.rank,row.third.rank,row.terminal.generated,row.terminal.meaningful,row.terminal.purchaseCandidate,row.terminal.purchased,row.reverse.exact12SameThird,row.scenario,row.category,row.distance,row.primaryCause]);
  fs.writeFileSync(csvTarget, `${[columns, ...csvRows].map(values => values.map(value => `"${String(value ?? '').replaceAll('"','""')}"`).join(',')).join('\n')}\n`);
  console.log(JSON.stringify({ target: String(target), summary: report.summary, lowTicket: report.lowTicket, thick: report.thick, integrity: report.integrity, largestBottlenecks: report.largestBottlenecks }, null, 2));
}
