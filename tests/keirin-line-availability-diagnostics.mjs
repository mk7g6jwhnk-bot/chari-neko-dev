import assert from "node:assert/strict";
import { deriveLineAvailability } from "../netlify/functions/keirin-predict.mjs";

const participants = Array.from({ length: 7 }, (_, index) => ({ number: index + 1 }));
const official = participants.map((item, index) => ({ number: item.number, position: index + 1, sourceType: "JSJ036" }));

assert.deepEqual(deriveLineAvailability({ raceCategory: "standard", participants, officialLines: [], resolvedLine: { confidence: "低" } }), {
  status: "OFFICIAL_UNAVAILABLE", lineDataAvailable: false, reason: "OFFICIAL_LINE_NOT_PUBLISHED_OR_NOT_FETCHED"
});
assert.equal(deriveLineAvailability({ raceCategory: "standard", participants, officialLines: official, resolvedLine: { confidence: "高" } }).status, "OFFICIAL_CONFIRMED");
assert.equal(deriveLineAvailability({ raceCategory: "standard", participants, officialLines: official, resolvedLine: { confidence: "低" } }).status, "PARSE_FAILED");
assert.equal(deriveLineAvailability({ raceCategory: "girls", participants }).status, "LINE_LESS");
assert.deepEqual(deriveLineAvailability({ raceCategory: "standard", browserAudit: { lineAvailabilityStatus: "FETCH_FAILED", lineDataAvailable: false, failureReason: "timeout" } }), {
  status: "FETCH_FAILED", lineDataAvailable: false, reason: "timeout"
});

console.log("PASS official line availability diagnostics distinguish unavailable/fetch/parse/confirmed/line-less");
