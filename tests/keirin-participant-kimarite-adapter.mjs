import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  adaptParticipant,
  adaptParticipantsForPrediction
} from "../netlify/functions/keirin-predict.mjs";

const profileFixture = JSON.parse(await readFile(new URL(
  "./fixtures/keirin-browser-toyohashi10-profile.json",
  import.meta.url
), "utf8"));
const kimariteFixture = JSON.parse(await readFile(new URL(
  "./fixtures/keirin-official-kimarite-toyohashi10.json",
  import.meta.url
), "utf8"));
const context = {
  raceDate: kimariteFixture.target.date,
  raceStartTime: profileFixture.basic.startTime,
  venueCode: kimariteFixture.target.venueCode,
  raceNo: kimariteFixture.target.raceNo,
  raceCategory: "girls"
};

const rawParticipants = profileFixture.participants.map((profile, index) =>
  rawParticipant(profile, kimariteFixture.participants[index])
);
const withoutKimarite = rawParticipants.map(item => {
  const copy = structuredClone(item);
  delete copy.officialKimariteCounts;
  return copy;
});

const before = adaptParticipantsForPrediction(withoutKimarite, context);
const after = adaptParticipantsForPrediction(rawParticipants, context);
assert.equal(after.length, 7);
assert.equal(after.filter(item => item.officialKimariteEvidence.status === "adopted").length, 7);

const expectedTotals = new Map([
  ["015313", [1, 1, 1, 0, 3]],
  ["015671", [0, 0, 4, 6, 10]],
  ["016027", [1, 0, 1, 0, 2]],
  ["015401", [1, 1, 2, 1, 5]],
  ["015319", [2, 1, 2, 5, 10]],
  ["015410", [0, 11, 2, 1, 14]],
  ["015853", [2, 5, 4, 2, 13]]
]);

for (let index = 0; index < after.length; index += 1) {
  const participant = after[index];
  const evidence = participant.officialKimariteEvidence;
  assert.deepEqual([
    evidence.nige.totalCount,
    evidence.makuri.totalCount,
    evidence.sasi.totalCount,
    evidence.mark.totalCount,
    evidence.totalQuinellaCount
  ], expectedTotals.get(participant.registration));
  for (const key of ["nige", "makuri", "sasi", "mark"]) {
    assert.equal(
      evidence[key].firstCount + evidence[key].secondCount,
      evidence[key].totalCount
    );
    assert.equal(evidence.fieldSources[key].sourceType, "JSJ068");
  }
  assert.equal(evidence.target.date, "20260807");
  assert.equal(evidence.target.venueCode, "45");
  assert.equal(evidence.target.raceNo, 10);
  assert.equal(after[index].recentForm, before[index].recentForm);
  assert.deepEqual(after[index].recentFormEvidence, before[index].recentFormEvidence);
  assert.equal(after[index].startPower, before[index].startPower);
  assert.deepEqual(after[index].startPowerEvidence, before[index].startPowerEvidence);
}

const rider6 = after.find(item => item.registration === "015410");
assert.deepEqual(rider6.officialKimariteEvidence.makuri, {
  firstCount: 8,
  secondCount: 3,
  totalCount: 11
});

const base = rawParticipants[0];
assertStatus(withEvidence(base, { identityPassed: false }), "identity_mismatch");
assertStatus(withEvidence(base, { targetIdentityPassed: false }), "target_mismatch");
assertStatus(withEvidence(base, { registration: "999999" }), "identity_mismatch");
assertStatus(withEvidence(base, { requestedRegistration: "999999" }), "identity_mismatch");
assertStatus(withEvidence(base, { date: "20260806" }), "target_mismatch");
assertStatus(withEvidence(base, { venueCode: "55" }), "target_mismatch");
assertStatus(withEvidence(base, { raceNo: 9 }), "target_mismatch");
assertStatus(withEvidence(base, { fetchedAt: "2026-08-07T11:00:00.000Z" }), "future_source");
assertStatus(withEvidence(base, { fetchedAt: "invalid" }), "unavailable");
assertStatus(withEvidence(base, { sourceType: "JSJ012" }), "unavailable");
assertStatus(withEvidence(base, {
  makuri: { ...base.officialKimariteCounts.makuri, totalCount: 2 }
}), "invalid_counts");
assertStatus(withEvidence(base, { totalQuinellaCount: 4 }), "invalid_counts");

