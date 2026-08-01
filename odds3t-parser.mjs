
import * as cheerio from "cheerio";
import { normalizeText } from "./utils.mjs";

export function parseOdds3tHtml(html, context = {}) {
  const $ = cheerio.load(html), odds = {};

  $("tr").each((_, row) => {
    const text = $(row).find("th,td").toArray().map(c=>normalizeText($(c).text())).join(" ");
    for (const m of text.matchAll(/([1-6])\s*[-–]\s*([1-6])\s*[-–]\s*([1-6])\s+(\d+(?:\.\d+)?)/g)) {
      store(odds,m[1],m[2],m[3],m[4]);
    }
  });

  $("[data-odds],[data-bet],[data-combination]").each((_,el)=>{
    const e=$(el), combo=e.attr("data-bet")||e.attr("data-combination")||"", val=e.attr("data-odds")||normalizeText(e.text()), m=combo.match(/([1-6])\D([1-6])\D([1-6])/);
    if(m)store(odds,m[1],m[2],m[3],val);
  });

  const count=Object.keys(odds).length;
  return {
    ok:count>0,
    complete:count===120,
    odds,
    diagnostics:{parsedCount:count,expectedCount:120,context}
  };
}

function store(odds,a,b,c,v){
  a=Number(a);b=Number(b);c=Number(c);v=Number(v);
  if(new Set([a,b,c]).size!==3||!Number.isFinite(v)||v<=1)return;
  odds[`${a}-${b}-${c}`]=v;
}
