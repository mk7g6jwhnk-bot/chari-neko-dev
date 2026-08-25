import fs from "node:fs/promises";
import path from "node:path";

const BASE = String(process.env.CHARI_NEKO_SITE_URL || "https://chari-neko-dev.netlify.app").replace(/\/$/,"");
const OUT = process.env.CHARI_NEKO_RESULTS_DIR || "./research/results";
const dates = Number(process.env.CHARI_NEKO_RESULT_DAYS || 2);

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  let body = null;
  try { body = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, body };
}

function ymd(d) {
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
}

function dateBack(days) {
  const d = new Date();
  d.setDate(d.getDate()-days);
  return ymd(d);
}

await fs.mkdir(OUT, { recursive: true });

const records=[];
const failures=[];

for(let offset=0; offset<dates; offset++){
  const date=dateBack(offset);
  const discover=await getJson(`${BASE}/.netlify/functions/keirin-discover?date=${date}`);
  if(!discover.ok || discover.body?.ok===false){
    failures.push({date,stage:"discover",status:discover.status,error:discover.body?.error||"discover failed"});
    continue;
  }

  for(const meeting of discover.body.meetings || []){
    const venueCode=String(meeting.venueCode||"").padStart(2,"0");
    const venueName=String(meeting.venueName||"").trim();
    const races=[...new Set((meeting.raceNumbers||[]).map(Number).filter(n=>n>=1&&n<=12))];

    for(const raceNo of races){
      const q=new URLSearchParams({date,venueCode,venueName,raceNo:String(raceNo)});
      const result=await getJson(`${BASE}/.netlify/functions/keirin-result?${q}`);
      if(result.ok && result.body?.ok && result.body?.result){
        records.push({
          race:{date,venueCode,venueName,raceNo},
          result:result.body.result,
          checkedAt:result.body.checkedAt||new Date().toISOString(),
          source:"chari-neko-netlify-keirin-result",
          verificationState:"RESULT_VERIFIED"
        });
      }
      await sleep(250);
    }
  }
}

const file=path.join(OUT,`official-results-${ymd(new Date())}.jsonl`);
const text=records.map(x=>JSON.stringify(x)).join("\n")+(records.length?"\n":"");
await fs.writeFile(file,text,"utf8");

const manifest=path.join(OUT,"official-results-latest-manifest.json");
await fs.writeFile(manifest,JSON.stringify({
  generatedAt:new Date().toISOString(),
  source:BASE,
  daysChecked:dates,
  fetched:records.length,
  failures
},null,2));

console.log(JSON.stringify({fetched:records.length,failures:failures.length,file},null,2));
