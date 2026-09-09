import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const SCENARIO_IDENTITY_V3_VERSION = "SCENARIO_IDENTITY_V3_SHADOW";
export const PROVENANCE_SCHEMA_VERSION = "SCENARIO_PROVENANCE_V1";
export const CANDIDATES = Object.freeze(["S0", "S1", "S2"]);
const BRANCH_FAMILIES = Object.freeze([
  "LEADER_HOLD", "BANTE_SASHI", "MAKURI_SUCCESS", "LEAD_BATTLE",
  "LINE_SEPARATION", "OTHER_LINE_RISE", "SOLO_RISE", "UNKNOWN"
]);
const RELATION_SPLIT_FAMILIES = new Set(["LEAD_BATTLE", "LINE_SEPARATION", "OTHER_LINE_RISE"]);

export function classifyScenarioTuple(tuple = {}, candidate = "S0") {
  if (!CANDIDATES.includes(candidate)) throw new Error(`unsupported candidate: ${candidate}`);
  const branchFamily = normalizeBranchFamily(tuple.branchType);
  if (branchFamily === "UNKNOWN") return identity(candidate, ["UNKNOWN"], branchFamily, "UNKNOWN", "UNKNOWN");
  const initiativeFamily = initiativeRelation(tuple);
  const relationSummary = normalizeRelation(tuple.firstSecondRelation);
  const parts = [branchFamily];
  if (candidate !== "S0") parts.push(initiativeFamily);
  if (candidate === "S2" && RELATION_SPLIT_FAMILIES.has(branchFamily)) parts.push(relationSummary);
  return identity(candidate, parts, branchFamily, initiativeFamily, relationSummary);
}

