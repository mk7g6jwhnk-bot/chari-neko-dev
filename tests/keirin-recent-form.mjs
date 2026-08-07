import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  adaptParticipantsForPrediction,
  buildLineText,
  detectRaceCategory
} from "../netlify/functions/keirin-predict.mjs";
import { KEIRIN_RECENT_FORM_BASELINE } from "../keirin/config/recent-form-baseline-v1.mjs";
import { applyRecentFormEvidence } from "../keirin/recent-form/recent-form.mjs";
import { inferLines } from "../keirin/parser/line-parser.mjs";
import { runKeirinEngine } from "../keirin/engine/keirin-engine.mjs";

const toyohashi = await fixture("keirin-browser-toyohashi10-profile.json");
const utsunomiya = await fixture("keirin-browser-utsunomiya7-profile.json");

assert.equal(KEIRIN_RECENT_FORM_BASELINE.schemaVersion, 1);
assert.equal(KEIRIN_RECENT_FORM_BASELINE.classes.L1.n, 227);
assert.equal(KEIRIN_RECENT_FORM_BASELINE.classes.A1.n, 504);
assert.equal(KEIRIN_RECENT_FORM_BASELINE.classes.A2.n, 515);
assert.equal(KEIRIN_RECENT_FORM_BASELINE.classes.S1.n, 209);
assert.equal(KEIRIN_RECENT_FORM_BASELINE.classes.S2.n, 459);

const toyohashiContext = contextFor(toyohashi, "girls");
const toyohashiRaw = toyohashi.participants.map(profile => rawParticipant(profile));
const toyohashiAdapted = adaptParticipantsForPrediction(toyohashiRaw, toyohashiContext);

// A: the seven girls receive differentiated race-relative recent form.
assert.equal(toyohashiAdapted.length, 7);
assert.ok(new Set(toyohashiAdapted.map(item => item.recentForm)).size >= 6);
assert.ok(toyohashiAdapted.every(item => item.recentFormEvidence.confidence === "high"));
assert.ok(toyohashiAdapted.every(item => item.recentFormEvidence.classKey === "L1"));
assert.ok(toyohashiAdapted.every(item => item.recentFormEvidence.selectedMetric === "recent4MonthScore"));
const toyohashiLines = inferLines({
  participants: toyohashiAdapted,
  lineText: buildLineText(toyohashi.lines)
});
const toyohashiPrediction = runKeirinEngine({
  race: {
    id: "20260807-45-10-recent-form",
    venue: toyohashi.basic.venueName,
    venueCode: toyohashi.request.venueCode,
    date: toyohashi.request.date,
    raceNo: toyohashi.request.raceNo,
    lineConfidence: toyohashiLines.confidence,
    participants: toyohashiLines.participants
  },
  oddsByOrder: {}
});
assert.ok(toyohashiPrediction.branches.length > 0);
assert.ok(toyohashiPrediction.terminals.length > 0);
assert.deepEqual(toyohashiPrediction.audit.errors, []);

// B/C: the mixed A race keeps race order primary; missing current score remains usable.
const utsunomiyaAdapted = adaptParticipantsForPrediction(
  utsunomiya.participants.map(profile => rawParticipant(profile)),
  contextFor(utsunomiya, "standard")
);
const a2Number6 = utsunomiyaAdapted.find(item => item.number === 6);
const a2Number7 = utsunomiyaAdapted.find(item => item.number === 7);
const missingCurrent = utsunomiyaAdapted.find(item => item.number === 3);
assert.ok(a2Number6.recentForm > a2Number7.recentForm);
assert.ok(a2Number6.recentFormEvidence.raceRecentPercentile > a2Number7.recentFormEvidence.raceRecentPercentile);
assert.ok(Math.abs(a2Number6.recentFormEvidence.classAdjustment) <= 0.2);
assert.ok(Math.abs(a2Number7.recentFormEvidence.classAdjustment) <= 0.2);
assert.equal(missingCurrent.recentFormEvidence.currentScoreMissing, true);
assert.equal(missingCurrent.recentFormEvidence.selectedMetric, "recent4MonthScore");
assert.ok(Number.isFinite(missingCurrent.recentForm));

