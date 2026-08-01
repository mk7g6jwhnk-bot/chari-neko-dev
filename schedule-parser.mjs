
import * as cheerio from "cheerio";
import { normalizeText, VENUES } from "./utils.mjs";

export function parseScheduleHtml(html, date) {
  const $ = cheerio.load(html);
  const found = new Map();

  $('a[href*="raceindex"]').each((_, el) => {
    const href = $(el).attr("href") || "";
    const m = href.match(/[?&]jcd=(\d{2})/);
    if (!m || !VENUES[m[1]]) return;
    found.set(m[1], {
      code:m[1],
      name:VENUES[m[1]],
      raceIndexUrl:new URL(href, `https://www.boatrace.jp/owpc/pc/race/index?hd=${date}`).toString()
    });
  });

  if (!found.size) {
    for (const m of html.matchAll(/raceindex\?[^"'<>]*?jcd=(\d{2})/g)) {
      if (VENUES[m[1]]) {
        found.set(m[1], {
          code:m[1],
          name:VENUES[m[1]],
          raceIndexUrl:`https://www.boatrace.jp/owpc/pc/race/raceindex?hd=${date}&jcd=${m[1]}`
        });
      }
    }
  }

  return {
    ok:found.size>0,
    venues:[...found.values()].sort((a,b)=>Number(a.code)-Number(b.code)),
    diagnostics:{
      venueCount:found.size,
      title:normalizeText($("title").text())
    }
  };
}
