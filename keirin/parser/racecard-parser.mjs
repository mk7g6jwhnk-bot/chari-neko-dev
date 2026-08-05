
import * as cheerio from "cheerio";
import { normalizeText } from "./utils.mjs";

export function parseRaceCardHtml(html, context={}) {
  const $=cheerio.load(html), races=[];

  $("table").each((_,table)=>{
    const root=$(table), text=normalizeText(root.text());
    const raceNo=Number(text.match(/\b(1[0-2]|[1-9])R\b/)?.[1] || text.match(/第\s*(1[0-2]|[1-9])\s*レース/)?.[1]);
    if(!raceNo)return;

    const participants=parseParticipants(root);
    if(!participants.length)return;

    races.push({
      raceNo,
      deadline:text.match(/\b([0-2]?\d:[0-5]\d)\b/)?.[1]||null,
      participants,
      lineSource:text.match(/(?:並び|ライン|周回予想)[：:\s]*([^|]{3,120})/)?.[1]||null
    });
  });

  if(!races.length){
    const participants=parseParticipants($), body=normalizeText($("body").text()),
      raceNo=Number(body.match(/\b(1[0-2]|[1-9])R\b/)?.[1]||0);
    if(participants.length&&raceNo)races.push({
      raceNo,deadline:body.match(/\b([0-2]?\d:[0-5]\d)\b/)?.[1]||null,
      participants,lineSource:body.match(/(?:並び|ライン|周回予想)[：:\s]*([^|]{3,120})/)?.[1]||null
    });
  }

  return {ok:races.length>0,races,diagnostics:{raceCount:races.length,title:normalizeText($("title").text()),context}};
}

function parseParticipants(root){
  const out=[],seen=new Set();
  root.find("tr").each((_,row)=>{
    const cells=root.find(row).find("th,td").toArray().map(c=>normalizeText(root.find(c).text()));
    const full=cells.join(" | ");
    const number=cells.slice(0,3).map(Number).find(n=>n>=1&&n<=9) ?? Number(full.match(/(?:^|\|)\s*([1-9])\s*(?:\||$)/)?.[1]);
    const name=cells.map(x=>x.match(/[一-龠々ヶヵぁ-んァ-ヶー]{2,}(?:\s+[一-龠々ヶヵぁ-んァ-ヶー]{1,})?/)?.[0])
      .find(x=>x&&!/(出走表|競走得点|選手|レース|開催)/.test(x));
    if(!number||!name)return;
    const key=`${number}|${name}`;if(seen.has(key))return;seen.add(key);
    const nums=cells.flatMap(x=>[...x.replace(/,/g,"").matchAll(/-?\d+(?:\.\d+)?/g)].map(m=>Number(m[0])));
    const score=nums.find(v=>v>=70&&v<=130)??null;
    const text=full;
    const metric=(label)=>Number(text.match(new RegExp(`${label}\\s*(\\d+)`))?.[1]||5);
    out.push({
      id:`K${text.match(/\b(\d{5,6})\b/)?.[1]||number}`,
      number,name,
      registration:text.match(/\b(\d{5,6})\b/)?.[1]||null,
      className:text.match(/\b[SLAB]\d\b/)?.[0]||null,
      score,
      recentForm:Number.isFinite(score)?Math.max(0,Math.min(10,(score-80)/4)):5,
      startPower:metric("S(?:回数)?"),
      sprintPower:Math.max(metric("捲"),metric("まくり")),
      stamina:metric("B(?:回数)?"),
      attackTiming:Math.max(metric("逃"),metric("先行")),
      trackingSkill:Math.max(metric("マーク"),metric("追込")),
      finishPower:Math.max(metric("差"),metric("追込")),
      lineTrust:5,
      venueSuitability:5
    });
  });
  return out.sort((a,b)=>a.number-b.number);
}
