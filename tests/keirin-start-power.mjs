import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { KEIRIN_START_POWER_BASELINE } from "../keirin/config/start-power-baseline-v1.mjs";
import { applyStartPowerEvidence } from "../keirin/start-power/start-power.mjs";
import { adaptParticipantsForPrediction } from "../netlify/functions/keirin-predict.mjs";

const toyohashi = await fixture("keirin-browser-toyohashi10-profile.json");
const raceFixtures = await fixture("keirin-start-power-races.json");

assert.equal(KEIRIN_START_POWER_BASELINE.schemaVersion, 1);
assert.equal(KEIRIN_START_POWER_BASELINE.priorStrength, 15);
assert.equal(KEIRIN_START_POWER_BASELINE.categories.girls.population, 227);
assert.equal(KEIRIN_START_POWER_BASELINE.categories.standard.population, 1687);

// A: an official zero-start sample is distinct from missing and cannot divide by zero.
const starts0 = synthetic(0, 0, 0)[0];
assert.equal(starts0.startPower, 5);
assert.equal(starts0.startPowerEvidence.confidence, "low");
assert.equal(starts0.startPowerEvidence.sparseSampleFlag, true);
assert.equal(starts0.startPowerEvidence.bFrequency, null);
assert.equal(starts0.startPowerEvidence.hFrequency, null);
assert.ok(Number.isFinite(starts0.startPower));

// B-D: sparse perfect frequencies remain strongly shrunk and never approach 9-10.
const starts2 = synthetic(2, 2, 0)[0];
const starts5 = synthetic(5, 5, 5)[0];
const starts10 = synthetic(10, 10, 10)[0];
assert.ok(starts2.startPower > 5 && starts2.startPower < 6);
assert.ok(starts5.startPower > starts2.startPower && starts5.startPower < 7);
assert.ok(starts10.startPower > starts5.startPower && starts10.startPower < 8);
assert.equal(starts10.startPowerEvidence.sparseSampleFlag, true);
assert.equal(starts10.startPowerEvidence.confidence, "low");

// E/F: 25 starts permits evidence-driven movement but never hard-pins to either boundary.
const fullHigh = synthetic(25, 25, 25)[0];
const fullZero = synthetic(25, 0, 0)[0];
assert.ok(fullHigh.startPower > 7 && fullHigh.startPower < 9.5);
assert.ok(fullZero.startPower > 0 && fullZero.startPower < 5);
assert.equal(fullHigh.startPowerEvidence.confidence, "high");

// G/H: one-sided B/H evidence is integrated as one correlated latent factor.
const bHigh = synthetic(25, 25, 0)[0];
const hHigh = synthetic(25, 0, 25)[0];
assert.ok(bHigh.startPower > 3 && bHigh.startPower < 8);
assert.ok(hHigh.startPower > 3 && hHigh.startPower < 8);
assert.ok(bHigh.startPower < fullHigh.startPower);
assert.ok(hHigh.startPower < fullHigh.startPower);

// I/J: equal evidence is exactly equal, and another extreme participant cannot move it.
const equalPair = applyStartPowerEvidence([
  participantEvidence(20, 4, 5), participantEvidence(20, 4, 5)
]);
assert.equal(equalPair[0].startPower, equalPair[1].startPower);
const stableBefore = applyStartPowerEvidence([participantEvidence(20, 4, 5)])[0].startPower;
const stableAfter = applyStartPowerEvidence([
  participantEvidence(20, 4, 5), participantEvidence(25, 25, 25)
])[0].startPower;
assert.equal(stableAfter, stableBefore);

// Missing verified inputs remain neutral; a real zero count remains a used value.
const missing = applyStartPowerEvidence([participantEvidence(null, 0, 0)])[0];
assert.equal(missing.startPower, 5);
assert.ok(missing.startPowerEvidence.missingInputs.includes("officialTotalStarts"));
assert.deepEqual(fullZero.startPowerEvidence.missingInputs, []);
assert.equal(fullZero.startPowerEvidence.rawBackCount, 0);
const invalidProfile = applyStartPowerEvidence([{
  raceCategory: "standard", officialForeignFlag: false, officialProfileEvidence: null
}])[0];
assert.equal(invalidProfile.startPower, 5);
assert.equal(invalidProfile.startPowerEvidence.confidence, "low");
const missingBack = applyStartPowerEvidence([participantEvidence(25, null, 2)])[0];
assert.equal(missingBack.startPower, 5);
assert.ok(missingBack.startPowerEvidence.missingInputs.includes("backCount"));