// D: a real zero is an input, not a missing value.
const zeroRace = adaptParticipantsForPrediction([
  rawParticipant({ number: 1, registration: "010001", className: "L1", currentScore: 55, recent4MonthScore: 0 }),
  rawParticipant({ number: 2, registration: "010002", className: "L1", currentScore: 52, recent4MonthScore: 50 }),
  rawParticipant({ number: 3, registration: "010003", className: "L1", currentScore: 50, recent4MonthScore: 55 })
], { raceDate: "20260807", raceStartTime: "20:00", raceCategory: "girls" });
assert.equal(zeroRace[0].recentFormEvidence.recentScoreIsActualZero, true);
assert.equal(zeroRace[0].recentFormEvidence.selectedMetric, "recent4MonthScore");
assert.ok(!zeroRace[0].recentFormEvidence.missingInputs.includes("recent4MonthScore"));
assert.ok(zeroRace[0].recentForm < 5);

// E: invalid official profiles are explicitly neutral and low confidence.
const invalidRaw = rawParticipant({ number: 8, registration: "010008", className: "A1", currentScore: 90, recent4MonthScore: 90 });
invalidRaw.officialProfile.identityPassed = false;
const invalid = adaptParticipantsForPrediction([invalidRaw], {
  raceDate: "20260807", raceStartTime: "20:00", raceCategory: "standard"
})[0];
assert.equal(invalid.recentForm, 5);
assert.equal(invalid.recentFormEvidence.confidence, "low");
assert.equal(invalid.recentFormEvidence.profileIdentityPassed, false);
assert.deepEqual(invalid.recentFormEvidence.missingInputs, ["currentScore", "recent4MonthScore"]);

// F: sparse/foreign flags remain evidence; rates and JSJ067 never move the value.
const controlRaw = rawParticipant({ number: 1, registration: "020001", className: "S2", currentScore: 100, recent4MonthScore: 100 });
const flaggedRaw = rawParticipant({ number: 2, registration: "020002", className: "S2", currentScore: 100, recent4MonthScore: 100 });
flaggedRaw.sparseSampleFlag = true;
flaggedRaw.officialForeignFlag = true;
flaggedRaw.officialProfile.winRate = 100;
flaggedRaw.officialProfile.quinellaRate = 100;
flaggedRaw.officialProfile.trioRate = 100;
flaggedRaw.officialProfile.scoreHistory = [{
  date: "26/07/01", recent4MonthScore: 1, currentTermScore: 1,
  sourceType: "JSJ067", sourcePath: "tokutenList[0]", requestedRegistration: "020002"
}];
const flaggedRace = adaptParticipantsForPrediction([controlRaw, flaggedRaw], {
  raceDate: "20260807", raceStartTime: "20:00", raceCategory: "standard"
});
assert.equal(flaggedRace[0].recentForm, flaggedRace[1].recentForm);
assert.equal(flaggedRace[1].recentFormEvidence.sparseSampleFlag, true);
assert.equal(flaggedRace[1].recentFormEvidence.foreignFlag, true);
assert.equal(flaggedRace[1].recentFormEvidence.confidence, "low");

// A/B: real adjacent scores remain close under the robust continuous scale.
const toyohashi521 = toyohashiAdapted.find(item => item.number === 5);
const toyohashi522 = toyohashiAdapted.find(item => item.number === 2);
assert.equal(toyohashi521.recentFormEvidence.selectedScore, 52.21);
assert.equal(toyohashi522.recentFormEvidence.selectedScore, 52.22);
assert.ok(Math.abs(toyohashi522.recentForm - toyohashi521.recentForm) < 0.25);
const utsunomiya9350 = utsunomiyaAdapted.find(item => item.number === 3);
const utsunomiya9354 = utsunomiyaAdapted.find(item => item.number === 2);
assert.ok(Math.abs(utsunomiya9354.recentForm - utsunomiya9350.recentForm) < 0.25);

// C/D/G: exact ties remain exact, including IQR=0, while one outlier moves only gently.
const allEqual = scoreRace([50, 50, 50, 50, 50, 50, 50]);
assert.deepEqual(new Set(allEqual.map(item => item.recentForm)).size, 1);
assert.equal(allEqual[0].recentForm, 5);
assert.ok(allEqual.every(item => item.recentFormEvidence.raceIqr === 0));
assert.ok(allEqual.every(item => Number.isFinite(item.recentForm)));
const sixEqualOneHigh = scoreRace([50, 50, 50, 50, 50, 50, 60]);
assert.equal(new Set(sixEqualOneHigh.slice(0, 6).map(item => item.recentForm)).size, 1);
assert.ok(sixEqualOneHigh[6].recentForm > sixEqualOneHigh[0].recentForm);
assert.ok(sixEqualOneHigh[6].recentForm - sixEqualOneHigh[0].recentForm < 1);

