const VERIFIED_STATES = new Set(["VERIFIED", "RESULT_VERIFIED"]);

/**
 * Reverse-tree learning layer.
 *
 * Learning is separate from prediction/purchase:
 * - only verified post-race records are accepted;
 * - prediction-time fields are not rewritten;
 * - learning produces research statistics only;
 * - production auto-apply is explicitly disabled.
 */
export function learnVerified(records = []) {
  const accepted = records.filter(isEligibleRecord);
  const rejected = records.length - accepted.length;
  const nodeStats = new Map();
  const templateStats = new Map();
  const patternStats = new Map();

  for (const record of accepted) {
    const result = record.result || {};
    const order = Array.isArray(result.order) ? result.order : [];
    const hypotheses = Array.isArray(record.reverseTree?.hypotheses)
      ? record.reverseTree.hypotheses
      : [];

    for (const hypothesis of hypotheses) {
      const outcome = classifyOutcome(hypothesis, order);
      const templateId = hypothesis.templateId || "unknown";
      update(templateStats, templateId, outcome, hypothesis.supportScore || 0);

      for (const nodeId of hypothesis.path || []) {
        update(nodeStats, nodeId, outcome, hypothesis.supportScore || 0);
      }

      const patternKey = `${templateId}|${(hypothesis.path || []).join(">")}`;
      update(patternStats, patternKey, outcome, hypothesis.supportScore || 0);
    }
  }

  return {
    version: "REVERSE-TREE-LEARNING-0.1.0",
    acceptedRecords: accepted.length,
    rejectedRecords: rejected,
    nodeStats: mapToObject(nodeStats),
    templateStats: mapToObject(templateStats),
    patternStats: mapToObject(patternStats),
    safeguards: {
      verifiedOnly: true,
      predictionSealRequired: true,
      postResultLeakageBlocked: true,
      productionAutoApply: false
    }
  };
}

function isEligibleRecord(record) {
  if (!record || !record.result || !record.reverseTree) return false;
  if (!VERIFIED_STATES.has(record.verificationState)) return false;
  if (record.predictionSeal !== true && record.predictionSealed !== true) return false;
  if (!Array.isArray(record.result.order) || record.result.order.length < 3) return false;
  return true;
}

function classifyOutcome(hypothesis, order) {
  if (hypothesis.support === "矛盾") return "contradicted";
  if (hypothesis.support === "その他・未観測") return "unknown";

  const observed = hypothesis.observedOrder || hypothesis.targetOrder;
  if (Array.isArray(observed) && observed.length >= 3) {
    return sameOrder(observed, order) ? "confirmed" : "missed";
  }

  if (hypothesis.support === "確定" || hypothesis.support === "強支持") {
    return "supported";
  }
  if ((hypothesis.path || []).length) return "candidate";
  return "unknown";
}

function sameOrder(a, b) {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

function update(map, key, outcome, score) {
  if (!map.has(key)) {
    map.set(key, {
      samples: 0,
      confirmed: 0,
      missed: 0,
      contradicted: 0,
      supported: 0,
      candidate: 0,
      unknown: 0,
      scoreSum: 0
    });
  }
  const stats = map.get(key);
  stats.samples += 1;
  stats[outcome] = (stats[outcome] || 0) + 1;
  stats.scoreSum += Number(score) || 0;
}

function mapToObject(map) {
  return Object.fromEntries([...map.entries()].map(([key, stats]) => [
    key,
    {
      ...stats,
      confirmationRate: stats.samples ? stats.confirmed / stats.samples : 0,
      contradictionRate: stats.samples ? stats.contradicted / stats.samples : 0,
      meanSupportScore: stats.samples ? stats.scoreSum / stats.samples : 0
    }
  ]));
}
