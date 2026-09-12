import assert from "node:assert/strict";
import { boundaryScores, buildScenarioCliffShadow, DEFAULT_CONFIG, evaluateScenarioCliffShadow, selectNaturalBoundary, VERSION } from "../research/scenario-cliff-shadow.mjs";

const terminal = (order, score, scenario = "LEADER_HOLD", extra = {}) => ({ order, purchaseRejectCode: "ADOPTED", dominantBranchId: scenario, terminalModelWeight: score, naturalConvergenceScore: score, branchFit: score, secondFamilyRelativeToBest: score, thirdFamilyRelativeToBest: score, ...extra });
const record = rows => ({ raceKey: "20260901-01-1", sealed: { researchPrediction: { performanceSchemaVersion: "PURCHASE_PERFORMANCE_V2", standardPurchasePlan: [{ order: [1, 2, 3], betClass: "MAIN" }], purchase: { audit: { terminalLifecycleAudit: { rows } } } } }, result: { result: { status: "confirmed", finishOrder: [1, 2, 4], payout: 12340 } } });

assert.equal(VERSION, "SCENARIO_CLIFF_PURCHASE_SHADOW_V1");
const cliffs = boundaryScores([1, .92, .88, .61, .58]);
assert.equal(cliffs.sort((a, b) => b.boundaryScore - a.boundaryScore)[0].keep, 3, "88 to 61 is the natural cliff");
assert.equal(selectNaturalBoundary([{ relativeScore: 1 }, { relativeScore: .99 }, { relativeScore: .98 }]).detected, false, "flat cluster has no cliff");
assert.equal(selectNaturalBoundary([{ relativeScore: 1 }, { relativeScore: .3 }, { relativeScore: .29 }], DEFAULT_CONFIG.thickBoundary).rows.length, 1, "one-ticket thick is possible");
assert.equal(selectNaturalBoundary([{ relativeScore: 1 }, { relativeScore: .9 }, { relativeScore: .2 }], DEFAULT_CONFIG.thickBoundary).rows.length, 2, "multi-ticket thick is possible");
assert.equal(selectNaturalBoundary([{ relativeScore: 1 }, { relativeScore: .96 }, { relativeScore: .94 }], DEFAULT_CONFIG.thickBoundary).detected, false, "no cliff means no thick");

const basic = buildScenarioCliffShadow(record([
  terminal([1, 2, 3], 1), terminal([1, 2, 4], .91), terminal([1, 3, 2], .3),
  terminal([4, 5, 1], .75, "MAKURI_SUCCESS"), terminal([4, 5, 2], .7, "MAKURI_SUCCESS")
]));
assert.equal(basic.mode, "RESEARCH_ONLY_SHADOW");
assert.equal(basic.audit.resultFieldsUsed.length, 0);
assert.ok(basic.tickets.length < 20, "natural under cap is never force-filled");
assert.ok(basic.tickets.every(x => ["MAIN", "COVER"].includes(x.category)));
assert.ok(Object.hasOwn(basic.tickets[0], "firstRelativeScore"));
assert.ok(Object.hasOwn(basic.tickets[0], "pairRelativeScore"));
assert.ok(Object.hasOwn(basic.tickets[0], "thirdConditionalScore"));

const duplicate = buildScenarioCliffShadow(record([
  terminal([1, 2, 3], .9, "A"), terminal([1, 2, 3], .8, "A"), terminal([1, 2, 3], .7, "B")
]), { ...DEFAULT_CONFIG, scenarioBoundary: { ...DEFAULT_CONFIG.scenarioBoundary, minimumScore: 2 }, terminalBoundary: { ...DEFAULT_CONFIG.terminalBoundary, minimumScore: 2 } });
assert.equal(duplicate.tickets.length, 1, "exact ticket merged");
assert.equal(duplicate.tickets[0].independentScenarioSupportCount, 2, "technical duplicate cannot add scenario support");
assert.equal(duplicate.audit.technicalScenarioDuplicates, 1);

const over = buildScenarioCliffShadow(record(Array.from({ length: 21 }, (_, index) => terminal([Math.floor(index / 6) + 1, index % 6 + 1, (index + 2) % 7 + 1], .8, `S${index}`)).filter(x => new Set(x.order).size === 3)), { ...DEFAULT_CONFIG, maximumTickets: 5, scenarioBoundary: { ...DEFAULT_CONFIG.scenarioBoundary, minimumScore: 2 }, terminalBoundary: { ...DEFAULT_CONFIG.terminalBoundary, minimumScore: 2 } });
assert.equal(over.purchaseEligibility.reason, "NATURAL_SELECTION_EXCEEDS_CAP");
assert.equal(over.tickets.length, 0);

const missing = buildScenarioCliffShadow(record([]));
assert.equal(missing.predictionContinues, true);
assert.equal(missing.purchaseEligibility.reason, "CRITICAL_DATA_MISSING");
const partial = buildScenarioCliffShadow(record([terminal([1, 2, 3], .9)]));
assert.equal(partial.purchaseEligibility.canPurchase, true);
assert.ok(partial.warnings.includes("PARTIAL_DATA_MISSING"));

const lowOddsRows = [terminal([1, 2, 3], .9, "A", { odds: 4 }), terminal([4, 5, 6], .85, "B", { odds: 5 })];
const lowOdds = buildScenarioCliffShadow(record(lowOddsRows), { ...DEFAULT_CONFIG, scenarioBoundary: { ...DEFAULT_CONFIG.scenarioBoundary, minimumScore: 2 } });
assert.equal(lowOdds.purchaseEligibility.canPurchase, true);
assert.ok(lowOdds.warnings.includes("LOW_ODDS_VALUE"));

assert.throws(() => buildScenarioCliffShadow(record([terminal([1, 2, 3], .9, "A", { result: "win" })])), /result-aware/);
const unknown = buildScenarioCliffShadow(record([terminal([1, 2, 3], .9, "UNKNOWN", { branchFit: null })]));
assert.equal(unknown.scenarios[0].unknownEvidenceCount > 0, true, "UNKNOWN remains explicit");

const protectedRecord = record([terminal([1, 2, 4], .9)]); protectedRecord.sequence = 450;
const evaluation = evaluateScenarioCliffShadow([record([terminal([1, 2, 4], .9)]), protectedRecord]);
assert.equal(evaluation.cohortSize, 1);
assert.equal(evaluation.protectedExcluded, 1);
assert.equal(evaluation.candidate.exactHits, 1);

const before = JSON.stringify(record([terminal([1, 2, 3], .9)]).sealed.researchPrediction);
const immutable = record([terminal([1, 2, 3], .9)]); buildScenarioCliffShadow(immutable);
assert.equal(JSON.stringify(immutable.sealed.researchPrediction), before);
console.log("PASS scenario relative score / cliff shadow");