// E: smaller total spreads are progressively shrunk closer to neutral five.
const spread005 = scoreRace([50, 50.008, 50.017, 50.025, 50.033, 50.042, 50.05]);
const spread01 = scoreRace([50, 50.017, 50.033, 50.05, 50.067, 50.083, 50.1]);
const spread05 = scoreRace([50, 50.083, 50.167, 50.25, 50.333, 50.417, 50.5]);
assert.ok(valueRange(spread005) < valueRange(spread01));
assert.ok(valueRange(spread01) < valueRange(spread05));
assert.ok(maxAdjacentDifference(spread005) < 0.2);
assert.ok(maxAdjacentDifference(spread01) < 0.2);
assert.ok(maxAdjacentDifference(spread05) < 0.5);

// F: two, three, and four valid scores cannot create extreme race-relative values.
const valid2 = scoreRace([50, 50.01, null, null, null, null, null]);
const valid3 = scoreRace([50, 50.01, 50.02, null, null, null, null]);
const valid4 = scoreRace([50, 50.01, 50.02, 50.03, null, null, null]);
for (const race of [valid2, valid3, valid4]) {
  assert.ok(race.filter(item => item.recentFormEvidence.selectedScore !== null).every(item => item.recentForm > 4.5 && item.recentForm < 5.5));
  assert.ok(race.filter(item => item.recentFormEvidence.selectedScore === null).every(item => item.recentForm === 5));
}
assert.ok(valid2.every(item => item.recentFormEvidence.confidence === "low"));
assert.ok(valid3.every(item => item.recentFormEvidence.confidence === "low"));

// H: an official zero is valid, remains selected, and is never counted as missing.
const actualZero = scoreRace([0, 0, 48, 49, 50, 51, 52]);
assert.equal(actualZero[0].recentFormEvidence.selectedScore, 0);
assert.equal(actualZero[0].recentFormEvidence.recentScoreIsActualZero, true);
assert.equal(actualZero[0].recentFormEvidence.missingInputs.includes("recent4MonthScore"), false);
assert.equal(actualZero[0].recentForm, actualZero[1].recentForm);

// I: currentScore is a separate fallback population and can never become high confidence.
const currentFallback = scoreRace([80, 82, 84, 86, 88, 90, 92], { currentOnly: true });
assert.ok(currentFallback.every(item => item.recentFormEvidence.selectedMetric === "currentScore"));
assert.ok(currentFallback.every(item => item.recentFormEvidence.confidence === "medium"));
assert.ok(currentFallback.every(item => item.recentFormEvidence.missingInputs.includes("recent4MonthScore")));

// J: invalid official evidence is excluded from the race population and remains neutral.
const invalidProfiles = scoreRace([50, 51, 52, 53, 54, 55, 56], { identityPassed: false });
assert.ok(invalidProfiles.every(item => item.recentForm === 5));
assert.ok(invalidProfiles.every(item => item.recentFormEvidence.confidence === "low"));
assert.ok(invalidProfiles.every(item => item.recentFormEvidence.profileIdentityPassed === false));

// K: class assistance cannot split ties or reverse selectedScore order.
const mixedClass = scoreRace([98.32, 98.77, 99, 99, 100, 101, 102], {
  classes: ["S2", "S2", "S2", "S1", "S2", "S1", "S2"]
});
const mixedSorted = [...mixedClass].sort((left, right) => left.recentFormEvidence.selectedScore - right.recentFormEvidence.selectedScore);
for (let index = 1; index < mixedSorted.length; index += 1) {
  assert.ok(mixedSorted[index].recentForm >= mixedSorted[index - 1].recentForm);
}
const tied99 = mixedClass.filter(item => item.recentFormEvidence.selectedScore === 99);
assert.equal(tied99.length, 2);
assert.equal(tied99[0].recentForm, tied99[1].recentForm);
assert.ok(mixedClass.every(item => Math.abs(item.recentFormEvidence.classAdjustment) <= 0.2));

// Evidence exposes every input and shrinkage component needed for an audit.
for (const field of [
  "value", "confidence", "selectedMetric", "selectedScore", "raceMedian", "raceIqr",
  "validCount", "validRate", "uniqueCount", "continuousScore", "qualityFactor",
  "classPercentile", "classAdjustment", "sparseSampleFlag", "foreignFlag",
  "inputsUsed", "missingInputs", "baselineVersion", "baselineSchemaVersion"
]) assert.ok(Object.hasOwn(toyohashi521.recentFormEvidence, field), `missing evidence field: ${field}`);

