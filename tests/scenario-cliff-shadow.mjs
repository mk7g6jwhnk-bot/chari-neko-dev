import assert from "node:assert/strict";
import { boundaryScores, buildScenarioCliffShadow, buildScenarioCliffShadowV2, buildScenarioCliffShadowV3, buildScenarioCliffShadowV5, DEFAULT_CONFIG, evaluateScenarioCliffFourWay, evaluateScenarioCliffShadow, evaluateScenarioCliffThreeWay, evaluateScenarioCliffV5, scenarioSemanticKey, scenarioTechnicalKey, selectNaturalBoundary, VERSION } from "../research/scenario-cliff-shadow.mjs";

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

const noCliffV2 = buildScenarioCliffShadowV2(record([terminal([1, 2, 3], .9), terminal([1, 2, 4], .89), terminal([1, 2, 5], .88)]));
assert.equal(noCliffV2.tickets.length, 3, "V2 no-cliff retains multiple natural terminals");
const clearCliffV2 = buildScenarioCliffShadowV2(record([terminal([1, 2, 3], 1), terminal([1, 2, 4], .92), terminal([1, 2, 5], .2)]));
assert.ok(clearCliffV2.tickets.length < 3, "clear cliff stops the scenario terminal tail");

const duplicateBeforeCap = buildScenarioCliffShadowV2(record(Array.from({ length: 30 }, (_, index) => terminal([1, 2, 3], .9 - index / 1000, index % 2 ? "LEAD-A" : "LEAD-B"))), { ...DEFAULT_CONFIG, scenarioBoundary: { ...DEFAULT_CONFIG.scenarioBoundary, minimumScore: 2 }, terminalBoundary: { ...DEFAULT_CONFIG.terminalBoundary, minimumScore: 2 } });
assert.equal(duplicateBeforeCap.purchaseEligibility.canPurchase, true, ">20 before consolidation can be eligible after exact/near merge");
assert.equal(duplicateBeforeCap.tickets.length, 1);
assert.ok(duplicateBeforeCap.audit.nearDuplicateScenarioMerges >= 1, "near-duplicate scenarios consolidate before cap");

const broad = [];
for (let first = 1; first <= 6; first += 1) for (let second = 1; second <= 6; second += 1) for (let third = 1; third <= 6; third += 1) if (new Set([first, second, third]).size === 3) broad.push(terminal([first, second, third], .8, "FLAT"));
const finalOver = buildScenarioCliffShadowV2(record(broad), { ...DEFAULT_CONFIG, scenarioBoundary: { ...DEFAULT_CONFIG.scenarioBoundary, minimumScore: 2 }, terminalBoundary: { ...DEFAULT_CONFIG.terminalBoundary, minimumScore: 2 }, v2: { ...DEFAULT_CONFIG.v2, pairSupportFloor: 0 } });
assert.equal(finalOver.purchaseEligibility.reason, "NATURAL_SELECTION_EXCEEDS_CAP", "still over 20 after final consolidation is ineligible");
assert.equal(finalOver.tickets.length, 0, "never arbitrary top20 slices");

const scenariosV2 = buildScenarioCliffShadowV2(record([terminal([1, 2, 3], .9, "LEAD-A"), terminal([4, 5, 6], .85, "MAKURI-B"), terminal([6, 5, 4], .2, "WEAK-C")]));
assert.ok(scenariosV2.selectedScenarioIds.some(x => x.startsWith("LEAD-A")) && scenariosV2.selectedScenarioIds.some(x => x.startsWith("MAKURI-B")), "multiple supported scenarios preserved");
assert.ok(!scenariosV2.selectedScenarioIds.some(x => x.startsWith("WEAK-C")), "weak scenario is not force-filled");
assert.ok(scenariosV2.tickets.some(x => x.category === "MAIN") && scenariosV2.tickets.some(x => x.category === "COVER"), "MAIN/COVER follow scenario families");
assert.equal(scenariosV2.tickets.find(x => x.category === "MAIN").supportingScenarios[0].scenarioId.startsWith("LEAD-A"), true);

assert.equal(noCliffV2.warnings.includes("PARTIAL_DATA_MISSING"), false, "auxiliary odds absence is not a permanent partial-data warning");
const materialMissing = buildScenarioCliffShadowV2(record([terminal([1, 2, 3], .9, "A", { terminalModelWeight: null, probability: null, modelWeight: null, naturalConvergenceScore: null })]));
assert.ok(materialMissing.warnings.includes("PARTIAL_DATA_MISSING"), "material non-redundant missing support remains a warning");
assert.equal(buildScenarioCliffShadowV2(record([])).purchaseEligibility.reason, "CRITICAL_DATA_MISSING");
assert.throws(() => buildScenarioCliffShadowV2(record([terminal([1, 2, 3], .9, "A", { result: "win" })])), /result-aware/);
const v2Unknown = buildScenarioCliffShadowV2(record([terminal([1, 2, 3], .9, "UNKNOWN", { branchFit: null })]));
assert.ok(v2Unknown.scenarios[0].unknownEvidenceCount > 0);

