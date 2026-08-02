
import * as cheerio from "cheerio";
import { normalizeText } from "./utils.mjs";

export function parseRaceListHtml(html, context = {}) {
  const $ = cheerio.load(html), found = new Map();

  $("table tr").each((_, row) => {
    const cells = $(row).find("th,td").toArray().map(c=>normalizeText($(c).text()));
    const full = cells.join(" | ");
    const lane = cells.slice(0,3).map(Number).find(n=>n>=1&&n<=6)
      ?? Number(full.match(/(?:^|\|)\s*([1-6])\s*(?:\||$)/)?.[1]);
    const registration = full.match(/\b(\d{4})\b/)?.[1];
    const className = full.match(/\b([AB]\d)\b/)?.[1];
    if (!lane || !registration) return;

    const values = cells.flatMap(x => [...x.matchAll(/\d+(?:\.\d+)?/g)].map(m=>Number(m[0])));
    const name = cells.map(x=>x.replace(registration,"").replace(className||"","").trim())
      .find(x=>/^[一-龠々ヶヵぁ-んァ-ヶー\s]{2,}$/.test(x))
      || `登録${registration}`;

    found.set(lane, {
      id:`B${lane}`,
      number:lane,
      course:lane,
      registration,
      className,
      name,
      avgSt:values.find(v=>v>=.05&&v<=.30)??null,
      nationalWinRate:values.find(v=>v>=2&&v<=10)??null,
      localWinRate:values.filter(v=>v>=2&&v<=10)[1]??null,
      motorTwoRate:values.find(v=>v>20&&v<=100)??null,
      boatTwoRate:values.filter(v=>v>20&&v<=100)[1]??null
    });
  });

  const participants=[...found.values()].sort((a,b)=>a.number-b.number);
  return {ok:participants.length===6,participants,diagnostics:{participantCount:participants.length,context}};
}
