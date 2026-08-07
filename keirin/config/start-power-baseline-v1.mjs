export const KEIRIN_START_POWER_BASELINE = Object.freeze({
  schemaVersion: 1,
  baselineVersion: "keirin-active-racers-start-power-20260807-v1",
  generatedAt: "2026-08-07T18:17:03+09:00",
  effectiveAt: "2026-08-07T18:17:03+09:00",
  source: "KEIRIN.JP active racer census",
  priorStrength: 15,
  categories: Object.freeze({
    girls: categoryBaseline({
      population: 227,
      validCount: 209,
      correlation: 0.664931,
      bFrequency: distribution(209, 0.146116, 0, 0, 0, 0.066667, 0.230769, 0.401818, 0.888889, 0.230769),
      hFrequency: distribution(209, 0.138869, 0, 0, 0, 0.095238, 0.227273, 0.333333, 0.8, 0.227273),
      shrunkBFrequency: distribution(209, 0.146078, 0.042975, 0.060553, 0.073058, 0.104369, 0.187629, 0.28763, 0.551265, 0.11457),
      shrunkHFrequency: distribution(209, 0.139944, 0.040844, 0.057862, 0.077149, 0.113418, 0.191433, 0.252122, 0.489309, 0.114284)
    }),
    standard: categoryBaseline({
      population: 1687,
      validCount: 1668,
      correlation: 0.95578,
      bFrequency: distribution(1668, 0.14725, 0, 0, 0, 0, 0.259259, 0.5, 1, 0.259259),
      hFrequency: distribution(1668, 0.14442, 0, 0, 0, 0, 0.259259, 0.479227, 0.904762, 0.259259),
      shrunkBFrequency: distribution(1668, 0.147736, 0.042476, 0.052589, 0.056635, 0.078573, 0.210481, 0.362113, 0.624018, 0.153846),
      shrunkHFrequency: distribution(1668, 0.14516, 0.04166, 0.051579, 0.055546, 0.077368, 0.209392, 0.345519, 0.587953, 0.153846)
    })
  })
});

function categoryBaseline({
  population,
  validCount,
  correlation,
  bFrequency,
  hFrequency,
  shrunkBFrequency,
  shrunkHFrequency
}) {
  return Object.freeze({
    population,
    validCount,
    correlation,
    bFrequency,
    hFrequency,
    shrunkBFrequency,
    shrunkHFrequency
  });
}

function distribution(n, mean, min, p10, p25, median, p75, p90, max, iqr) {
  return Object.freeze({ n, mean, min, p10, p25, median, p75, p90, max, iqr });
}
