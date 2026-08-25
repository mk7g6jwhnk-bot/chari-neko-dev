const PREDICTED_STATES = new Set(["SEALED", "PREDICTION_SEALED", "VERIFIED", "RESULT_VERIFIED"]);
const VERIFIED_STATES = new Set(["VERIFIED", "RESULT_VERIFIED"]);

/**
 * Learning is split into two independent datasets:
 *
 * 1) resultLearning:
 *    Can learn from ANY race with a verified official result,
 *    even when there was no prediction.
 *
 * 2) predictionErrorLearning:
 *    Requires a sealed prediction AND a verified result.
 *
 * Neither dataset mutates production prediction parameters automatically.
 */
export function learnRace(record = {}) {
  const resultLearning = learnResultStructure(record);
  const predictionErrorLearning = learnPredictionError(record);
  return {
    version: "REVERSE-TREE-LEARNING-0.2.0",
    resultLearning,
    predictionErrorLearning,
    safeguards: {
      resultLearningAllowsUnpredicted: true,
      predictionErrorRequiresPredictionSeal: true,
      verifiedResultRequiredForBoth: true,
      postResultPredictionRewriteBlocked: true,
      productionAutoApply: false
    }
  };
}

export function learnResultStructure(record = {}) {
  if (!hasVerifiedResult(record)) {
    return { eligible: false, reason: "VERIFIED_RESULT_REQUIRED" };
  }

  const result = record.result;
  const hypotheses = Array.isArray(record.reverseTree?.hypotheses)
    ? record.reverseTree.hypotheses
    : [];

  const nodeStats = {};
  const templateStats = {};
  const patternStats = {};

  for (const h of hypotheses) {
    const outcome = classifyObservedStructure(h, result);
    update(templateStats, h.templateId || "unknown", outcome, h.supportScore);
    for (const nodeId of h.path || []) {
      update(nodeStats, nodeId, outcome, h.supportScore);
    }
    const key = `${h.templateId || "unknown"}|${(h.path || []).join(">")}`;
    update(patternStats, key, outcome, h.supportScore);
  }

  return {
    eligible: true,
    sourceType: hasPrediction(record) ? "PREDICTED_OR_SEALED" : "UNPREDICTED_RESULT",
    nodeStats,
    templateStats,
    patternStats
  };
}

export function learnPredictionError(record = {}) {
  if (!hasVerifiedResult(record)) {
    return { eligible: false, reason: "VERIFIED_RESULT_REQUIRED" };
  }
  if (!hasPrediction(record)) {
    return { eligible: false, reason: "PREDICTION_SEAL_REQUIRED" };
  }

  const order = record.result.order || [];
  const predicted = record.prediction?.order || record.predictedOrder || [];
  return {
    eligible: true,
    predictedOrder: predicted.slice(0, 3),
    actualOrder: order.slice(0, 3),
    exactHit: sameOrder(predicted, order),
    top1Hit: predicted[0] != null && predicted[0] === order[0],
    positionHits: predicted.slice(0, 3).map((n, i) => n === order[i])
  };
}

function hasVerifiedResult(record) {
  return VERIFIED_STATES.has(record.verificationState) &&
    Array.isArray(record.result?.order) &&
    record.result.order.length >= 3;
}

function hasPrediction(record) {
  return record.predictionSeal === true ||
    record.predictionSealed === true ||
    PREDICTED_STATES.has(record.predictionState);
}

function classifyObservedStructure(h, result) {
  if (h?.support === "矛盾") return "contradicted";
  if (h?.support === "その他・未観測") return "unknown";
  if (Array.isArray(h?.observedOrder) && h.observedOrder.length >= 3) {
    return sameOrder(h.observedOrder, result.order) ? "confirmed" : "missed";
  }
  return "observed_result_pattern";
}

function sameOrder(a = [], b = []) {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

function update(map, key, outcome, score) {
  if (!map[key]) {
    map[key] = {
      samples: 0,
      confirmed: 0,
      missed: 0,
      contradicted: 0,
      observed_result_pattern: 0,
      unknown: 0,
      scoreSum: 0
    };
  }
  const s = map[key];
  s.samples += 1;
  s[outcome] = (s[outcome] || 0) + 1;
  s.scoreSum += Number(score) || 0;
  s.confirmationRate = s.confirmed / s.samples;
  s.contradictionRate = s.contradicted / s.samples;
}
