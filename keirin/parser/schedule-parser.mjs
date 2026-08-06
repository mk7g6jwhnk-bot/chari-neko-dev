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
 * 月間日程表の「ヘッダー上の実際の列番号」を基準に対象日を特定する。
 * 以前のように先頭セルの次を1日と仮定しない。
 */
export function parseScheduleHtml(html, baseUrl, targetDate) {
  const $ = cheerio.load(html);
  const target = String(targetDate || "");
  const day = Number(target.slice(6, 8));
  const meetings = [];
  const auditedRows = [];

  if (!/^\d{8}$/.test(target) || day < 1 || day > 31) {
    return { ok:false, meetings:[], diagnostics:{ targetDate:target, requestedDay:day||0, error:"target-date-invalid", parserMode:"header-column-v053" } };
  }

  $("table").each((tableIndex, tableElement) => {
    const table = $(tableElement);
    const header = findHeaderMap($, table);
    if (!header || !header.dayToIndex.has(day)) return;
    const targetIndex = header.dayToIndex.get(day);

    table.find("tr").each((rowIndex, rowElement) => {
      const row = $(rowElement);
      const cells = row.children("th,td").toArray();
      if (cells.length <= targetIndex) return;

      const venueCell = $(cells[header.venueIndex]);
      const venueCellText = normalizeText(venueCell.text());
      const venueName = [...VENUE_BY_NAME.keys()].find(name => venueCellText.includes(name));
      if (!venueName) return;
      const venueCode = VENUE_BY_NAME.get(venueName);
      const targetCell = $(cells[targetIndex]);

      const images = targetCell.find("img").toArray().map(image => ({
        src:String($(image).attr("src")||"").trim(),
        alt:normalizeText($(image).attr("alt")||""),
        title:normalizeText($(image).attr("title")||"")
      }));
      const evidenceText = normalizeText(targetCell.text());
      const evidence = images.map(x=>`${x.src} ${x.alt} ${x.title}`).join(" ");
      const hasEventImage = images.some(x => !/kaisaihuka|開催不可|spacer|blank/i.test(`${x.src} ${x.alt} ${x.title}`));
      const hasGradeText = /(?:GⅠ|G1|GⅡ|G2|GⅢ|G3|FⅠ|F1|FⅡ|F2|GP)/i.test(`${evidenceText} ${evidence}`);
      const links = targetCell.find("a[href]").toArray().map(a => ({
        href:String($(a).attr("href")||"").trim(),
        text:normalizeText($(a).text()),
        url:absoluteUrl(String($(a).attr("href")||""), baseUrl)
      })).filter(x => x.url && /^https:\/\/(?:www\.)?keirin\.jp\//i.test(x.url));
      const onclickUrls = targetCell.find("[onclick]").toArray().flatMap(el => {
        const raw=String($(el).attr("onclick")||"");
        const found=[...raw.matchAll(/["']([^"']+(?:race|kaisai|program|odds)[^"']*)["']/ig)].map(m=>absoluteUrl(m[1],baseUrl));
        return found.filter(Boolean).map(url=>({href:url,text:"onclick",url}));
      });
      const officialLinks=[...links,...onclickUrls];
      const included=(hasEventImage||hasGradeText||officialLinks.length>0);

      auditedRows.push({tableIndex,rowIndex,venueCode,venueName,targetIndex,included,imageCount:images.length,officialLinkCount:officialLinks.length,evidence:images.map(x=>x.src||x.alt).filter(Boolean).slice(0,6)});
      if(!included) return;

      meetings.push({
        venueCode, venueName, date:target,
        discoveredUrl:officialLinks[0]?.url || "",
        officialLinks,
        contextText:evidenceText.slice(0,240),
        source:"header-column-target-cell",
        scheduleEvidence:{tableIndex,targetIndex,images,hasEventImage,hasGradeText}
      });
    });
  });

  const best = new Map();
  for(const m of meetings){ const key=`${m.date}|${m.venueCode}`; const prev=best.get(key); if(!prev || (!prev.discoveredUrl && m.discoveredUrl)) best.set(key,m); }
  const deduped=[...best.values()].sort((a,b)=>Number(a.venueCode)-Number(b.venueCode));
  return { ok:true, meetings:deduped, diagnostics:{meetingCount:deduped.length,auditedVenueCount:auditedRows.length,title:normalizeText($("title").text()),targetDate:target,requestedDay:day,parserMode:"header-column-target-cell-v053",rows:auditedRows} };
}

function findHeaderMap($, table){
  let best=null;
  table.find("tr").each((_,tr)=>{
    const cells=$(tr).children("th,td").toArray();
    const dayToIndex=new Map();
    let venueIndex=0;
    cells.forEach((cell,index)=>{
      const text=normalizeText($(cell).text());
      if(/競輪場/.test(text)) venueIndex=index;
      if(/^\d{1,2}$/.test(text)){
        const n=Number(text); if(n>=1&&n<=31&&!dayToIndex.has(n)) dayToIndex.set(n,index);
      }
    });
    if(dayToIndex.size>=20 && (!best || dayToIndex.size>best.dayToIndex.size)) best={dayToIndex,venueIndex};
  });
  return best;
}
