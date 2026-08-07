import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  adaptParticipant,
  buildLineText,
  detectRaceCategory
} from "../netlify/functions/keirin-predict.mjs";

const fixture = JSON.parse(await readFile(new URL(
  "./fixtures/keirin-browser-toyohashi10-profile.json",
  import.meta.url
), "utf8"));
const context = {
  raceDate: fixture.request.date,
  raceStartTime: fixture.basic.startTime,
  raceCategory: detectRaceCategory({ basic: fixture.basic, participants: fixture.participants })
};

function rawParticipant(profile, overrides = {}) {
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
    currentMeetingResults: [
      { rawFinish: String((profile.number % 3) + 1), specialStatus: null, backToriRaw: "", sourceType: "JSJ038" },
      { rawFinish: profile.number === 1 ? "欠" : "2", specialStatus: profile.number === 1 ? "欠" : null, backToriRaw: "", sourceType: "JSJ038" }
    ],
    recentMeetingResults: [{
      meetingName: "公式過去開催",
      meetingDate: "20260727",
      sourceType: "JSJ038",
      sourcePath: `$.sensyuTypeInfo[${profile.number - 1}].tyoInfoSubData[0]`,
      results: [{ rawFinish: "3補", specialStatus: "3補", backToriRaw: "", sourceType: "JSJ038" }]
    }],
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
      scoreHistory: [
        { date: "26/07/27", recent4MonthScore: profile.recent4MonthScore, currentTermScore: profile.currentScore, sourceType: "JSJ067", sourcePath: "tokutenList[0]", requestedRegistration: profile.registration },
        { date: "26/08/08", recent4MonthScore: 99, currentTermScore: 99, sourceType: "JSJ067", sourcePath: "tokutenList[1]", requestedRegistration: profile.registration }
      ]
    },
    ...overrides
  };
}

// A: explicit missing values stay missing and derived axes remain neutral.
const missing = adaptParticipant(rawParticipant(fixture.participants[0]), context);
assert.deepEqual(
  Object.values(missing.legacyOfficialMetrics).slice(0, 6),
  [null, null, null, null, null, null]
);
for (const field of ["recentForm", "startPower", "sprintPower", "stamina", "attackTiming", "trackingSkill", "finishPower", "lineTrust"]) {
  assert.equal(missing[field], 5, field);
}
const emptyAndUndefined = adaptParticipant(rawParticipant(fixture.participants[0], {
  score: " ", escapeCount: "", makuriCount: undefined
}), context);
assert.equal(emptyAndUndefined.legacyOfficialMetrics.score, null);
assert.equal(emptyAndUndefined.legacyOfficialMetrics.escapeCount, null);
assert.equal(emptyAndUndefined.legacyOfficialMetrics.makuriCount, null);

// B: real zero is retained as zero, not missing.
const zero = adaptParticipant(rawParticipant(fixture.participants[0], {
  score: 0, escapeCount: 0, makuriCount: 0,
  differenceCount: 0, markCount: 0, backCount: 0
}), context);
assert.deepEqual(
  Object.values(zero.legacyOfficialMetrics).slice(0, 6),
  [0, 0, 0, 0, 0, 0]
);
assert.equal(zero.recentForm, 4.5);

// C: verified profile is adopted with provenance and without legacy-field aliasing.
assert.equal(missing.officialProfileStatus.adopted, true);
assert.equal(missing.officialProfileEvidence.currentScore, 50.33);
assert.equal(missing.officialProfileEvidence.backCount, 3);
assert.equal(missing.legacyOfficialMetrics.backCount, null);
assert.equal(missing.officialProfileEvidence.fieldSources.currentScore.officialField, "currentScore");
assert.equal(missing.officialProfileEvidence.scoreHistory.length, 1, "future score history must be removed");

// D/E/F: identity, registration and time failures are rejected.
const mismatch = adaptParticipant(rawParticipant(fixture.participants[0], {
  officialProfile: { ...rawParticipant(fixture.participants[0]).officialProfile, registration: "999999" }
}), context);
assert.deepEqual(mismatch.officialProfileStatus, { adopted: false, reason: "registration-mismatch" });
assert.equal(mismatch.officialProfileEvidence, null);
const failedIdentity = adaptParticipant(rawParticipant(fixture.participants[0], {
  officialProfile: { ...rawParticipant(fixture.participants[0]).officialProfile, identityPassed: false }
}), context);
assert.equal(failedIdentity.officialProfileStatus.reason, "identity-failed");
const future = adaptParticipant(rawParticipant(fixture.participants[0], {
  officialProfile: { ...rawParticipant(fixture.participants[0]).officialProfile, sourceUpdatedAt: "2026-08-07T11:00:00.000Z" }
}), context);
assert.equal(future.officialProfileStatus.reason, "profile-from-future");

// G/H/I/J: all Toyohashi riders keep differentiated profiles and raw JSJ038 results.
const adapted = fixture.participants.map(profile => adaptParticipant(rawParticipant(profile), context));
assert.equal(context.raceCategory, "girls");
assert.equal(adapted.length, 7);
assert.equal(adapted.filter(item => item.officialProfileStatus.adopted).length, 7);
assert.ok(new Set(adapted.map(item => item.officialProfileEvidence.currentScore)).size > 1);
assert.ok(new Set(adapted.map(item => item.officialProfileEvidence.trioRate)).size > 1);
for (const participant of adapted) {
  assert.equal(participant.raceCategory, "girls");
  assert.equal(participant.officialRecentResults.currentMeetingResults.length, 2);
  assert.equal(participant.officialRecentResults.recentMeetingResults.length, 1);
  assert.equal(participant.officialRecentResults.usableRecentMeetingResults.length, 1);
}
assert.equal(adapted[0].officialRecentResults.currentMeetingResults[1].rawFinish, "欠");
assert.equal(adapted[0].officialRecentResults.currentMeetingResults[1].specialStatus, "欠");
assert.equal(adapted[0].officialRecentResults.recentMeetingResults[0].results[0].rawFinish, "3補");
assert.equal(typeof adapted[0].officialRecentResults.recentMeetingResults[0].results[0].rawFinish, "string");

// K: official line formatting is unchanged.
assert.equal(buildLineText(fixture.lines), "17 652 43");

// Integrated and module adapters must not diverge.
const moduleFunctions = await import("../modules/keirin/netlify/functions/keirin-predict.mjs");
assert.deepEqual(
  moduleFunctions.adaptParticipant(rawParticipant(fixture.participants[0]), context),
  missing
);
assert.equal(moduleFunctions.buildLineText(fixture.lines), "17 652 43");

console.log("keirin participant official profile adapter: ok");