const threeWay = evaluateScenarioCliffThreeWay([record([terminal([1, 2, 4], .9)]), protectedRecord]);
assert.equal(threeWay.cohortSize, 1); assert.equal(threeWay.protectedExcluded, 1); assert.equal(threeWay.candidateV2.exactHits, 1);

assert.equal(scenarioSemanticKey(terminal([1, 2, 3], .9, "LEAD-A")).split("|")[0], "LEADER_HOLD", "technical suffix is absent from semantic family");
assert.notEqual(scenarioTechnicalKey(terminal([1, 2, 3], .9, "LEAD-A")), scenarioTechnicalKey(terminal([1, 2, 3], .9, "LEAD-B")), "technical identities remain auditable");
const v3Rows = [
  terminal([1, 2, 3], 1, "LEAD-A"),
  terminal([1, 2, 4], .95, "LEAD-B", { purchaseRejectCode: "THIRD_VARIANT_REJECTED" }),
  terminal([1, 3, 2], .92, "LEAD-A", { purchaseRejectCode: "TERMINAL_BOUNDARY" }),
  terminal([4, 5, 1], .9, "MAKURI-A", { purchaseRejectCode: "TERMINAL_BOUNDARY" })
];
const v3 = buildScenarioCliffShadowV3(record(v3Rows));
assert.equal(v3.version, "SCENARIO_CLIFF_PURCHASE_SHADOW_V3");
assert.ok(v3.upstream.firstCandidateCount > 1 && v3.upstream.pairCandidateCount > 1 && v3.upstream.thirdCandidateCount > 1, "first/pair/third are independently enumerated before natural selection");
assert.equal(v3.upstream.earlyThirdPruning, false, "third variants are not pruned before pair evaluation");
assert.equal(v3.audit.semanticScenarioMerges >= 1, true, "semantic scenario merge suppresses technical split support");
assert.equal(v3.upstream.firstCandidateCount >= 2, true, "all first candidates are independently inspected before natural boundary");
assert.equal(v3.upstream.pairCandidateCount >= 3, true, "all pairs are independently inspected");
assert.equal(v3.upstream.thirdCandidateCount >= 3, true, "thirds are inspected before pruning");
assert.equal(v3.upstream.earlyThirdPruning, false);
assert.equal(v3.audit.resultFieldsUsed.length, 0);
assert.throws(() => buildScenarioCliffShadowV3(record([terminal([1, 2, 3], .9, "A", { result: "win" })])), /result-aware/);
const flatV3 = buildScenarioCliffShadowV3(record(broad));
assert.equal(flatV3.upstream.source, "EXPLOSION_GUARD_CURRENT_NATURAL", "flat candidate explosion is never force-sliced");
assert.equal(flatV3.upstream.naturalTerminalCount, broad.length, "guard preserves sealed natural set rather than arbitrary pruning");
const fourWay = evaluateScenarioCliffFourWay([record([terminal([1, 2, 4], .9)]), protectedRecord]);
assert.equal(fourWay.cohortSize, 1); assert.equal(fourWay.protectedExcluded, 1); assert.equal(fourWay.candidateV3.exactHits, 1);

const lines = [{ id: "A", members: [{ number: 1, lineId: "A", lineOrder: 1, officialScore: 90, roleScores: { first: 9, second: 4 } }, { number: 2, lineId: "A", lineOrder: 2, officialScore: 88, roleScores: { first: 4, second: 9 } }] }, { id: "B", members: [{ number: 3, lineId: "B", lineOrder: 1, officialScore: 80, roleScores: { first: 6, second: 5 } }] }];
const v5Record = record([terminal([1, 2, 3], .9, "LEAD-A"), terminal([1, 3, 2], .7, "LEAD-A"), terminal([3, 2, 1], .4, "MAKURI-B")]); v5Record.sealed.researchPrediction.lines = lines;
const v5 = buildScenarioCliffShadowV5(v5Record);
assert.equal(v5.version, "SCENARIO_CLIFF_PURCHASE_SHADOW_V5");
assert.ok(v5.pairLayer.pairs.some(pair => pair.relation === "SAME_LINE") && v5.pairLayer.pairs.some(pair => pair.relation === "CROSS_LINE"));
assert.ok(v5.pairLayer.pairs.every(pair => pair.pairScoreBreakdown && Array.isArray(pair.pairCounterEvidence)), "pair score and counter evidence are explicit");
assert.equal(v5.audit.resultFieldsUsed.length, 0);
assert.throws(() => buildScenarioCliffShadowV5(record([terminal([1, 2, 3], .9, "A", { result: "win" })])), /result-aware/);
const v5Evaluation = evaluateScenarioCliffV5([v5Record, protectedRecord]);
assert.equal(v5Evaluation.cohortSize, 1); assert.equal(v5Evaluation.protectedExcluded, 1);
console.log("PASS scenario relative score / cliff shadow");