export function groupPredictionScenarios(prediction, candidate = "S0") {
  if (prediction?.scenarioProvenanceSchemaVersion !== PROVENANCE_SCHEMA_VERSION) return [];
  const dictionary = prediction.scenarioProvenances || {};
  const groups = new Map();
  for (const terminal of prediction.terminals || prediction.prediction?.terminals || []) {
    const tuple = dictionary[terminal?.scenarioProvenanceId];
    const scenario = tuple ? classifyScenarioTuple(tuple, candidate) : identity(candidate, ["UNKNOWN"], "UNKNOWN", "UNKNOWN", "UNKNOWN");
    if (!groups.has(scenario.id)) groups.set(scenario.id, {
      ...scenario, mass: 0, rawMass: 0, terminalCount: 0,
      initiativeFamilies: new Set(), relationSummaries: new Set()
    });
    const group = groups.get(scenario.id);
    const mass = terminalMass(terminal);
    group.rawMass += mass;
    group.terminalCount += 1;
    group.initiativeFamilies.add(scenario.initiativeFamily);
    group.relationSummaries.add(scenario.relationSummary);
  }
  const rows = [...groups.values()];
  const total = rows.reduce((sum, row) => sum + row.rawMass, 0);
  const fallback = rows.reduce((sum, row) => sum + row.terminalCount, 0);
  return rows.map(row => ({
    id: row.id, candidate: row.candidate, branchFamily: row.branchFamily,
    mass: total > 0 ? row.rawMass / total : fallback ? row.terminalCount / fallback : 0,
    terminalCount: row.terminalCount,
    initiativeFamily: summarizeSet(row.initiativeFamilies),
    firstSecondRelationSummary: summarizeSet(row.relationSummaries)
  })).sort((a, b) => b.mass - a.mass || a.id.localeCompare(b.id, "en"))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export function evaluateRaceRecord(record, { includeResult = true } = {}) {
  const prediction = record?.sealed?.researchPrediction || record?.researchPrediction || record?.prediction || record;
  if (prediction?.scenarioProvenanceSchemaVersion !== PROVENANCE_SCHEMA_VERSION) return null;
  const dictionary = prediction.scenarioProvenances || {};
  const terminalRows = prediction.terminals || prediction.prediction?.terminals || [];
  const rawValues = Object.values(dictionary).flatMap(tuple => Object.values(tuple || {}));
  const rawUnknown = rawValues.filter(value => value === "UNKNOWN").length;
  const terminalUnknown = terminalRows.reduce((count, terminal) => {
    const tuple = dictionary[terminal?.scenarioProvenanceId];
    return count + (tuple ? Object.values(tuple).filter(value => value === "UNKNOWN").length : 8);
  }, 0);
  const resultAllowed = includeResult && !isFinalTestRecord(record);
  const finish = resultAllowed ? finishOrder(record) : null;
  const correctTerminal = finish ? terminalRows.find(row => orderKey(row) === finish.join("-")) : null;
  const candidates = Object.fromEntries(CANDIDATES.map(name => {
    const scenarios = groupPredictionScenarios(prediction, name);
    const correctScenario = correctTerminal ? classifyScenarioTuple(dictionary[correctTerminal.scenarioProvenanceId], name) : null;
    const correctRank = correctScenario ? scenarios.find(row => row.id === correctScenario.id)?.rank ?? null : null;
    return [name, {
      scenarios,
      scenarioCount: scenarios.length,
      top1Mass: scenarios[0]?.mass || 0,
      top2CumulativeMass: scenarios.slice(0, 2).reduce((sum, row) => sum + row.mass, 0),
      top3CumulativeMass: scenarios.slice(0, 3).reduce((sum, row) => sum + row.mass, 0),
      concentration: concentration(scenarios),
      correctScenarioRank: correctRank
    }];
  }));
  return {
    raceKey: record?.raceKey || prediction?.raceKey || null,
    rawProvenanceCount: Object.keys(dictionary).length,
    rawUnknownFields: rawUnknown,
    rawFieldCount: rawValues.length,
    terminalUnknownFields: terminalUnknown,
    terminalFieldCount: terminalRows.length * 8,
    resultEvaluated: Boolean(correctTerminal),
    finalTestExcluded: includeResult && isFinalTestRecord(record),
    currentDominantBranchRank: correctTerminal ? dominantBranchRank(terminalRows, correctTerminal) : null,
    candidates
  };
}

export function createShadowAccumulator() {
  const races = [];
  return {
    add(record, options) { const row = evaluateRaceRecord(record, options); if (row) races.push(compactRace(row)); return row; },
    finish() { return summarizeRaces(races); },
    get size() { return races.length; }
  };
}

function compactRace(row) {
  return {
    ...row,
    candidates: Object.fromEntries(CANDIDATES.map(name => [name, {
      ...row.candidates[name],
      unknownScenarioCount: row.candidates[name].scenarios.filter(item => item.branchFamily === "UNKNOWN").length,
      scenarios: undefined
    }]))
  };
}

export function summarizeRaces(races) {
  const resultRows = races.filter(row => row.resultEvaluated);
  const summary = {
    version: SCENARIO_IDENTITY_V3_VERSION,
    mode: "RESEARCH_ONLY_READ_ONLY",
    sampleSize: races.length,
    resultSampleSize: resultRows.length,
    finalTestExcludedCount: races.filter(row => row.finalTestExcluded).length,
    rawProvenance: distribution(races.map(row => row.rawProvenanceCount)),
    rawUnknownRate: ratio(sum(races, "rawUnknownFields"), sum(races, "rawFieldCount")),
    terminalWeightedUnknownRate: ratio(sum(races, "terminalUnknownFields"), sum(races, "terminalFieldCount")),
    currentDominantBranch: resultMetrics(resultRows.map(row => row.currentDominantBranchRank)),
    candidates: {}
  };
  for (const name of CANDIDATES) {
    const counts = races.map(row => row.candidates[name].scenarioCount);
    const ranks = resultRows.map(row => row.candidates[name].correctScenarioRank);
    summary.candidates[name] = {
      scenarioCount: distribution(counts),
      withinTwoToSixRate: ratio(counts.filter(value => value >= 2 && value <= 6).length, counts.length),
      unknownScenarioRate: ratio(races.reduce((n, row) => n + row.candidates[name].unknownScenarioCount, 0), races.reduce((n, row) => n + row.candidates[name].scenarioCount, 0)),
      top1Mass: distribution(races.map(row => row.candidates[name].top1Mass)),
      top2CumulativeMass: distribution(races.map(row => row.candidates[name].top2CumulativeMass)),
      top3CumulativeMass: distribution(races.map(row => row.candidates[name].top3CumulativeMass)),
      concentration: countBy(races.map(row => row.candidates[name].concentration)),
      correctScenario: resultMetrics(ranks)
    };
  }
  return summary;
}

export function evaluateDirectory(directory, options = {}) {
  const accumulator = createShadowAccumulator();
  const files = fs.readdirSync(directory, { withFileTypes: true });
  let peakRecordBytes = 0;
  for (const entry of files) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const file = path.join(directory, entry.name);
    const source = fs.readFileSync(file, "utf8");
    peakRecordBytes = Math.max(peakRecordBytes, Buffer.byteLength(source));
    accumulator.add(JSON.parse(source), options);
  }
  return { ...accumulator.finish(), boundedAggregation: true, peakRecordBytes };
}

