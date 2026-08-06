import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseScheduleHtml } from "../keirin/parser/schedule-parser.mjs";
import integratedDiscover from "../netlify/functions/keirin-discover.mjs";
import moduleDiscover from "../modules/keirin/netlify/functions/keirin-discover.mjs";

const fixtureUrl=new URL("./fixtures/keirin-schedule-20260807-minimal.html",import.meta.url);
const scheduleHtml=await readFile(fixtureUrl,"utf8");
const scheduleUrl="https://keirin.jp/pc/raceschedule?scyy=2026&scym=08";
const expectedCodes=["13","24","37","43","45","55","85"];

const parsed=parseScheduleHtml(scheduleHtml,scheduleUrl,"20260807");
assert.deepEqual(parsed.meetings.map(x=>x.venueCode),expectedCodes);
assert.equal(parsed.meetings.some(x=>x.venueCode==="48"),false,"四日市の空対象日セルを除外する");
assert.equal(parsed.meetings.some(x=>x.venueCode==="32"),false,"VELO250を除外する");
for(const meeting of parsed.meetings){
  assert.equal(meeting.discoveredUrl,"https://keirin.jp/pc/racelist");
  assert.equal(meeting.officialRequest.method,"POST");
  assert.equal(meeting.officialRequest.postPath,"/pc/racelist");
  assert.match(meeting.officialRequest.encp,/^fixture-/);
  assert.equal(meeting.officialRequest.disp,meeting.officialRequest.dkbn==="1"?"PJ0301":"PJ0302");
}

for(const handler of [integratedDiscover,moduleDiscover]){
  const calls=[];
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async (url,options={})=>{
    calls.push({url:String(url),options});
    if(String(url).includes("/pc/raceschedule")){
      return new Response(scheduleHtml,{status:200,headers:{"set-cookie":"KEIRIN_SESSION=fixture-cookie; Path=/"}});
    }
    assert.equal(String(url),"https://keirin.jp/pc/racelist");
    assert.equal(options.method,"POST","開催ページをGETしない");
    assert.equal(options.redirect,"follow");
    assert.equal(options.headers.cookie,"KEIRIN_SESSION=fixture-cookie");
    const postedEncp=new URLSearchParams(options.body).get("encp");
    assert.equal(options.headers.referer,postedEncp?.startsWith("target-")?"https://keirin.jp/pc/racelist":scheduleUrl);
    assert.equal(options.headers["content-type"],"application/x-www-form-urlencoded");
    const body=new URLSearchParams(options.body);
    const encp=body.get("encp");
    const code=encp?.replace(/^(?:fixture|target)-/,"");
    assert.ok(expectedCodes.includes(code));
    assert.equal(body.get("disp"),encp?.startsWith("target-")?"PJ0305":code==="45"?"PJ0301":"PJ0302");
    if(encp==="fixture-13"){
      const json={C0201data:{selKaisai:"20260806",selKjyoCd:code,selRaceNo:1,C0201kaisai:[{txtEventDate:"08/06",encParaK:"fixture-13"},{txtEventDate:"08/07",encParaK:"target-13"}],C0201race:Array.from({length:12},()=>({flgActvRaceBtn:true}))}};
      return new Response(`<script>var jsonData={}; jsonData['PC0201'] = ${JSON.stringify(json)};</script>`,{status:200});
    }
    const count=code==="43"?7:12;
    const races=Array.from({length:count},(_,index)=>({flgActvRaceBtn:index%2===0}));
    const json={C0201data:{selKaisai:"20260807",selKjyoCd:code,selRaceNo:1,C0201race:races}};
    return new Response(`<script>var jsonData={}; jsonData['PC0201'] = ${JSON.stringify(json)};</script>`,{status:200});
  };
  try{
    const response=await handler(new Request("https://local.test/.netlify/functions/keirin-discover?date=20260807"));
    assert.equal(response.status,200);
    const body=await response.json();
    assert.deepEqual(body.meetings.map(x=>x.venueCode),expectedCodes);
    assert.equal(body.meetings.every(x=>x.raceNumbers.length>0),true);
    assert.deepEqual(body.meetings.find(x=>x.venueCode==="43").raceNumbers,[1,2,3,4,5,6,7]);
    assert.equal(body.diagnostics.rejected.some(x=>x.reason==="target-cell-official-url-not-found"),false);
    assert.equal(JSON.stringify(body).includes("fixture-"),false,"encpを応答へ公開しない");
    assert.equal(calls.filter(x=>x.options.method==="POST").length,8);
    assert.equal(calls.filter(x=>x.url.includes("/pc/racelist")&&x.options.method!=="POST").length,0);
  }finally{globalThis.fetch=originalFetch;}
}

console.log("keirin discover data-pprm POST fixture: ok");
