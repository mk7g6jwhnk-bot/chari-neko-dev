import { parseScheduleHtml } from "../../keirin/parser/schedule-parser.mjs";
import { discoverRacePages } from "../../keirin/parser/discovery-parser.mjs";
import { validDate, jsonResponse } from "../../keirin/parser/utils.mjs";

export default async req => {
  const u=new URL(req.url); const date=u.searchParams.get("date")||"";
  if(!validDate(date)) return jsonResponse(400,{ok:false,error:"日付形式不正"});
  const year=date.slice(0,4), month=date.slice(4,6);
  const scheduleUrl=`https://keirin.jp/pc/raceschedule?scyy=${year}&scym=${month}`;
  const jar=new Jar();
  try{
    const sr=await fw(scheduleUrl,jar); if(!sr.ok) return jsonResponse(502,{ok:false,error:`日程取得HTTP ${sr.status}`});
    const schedule=parseScheduleHtml(await sr.text(),scheduleUrl,date);
    const checked=await Promise.all(schedule.meetings.slice(0,20).map(async m=>{
      if(!m.discoveredUrl) return {...m,verifiedMeeting:false,raceNumbers:[],verificationReason:"target-cell-official-url-not-found"};
      try{
        const r=await fw(m.discoveredUrl,jar,scheduleUrl); const html=r.ok?await r.text():"";
        const discovery=r.ok?discoverRacePages(html,m.discoveredUrl):null;
        const raceNumbers=extractRaceNumbers(discovery);
        return {...m,verifiedMeeting:r.ok&&raceNumbers.length>0,raceNumbers,discovery:discovery||emptyDiscovery(),discoveryError:r.ok?null:`HTTP ${r.status}`,verificationReason:raceNumbers.length?"official-race-number-found":"official-race-number-not-found"};
      }catch(e){ return {...m,verifiedMeeting:false,raceNumbers:[],discovery:emptyDiscovery(),discoveryError:e.message,verificationReason:"verification-error"}; }
    }));
    const meetings=checked.filter(m=>m.verifiedMeeting&&m.raceNumbers.length>0);
    return jsonResponse(200,{ok:true,date,meetings,diagnostics:{...schedule.diagnostics,candidateCount:checked.length,verifiedCount:meetings.length,rejected:checked.filter(x=>!x.verifiedMeeting).map(x=>({venueCode:x.venueCode,venueName:x.venueName,reason:x.verificationReason,error:x.discoveryError||null})),note:"対象日ヘッダー列＋対象セル公式URL＋実在R確認済みのみ表示"},checkedAt:new Date().toISOString()});
  }catch(e){ return jsonResponse(500,{ok:false,error:e.message}); }
};

function extractRaceNumbers(discovery){
  const links=[...(discovery?.links?.raceCards||[]),...(discovery?.links?.other||[])];
  const out=new Set();
  for(const x of links){ const t=`${x.text||""} ${x.context||""} ${x.url||""}`; for(const m of t.matchAll(/(?:^|\D)(1[0-2]|[1-9])\s*[RＲ](?:\D|$)/ig)) out.add(Number(m[1])); }
  return [...out].sort((a,b)=>a-b);
}
function emptyDiscovery(){return {ok:false,links:{raceCards:[],odds:[],results:[],other:[]},diagnostics:{fallback:true}}}
class Jar{constructor(){this.c=new Map()} ingest(r){const s=r.headers.get("set-cookie");if(!s)return;for(const p of s.split(/,(?=[^;,]+=)/)){const q=p.split(";")[0],i=q.indexOf("=");if(i>0)this.c.set(q.slice(0,i).trim(),q.slice(i+1).trim())}} header(){return [...this.c].map(([k,v])=>`${k}=${v}`).join("; ")} names(){return [...this.c.keys()]}}
async function fw(url,jar,referer=null){const h={"user-agent":"Mozilla/5.0 (compatible; ChariNekoDev/0.5.3; personal-use)","accept-language":"ja"};if(jar.header())h.cookie=jar.header();if(referer)h.referer=referer;const r=await fetch(url,{headers:h,redirect:"follow",signal:AbortSignal.timeout(12000)});jar.ingest(r);return r}
