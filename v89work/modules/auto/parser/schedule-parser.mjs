
import * as cheerio from "cheerio";
import {TRACKS,normalizeText,absoluteUrl} from "./utils.mjs";

export function parseAutoScheduleHtml(html,baseUrl){
  const $=cheerio.load(html),meetings=[],seen=new Set();

  $("a[href]").each((_,el)=>{
    const href=$(el).attr("href")||"",text=normalizeText($(el).text()),
      context=normalizeText($(el).closest("tr,li,div,section").text()),
      url=absoluteUrl(href,baseUrl);
    if(!url)return;

    const slug=Object.keys(TRACKS).find(x=>
      url.includes(`/Live/${x}`) ||
      `${text} ${context}`.includes(TRACKS[x])
    );
    if(!slug)return;

    const key=`${slug}|${url}`;
    if(seen.has(key))return;
    seen.add(key);

    meetings.push({
      trackSlug:slug,
      trackName:TRACKS[slug],
      liveUrl:`https://autorace.jp/race_info/Live/${slug}`,
      discoveredUrl:url,
      linkText:text,
      contextText:context.slice(0,240)
    });
  });

  return {
    ok:meetings.length>0,
    meetings,
    diagnostics:{
      meetingCount:meetings.length,
      title:normalizeText($("title").text())
    }
  };
}
