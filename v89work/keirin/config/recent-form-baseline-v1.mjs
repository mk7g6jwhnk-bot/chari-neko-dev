export const KEIRIN_RECENT_FORM_BASELINE = Object.freeze({
  schemaVersion: 1,
  baselineVersion: "keirin-active-racers-20260807-v1",
  generatedAt: "2026-08-07T16:16:14+09:00",
  effectiveAt: "2026-08-08T00:00:00+09:00",
  source: "KEIRIN.JP active racer census",
  classes: Object.freeze({
    L1: baseline("girls", 227,
      distribution(201, 0.11454, 0, 44, 46.33, 48.16, 50.66, 53.77, 57, 58.33),
      distribution(227, 0, 0.0793, 0, 44.662, 47.21, 49.95, 53.16, 55.568, 60.83)),
    A1: baseline("standard", 504,
      distribution(487, 0.03373, 0, 76.66, 83.14, 86, 89, 91.83, 94.22, 98.83),
      distribution(504, 0, 0.00794, 0, 83.879, 86.0225, 89.065, 92.6675, 95.081, 102)),
    A2: baseline("standard", 515,
      distribution(488, 0.05243, 0, 75.33, 78.22, 80.11, 82, 85.33, 88.426, 96.33),
      distribution(515, 0, 0.02136, 0, 75.97, 79.695, 82, 84.445, 87.19, 95.06)),
    S1: baseline("standard", 209,
      distribution(200, 0.04306, 0, 93.9, 102.317, 104, 107.235, 109.94, 112.025, 119.57),
      distribution(209, 0, 0, 93.9, 102.236, 104.46, 107.47, 110.73, 112.796, 117.57)),
    S2: baseline("standard", 459,
      distribution(438, 0.04575, 0, 89, 93.97, 96.23, 99, 102, 104.661, 112.9),
      distribution(459, 0, 0.01525, 0, 92.692, 95.25, 98.78, 101.775, 104.74, 111.91))
  })
});

function baseline(category, n, currentScore, recent4MonthScore) {
  return Object.freeze({ category, n, currentScore, recent4MonthScore });
}

function distribution(n, missingRate, zeroRate, min, p10, p25, median, p75, p90, max) {
  return Object.freeze({ n, missingRate, zeroRate, min, p10, p25, median, p75, p90, max });
}
