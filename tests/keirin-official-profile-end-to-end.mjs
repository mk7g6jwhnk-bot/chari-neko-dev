import assert from "node:assert/strict";
import handler from "../netlify/functions/keirin-predict.mjs";

const originalFetch = globalThis.fetch;
const originalBase = process.env.KEIRIN_BROWSER_SERVICE_URL;
process.env.KEIRIN_BROWSER_SERVICE_URL = "https://fixture.browser";

const participants = Array.from({ length: 7 }, (_, index) => {
  const number = index + 1;
  const registration = `2800${String(number).padStart(2, "0")}`;
  return {
    number, registration, name: `選手${number}`, score: 90 + number,
    escapeCount: number % 3, makuriCount: number % 4, differenceCount: number % 2, markCount: (number + 1) % 3,
    identityPassed: true,
    officialProfile: number === 1 ? {
      registration, identityPassed: true, fetchedAt: "2026-08-08T00:00:00Z", sourceType: "official-profile",
      officialTotalStarts: 24, backCount: 0, homeCount: 0,
      currentScore: 91, recent4MonthScore: 90, winningStyleRates: { escape: 0, makuri: 0, difference: 0, mark: 0 }
    } : number === 2 ? null : {
      registration, identityPassed: true, fetchedAt: "2026-08-08T00:00:00Z", sourceType: "official-profile",
      officialTotalStarts: 20 + number, backCount: number % 5, homeCount: (number + 1) % 5,
      currentScore: 90 + number, recent4MonthScore: 89 + number, winningStyleRates: { escape: 10, makuri: 20, difference: 30, mark: 40 }
    }
  };
});

globalThis.fetch = async () => new Response(JSON.stringify({
  ok: true,
  officialData: {
    basic: { venueName: "立川", date: "2026/08/09", raceNo: 3, startTime: "12:00", className: "A級" },
    participants,
    lines: [{ number: 1, lineId: "1", position: 1 }, { number: 2, lineId: "1", position: 2 }, { number: 3, lineId: "2", position: 1 }, { number: 4, lineId: "2", position: 2 }, { number: 5, lineId: "3", position: 1 }, { number: 6, lineId: "3", position: 2 }, { number: 7, lineId: "3", position: 3 }],
    odds: { ok: false, odds: {} }
  },
  audit: { identityPassed: true }
}), { status: 200, headers: { "content-type": "application/json" } });

try {
  const response = await handler(new Request("https://app/.netlify/functions/keirin-predict?date=20260809&venueCode=28&venueName=%E7%AB%8B%E5%B7%9D&raceNo=3&budget=3000"));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.dataQuality.officialProfileEvidenceCount, 6, "only the genuinely missing official profile is excluded");
  const observedZero = payload.prediction.scored.find(item => item.number === 1);
  const missing = payload.prediction.scored.find(item => item.number === 2);
  assert.equal(observedZero.startPower, 2.649);
  assert.deepEqual(observedZero.startPowerEvidence.missingInputs, []);
  assert.equal(missing.startPower, 5);
  assert.ok(missing.startPowerEvidence.missingInputs.includes("verifiedOfficialProfile"));
  assert.notDeepEqual(observedZero.startPowerEvidence.missingInputs, missing.startPowerEvidence.missingInputs);
  assert.equal(observedZero.scoreTrace.first.find(item => item.key === "startPower").value, 2.649);
  const lead = payload.prediction.branches.find(item => Number(item.requiredFirstNumber) === 1);
  assert.ok(lead, "the observed-zero leader must generate a structural branch");
  assert.equal(lead.scoreTrace.find(item => item.key === "first").value, observedZero.roleScores.first);
  assert.ok(payload.prediction.terminals.length > 0);
  console.log("official-profile DB-free end-to-end PASS", { startPower: observedZero.startPower, branches: payload.prediction.branches.length, terminals: payload.prediction.terminals.length });
} finally {
  globalThis.fetch = originalFetch;
  if (originalBase === undefined) delete process.env.KEIRIN_BROWSER_SERVICE_URL;
  else process.env.KEIRIN_BROWSER_SERVICE_URL = originalBase;
}