// Foreign/style/escape evidence can restrict confidence or explain consistency, but cannot move the value.
const foreignHighEvidence = participantEvidence(25, 25, 25);
foreignHighEvidence.officialForeignFlag = true;
const foreignHigh = applyStartPowerEvidence([foreignHighEvidence])[0];
assert.equal(foreignHigh.startPower, fullHigh.startPower);
assert.equal(foreignHigh.startPowerEvidence.confidence, "medium");
const styleEscapeVariant = participantEvidence(25, 25, 25);
styleEscapeVariant.officialProfileEvidence.ridingStyle = "追";
styleEscapeVariant.officialProfileEvidence.winningStyleRates.escape = 100;
const variedEvidence = applyStartPowerEvidence([styleEscapeVariant])[0];
assert.equal(variedEvidence.startPower, fullHigh.startPower);

// K: Toyohashi girls use the verified profile counts and remain distinct from recent form.
const toyohashiAdapted = adaptRace(
  toyohashi.participants,
  { raceDate: toyohashi.request.date, raceStartTime: toyohashi.basic.startTime, raceCategory: "girls" }
);
assert.equal(toyohashiAdapted.length, 7);
assert.ok(toyohashiAdapted.every(item => item.startPowerEvidence.raceCategory === "girls"));
assert.ok(toyohashiAdapted.every(item => item.startPowerEvidence.missingInputs.length === 0));
assert.deepEqual(
  toyohashiAdapted.map(item => item.recentForm),
  [1.869, 5.335, 0.7, 2.584, 5.176, 8.236, 8.536]
);

// L: an A-grade race uses the standard baseline without class-score adjustment.
const utsunomiya = raceFixtures.utsunomiya7;
const utsunomiyaAdapted = adaptRace(utsunomiya.participants, {
  raceDate: utsunomiya.request.date,
  raceStartTime: utsunomiya.basic.startTime,
  raceCategory: "standard"
});
assert.equal(utsunomiyaAdapted.length, 7);
assert.ok(utsunomiyaAdapted.every(item => item.startPowerEvidence.raceCategory === "standard"));
assert.deepEqual(
  utsunomiyaAdapted.map(item => item.recentForm),
  [9.454, 8.288, 8.12, 5.069, 4.703, 2.654, 0.7]
);

// M: the nine-start foreign rider is calculated normally but strongly shrunk and low confidence.
const wakayama = raceFixtures.wakayama12;
const wakayamaAdapted = adaptRace(wakayama.participants, {
  raceDate: wakayama.request.date,
  raceStartTime: wakayama.basic.startTime,
  raceCategory: "standard"
});
const foreign = wakayamaAdapted.find(item => item.number === 2);
assert.equal(foreign.startPowerEvidence.officialTotalStarts, 9);
assert.equal(foreign.startPowerEvidence.foreignFlag, true);
assert.equal(foreign.startPowerEvidence.confidence, "low");
assert.equal(foreign.startPowerEvidence.sparseSampleFlag, true);
assert.ok(foreign.startPower < 7, `foreign sparse startPower was ${foreign.startPower}`);
assert.ok(foreign.startPower < 9.5, "must be lower than the unshrunk audit value");

// N: startPower is not a copy of recentForm in either category.
const girlsCorrelation = spearman(
  toyohashiAdapted.map(item => item.startPower),
  toyohashiAdapted.map(item => item.recentForm)
);
const standardCorrelation = spearman(
  utsunomiyaAdapted.map(item => item.startPower),
  utsunomiyaAdapted.map(item => item.recentForm)
);
assert.ok(Math.abs(girlsCorrelation) < 0.9);
assert.ok(Math.abs(standardCorrelation) < 0.9);
for (const participant of [...toyohashiAdapted, ...utsunomiyaAdapted]) {
  for (const field of [
    "sprintPower", "stamina", "attackTiming", "trackingSkill",
    "finishPower", "lineTrust", "venueSuitability"
  ]) assert.equal(participant[field], 5, `${field} changed unexpectedly`);
}

// Evidence is complete and excludes strength, odds, popularity, line, and result inputs.
for (const field of [
  "value", "confidence", "officialTotalStarts", "rawBackCount", "rawHomeCount",
  "bFrequency", "hFrequency", "shrunkBFrequency", "shrunkHFrequency",
  "latentScore", "startsQuality", "sparseSampleFlag", "raceCategory",
  "ridingStyle", "escapeRate", "foreignFlag", "baselineVersion",
  "baselineSchemaVersion", "inputsUsed", "missingInputs"
]) assert.ok(Object.hasOwn(fullHigh.startPowerEvidence, field), `missing evidence: ${field}`);
for (const forbidden of ["currentScore", "recent4MonthScore", "winRate", "odds", "popularity", "linePosition"]) {
  assert.ok(fullHigh.startPowerEvidence.inputsUsed.every(input => !input.includes(forbidden)));
}

