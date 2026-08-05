
import * as cheerio from "cheerio";
import {normalizeText,absoluteUrl} from "./utils.mjs";

export function discoverAutoRaceLinks(html,currentUrl){
  const $=cheerio.load(html),links={program:[],odds:[],results:[],racePages:[]};

  $("a[href]").each((_,el)=>{
    const href=$(el).attr("href")||"",text=normalizeText($(el).text()),
      context=normalizeText($(el).closest("tr,li,div").text()).slice(0,220),
      url=absoluteUrl(href,currentUrl);
    if(!url)return;
    const combined=`${text} ${context} ${href}`;

    if(/出走表|Program|program/i.test(combined))links.program.push({text,context,url});
    else if(/3連単|オッズ|Odds|odds/i.test(combined))links.odds.push({text,context,url});
    else if(/結果|Result|result/i.test(combined))links.results.push({text,context,url});
    else if(/\b(?:1[0-2]|[1-9])R\b|race|レース/i.test(combined))links.racePages.push({text,context,url});
  });

  for(const key of Object.keys(links)){
    const map=new Map();
    for(const item of links[key])if(!map.has(item.url))map.set(item.url,item);
    links[key]=[...map.values()];
  }

  return {
    ok:links.program.length>0 || links.racePages.length>0,
    links,
    diagnostics:{
      programLinks:links.program.length,
      oddsLinks:links.odds.length,
      resultLinks:links.results.length,
      racePageLinks:links.racePages.length,
      title:normalizeText($("title").text())
    }
  };
}
