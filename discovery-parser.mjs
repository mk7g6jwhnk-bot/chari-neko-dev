
import * as cheerio from "cheerio";
import { normalizeText, absoluteUrl } from "./utils.mjs";

export function discoverRacePages(html, currentUrl) {
  const $ = cheerio.load(html);
  const links = {raceCards:[],odds:[],results:[],other:[]};

  $("a[href]").each((_,el)=>{
    const href=$(el).attr("href")||"", text=normalizeText($(el).text()),
      context=normalizeText($(el).closest("tr,li,div").text()).slice(0,200),
      url=absoluteUrl(href,currentUrl);
    if(!url)return;
    const combined=`${text} ${context} ${href}`;

    if(/出走表|race.?card|program|選手/i.test(combined))links.raceCards.push({text,context,url});
    else if(/3連単|オッズ|odds/i.test(combined))links.odds.push({text,context,url});
    else if(/結果|result/i.test(combined))links.results.push({text,context,url});
    else if(/race|競輪|レース/i.test(combined))links.other.push({text,context,url});
  });

  for(const key of Object.keys(links)){
    const map=new Map();for(const x of links[key])if(!map.has(x.url))map.set(x.url,x);
    links[key]=[...map.values()];
  }

  return {ok:links.raceCards.length>0||links.other.length>0,links,diagnostics:{
    raceCardLinks:links.raceCards.length,oddsLinks:links.odds.length,title:normalizeText($("title").text())
  }};
}
