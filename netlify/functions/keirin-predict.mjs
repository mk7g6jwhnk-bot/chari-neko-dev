import{parseRaceCardHtml}from"../../keirin/parser/racecard-parser.mjs";
import{inferLines}from"../../keirin/parser/line-parser.mjs";
import{parseKeirinTrifectaOddsHtml}from"../../keirin/parser/odds-parser.mjs";
import{runKeirinEngine}from"../../keirin/engine/keirin-engine.mjs";
import{jsonResponse}from"../../keirin/parser/utils.mjs";

export default async req=>{
  const u=new URL(req.url),
    venueCode=String(u.searchParams.get("venueCode")||"").padStart(2,"0"),
    venueName=u.searchParams.get("venueName")||"競輪場",
    date=u.searchParams.get("date")||"",
    budget=Number(u.searchParams.get("budget")||3000),
    target=Number(u.searchParams.get("raceNo")||0);

  if(!/^\d{8}$/.test(date))return jsonResponse(400,{ok:false,error:"日付形式不正"});
  if(!/^\d{2}$/.test(venueCode))return jsonResponse(400,{ok:false,error:"会場コード不正"});
  if(!Number.isInteger(target)||target<1||target>12)return jsonResponse(400,{ok:false,error:"レース番号不正"});

  const targetRaceCardUrl=buildRaceCardUrl(date,venueCode,target);
  const targetOddsUrl=buildOddsUrl(date,venueCode,target);
  const jar=new Jar();

  try{
    const rr=await fw(targetRaceCardUrl,jar,"https://keirin.jp/pc/raceschedule");
    if(!rr.ok)return jsonResponse(502,{ok:false,error:`出走表HTTP ${rr.status}`,targetRaceCardUrl});

    const cards=parseRaceCardHtml(await rr.text(),{
      sourceUrl:targetRaceCardUrl,
      expectedRaceNo:target,
      expectedVenueCode:venueCode,
      expectedVenueName:venueName
    });

    const exact=cards.races.filter(x=>x.raceNo===target);
    if(exact.length!==1){
      return jsonResponse(422,{
        ok:false,
        error:`${venueName} ${target}Rの出走表を一意に抽出できません`,
        targetRaceCardUrl,
        expected:{venueCode,venueName,raceNo:target},
        diagnostics:cards.diagnostics,
        detectedRaces:cards.races.map(x=>({
          raceNo:x.raceNo,
          participantCount:x.participants.length,
          numbers:x.participants.map(p=>p.number)
        }))
      });
    }

    const card=exact[0];
    const numbers=card.participants.map(x=>x.number);
    if(
      card.participants.length<5||
      card.participants.length>9||
      new Set(numbers).size!==card.participants.length
    ){
      return jsonResponse(422,{
        ok:false,
        error:"選手抽出監査不合格",
        expected:{venueCode,venueName,raceNo:target},
        participantCount:card.participants.length,
        numbers,
        targetRaceCardUrl
      });
    }

    const line=inferLines({participants:card.participants,lineText:card.lineSource});
    const race={
      id:`${date}-${venueCode}-${target}`,
      venue:venueName,
      venueCode,
      raceNo:target,
      deadline:card.deadline,
      lineConfidence:line.confidence,
      participants:line.participants
    };

    let odds={ok:false,odds:{},diagnostics:{}};
    try{
      const or=await fw(targetOddsUrl,jar,targetRaceCardUrl);
      if(or.ok){
        odds=parseKeirinTrifectaOddsHtml(
          await or.text(),
          {sourceUrl:targetOddsUrl,expectedRaceNo:target}
        );
      }
    }catch{}

    const prediction=runKeirinEngine({race,oddsByOrder:odds.odds,budget});

    return jsonResponse(200,{
      ok:prediction.audit.passed,
      race,
      odds,
      prediction,
      sourceUrls:{raceCardUrl:targetRaceCardUrl,oddsUrl:targetOddsUrl},
      requestAudit:{date,venueCode,venueName,raceNo:target},
      dataQuality:{lineConfidence:line.confidence,oddsAvailable:odds.ok},
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

function buildRaceCardUrl(date,venueCode,raceNo){
  const q=new URLSearchParams({KBI:date,KCD:venueCode,RNO:String(raceNo)});
  return `https://keirin.jp/pc/dfw/dataplaza/guest/racemember?${q}`;
}
function buildOddsUrl(date,venueCode,raceNo){
  const q=new URLSearchParams({BET:"5",KBI:date,KCD:venueCode,RNO:String(raceNo)});
  return `https://keirin.jp/pc/dfw/dataplaza/guest/odds?${q}`;
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
