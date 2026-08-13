export const KEIRIN_START_POWER_BASELINE = Object.freeze({
  schemaVersion: 1,
  baselineVersion: "keirin-official-rider-census-start-power-20260807-v2",
  generatedAt: "2026-08-07T18:17:03+09:00",
  effectiveAt: "2026-08-07T18:17:03+09:00",
  source: "KEIRIN.JP official rolling-4-month rider census (2,420 riders; retrieved 2026-08-07)",
  priorStrength: 15,
  categories: Object.freeze({
    girls: categoryBaseline({
      population: 227,
      validCount: 209,
      correlation: 0.637056,
      bFrequency: distribution(209, 0.146116, 0, 0, 0, 0.066667, 0.230769, 0.401818, 0.533333, 0.888889, 0.354067),
      hFrequency: distribution(209, 0.138869, 0, 0, 0, 0.095238, 0.227273, 0.333333, 0.444444, 0.8, 0.258373),
      shrunkBFrequency: distribution(209, 0.146078, 0.042975, 0.060553, 0.073058, 0.104369, 0.187629, 0.28763, 0.391153, 0.551265, 0),
      shrunkHFrequency: distribution(209, 0.139944, 0.040844, 0.057862, 0.077149, 0.113418, 0.191433, 0.252122, 0.295197, 0.489309, 0)
    }),
    standard: categoryBaseline({
      population: 2193,
      validCount: 2169,
      correlation: 0.947204,
      bFrequency: distribution(2169, 0.14197, 0, 0, 0, 0, 0.25, 0.478609, 0.583333, 1, 0.530659),
      hFrequency: distribution(2169, 0.139978, 0, 0, 0, 0, 0.25, 0.461538, 0.583333, 0.904762, 0.528815),
      shrunkBFrequency: distribution(2169, 0.142193, 0.040953, 0.050704, 0.054604, 0.076056, 0.203239, 0.337259, 0.410784, 0.622132, 0),
      shrunkHFrequency: distribution(2169, 0.140428, 0.040378, 0.049992, 0.053838, 0.075602, 0.202848, 0.335706, 0.403322, 0.586102, 0)
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

function distribution(n, mean, min, p10, p25, median, p75, p90, p95, max, zeroRate) {
  return Object.freeze({ n, mean, min, p10, p25, median, p75, p90, p95, max, zeroRate });
}