function identity(candidate, parts, branchFamily, initiativeFamily, relationSummary) {
  return { candidate, id: parts.join("|"), branchFamily, initiativeFamily, relationSummary, thirdPositionUsed: false, resultFieldsUsed: [] };
}
function normalizeBranchFamily(value) {
  const text = String(value || "").trim().toUpperCase().replace(/[ -]+/g, "_");
  if (!text || text === "UNKNOWN") return "UNKNOWN";
  for (const family of BRANCH_FAMILIES.slice(0, -1)) if (text === family || text.includes(family)) return family;
  if (text.includes("OTHER") && text.includes("RISE")) return "OTHER_LINE_RISE";
  return "UNKNOWN";
}
function initiativeRelation(tuple) {
  const initiative = field(tuple.initiativeLineId), first = field(tuple.firstLineId), second = field(tuple.secondLineId);
  if ([initiative, first, second].includes("UNKNOWN")) return "UNKNOWN";
  if (initiative === first && initiative === second) return "INITIATIVE_LINE_SWEEP";
  if (initiative === first || initiative === second) return "INITIATIVE_LINE_SURVIVES";
  return "OTHER_LINE_TAKES_TOP2";
}
function normalizeRelation(value) {
  const text = field(value);
  if (text.startsWith("SAME_LINE")) return text === "SAME_LINE_REVERSE" ? "SAME_LINE_REVERSE" : "SAME_LINE_FORWARD";
  if (text === "CROSS_LINE") return "CROSS_LINE";
  return "UNKNOWN";
}
function terminalMass(row) {
  for (const key of ["normalizedWeight", "normalizedProbability", "probability", "modelWeight", "weight"]) {
    const value = Number(row?.[key]); if (Number.isFinite(value) && value >= 0) return value;
  }
  return 1;
}
function concentration(rows) {
  const top1 = rows[0]?.mass || 0, top2 = rows.slice(0, 2).reduce((sum, row) => sum + row.mass, 0);
  return top1 >= 0.6 ? "HIGH" : top2 >= 0.7 ? "MEDIUM" : "LOW";
}
function dominantBranchRank(terminals, correct) {
  const groups = new Map();
  for (const terminal of terminals) { const id = String(terminal?.dominantBranchId || "UNKNOWN"); groups.set(id, (groups.get(id) || 0) + terminalMass(terminal)); }
  const ranked = [...groups].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "en"));
  const id = String(correct?.dominantBranchId || "UNKNOWN");
  const index = ranked.findIndex(([key]) => key === id);
  return index >= 0 ? index + 1 : null;
}
function isFinalTestRecord(record) {
  const values = [record?.sequence, record?.recordNumber, record?.comparisonNumber, record?.validationIndex, record?.sealed?.sequence];
  return values.some(value => Number.isInteger(Number(value)) && Number(value) >= 403 && Number(value) <= 502);
}
function finishOrder(record) {
  const result = record?.result?.result || record?.result || record?.sealed?.result;
  if (String(result?.status || "").toLowerCase() !== "confirmed") return null;
  const order = result?.finishOrder || result?.order;
  const normalized = (Array.isArray(order) ? order : String(order || "").match(/\d+/g) || []).map(Number).slice(0, 3);
  return normalized.length === 3 ? normalized : null;
}
function orderKey(row) { const value = row?.order || row?.combination; const order = (Array.isArray(value) ? value : String(value || "").match(/\d+/g) || []).map(Number).slice(0, 3); return order.length === 3 ? order.join("-") : ""; }
function field(value) { return value === null || value === undefined || value === "" ? "UNKNOWN" : String(value).toUpperCase(); }
function summarizeSet(set) { const values = [...set].sort(); return values.length === 1 ? values[0] : values.join("+"); }
function sum(rows, key) { return rows.reduce((total, row) => total + Number(row[key] || 0), 0); }
function ratio(numerator, denominator) { return denominator ? numerator / denominator : null; }
function countBy(values) { return values.reduce((out, value) => { out[value] = (out[value] || 0) + 1; return out; }, {}); }
function resultMetrics(ranks) { const valid = ranks.filter(Number.isFinite); return { sampleSize: valid.length, meanRank: valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null, medianRank: quantile(valid, 0.5), top1: valid.filter(x => x <= 1).length, top2: valid.filter(x => x <= 2).length, top3: valid.filter(x => x <= 3).length }; }
function distribution(values) { return { median: quantile(values, 0.5), p75: quantile(values, 0.75), p90: quantile(values, 0.9), max: values.length ? Math.max(...values) : null, mean: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null }; }
function quantile(values, p) { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b), index = (sorted.length - 1) * p, low = Math.floor(index), high = Math.ceil(index); return sorted[low] + (sorted[high] - sorted[low]) * (index - low); }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const directory = process.argv[2];
  if (!directory) throw new Error("usage: node research/scenario-identity-v3-shadow.mjs <sealed-record-directory>");
  process.stdout.write(`${JSON.stringify(evaluateDirectory(directory), null, 2)}\n`);
}
