
import * as cheerio from "cheerio";
import { normalizeText } from "./utils.mjs";

export function parseKeirinTrifectaOddsHtml(html,context={}) {
  const $=cheerio.load(html),odds={};
  $("tr").each((_,row)=>{
    const text=$(row).find("th,td").toArray().map(c=>normalizeText($(c).text())).join(" ");
    for(const m of text.matchAll(/([1-9])\s*[-–]\s*([1-9])\s*[-–]\s*([1-9])\s+(\d+(?:\.\d+)?)/g))store(odds,m[1],m[2],m[3],m[4]);
  });
  const count=Object.keys(odds).length;
  return {ok:count>0,odds,diagnostics:{parsedCount:count,context}};
}
function store(o,a,b,c,v){a=Number(a);b=Number(b);c=Number(c);v=Number(v);if(new Set([a,b,c]).size===3&&v>1)o[`${a}-${b}-${c}`]=v}
