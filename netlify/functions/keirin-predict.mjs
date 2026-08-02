import{parseRaceCardHtml}from"../../keirin/parser/racecard-parser.mjs";
import{inferLines}from"../../keirin/parser/line-parser.mjs";
import{parseKeirinTrifectaOddsHtml}from"../../keirin/parser/odds-parser.mjs";
import{runKeirinEngine}from"../../keirin/engine/keirin-engine.mjs";
import{jsonResponse}from"../../keirin/parser/utils.mjs";

export default async req=>{
  const u=new URL(req.url),
    raceCardUrl=u.searchParams.get("raceCardUrl"),
    oddsUrl=u.searchParams.get("oddsUrl"),
    venueName=u.searchParams.get("venueName")||"競輪場",
    date=u.searchParams.get("date")||"",
    budget=Number(u.searchParams.get("budget")||3000),
    target=Number(u.searchParams.get("raceNo")||0);

  if(!raceCardUrl||!/^https:\/\/keirin\.jp\//.test(raceCardUrl)){
    return jsonResponse(400,{ok:false,error:"公式内部リンクのraceCardUrlが必要"});
  }

  const targetRaceCardUrl=withRaceNo(raceCardUrl,target||1);
  const targetOddsUrl=oddsUrl&&/^https:\/\/keirin\.jp\//.test(oddsUrl)
    ?withRaceNo(oddsUrl,target||1)
    :null;

  const jar=new Jar();

  try{
    const rr=await fw(targetRaceCardUrl,jar,"https://keirin.jp/pc/raceschedule");
    if(!rr.ok)return jsonResponse(502,{ok:false,error:`出走表HTTP ${rr.status}`,targetRaceCardUrl});

    const cards=parseRaceCardHtml(await rr.text(),{sourceUrl:targetRaceCardUrl});
    const card=target
      ?cards.races.find(x=>x.raceNo===target)||cards.races[0]
      :cards.races[0];

    if(!card){
      return jsonResponse(422,{
        ok:false,
        error:"対象レース抽出失敗",
        targetRaceCardUrl,
        cards
      });
    }

    const line=inferLines({
      participants:card.participants,
      lineText:card.lineSource
    });

    const race={
      id:`${date}-${venueName}-${card.raceNo}`,
      venue:venueName,
      raceNo:card.raceNo,
      deadline:card.deadline,
      lineConfidence:line.confidence,
      participants:line.participants
    };

    let odds={ok:false,odds:{},diagnostics:{}};

    if(targetOddsUrl){
      try{
        const or=await fw(targetOddsUrl,jar,targetRaceCardUrl);
        if(or.ok){
          odds=parseKeirinTrifectaOddsHtml(
            await or.text(),
            {sourceUrl:targetOddsUrl}
          );
        }
      }catch{}
    }

    const prediction=runKeirinEngine({
      race,
      oddsByOrder:odds.odds,
      budget
    });

    return jsonResponse(200,{
      ok:prediction.audit.passed,
      race,
      odds,
      prediction,
      sourceUrls:{
        raceCardUrl:targetRaceCardUrl,
        oddsUrl:targetOddsUrl
      },
      dataQuality:{
        lineConfidence:line.confidence,
        oddsAvailable:odds.ok
      },
      warnings:[
        ...line.warnings,
        !odds.ok?"オッズ未取得・購入判断保留":null
      ].filter(Boolean),
      checkedAt:new Date().toISOString()
    });
  }catch(e){
    return jsonResponse(500,{ok:false,error:e.message});
  }
};

function withRaceNo(url,raceNo){
  const parsed=new URL(url);
  parsed.searchParams.set("RNO",String(raceNo));
  return parsed.toString();
}

class Jar{
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
