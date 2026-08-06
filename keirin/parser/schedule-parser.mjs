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

/**
 * KEIRIN.JPの月間日程表を、対象日の列だけで判定する。
 * 会場名リンクは全会場に常設されているため、リンクの存在を開催根拠にしない。
 */
export function parseScheduleHtml(html, baseUrl, targetDate) {
  const $ = cheerio.load(html);
  const target = String(targetDate || "");
  const day = Number(target.slice(6, 8));
  const meetings = [];
  const auditedRows = [];

  if (!/^\d{8}$/.test(target) || day < 1 || day > 31) {
    return {
      ok: false,
      meetings: [],
      diagnostics: {
        meetingCount: 0,
        title: normalizeText($("title").text()),
        targetDate: target,
        requestedDay: day || 0,
        parserMode: "target-day-cell-v052",
        error: "target-date-invalid"
      }
    };
  }

  $("tr").each((rowIndex, rowElement) => {
    const row = $(rowElement);
    const cells = row.children("th,td").toArray();
    if (cells.length < 2) return;

    const venueCell = $(cells[0]);
    const venueCellText = normalizeText(venueCell.text());
    const venueName = [...VENUE_BY_NAME.keys()].find(name => venueCellText.includes(name));
    if (!venueName) return;

    const venueCode = VENUE_BY_NAME.get(venueName);
    const targetCellInfo = findDayCell($, cells, day);
    if (!targetCellInfo) {
      auditedRows.push({ venueCode, venueName, rowIndex, included: false, reason: "target-cell-not-found" });
      return;
    }

    const targetCell = targetCellInfo.cell;
    const images = targetCell.find("img").toArray().map(image => ({
      src: String($(image).attr("src") || "").trim(),
      alt: normalizeText($(image).attr("alt") || ""),
      title: normalizeText($(image).attr("title") || "")
    }));

    const evidenceText = normalizeText(targetCell.text());
    const evidence = images.map(image => `${image.src} ${image.alt} ${image.title}`).join(" ");

    // グレード画像があるセルだけを実開催として採用する。
    // 「開催不可」等の案内アイコンや、会場名の常設リンクだけでは採用しない。
    const hasGradeIcon = images.some(image => /\/grade\/ico_[^/]+\.(?:png|gif|jpe?g|webp)(?:\?|$)/i.test(image.src));
    const hasExplicitGradeText = /(?:GⅠ|G1|GⅡ|G2|GⅢ|G3|FⅠ|F1|FⅡ|F2|GP)/i.test(`${evidenceText} ${evidence}`);
    const excludedOnly = images.length > 0 && images.every(image => /kaisaihuka|開催不可/i.test(`${image.src} ${image.alt} ${image.title}`));
    const included = (hasGradeIcon || hasExplicitGradeText) && !excludedOnly;

    auditedRows.push({
      venueCode,
      venueName,
      rowIndex,
      included,
      logicalDayStart: targetCellInfo.startDay,
      logicalDayEnd: targetCellInfo.endDay,
      imageCount: images.length,
      hasGradeIcon,
      hasExplicitGradeText,
      excludedOnly,
      evidence: images.map(image => image.src || image.alt || image.title).filter(Boolean).slice(0, 8)
    });

    if (!included) return;

    const targetLink = targetCell.find("a[href]").first();
    const venueLink = venueCell.find("a[href]").first();
    const href = String(targetLink.attr("href") || venueLink.attr("href") || "").trim();
    const discoveredUrl = absoluteUrl(href, baseUrl) || baseUrl;

    meetings.push({
      venueCode,
      venueName,
      date: target,
      discoveredUrl,
      linkText: normalizeText(targetLink.text()) || venueName,
      contextText: evidenceText.slice(0, 240),
      source: "target-day-cell",
      scheduleEvidence: {
        logicalDayStart: targetCellInfo.startDay,
        logicalDayEnd: targetCellInfo.endDay,
        images,
        hasGradeIcon,
        hasExplicitGradeText
      }
    });
  });

  const bestByVenue = new Map();
  for (const meeting of meetings) {
    const key = `${meeting.date}|${meeting.venueCode}`;
    if (!bestByVenue.has(key)) bestByVenue.set(key, meeting);
  }

  const deduped = [...bestByVenue.values()].sort((a, b) => Number(a.venueCode) - Number(b.venueCode));

  return {
    ok: true,
    meetings: deduped,
    diagnostics: {
      meetingCount: deduped.length,
      auditedVenueCount: auditedRows.length,
      title: normalizeText($("title").text()),
      targetDate: target,
      requestedDay: day,
      parserMode: "target-day-cell-grade-evidence-v052",
      excludedExternalVenues: ["32:千葉(VELO250)"],
      rows: auditedRows
    }
  };
}

function findDayCell($, cells, targetDay) {
  // 先頭セルは会場名。以降を1日から順に割り当てる。
  let logicalDay = 1;
  for (let index = 1; index < cells.length; index += 1) {
    const cell = $(cells[index]);
    const colspan = Math.max(1, Number.parseInt(cell.attr("colspan") || "1", 10) || 1);
    const startDay = logicalDay;
    const endDay = logicalDay + colspan - 1;
    if (targetDay >= startDay && targetDay <= endDay) {
      return { cell, startDay, endDay, index };
    }
    logicalDay = endDay + 1;
  }
  return null;
}