const zero = adaptParticipant(base, context).officialKimariteEvidence;
assert.deepEqual(zero.mark, { firstCount: 0, secondCount: 0, totalCount: 0 });
for (const invalid of [null, undefined, "", " ", -1, 1.5, "not-a-number"]) {
  assertStatus(withEvidence(base, {
    nige: { ...base.officialKimariteCounts.nige, firstCount: invalid }
  }), "invalid_counts");
}

const missing = adaptParticipant(withoutKimarite[0], context);
const standaloneWithEvidence = adaptParticipant(base, context);
assert.equal(missing.officialKimariteEvidence.status, "missing");
assert.equal(missing.recentForm, standaloneWithEvidence.recentForm);
assert.deepEqual(missing.recentFormEvidence, standaloneWithEvidence.recentFormEvidence);
assert.equal(missing.startPower, standaloneWithEvidence.startPower);
assert.deepEqual(missing.startPowerEvidence, standaloneWithEvidence.startPowerEvidence);

const moduleFunctions = await import(
  "../modules/keirin/netlify/functions/keirin-predict.mjs"
);
assert.deepEqual(
  moduleFunctions.adaptParticipantsForPrediction(rawParticipants, context),
  after
);

console.log("keirin participant official kimarite evidence adapter: ok");

function assertStatus(raw, expected) {
  assert.equal(
    adaptParticipant(raw, context).officialKimariteEvidence.status,
    expected
  );
}

function withEvidence(raw, overrides) {
  return {
    ...raw,
    officialKimariteCounts: {
      ...raw.officialKimariteCounts,
      ...overrides
    }
  };
}

function rawParticipant(profile, counts) {
  return {
    number: profile.number,
    registration: profile.registration,
    className: profile.className,
    style: profile.style,
    score: null,
    escapeCount: null,
    makuriCount: null,
    differenceCount: null,
    markCount: null,
    backCount: null,
    sourceType: "JSJ038",
    sourcePath: `$.sensyuTypeInfo[${profile.number - 1}]`,
    officialProfile: {
      identityPassed: true,
      registration: profile.registration,
      fetchedAt: "2026-08-07T05:00:00.000Z",
      sourceUpdatedAt: "2026-08-06T22:03:00.000Z",
      sourceType: "KEIRIN.JP-PC-PROFILE",
      sourcePath: `/pc/racerprofile?snum=${profile.registration}`,
      ridingStyle: profile.style,
      currentScore: profile.currentScore,
      recent4MonthScore: profile.recent4MonthScore,
      officialTotalStarts: profile.officialTotalStarts,
      backCount: profile.backCount,
      homeCount: profile.homeCount,
      winRate: profile.winRate,
      quinellaRate: profile.quinellaRate,
      trioRate: profile.trioRate,
      rateUnit: "percent",
      winningStyleRates: {
        escape: profile.rates[0],
        makuri: profile.rates[1],
        difference: profile.rates[2],
        mark: profile.rates[3]
      },
      scoreHistory: []
    },
    officialKimariteCounts: {
      identityPassed: true,
      targetIdentityPassed: true,
      requestedRegistration: profile.registration,
      registration: profile.registration,
      date: kimariteFixture.target.date,
      venueCode: kimariteFixture.target.venueCode,
      raceNo: kimariteFixture.target.raceNo,
      fetchedAt: kimariteFixture.target.fetchedAt,
      sourceType: "JSJ068",
      sourcePath: `/pc/json?type=JSJ068&skbn=1&snum=${profile.registration}`,
      nige: group(counts.nige),
      makuri: group(counts.makuri),
      sasi: group(counts.sasi),
      mark: group(counts.mark),
      totalQuinellaCount: counts.total
    }
  };
}

function group(values) {
  return {
    firstCount: values[0],
    secondCount: values[1],
    totalCount: values[2]
  };
}
