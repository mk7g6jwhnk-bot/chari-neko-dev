import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { adaptParticipant, buildLineText } from "../netlify/functions/keirin-predict.mjs";
import { inferLines } from "../keirin/parser/line-parser.mjs";
import { runKeirinEngine } from "../keirin/engine/keirin-engine.mjs";

const fixture = JSON.parse(await readFile(
  new URL("./fixtures/keirin-browser-official-lines.json", import.meta.url),
  "utf8"
));
const { participants: rawParticipants, lines } = fixture.officialData;

assert.equal(lines.length, 7, "Railway response lines must be preserved");
const lineText = buildLineText(lines);
assert.equal(lineText, "17 652 43", "sparse official positions must delimit line groups");

const participants = rawParticipants.map(adaptParticipant);
assert.deepEqual(participants.map(item => item.id), ["1", "2", "3", "4", "5", "6", "7"]);

const inferred = inferLines({ participants, lineText });
assert.equal(inferred.confidence, "高");
assert.equal(new Set(inferred.participants.map(item => item.lineId)).size, 3);

const prediction = runKeirinEngine({
  race: {
    id: "20260807-45-2",
    venue: "豊橋",
    venueCode: "45",
    date: "20260807",
    raceNo: 2,
    lineConfidence: inferred.confidence,
    participants: inferred.participants
  },
  oddsByOrder: {}
});
assert.ok(prediction.branches.length > 0, "official lines must enable branches");
assert.ok(prediction.terminals.length > 0, "participant ids must resolve terminal candidates");
assert.deepEqual(prediction.audit.errors, []);

const moduleFunctions = await import("../modules/keirin/netlify/functions/keirin-predict.mjs");
assert.equal(moduleFunctions.buildLineText(lines), lineText, "module behavior must match integrated behavior");
assert.deepEqual(rawParticipants.map(moduleFunctions.adaptParticipant).map(item => item.id), participants.map(item => item.id));

console.log("keirin-predict official lines fixture: ok");
