
import assert from"node:assert/strict";import{parseRaceIndexHtml}from"../parser/raceindex-parser.mjs";import{parseScheduleHtml}from"../parser/schedule-parser.mjs";
const schedule=parseScheduleHtml(`<a href="/owpc/pc/race/raceindex?hd=20260801&jcd=18">徳山</a>`,"20260801");assert.equal(schedule.venues[0].name,"徳山");
const races=parseRaceIndexHtml(`<table><tr><td>1R</td><td>09:10</td></tr><tr><td>2R</td><td>09:40</td></tr></table>`,5);assert.equal(races.races[0].purchaseDeadline,"09:05");
console.log("Integrated app tests passed.");
