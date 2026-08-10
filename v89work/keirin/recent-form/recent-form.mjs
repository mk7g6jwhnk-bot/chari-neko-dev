import { KEIRIN_RECENT_FORM_BASELINE } from "../config/recent-form-baseline-v1.mjs";

const CONTINUOUS_WEIGHT = 0.9;
const RANK_WEIGHT = 0.1;
const MIN_ROBUST_SCALE = 1;
const CLASS_GAP_CAP = 20;
const CLASS_ADJUSTMENT_RATE = 0.01;

export function applyRecentFormEvidence(participants, {
  baseline = KEIRIN_RECENT_FORM_BASELINE
} = {}) {
  const items = Array.isArray(participants) ? participants : [];
  const metricStats = {
    currentScore: raceStats(validValues(items, "currentScore"), items.length),
    recent4MonthScore: raceStats(validValues(items, "recent4MonthScore"), items.length)
  };

  const prepared = items.map((participant, index) => prepareParticipant({
    participant,
    index,
    metricStats,
    baseline
  }));
  applyOrderSafeClassAdjustments(prepared);

  return prepared.map(entry => ({
    ...entry.participant,
    recentForm: entry.value,
    recentFormEvidence: buildEvidence(entry, baseline)
  }));
}

function prepareParticipant({ participant, index, metricStats, baseline }) {
  const profile = participant.officialProfileEvidence;
  const currentScore = nullableNumber(profile?.currentScore);
  const recentScore = nullableNumber(profile?.recent4MonthScore);
  const selectedMetric = recentScore !== null
    ? "recent4MonthScore"
    : currentScore !== null ? "currentScore" : null;
  const selectedScore = selectedMetric === "recent4MonthScore" ? recentScore : currentScore;
  const stats = selectedMetric ? metricStats[selectedMetric] : emptyStats(metricStats.currentScore.totalCount);
  const classKey = resolveBaselineClass(participant);
  const classBaseline = classKey ? baseline.classes?.[classKey] : null;
  const classDistribution = selectedMetric ? classBaseline?.[selectedMetric] : null;
  const classPercentileValue = classPercentile(classDistribution, selectedScore);
  const sparseSampleFlag = participant.sparseSampleFlag === true;
  const foreignFlag = participant.officialForeignFlag === true;
  const profileIdentityPassed = profile?.identityPassed === true;

  if (!profileIdentityPassed || selectedMetric === null || stats.validCount <= 1) {
    return {
      participant, index, selectedMetric, selectedScore, stats, metricStats, classKey,
      classPercentile: classPercentileValue,
      racePercentile: selectedScore === null ? null : racePercentile(stats.values, selectedScore),
      continuousScore: selectedScore === null ? null : 5,
      baseValue: 5,
      rawClassAdjustment: 0,
      classAdjustment: 0,
      value: 5,
      confidence: "low",
      sparseSampleFlag,
      foreignFlag,
      profileIdentityPassed,
      currentScore,
      recentScore
    };
  }

  const racePercentileValue = racePercentile(stats.values, selectedScore);
  const continuousScore = robustContinuousScore(selectedScore, stats.median, stats.iqr);
  const rankScore = racePercentileValue / 10;
  const rawScore = continuousScore * CONTINUOUS_WEIGHT + rankScore * RANK_WEIGHT;
  const baseValue = clamp(5 + stats.qualityFactor * (rawScore - 5), 0.5, 9.5);
  const classGap = classPercentileValue === null
    ? 0
    : clamp(classPercentileValue - continuousScore * 10, -CLASS_GAP_CAP, CLASS_GAP_CAP);
  const rawClassAdjustment = classGap * CLASS_ADJUSTMENT_RATE * stats.qualityFactor;

  return {
    participant, index, selectedMetric, selectedScore, stats, metricStats, classKey,
    classPercentile: classPercentileValue,
    racePercentile: racePercentileValue,
    continuousScore,
    baseValue,
    rawClassAdjustment,
    classAdjustment: 0,
    value: round(baseValue),
    confidence: confidenceFor({
      participant,
      profileIdentityPassed,
      selectedMetric,
      stats,
      sparseSampleFlag,
      foreignFlag
    }),
    sparseSampleFlag,
    foreignFlag,
    profileIdentityPassed,
    currentScore,
    recentScore
  };
}

