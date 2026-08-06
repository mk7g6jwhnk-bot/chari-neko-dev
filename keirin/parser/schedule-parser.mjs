import * as cheerio from "cheerio";
import { normalizeText, absoluteUrl } from "./utils.mjs";

const VENUES = [
["11","函館"],["12","青森"],["13","いわき平"],["21","弥彦"],["22","前橋"],["23","取手"],
["24","宇都宮"],["25","大宮"],["26","西武園"],["27","京王閣"],["28","立川"],["31","松戸"],
["34","川崎"],["35","平塚"],["36","小田原"],["37","伊東"],["38","静岡"],
["42","名古屋"],["43","岐阜"],["44","大垣"],["45","豊橋"],["46","富山"],["47","松阪"],
["48","四日市"],["51","福井"],["53","奈良"],["54","向日町"],["55","和歌山"],["56","岸和田"],
["61","玉野"],["62","広島"],["63","防府"],["71","高松"],["73","小松島"],["74","高知"],
["75","松山"],["81","小倉"],["83","久留米"],["84","武雄"],["85","佐世保"],["86","別府"],["87","熊本"]
];

const VENUE_BY_NAME = new Map(VENUES.map(([code, name]) => [name, code]));

export function parseScheduleHtml(html, baseUrl, targetDate) {
  const $ = cheerio.load(html);
  const meetings = [];
  const seen = new Set();
  const day = Number(String(targetDate).slice(6, 8));

  $("tr").each((_, row) => {
    const cells = $(row).children("th,td").toArray();
    if (cells.length < 2) return;

    const venueText = normalizeText($(cells[0]).text());
    const venueName = [...VENUE_BY_NAME.keys()].find(name => venueText.includes(name));
    if (!venueName) return;
    const venueCode = VENUE_BY_NAME.get(venueName);

    let logicalDay = 1;
    let targetCell = null;
    for (let index = 1; index < cells.length; index += 1) {
      const cell = cells[index];
      const colspan = Math.max(1, Number.parseInt($(cell).attr("colspan") || "1", 10) || 1);
      const start = logicalDay;
      const end = logicalDay + colspan - 1;
      if (day >= start && day <= end) {
        targetCell = cell;
        break;
      }
      logicalDay += colspan;
    }
    if (!targetCell) return;

    const candidates = $(targetCell).find("a[href]").toArray();
    for (const link of candidates) {
      const href = $(link).attr("href") || "";
      const absolute = absoluteUrl(href, baseUrl);
      if (!absolute) continue;
      const parsed = new URL(absolute);

      // KEIRIN.JP外部サイト（例: VELO250）は通常競輪開催として扱わない。
      if (parsed.hostname !== "keirin.jp" && !parsed.hostname.endsWith(".keirin.jp")) continue;
      if (!/race|kaisai|開催|jocd|jcd|bkcd|sp\/top/i.test(`${href} ${absolute}`)) continue;

      const key = `${targetDate}|${venueCode}`;
      if (seen.has(key)) continue;
      seen.add(key);

      meetings.push({
        venueCode,
        venueName,
        date: targetDate,
        discoveredUrl: absolute,
        linkText: normalizeText($(link).text()) || normalizeText($(link).find("img").attr("alt") || ""),
        contextText: normalizeText($(targetCell).text()).slice(0, 240),
        source: "target-date-cell"
      });
    }
  });

  return {
    ok: true,
    meetings,
    diagnostics: {
      meetingCount: meetings.length,
      title: normalizeText($("title").text()),
      targetDate,
      requestedDay: day,
      excludedExternalVenues: ["32:千葉(VELO250)"]
    }
  };
}
