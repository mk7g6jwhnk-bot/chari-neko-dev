
import * as cheerio from "cheerio";
import { normalizeText } from "./utils.mjs";

export function parseBeforeInfoHtml(html, context = {}) {
  const $ = cheerio.load(html), found = new Map();

  $("table tr").each((_, row) => {
    const cells = $(row).find("th,td").toArray().map(c=>normalizeText($(c).text()));
    const full = cells.join(" | ");
    const lane = cells.slice(0,3).map(Number).find(n=>n>=1&&n<=6)
      ?? Number(full.match(/(?:^|\|)\s*([1-6])\s*(?:\||$)/)?.[1]);
    if (!lane) return;

    const exTime = Number(full.match(/\b(6\.\d{2}|7\.\d{2})\b/)?.[1]) || null;
    const stm = full.match(/(?:^|\s)(?:0)?\.(\d{2})(?:\s|$)/);
    const exSt = stm ? Number(`0.${stm[1]}`) : null;
    if (exTime===null && exSt===null) return;

    found.set(lane,{id:`B${lane}`,number:lane,exhibitionTime:exTime,exhibitionSt:exSt});
  });

  const participants=[...found.values()].sort((a,b)=>a.number-b.number);
  const text=normalizeText($("body").text());

  return {
    ok:participants.length===6,
    participants,
    weather:{
      windSpeed:Number(text.match(/風速\s*(\d+(?:\.\d+)?)\s*m/)?.[1])||null,
      waveHeight:Number(text.match(/波高\s*(\d+(?:\.\d+)?)\s*cm/)?.[1])||null
    },
    diagnostics:{participantCount:participants.length,context}
  };
}