function applyOrderSafeClassAdjustments(entries) {
  for (const metric of ["recent4MonthScore", "currentScore"]) {
    const metricEntries = entries.filter(entry => entry.selectedMetric === metric && entry.selectedScore !== null);
    const grouped = new Map();
    for (const entry of metricEntries) {
      const members = grouped.get(entry.selectedScore) || [];
      members.push(entry);
      grouped.set(entry.selectedScore, members);
    }
    const scoreGroups = [...grouped.entries()]
      .sort(([left], [right]) => left - right)
      .map(([score, members]) => {
        const baseValue = average(members.map(member => member.baseValue));
        const adjustment = average(members.map(member => member.rawClassAdjustment));
        return {
          score,
          members,
          baseValue,
          weight: members.length,
          proposed: clamp(baseValue + adjustment, 0.5, 9.5)
        };
      });

    const fitted = isotonicNondecreasing(scoreGroups.map(group => ({
      value: group.proposed,
      weight: group.weight
    })));
    scoreGroups.forEach((group, groupIndex) => {
      const value = round(fitted[groupIndex]);
      const classAdjustment = round(value - group.baseValue);
      for (const entry of group.members) {
        entry.value = value;
        entry.classAdjustment = classAdjustment;
      }
    });
  }
}

function buildEvidence(entry, baseline) {
  const {
    participant, selectedMetric, selectedScore, stats, metricStats, classKey,
    classPercentile: selectedClassPercentile, racePercentile: selectedRacePercentile,
    continuousScore, classAdjustment, value, confidence, sparseSampleFlag,
    foreignFlag, profileIdentityPassed, currentScore, recentScore
  } = entry;
  const inputsUsed = [];
  if (selectedMetric) {
    inputsUsed.push(
      `${selectedMetric}.raceMedianIqrContinuous`,
      `${selectedMetric}.raceMidRankAuxiliary`,
      "raceQualityShrinkage"
    );
    if (selectedClassPercentile !== null) inputsUsed.push(`${selectedMetric}.classPercentileCappedAdjustment`);
  }

  return {
    value,
    confidence,
    selectedMetric,
    selectedScore,
    raceMedian: stats.median,
    raceIqr: stats.iqr,
    validCount: stats.validCount,
    validRate: stats.validRate,
    uniqueCount: stats.uniqueCount,
    continuousScore,
    qualityFactor: stats.qualityFactor,
    classPercentile: selectedClassPercentile,
    classAdjustment,
    racePercentile: selectedRacePercentile,
    raceCurrentPercentile: currentScore === null ? null : racePercentile(metricStats.currentScore.values, currentScore),
    raceRecentPercentile: recentScore === null ? null : racePercentile(metricStats.recent4MonthScore.values, recentScore),
    classCurrentPercentile: classPercentileForMetric(participant, baseline, "currentScore", currentScore),
    classRecentPercentile: classPercentileForMetric(participant, baseline, "recent4MonthScore", recentScore),
    inputsUsed,
    missingInputs: [
      currentScore === null ? "currentScore" : null,
      recentScore === null ? "recent4MonthScore" : null
    ].filter(Boolean),
    currentScoreMissing: currentScore === null,
    recentScoreIsActualZero: recentScore === 0,
    profileIdentityPassed,
    officialTotalStarts: nullableNumber(participant.officialTotalStarts),
    sparseSampleFlag,
    foreignFlag,
    classKey,
    baselineVersion: baseline.baselineVersion,
    baselineSchemaVersion: baseline.schemaVersion
  };
}

function raceStats(values, totalCount) {
  const sorted = [...values].sort((left, right) => left - right);
  const validCount = sorted.length;
  const validRate = totalCount > 0 ? validCount / totalCount : 0;
  const median = validCount ? quantile(sorted, 0.5) : null;
  const iqr = validCount ? quantile(sorted, 0.75) - quantile(sorted, 0.25) : null;
  const uniqueCount = new Set(sorted).size;
  const countFactor = validCount <= 1 ? 0
    : validCount === 2 ? 0.25
      : validCount === 3 ? 0.4
        : validCount === 4 ? 0.6
          : validCount === 5 ? 0.8
            : validCount === 6 ? 0.9 : 1;
  const coverageFactor = Math.min(1, validRate / 0.7);
  const iqrFactor = validCount <= 1 ? 0 : 0.25 + 0.75 * Math.min(1, Math.max(0, iqr) / 1);
  const uniqueFactor = uniqueCount <= 1 ? 0.25
    : uniqueCount === 2 ? 0.4
      : uniqueCount === 3 ? 0.7 : 1;
  return {
    values: sorted,
    totalCount,
    validCount,
    validRate: round(validRate),
    median: median === null ? null : round(median),
    iqr: iqr === null ? null : round(iqr),
    uniqueCount,
    qualityFactor: round(countFactor * coverageFactor * iqrFactor * uniqueFactor)
  };
}

