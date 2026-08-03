import * as cheerio from "cheerio";
import { normalizeText } from "./utils.mjs";

export function parseKeirinTrifectaOddsHtml(html, context={}) {
  const $=cheerio.load(html),odds={};

  // 1) 「1-2-3 45.6」の通常表記
  $("tr,li,div,p").each((_,node)=>{
    const text=normalizeText($(node).text()).replace(/,/g,"");
    for(const m of text.matchAll(
      /([1-9])\s*[-–―→]\s*([1-9])\s*[-–―→]\s*([1-9])\s+(\d+(?:\.\d+)?)/g
    )){
      store(odds,m[1],m[2],m[3],m[4]);
    }
  });

  // 2) セル分割型: [1][2][3][45.6]
  $("tr").each((_,row)=>{
    const cells=$(row).find("th,td").toArray()
      .map(c=>normalizeText($(c).text()).replace(/,/g,""))
      .filter(Boolean);

    for(let i=0;i+3<cells.length;i++){
      const a=singleDigit(cells[i]);
      const b=singleDigit(cells[i+1]);
      const c=singleDigit(cells[i+2]);
      const v=singleOdds(cells[i+3]);
      if(a&&b&&c&&v)store(odds,a,b,c,v);
    }

    // 3) 行見出し＋複数オッズ型
    // 例: 1-2 | 3 | 45.6 | 4 | 52.1 ...
    const prefix=cells[0]?.match(/^([1-9])\s*[-–―→]\s*([1-9])$/);
    if(prefix){
      for(let i=1;i+1<cells.length;i+=2){
        const third=singleDigit(cells[i]);
        const value=singleOdds(cells[i+1]);
        if(third&&value)store(odds,prefix[1],prefix[2],third,value);
      }
    }
  });

  // 4) data属性に組番・オッズが入る形式
  $("[data-combination],[data-order],[data-odds]").each((_,node)=>{
    const order=$(node).attr("data-combination")||$(node).attr("data-order")||"";
    const value=$(node).attr("data-odds")||normalizeText($(node).text());
    const m=order.match(/([1-9])\D+([1-9])\D+([1-9])/);
    const v=singleOdds(value);
    if(m&&v)store(odds,m[1],m[2],m[3],v);
  });

  const count=Object.keys(odds).length;
  return {
    ok:count>0,
    odds,
    diagnostics:{
      parsedCount:count,
      context,
      expectedMax:504,
      completeness:count/504
    }
  };
}

function singleDigit(value){
  const m=String(value).trim().match(/^([1-9])$/);
  return m?Number(m[1]):null;
}

function singleOdds(value){
  const cleaned=String(value).replace(/,/g,"").trim();
  const m=cleaned.match(/^(\d+(?:\.\d+)?)$/);
  const n=m?Number(m[1]):null;
  return Number.isFinite(n)&&n>1?n:null;
}

function store(o,a,b,c,v){
  a=Number(a);b=Number(b);c=Number(c);v=Number(v);
  if(new Set([a,b,c]).size===3&&v>1)o[`${a}-${b}-${c}`]=v;
}
