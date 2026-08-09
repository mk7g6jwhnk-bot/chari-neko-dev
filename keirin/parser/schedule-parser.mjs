
import * as cheerio from "cheerio";
import { normalizeText, absoluteUrl } from "./utils.mjs";

const VENUES = [
["11","函館"],["12","青森"],["13","いわき平"],["21","弥彦"],["22","前橋"],["23","取手"],
["24","宇都宮"],["25","大宮"],["26","西武園"],["27","京王閣"],["28","立川"],["31","松戸"],
["32","千葉"],["34","川崎"],["35","平塚"],["36","小田原"],["37","伊東"],["38","静岡"],
["42","名古屋"],["43","岐阜"],["44","大垣"],["45","豊橋"],["46","富山"],["47","松阪"],
["48","四日市"],["51","福井"],["53","奈良"],["54","向日町"],["55","和歌山"],["56","岸和田"],
["61","玉野"],["62","広島"],["63","防府"],["71","高松"],["73","小松島"],["74","高知"],
["75","松山"],["81","小倉"],["83","久留米"],["84","武雄"],["85","佐世保"],["86","別府"],["87","熊本"]
];

export function parseScheduleHtml(html, baseUrl, targetDate) {
  const $ = cheerio.load(html), meetings = [], seen = new Set();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    const text = normalizeText($(el).text());
    const context = normalizeText($(el).closest("tr,li,div,section").text());
    const absolute = absoluteUrl(href, baseUrl);
    if (!absolute) return;

    const venue = VENUES.map(([code,name])=>({code,name}))
      .find(v => `${text} ${context}`.includes(v.name));
    if (!venue) return;

    if (!/race|kaisai|開催|出走|program|card/i.test(`${href} ${text} ${context}`)) return;

    const key = `${venue.code}|${absolute}`;
    if (seen.has(key)) return;
    seen.add(key);

    meetings.push({
      venueCode:venue.code,
      venueName:venue.name,
      date:targetDate,
      discoveredUrl:absolute,
      linkText:text,
      contextText:context.slice(0,240)
    });
  });

  return {
    ok:meetings.length>0,
    meetings,
    diagnostics:{meetingCount:meetings.length,title:normalizeText($("title").text())}
  };
}
