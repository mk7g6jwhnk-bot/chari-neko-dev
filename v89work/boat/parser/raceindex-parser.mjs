
import * as cheerio from "cheerio";
import { normalizeText, timeToMinutes, minutesToTime } from "./utils.mjs";

export function parseRaceIndexHtml(html, leadMinutes = 5, context = {}) {
  const $ = cheerio.load(html);
  const rows = [];

  $("table tr").each((_, row) => {
    const cells = $(row).find("th,td").toArray().map(c => normalizeText($(c).text()));
    if (!cells.length) return;
    const text = cells.join(" | ");
    const raceMatch = text.match(/(?:^|\|)\s*(1[0-2]|[1-9])R?\s*(?:\||$)/);
    const timeMatch = text.match(/\b([0-2]?\d:[0-5]\d)\b/);
    if (!raceMatch || !timeMatch) return;

    const raceNo = Number(raceMatch[1]);
    const officialDeadline = timeMatch[1];
    const officialMinutes = timeToMinutes(officialDeadline);

    rows.push({
      raceNo,
      officialDeadline,
      purchaseDeadline: officialMinutes === null
        ? null
        : minutesToTime(officialMinutes - leadMinutes),
      leadMinutes,
      rawCells:cells
    });
  });

  if (!rows.length) {
    const text = normalizeText($("body").text());
    for (let raceNo=1; raceNo<=12; raceNo++) {
      const regex = new RegExp(`(?:^|\\s)${raceNo}R?\\s+(\\d{1,2}:\\d{2})(?:\\s|$)`);
      const m = text.match(regex);
      if (m) {
        const officialMinutes = timeToMinutes(m[1]);
        rows.push({
          raceNo,
          officialDeadline:m[1],
          purchaseDeadline:officialMinutes===null?null:minutesToTime(officialMinutes-leadMinutes),
          leadMinutes
        });
      }
    }
  }

  return {
    ok:rows.length>0,
    races:rows.sort((a,b)=>a.raceNo-b.raceNo),
    diagnostics:{
      parsedRaceCount:rows.length,
      title:normalizeText($("title").text()),
      context
    }
  };
}
