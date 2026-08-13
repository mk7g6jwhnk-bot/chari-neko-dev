/*
 * Chari Neko - Keirin start-power
 * START_POWER_CALIBRATION_V2
 *
 * Critical rule:
 * - observed B=0/H=0 is NOT missing and is NOT the neutral 5.00.
 * - starts affects confidence/quality only.
 * - missing/invalid evidence is null, never silently converted to 5.00.
 *
 * Calibration anchors are derived from the 2026-08-07 official four-month
 * rider distribution audit (standard/girls). The zero observation uses the
 * empirical mid-rank of the zero-tie group.
 */

const STANDARD_ZERO = 2.649;
const GIRLS_ZERO = 1.531;

const STANDARD_ANCHORS = [
  [0.000000, 2.649],
  [1/24,    5.417],
  [3/25,    6.200],
  [4/25,    6.600],
  [6/20,    7.828],
  [7/20,    8.209],
  [10/30,   8.069],
  [15/30,   9.064],
];

const GIRLS_ANCHORS = [
  [0.000000, 1.531],
  [1/24,    5.000],
  [3/25,    6.000],
  [4/25,    6.400],
  [6/20,    7.500],
  [7/20,    7.900],
  [10/30,   8.000],
  [15/30,   9.000],
];

const finite = v => Number.isFinite(Number(v));
const clamp = (v, lo=0, hi=10) => Math.max(lo, Math.min(hi, Number(v)));
const nullable = v => finite(v) ? Number(v) : null;
const normalizeCategory = v =>
  /girls|ガールズ|女子|Ｌ級|L級|ガ予|ガ決/i.test(String(v||""))
    ? "girls"
    : "standard";

function interpolate(rate, anchors) {
  const x = clamp(Number(rate), 0, 1);
  if (x <= anchors[0][0]) return anchors[0][1];
  for (let i=1; i<anchors.length; i++) {
    const [x1,y1] = anchors[i];
    const [x0,y0] = anchors[i-1];
    if (x <= x1) {
      const t = (x-x0)/(x1-x0 || 1);
      return y0 + (y1-y0)*t;
    }
  }
  const [x0,y0] = anchors[anchors.length-2];
  const [x1,y1] = anchors[anchors.length-1];
  const slope=(y1-y0)/(x1-x0 || 1);
  return clamp(y1 + (x-x1)*slope);
}

function zeroMidRank(category, side) {
  // The audit measured the zero-tie mass in the official four-month cohort.
  // Mid-rank is half of the tied zero mass; the corresponding empirical
  // percentile is then mapped through the category's observed calibration.
  if (category === "girls") return GIRLS_ZERO;
  return STANDARD_ZERO;
}

function scoreFrequency(rate, category, side) {
  if (rate === 0) return zeroMidRank(category, side);
  return interpolate(rate, category === "girls" ? GIRLS_ANCHORS : STANDARD_ANCHORS);
}

function quality(starts) {
  if (!finite(starts) || Number(starts) < 0) return null;
  const n=Number(starts);
  return n/(n+15);
}

function confidence(starts, missing=false) {
  if (missing) return "low";
  const q=quality(starts);
  if (q === null) return "low";
  if (q >= .60) return "high";
  if (q >= .40) return "medium";
  return "low";
}

function applyOne(participant) {
  const p={...participant};
  const ev=p.officialProfileEvidence || {};
  const category=normalizeCategory(p.raceCategory);

  const rawB=nullable(
    p.backCount ??
    ev.backCount ??
    ev.rawBackCount ??
    p.officialProfile?.backCount
  );
  const rawH=nullable(
    p.homeCount ??
    ev.homeCount ??
    ev.rawHomeCount ??
    p.officialProfile?.homeCount
  );
  const starts=nullable(
    p.officialTotalStarts ??
    ev.officialTotalStarts ??
    p.officialProfile?.officialTotalStarts
  );

  const identityPassed =
    p.officialProfileEvidence?.identityPassed === true ||
    p.officialProfileEvidence?.verifiedOfficialProfile === true;

  // Missing/invalid is never converted to 5.00.
  if (rawB === null || rawH === null || starts === null) {
    return {
      ...p,
      startPower:null,
      startPowerEvidence:{
        usable:false,
        confidence:"low",
        status:"MISSING_INPUTS",
        rawBackCount:rawB,
        rawHomeCount:rawH,
        officialTotalStarts:starts,
        bFrequency:null,
        hFrequency:null,
        shrunkBFrequency:null,
        shrunkHFrequency:null,
        bPercentileScore:null,
        hPercentileScore:null,
        latentScore:null,
        raceCategory:category,
        priorStrength:15,
        startsQuality:quality(starts),
        missingInputs:[
          ...(identityPassed ? [] : ["verifiedOfficialProfile"]),
          ...(rawB===null ? ["backCount"] : []),
          ...(rawH===null ? ["homeCount"] : []),
          ...(starts===null ? ["officialTotalStarts"] : [])
        ]
      }
    };
  }

  // Observed data integrity: B/H cannot exceed starts.
  if (starts < 0 || rawB < 0 || rawH < 0 || rawB > starts || rawH > starts) {
    return {
      ...p,
      startPower:null,
      startPowerEvidence:{
        usable:false,
        confidence:"low",
        status:"VALUE_UNAVAILABLE",
        rawBackCount:rawB,
        rawHomeCount:rawH,
        officialTotalStarts:starts,
        bFrequency:null,
        hFrequency:null,
        shrunkBFrequency:null,
        shrunkHFrequency:null,
        bPercentileScore:null,
        hPercentileScore:null,
        latentScore:null,
        raceCategory:category,
        priorStrength:15,
        startsQuality:quality(starts),
        missingInputs:["B/H count exceeds officialTotalStarts"]
      }
    };
  }

  // Officially observed zero is valid evidence. Do NOT neutralize to 5.
  const bFrequency=starts>0 ? rawB/starts : 0;
  const hFrequency=starts>0 ? rawH/starts : 0;
  const bScore=scoreFrequency(bFrequency,category,"B");
  const hScore=scoreFrequency(hFrequency,category,"H");
  const latentScore=(bScore+hScore)/2;
  const startsQuality=quality(starts);

  return {
    ...p,
    startPower:Number(latentScore.toFixed(3)),
    startPowerEvidence:{
      usable:true,
      status:"VERIFIED",
      confidence:confidence(starts),
      rawBackCount:rawB,
      rawHomeCount:rawH,
      officialTotalStarts:starts,
      bFrequency,
      hFrequency,
      // Kept for backward-compatible audit display. These are intentionally
      // identical to observed frequencies: no EB shrinkage is used for ability.
      shrunkBFrequency:bFrequency,
      shrunkHFrequency:hFrequency,
      bPercentileScore:bScore,
      hPercentileScore:hScore,
      latentScore:Number(latentScore.toFixed(3)),
      raceCategory:category,
      priorStrength:15,
      startsQuality,
      missingInputs:[]
    }
  };
}

export function applyStartPowerEvidence(participants=[]) {
  return (Array.isArray(participants) ? participants : []).map(applyOne);
}

export function calculateStartPower(participant) {
  return applyOne(participant);
}