// Only recentForm changes; all other ability axes retain their existing neutral values.
for (const participant of toyohashiAdapted) {
  for (const field of [
    "startPower", "sprintPower", "stamina", "attackTiming", "trackingSkill",
    "finishPower", "lineTrust", "venueSuitability"
  ]) assert.equal(participant[field], 5, `${field} must remain unchanged`);
}

// Integrated and modules paths produce identical participants and baseline data.
const moduleFunctions = await import("../modules/keirin/netlify/functions/keirin-predict.mjs");
const moduleBaseline = await import("../modules/keirin/config/recent-form-baseline-v1.mjs");
assert.deepEqual(
  moduleFunctions.adaptParticipantsForPrediction(toyohashiRaw, toyohashiContext),
  toyohashiAdapted
);
assert.deepEqual(moduleBaseline.KEIRIN_RECENT_FORM_BASELINE, KEIRIN_RECENT_FORM_BASELINE);

console.log(JSON.stringify({
  toyohashi: toyohashiAdapted.map(summary),
  utsunomiyaA2: [a2Number6, a2Number7].map(summary)
}, null, 2));
console.log("keirin recent form: ok");

async function fixture(name) {
  return JSON.parse(await readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
}

function contextFor(data, raceCategory = null) {
  return {
    raceDate: data.request.date,
    raceStartTime: data.basic.startTime,
    raceCategory: raceCategory || detectRaceCategory({ basic: data.basic, participants: data.participants })
  };
}

function rawParticipant(profile) {
  return {
    number: profile.number,
    registration: profile.registration,
    className: profile.className,
    style: profile.style || "",
    score: null,
    escapeCount: null,
    makuriCount: null,
    differenceCount: null,
    markCount: null,
    backCount: null,
    sourceType: "JSJ038",
    sourcePath: `$.participants[${profile.number - 1}]`,
    officialTotalStarts: 20,
    officialProfile: {
      identityPassed: true,
      registration: profile.registration,
      fetchedAt: "2026-08-07T05:00:00.000Z",
      sourceUpdatedAt: "2026-08-07T03:06:00.000Z",
      sourceType: "KEIRIN.JP-PC-PROFILE",
      sourcePath: `/pc/racerprofile?snum=${profile.registration}`,
      ridingStyle: profile.style || null,
      currentScore: profile.currentScore,
      recent4MonthScore: profile.recent4MonthScore,
      backCount: profile.backCount ?? null,
      homeCount: profile.homeCount ?? null,
      winRate: profile.winRate ?? null,
      quinellaRate: profile.quinellaRate ?? null,
      trioRate: profile.trioRate ?? null,
      rateUnit: "percent",
      winningStyleRates: {
        escape: profile.rates?.[0] ?? null,
        makuri: profile.rates?.[1] ?? null,
        difference: profile.rates?.[2] ?? null,
        mark: profile.rates?.[3] ?? null
      },
      scoreHistory: []
    }
  };
}

function summary(participant) {
  return {
    number: participant.number,
    className: participant.className,
    currentScore: participant.officialProfileEvidence?.currentScore ?? null,
    recent4MonthScore: participant.officialProfileEvidence?.recent4MonthScore ?? null,
    recentForm: participant.recentForm,
    confidence: participant.recentFormEvidence.confidence,
    ...participant.recentFormEvidence
  };
}

function scoreRace(scores, {
  currentOnly = false,
  identityPassed = true,
  classes = []
} = {}) {
  return applyRecentFormEvidence(scores.map((score, index) => ({
    number: index + 1,
    registration: String(index + 1).padStart(6, "0"),
    className: classes[index] || "L1",
    raceCategory: classes[index]?.startsWith("S") ? "standard" : "girls",
    officialTotalStarts: 20,
    sparseSampleFlag: false,
    officialForeignFlag: false,
    officialProfileEvidence: identityPassed ? {
      identityPassed: true,
      currentScore: currentOnly ? score : score,
      recent4MonthScore: currentOnly ? null : score
    } : null
  })));
}

function valueRange(participants) {
  const values = participants.map(item => item.recentForm);
  return Math.max(...values) - Math.min(...values);
}

function maxAdjacentDifference(participants) {
  const sorted = [...participants].sort((left, right) => left.recentFormEvidence.selectedScore - right.recentFormEvidence.selectedScore);
  return Math.max(...sorted.slice(1).map((item, index) => item.recentForm - sorted[index].recentForm));
}
