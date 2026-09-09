const EPSILON = 1e-15;

export const TERMINAL_AGGREGATION_GRID = Object.freeze({
  initiativeFamilyLogWeight: Object.freeze([-0.5, -0.25, 0, 0.25, 0.5]),
  fourthCornerFitLogWeight: Object.freeze([-0.5, -0.25, 0, 0.25, 0.5])
});

export const TERMINAL_CALIBRATION_GRID = Object.freeze([
  0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 2
]);

export function rerankResearchTerminals(terminals, featureRows, weights) {
  const byOrder = new Map(featureRows.map(row => [orderKey(row.order), row]));
  return terminals.map(terminal => {
    const feature = byOrder.get(orderKey(terminal.order));
    const baseline = Math.log(Math.max(EPSILON, Number(terminal.terminalProbability) || 0));
    const score = baseline
      + Number(weights.initiativeFamilyLogWeight || 0) * Math.log(Math.max(EPSILON, feature?.initiativeFamilyMass || 0))
      + Number(weights.fourthCornerFitLogWeight || 0) * Math.log(Math.max(EPSILON, feature?.fourthCornerFit || 0));
    return { ...terminal, candidateRankingScore: score };
  }).sort((a, b) => b.candidateRankingScore - a.candidateRankingScore
    || orderKey(a.order).localeCompare(orderKey(b.order), "en"));
}

export function temperatureScaleTerminals(terminals, temperature) {
  if (!(Number(temperature) > 0)) throw new Error("POSITIVE_TEMPERATURE_REQUIRED");
  const logits = terminals.map(row => Math.log(Math.max(EPSILON, Number(row.terminalProbability) || 0)) / Number(temperature));
  const max = Math.max(...logits);
  const weights = logits.map(value => Math.exp(value - max));
  const total = weights.reduce((sum, value) => sum + value, 0) || 1;
  return terminals.map((row, index) => ({
    ...row,
    calibratedProbability: weights[index] / total,
    calibrationStatus: "TEMPERATURE_SCALED_SHADOW_ONLY"
  }));
}

export function assertRankPreserved(before, after) {
  const original = [...before].sort((a, b) => Number(b.terminalProbability) - Number(a.terminalProbability)).map(row => orderKey(row.order));
  const calibrated = [...after].sort((a, b) => Number(b.calibratedProbability) - Number(a.calibratedProbability)).map(row => orderKey(row.order));
  if (original.join("|") !== calibrated.join("|")) throw new Error("CALIBRATION_CHANGED_TERMINAL_RANK");
  return true;
}

function orderKey(order) { return (order || []).map(Number).join("-"); }
