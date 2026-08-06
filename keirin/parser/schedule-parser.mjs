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
  const candidates = [];
  const target = String(targetDate || "");
  const day = Number(target.slice(6, 8));
  const month = Number(target.slice(4, 6));
  const dateTokens = buildDateTokens(target, month, day);

  $("a[href]").each((domIndex, link) => {
    const href = String($(link).attr("href") || "").trim();
    const absolute = absoluteUrl(href, baseUrl);
    if (!absolute) return;

    let parsed;
    try { parsed = new URL(absolute); } catch { return; }
    if (parsed.hostname !== "keirin.jp" && !parsed.hostname.endsWith(".keirin.jp")) return;

    const linkText = normalizeText($(link).text()) || normalizeText($(link).find("img").attr("alt") || "");
    const row = $(link).closest("tr");
    const local = $(link).closest("td,th,li,div,section");
    const rowText = normalizeText(row.text());
    const localText = normalizeText(local.text());
    const searchable = `${linkText} ${localText} ${rowText} ${href} ${absolute}`;

    const venueName = [...VENUE_BY_NAME.keys()].find(name => searchable.includes(name));
    if (!venueName) return;
    const venueCode = VENUE_BY_NAME.get(venueName);

    const raceLike = /race|kaisai|jocd|jcd|bkcd|sp\/top|出走|オッズ|開催/i.test(searchable);
    if (!raceLike) return;

    let score = 10;
    const dateMatched = dateTokens.some(token => token && searchable.includes(token));
    if (dateMatched) score += 100;
    if (row.length) score += 20;
    if (linkText.includes(venueName)) score += 20;
    if (/jocd|jcd|bkcd/i.test(`${href} ${absolute}`)) score += 30;
    if (/race|kaisai|sp\/top/i.test(`${href} ${absolute}`)) score += 20;

    // 月間日程表の列構造を読める場合は対象日セルかどうかを加点する。
    if (row.length && day >= 1) {
      const cells = row.children("th,td").toArray();
      let logicalDay = 1;
      for (let index = 1; index < cells.length; index += 1) {
        const cell = cells[index];
        const colspan = Math.max(1, Number.parseInt($(cell).attr("colspan") || "1", 10) || 1);
        const end = logicalDay + colspan - 1;
        if (day >= logicalDay && day <= end && $(cell).find(link).length) score += 150;
        logicalDay = end + 1;
      }
    }

    candidates.push({
      venueCode,
      venueName,
      date: target,
      discoveredUrl: absolute,
      linkText,
      contextText: (localText || rowText).slice(0, 240),
      source: dateMatched ? "date-text-match" : "internal-schedule-link",
      score,
      domIndex
    });
  });

  // 同じ日付・会場は最も確からしい内部リンク1件だけに統合する。
  const bestByVenue = new Map();
  for (const candidate of candidates) {
    const key = `${target}|${candidate.venueCode}`;
    const previous = bestByVenue.get(key);
    if (!previous || candidate.score > previous.score ||
        (candidate.score === previous.score && candidate.domIndex < previous.domIndex)) {
      bestByVenue.set(key, candidate);
    }
  }

  const meetings = [...bestByVenue.values()]
    .sort((a, b) => Number(a.venueCode) - Number(b.venueCode))
    .map(({ score, domIndex, ...meeting }) => meeting);

  return {
    ok: true,
    meetings,
    diagnostics: {
      meetingCount: meetings.length,
      rawCandidateCount: candidates.length,
      title: normalizeText($("title").text()),
      targetDate: target,
      requestedDay: day,
      parserMode: "internal-link-ranked-dedup-v051",
      excludedExternalVenues: ["32:千葉(VELO250)"]
    }
  };
}

function buildDateTokens(targetDate, month, day) {
  if (!/^\d{8}$/.test(targetDate) || !month || !day) return [];
  const yyyy = targetDate.slice(0, 4);
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return [
    targetDate,
    `${yyyy}/${mm}/${dd}`,
    `${yyyy}-${mm}-${dd}`,
    `${month}/${day}`,
    `${month}月${day}日`,
    `${day}日`
  ];
}