function emptyStats(totalCount = 0) {
  return raceStats([], totalCount);
}

function robustContinuousScore(value, median, iqr) {
  if (value === null || median === null || iqr === null) return null;
  const scale = Math.max(iqr / 1.349, MIN_ROBUST_SCALE);
  return round(normalCdf((value - median) / scale) * 10);
}

function confidenceFor({ selectedMetric, stats, sparseSampleFlag, foreignFlag, profileIdentityPassed }) {
  if (!profileIdentityPassed || sparseSampleFlag || stats.validCount <= 3 || stats.iqr < 0.5 || stats.uniqueCount <= 2) {
    return "low";
  }
  const high = selectedMetric === "recent4MonthScore" &&
    stats.validCount >= 5 && stats.validRate >= 0.7 && stats.iqr >= 1 && stats.uniqueCount >= 4;
  if (high) return foreignFlag ? "medium" : "high";
  const medium = stats.validCount >= 4 && stats.validRate >= 0.5 && stats.iqr >= 0.5 && stats.uniqueCount >= 3;
  return medium ? "medium" : "low";
}

function isotonicNondecreasing(points) {
  const blocks = [];
  points.forEach((point, index) => {
    blocks.push({ start: index, end: index, weight: point.weight, value: point.value });
    while (blocks.length >= 2 && blocks.at(-2).value > blocks.at(-1).value) {
      const right = blocks.pop();
      const left = blocks.pop();
      const weight = left.weight + right.weight;
      blocks.push({
        start: left.start,
        end: right.end,
        weight,
        value: (left.value * left.weight + right.value * right.weight) / weight
      });
    }
  });
  const result = Array(points.length);
  for (const block of blocks) {
    for (let index = block.start; index <= block.end; index += 1) result[index] = block.value;
  }
  return result;
}

function validValues(participants, field) {
  return participants
    .filter(item => item.officialProfileEvidence?.identityPassed === true)
    .map(item => nullableNumber(item.officialProfileEvidence?.[field]))
    .filter(value => value !== null);
}

function racePercentile(values, value) {
  if (value === null || values.length === 0) return null;
  const below = values.filter(candidate => candidate < value).length;
  const equal = values.filter(candidate => candidate === value).length;
  return round((below + equal / 2) / values.length * 100);
}

function classPercentileForMetric(participant, baseline, metric, value) {
  const classKey = resolveBaselineClass(participant);
  return classPercentile(classKey ? baseline.classes?.[classKey]?.[metric] : null, value);
}

function classPercentile(distribution, value) {
  if (!distribution || value === null) return null;
  if (value === 0 && distribution.min === 0 && distribution.zeroRate > 0) return round(distribution.zeroRate * 50);
  const points = [
    [distribution.min, 0], [distribution.p10, 10], [distribution.p25, 25],
    [distribution.median, 50], [distribution.p75, 75], [distribution.p90, 90],
    [distribution.max, 100]
  ];
  if (value <= points[0][0]) return 0;
  if (value >= points.at(-1)[0]) return 100;
  for (let index = 1; index < points.length; index += 1) {
    const [upperValue, upperPercentile] = points[index];
    if (value > upperValue) continue;
    const [lowerValue, lowerPercentile] = points[index - 1];
    if (upperValue === lowerValue) return round((lowerPercentile + upperPercentile) / 2);
    const ratio = (value - lowerValue) / (upperValue - lowerValue);
    return round(lowerPercentile + ratio * (upperPercentile - lowerPercentile));
  }
  return null;
}

function resolveBaselineClass(participant) {
  if (participant.raceCategory === "girls") return "L1";
  const text = String(participant.className || "").normalize("NFKC").toUpperCase().replace(/\s+/g, "");
  return ["S1", "S2", "A1", "A2", "L1"].find(key => text.includes(key)) || null;
}

function quantile(sorted, percentile) {
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * percentile;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function normalCdf(value) {
  return 0.5 * (1 + erf(value / Math.sqrt(2)));
}

function erf(value) {
  const sign = value < 0 ? -1 : 1;
  const absolute = Math.abs(value);
  const t = 1 / (1 + 0.3275911 * absolute);
  const approximation = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) * Math.exp(-absolute * absolute);
  return sign * approximation;
}

function nullableNumber(value) {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value) {
  return value === null ? null : Math.round(value * 1000) / 1000;
}
