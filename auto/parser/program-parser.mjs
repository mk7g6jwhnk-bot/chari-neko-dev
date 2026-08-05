
import * as cheerio from "cheerio";
import {normalizeText,clamp} from "./utils.mjs";

export function parseAutoProgramHtml(html,context={}){
  const $=cheerio.load(html),body=normalizeText($("body").text()),participants=[],seen=new Set();

  $("table tr").each((_,row)=>{
    const cells=$(row).find("th,td").toArray().map(c=>normalizeText($(c).text()));
    if(!cells.length)return;
    const full=cells.join(" | ");

    const number=cells.slice(0,3).map(Number).find(n=>n>=1&&n<=8)
      ?? Number(full.match(/(?:^|\|)\s*([1-8])\s*(?:\||$)/)?.[1]);
    const name=cells.map(x=>x.match(/[一-龠々ヶヵぁ-んァ-ヶー]{2,}(?:\s+[一-龠々ヶヵぁ-んァ-ヶー]{1,})?/)?.[0])
      .find(x=>x&&!/(出走表|車番|選手名|ハンデ|試走|連率|前走|早見)/.test(x));
    if(!number||!name)return;

    const key=`${number}|${name}`;
    if(seen.has(key))return;
    seen.add(key);

    const nums=cells.flatMap(x=>[...x.replace(/,/g,"").matchAll(/-?\d+(?:\.\d+)?/g)].map(m=>Number(m[0])));
    const handicap=detectHandicap(cells,full);
    const trialTime=nums.find(v=>v>=3.20&&v<=4.20)??null;
    const className=full.match(/\b[AB]\d\b/)?.[0]||null;
    const rank=full.match(/\bS-\d+\b/)?.[0]||className;

    participants.push({
      id:`A${number}`,
      number,
      name,
      handicap,
      trialTime,
      className,
      rank,
      startSkill:deriveStartSkill(full),
      openingLapPower:deriveOpening(full),
      passingSkill:deriveRate(full,/3連対率|3連率/),
      lateRacePower:deriveRate(full,/2連対率|2連率/),
      stability:deriveStability(full),
      drySuitability:deriveSurfaceScore(full,"良"),
      wetSuitability:deriveSurfaceScore(full,"湿"),
      insideLineSkill:deriveLineSkill(full,"内"),
      outsideLineSkill:deriveLineSkill(full,"外"),
      recentForm:deriveRecent(full),
      trackSuitability:5,
      rawCells:cells
    });
  });

  const surface=detectSurface(body);
  const weather={
    temperature:numberMatch(body,/気温\s*(\d+(?:\.\d+)?)\s*°?C/),
    humidity:numberMatch(body,/湿度\s*(\d+(?:\.\d+)?)\s*%/),
    trackTemperature:numberMatch(body,/走路温度\s*(\d+(?:\.\d+)?)\s*°?C/),
    condition:surface
  };

  const raceNo=Number(body.match(/\b(1[0-2]|[1-9])R\b/)?.[1]||0);
  const deadline=body.match(/\b([0-2]?\d:[0-5]\d)\b/)?.[1]||null;

  return {
    ok:participants.length>=6,
    race:{
      raceNo,
      deadline,
      surface,
      participants:participants.sort((a,b)=>a.number-b.number),
      weather
    },
    diagnostics:{
      participantCount:participants.length,
      title:normalizeText($("title").text()),
      context,
      warning:participants.length>=6?null:"6車以上を完全抽出できませんでした。"
    }
  };
}

function detectHandicap(cells,full){
  const labeled=full.match(/ハンデ\s*(\d+)/);
  if(labeled)return Number(labeled[1]);
  const values=cells.map(Number).filter(v=>Number.isFinite(v)&&v>=0&&v<=50&&v%10===0);
  return values[0]??null;
}
function detectSurface(text){
  if(/湿走路|雨走路/.test(text))return"wet";
  if(/斑走路/.test(text))return"mixed";
  if(/良走路/.test(text))return"dry";
  return"unknown";
}
function deriveStartSkill(text){
  const st=numberMatch(text,/平均ST\s*(\d+(?:\.\d+)?)/);
  return Number.isFinite(st)?clamp(10-st*20):5;
}
function deriveOpening(text){return /スタート先行|先行/.test(text)?7:5}
function deriveRate(text,regex){
  const m=text.match(new RegExp(`${regex.source}\\s*(\\d+(?:\\.\\d+)?)`));
  return m?clamp(Number(m[1])/10):5;
}
function deriveStability(text){
  const outside=numberMatch(text,/着外\s*(\d+)/);
  return Number.isFinite(outside)?clamp(10-outside):5;
}
function deriveSurfaceScore(text,label){
  const m=text.match(new RegExp(`${label}[^|]{0,80}3連対率\\s*(\\d+(?:\\.\\d+)?)`));
  return m?clamp(Number(m[1])/10):5;
}
function deriveLineSkill(text,label){
  const m=text.match(new RegExp(`${label}[^|]{0,60}(?:成績|連対率)\\s*(\\d+(?:\\.\\d+)?)`));
  return m?clamp(Number(m[1])/10):5;
}
function deriveRecent(text){
  const wins=(text.match(/\b1着\b/g)||[]).length;
  return clamp(5+wins*.8);
}
function numberMatch(text,regex){
  const m=text.match(regex);return m?Number(m[1]):null;
}
