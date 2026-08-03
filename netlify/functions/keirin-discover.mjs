import {
  parseScheduleHtml,
  buildRaceCardUrl,
  buildOddsUrl
} from "../../keirin/parser/schedule-parser.mjs";
import { validDate, jsonResponse } from "../../keirin/parser/utils.mjs";

export default async req => {
  const u = new URL(req.url);
  const date = u.searchParams.get("date") || "";

  if (!validDate(date)) {
    return jsonResponse(400,{ok:false,error:"日付形式不正"});
  }

  const scheduleUrl = "https://keirin.jp/pc/raceschedule";
  const jar = new Jar();

  try {
    const sr = await fw(scheduleUrl,jar);
    if (!sr.ok) {
      return jsonResponse(502,{ok:false,error:`日程取得HTTP ${sr.status}`});
    }

    const schedule = parseScheduleHtml(await sr.text(),scheduleUrl,date);

    const meetings = schedule.meetings.map(m => {
      const raceCardUrl = m.generatedLinks?.raceCardUrl
        || buildRaceCardUrl(date,m.venueCode,1);
      const oddsUrl = m.generatedLinks?.oddsUrl
        || buildOddsUrl(date,m.venueCode,1);

      return {
        ...m,
        discovery: {
          ok: true,
          generated: true,
          links: {
            raceCards: [{
              text: `${m.venueName} 1R 出走表`,
              context: "公式URL直接生成",
              url: raceCardUrl
            }],
            odds: [{
              text: `${m.venueName} 1R 3連単オッズ`,
              context: "公式URL直接生成",
              url: oddsUrl
            }],
            results: [],
            other: []
          },
          diagnostics: {
            raceCardLinks: 1,
            oddsLinks: 1,
            title: "KEIRIN.JP公式URL直接生成",
            generationMode: "KBI-KCD-RNO"
          }
        },
        discoveryError: null,
        fetchDiagnostics: {
          status: null,
          finalUrl: raceCardUrl,
          contentType: null,
          redirected: false,
          notProbed: true
        }
      };
    });

    return jsonResponse(200,{
      ok: schedule.ok,
      date,
      meetings,
      diagnostics: {
        ...schedule.diagnostics,
        cookieNames: jar.names(),
        note: "開催日程表の対象日セル判定＋公式URL直接生成"
      },
      checkedAt: new Date().toISOString()
    });
  } catch(e) {
    return jsonResponse(500,{ok:false,error:e.message});
  }
};

class Jar {
  constructor(){this.c=new Map()}
  ingest(r){
    const s=r.headers.get("set-cookie");
    if(!s)return;
    for(const p of s.split(/,(?=[^;,]+=)/)){
      const q=p.split(";")[0],i=q.indexOf("=");
      if(i>0)this.c.set(q.slice(0,i).trim(),q.slice(i+1).trim());
    }
  }
  header(){return[...this.c].map(([k,v])=>`${k}=${v}`).join("; ")}
  names(){return[...this.c.keys()]}
}

async function fw(url,jar,referer=null){
  const h={
    "user-agent":"Mozilla/5.0 (compatible; ChariNekoDev/0.6; personal-use)",
    "accept-language":"ja"
  };
  if(jar.header())h.cookie=jar.header();
  if(referer)h.referer=referer;
  const r=await fetch(url,{headers:h,redirect:"follow"});
  jar.ingest(r);
  return r;
}