// O: integrated and modules adapters remain byte-for-byte equivalent in behavior.
const moduleFunctions = await import("../modules/keirin/netlify/functions/keirin-predict.mjs");
const moduleBaseline = await import("../modules/keirin/config/start-power-baseline-v1.mjs");
assert.deepEqual(
  moduleFunctions.adaptParticipantsForPrediction(
    toyohashi.participants.map(profile => rawParticipant(profile)),
    { raceDate: toyohashi.request.date, raceStartTime: toyohashi.basic.startTime, raceCategory: "girls" }
  ),
  toyohashiAdapted
);
assert.deepEqual(moduleBaseline.KEIRIN_START_POWER_BASELINE, KEIRIN_START_POWER_BASELINE);

console.log(JSON.stringify({
  synthetic: {
    starts0: summary(starts0), starts2: summary(starts2), starts5: summary(starts5),
    starts10: summary(starts10), fullHigh: summary(fullHigh), fullZero: summary(fullZero),
    bHigh: summary(bHigh), hHigh: summary(hHigh)
  },
  toyohashi: toyohashiAdapted.map(summary),
  utsunomiya: utsunomiyaAdapted.map(summary),
  wakayamaForeign: summary(foreign),
  correlations: { girls: girlsCorrelation, standard: standardCorrelation }
}, null, 2));
console.log("keirin start power: ok");

async function fixture(name) {
  return JSON.parse(await readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
}

function synthetic(starts, back, home, category = "standard") {
  return applyStartPowerEvidence([participantEvidence(starts, back, home, category)]);
}

function participantEvidence(starts, back, home, category = "standard") {
  return {
    number: 1,
    raceCategory: category,
    officialForeignFlag: false,
    officialProfileEvidence: {
      identityPassed: true,
      officialTotalStarts: starts,
      backCount: back,
      homeCount: home,
      ridingStyle: "両",
      winningStyleRates: { escape: 0 }
    }
  };
}

function adaptRace(profiles, context) {
  return adaptParticipantsForPrediction(profiles.map(profile => rawParticipant(profile)), context);
}

function rawParticipant(profile) {
  return {
    number: profile.number,
    registration: profile.registration,
    className: profile.className,
    style: profile.ridingStyle || profile.style || "",
    score: null,
    escapeCount: null,
    makuriCount: null,
    differenceCount: null,
    markCount: null,
    backCount: null,
    sourceType: "JSJ038",
    sourcePath: `$.participants[${profile.number - 1}]`,
    officialForeignFlag: profile.foreignFlag === true,
    officialProfile: {
      identityPassed: true,
      registration: profile.registration,
      fetchedAt: "2026-08-07T05:00:00.000Z",
      sourceUpdatedAt: "2026-08-07T03:00:00.000Z",
      sourceType: "KEIRIN.JP-PC-PROFILE",
      sourcePath: `/pc/racerprofile?snum=${profile.registration}`,
      ridingStyle: profile.ridingStyle || profile.style || null,
      currentScore: profile.currentScore ?? null,
      recent4MonthScore: profile.recent4MonthScore ?? null,
      officialTotalStarts: profile.officialTotalStarts,
      backCount: profile.backCount,
      homeCount: profile.homeCount,
      winRate: profile.winRate ?? null,
      quinellaRate: profile.quinellaRate ?? null,
      trioRate: profile.trioRate ?? null,
      winningStyleRates: {
        escape: profile.escapeRate ?? profile.rates?.[0] ?? null,
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
    registration: participant.registration,
    recentForm: participant.recentForm,
    startPower: participant.startPower,
    ...participant.startPowerEvidence
  };
}

function spearman(left, right) {
  const leftRanks = ranks(left);
  const rightRanks = ranks(right);
  const leftMean = average(leftRanks);
  const rightMean = average(rightRanks);
  let numerator = 0;
  let leftSquare = 0;
  let rightSquare = 0;
  for (let index = 0; index < leftRanks.length; index += 1) {
    const leftDelta = leftRanks[index] - leftMean;
    const rightDelta = rightRanks[index] - rightMean;
    numerator += leftDelta * rightDelta;
    leftSquare += leftDelta ** 2;
    rightSquare += rightDelta ** 2;
  }
  return Math.round(numerator / Math.sqrt(leftSquare * rightSquare) * 1000) / 1000;
}

function ranks(values) {
  return values.map(value => {
    const below = values.filter(candidate => candidate < value).length;
    const equal = values.filter(candidate => candidate === value).length;
    return below + (equal + 1) / 2;
  });
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
