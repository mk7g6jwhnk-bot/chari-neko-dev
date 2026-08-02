
import * as cheerio from "cheerio";
import {normalizeText} from "./utils.mjs";

export function parseAutoTrifectaOddsHtml(html,context={}){
  const $=cheerio.load(html),odds={};

  $("tr").each((_,row)=>{
    const text=$(row).find("th,td").toArray().map(c=>normalizeText($(c).text())).join(" ");
    for(const m of text.matchAll(/([1-8])\s*[-–]\s*([1-8])\s*[-–]\s*([1-8])\s+(\d+(?:\.\d+)?)/g)){
      store(odds,m[1],m[2],m[3],m[4]);
    }
  });

  $("[data-odds],[data-bet],[data-combination]").each((_,el)=>{
    const e=$(el),combo=e.attr("data-bet")||e.attr("data-combination")||"",
      value=e.attr("data-odds")||normalizeText(e.text()),
      m=combo.match(/([1-8])\D([1-8])\D([1-8])/);
    if(m)store(odds,m[1],m[2],m[3],value);
  });

  return {
    ok:Object.keys(odds).length>0,
    odds,
    diagnostics:{
      parsedCount:Object.keys(odds).length,
      context
    }
  };
}

function store(odds,a,b,c,value){
  const nums=[Number(a),Number(b),Number(c)],odd=Number(value);
  if(new Set(nums).size!==3||!Number.isFinite(odd)||odd<=1)return;
  odds[nums.join("-")]=odd;
}
