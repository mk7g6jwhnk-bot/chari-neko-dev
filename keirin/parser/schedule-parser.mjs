import * as cheerio from "cheerio";
import { normalizeText } from "./utils.mjs";

const VENUES = [
["11","函館"],["12","青森"],["13","いわき平"],["21","弥彦"],["22","前橋"],["23","取手"],
["24","宇都宮"],["25","大宮"],["26","西武園"],["27","京王閣"],["28","立川"],["31","松戸"],
["32","千葉"],["34","川崎"],["35","平塚"],["36","小田原"],["37","伊東"],["38","静岡"],
["42","名古屋"],["43","岐阜"],["44","大垣"],["45","豊橋"],["46","富山"],["47","松阪"],
["48","四日市"],["51","福井"],["53","奈良"],["54","向日町"],["55","和歌山"],["56","岸和田"],
["61","玉野"],["62","広島"],["63","防府"],["71","高松"],["73","小松島"],["74","高知"],
["75","松山"],["81","小倉"],["83","久留米"],["84","武雄"],["85","佐世保"],["86","別府"],["87","熊本"]
];

/**
 * 開催日程表の「対象日セル」を直接確認する。
 * 会場名リンクや場外発売リンクを開催本体として採用しない。
 */
export function parseScheduleHtml(html, baseUrl, targetDate) {
  const $ = cheerio.load(html);
  const day = Number(String(targetDate).slice(6, 8));
  const meetings = [];
  const seen = new Set();
  const diagnostics = {
    title: normalizeText($("title").text()),
    targetDay: day,
    scannedRows: 0,
    activeRows: 0,
    skippedVelo250: 0,
    generatedDirectLinks: 0,
    colspanHits: 0
  };

  if (!Number.isInteger(day) || day < 1 || day > 31) {
    return { ok:false, meetings:[], diagnostics:{...diagnostics,error:"対象日不正"} };
  }

  $("table tr").each((_, row) => {
    const physicalCells = $(row).find("th,td").toArray();
    if (!physicalCells.length) return;

    const rowText = normalizeText($(row).text());
    const venue = VENUES
      .map(([code,name]) => ({code,name}))
      .find(v => rowText.includes(v.name));
    if (!venue) return;

    diagnostics.scannedRows += 1;

    // 千葉は通常競輪とは別の250競走案内であり、このエンジンの対象外。
    if (venue.code === "32") {
      diagnostics.skippedVelo250 += 1;
      return;
    }

    const venuePhysicalIndex = findVenueCellIndex($, physicalCells, venue.name);
    if (venuePhysicalIndex < 0) return;

    // colspanを展開した論理列を作る。
    // 例: 1日〜4日を跨ぐ開催セルなら、4日分すべて同じセルとして扱う。
    const logicalCells = expandLogicalCells($, physicalCells);
    const venueLogicalIndex = logicalCells.findIndex(
      item => item.physicalIndex === venuePhysicalIndex
    );
    if (venueLogicalIndex < 0) return;

    const targetItem = logicalCells[venueLogicalIndex + day];
    if (!targetItem) return;

    const cell = $(targetItem.node);
    if (targetItem.span > 1) diagnostics.colspanHits =
      (diagnostics.colspanHits || 0) + 1;
    const gradeImage = cell.find('img[src*="/grade/"],img[src*="ico_g"],img[src*="ico_f"]').first();
    const cellText = normalizeText(cell.text());
    const imgAlt = normalizeText(gradeImage.attr("alt") || "");
    const imgSrc = gradeImage.attr("src") || "";

    const active =
      gradeImage.length > 0 ||
      /\b(GP|G1|G2|G3|F1|F2|FI|FII|GⅠ|GⅡ|GⅢ)\b/i.test(`${cellText} ${imgAlt} ${imgSrc}`);

    if (!active) return;
    diagnostics.activeRows += 1;

    const key = `${venue.code}|${targetDate}`;
    if (seen.has(key)) return;
    seen.add(key);

    const grade = detectGrade(`${cellText} ${imgAlt} ${imgSrc}`);
    const raceCardUrl = buildRaceCardUrl(targetDate, venue.code, 1);
    const oddsUrl = buildOddsUrl(targetDate, venue.code, 1);

    meetings.push({
      venueCode: venue.code,
      venueName: venue.name,
      date: targetDate,
      grade,
      discoveredUrl: raceCardUrl,
      linkText: `${venue.name} ${grade || ""}`.trim(),
      contextText: `開催日程表 ${targetDate} 対象日セル`,
      generatedLinks: {
        raceCardUrl,
        oddsUrl
      }
    });
    diagnostics.generatedDirectLinks += 1;
  });

  return {
    ok: meetings.length > 0,
    meetings,
    diagnostics: {
      ...diagnostics,
      meetingCount: meetings.length
    }
  };
}

function expandLogicalCells($, cells) {
  const logical = [];
  cells.forEach((node, physicalIndex) => {
    const raw = Number($(node).attr("colspan") || 1);
    const span = Number.isInteger(raw) && raw > 0 ? raw : 1;
    for (let offset = 0; offset < span; offset += 1) {
      logical.push({
        node,
        physicalIndex,
        span,
        spanOffset: offset
      });
    }
  });
  return logical;
}

function findVenueCellIndex($, cells, venueName) {
  return cells.findIndex(cell => normalizeText($(cell).text()).includes(venueName));
}

function detectGrade(value) {
  const text = String(value).toUpperCase();
  if (/ICO_GP|(?:^|\W)GP(?:\W|$)/.test(text)) return "GP";
  if (/ICO_G1|GⅠ|(?:^|\W)G1(?:\W|$)/.test(text)) return "G1";
  if (/ICO_G2|GⅡ|(?:^|\W)G2(?:\W|$)/.test(text)) return "G2";
  if (/ICO_G3|GⅢ|(?:^|\W)G3(?:\W|$)/.test(text)) return "G3";
  if (/ICO_F1|(?:^|\W)F1(?:\W|$)|(?:^|\W)FI(?:\W|$)/.test(text)) return "F1";
  if (/ICO_F2|(?:^|\W)F2(?:\W|$)|(?:^|\W)FII(?:\W|$)/.test(text)) return "F2";
  return null;
}

export function buildRaceCardUrl(date, venueCode, raceNo = 1) {
  const q = new URLSearchParams({
    KBI: String(date),
    KCD: String(venueCode),
    RNO: String(raceNo)
  });
  return `https://keirin.jp/pc/dfw/dataplaza/guest/racemember?${q}`;
}

export function buildOddsUrl(date, venueCode, raceNo = 1) {
  const q = new URLSearchParams({
    BET: "5",
    KBI: String(date),
    KCD: String(venueCode),
    RNO: String(raceNo)
  });
  return `https://keirin.jp/pc/dfw/dataplaza/guest/odds?${q}`;
}
