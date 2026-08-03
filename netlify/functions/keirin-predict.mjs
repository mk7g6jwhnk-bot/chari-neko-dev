import{parseRaceCardHtml}from"../../keirin/parser/racecard-parser.mjs";
import{inferLines}from"../../keirin/parser/line-parser.mjs";
import{parseKeirinTrifectaOddsHtml}from"../../keirin/parser/odds-parser.mjs";
import{runKeirinEngine}from"../../keirin/engine/keirin-engine.mjs";
import{jsonResponse}from"../../keirin/parser/utils.mjs";

const BASE="https://keirin.jp";
const RACE_URL=`${BASE}/sp/race`;

export default async req=>{
  const u=new URL(req.url),
    venueCode=String(u.searchParams.get("venueCode")||"").padStart(2,"0"),
    venueName=u.searchParams.get("venueName")||"競輪場",
    date=u.searchParams.get("date")||"",
    budget=Number(u.searchParams.get("budget")||3000),
    target=Number(u.searchParams.get("raceNo")||0);

  if(!/^\d{8}$/.test(date))
    return jsonResponse(400,{ok:false,error:"日付形式不正"});
  if(!/^\d{2}$/.test(venueCode))
    return jsonResponse(400,{ok:false,error:"会場コード不正"});
  if(!Number.isInteger(target)||target<1||target>12)
    return jsonResponse(400,{ok:false,error:"レース番号不正"});

  const jar=new Jar();

  try{
    const bootstrap=await fw(`${BASE}/sp/`,jar);
    const bootstrapHtml=await bootstrap.text();
    const bootstrapEncp=extractEncp(bootstrapHtml);

    const form=new URLSearchParams({
      encp:bootstrapEncp||"",
      disp:"SJ0315",
      skbn:"1",
      bkcd:venueCode,
      kday:date,
      rnum:String(target),
      kake:"",
      mode:"",
      searchOzz:"",
      hoji:""
    });

    const rr=await fw(RACE_URL,jar,`${BASE}/sp/`,{
      method:"POST",
      headers:{
        "content-type":"application/x-www-form-urlencoded",
        "origin":BASE
      },
      body:form.toString()
    });

    const raceHtml=await rr.text();
    const title=extractTitle(raceHtml);
    const responseEncp=extractEncp(raceHtml);

    const fetchAudit={
      bootstrap:{
        status:bootstrap.status,
        finalUrl:bootstrap.url,
        title:extractTitle(bootstrapHtml),
        encpFound:Boolean(bootstrapEncp)
      },
      racePost:{
        status:rr.status,
        finalUrl:rr.url,
        title,
        contentType:rr.headers.get("content-type")||null,
        encpFound:Boolean(responseEncp),
        htmlLength:raceHtml.length
      },
      request:{
        venueCode,
        venueName,
        date,
        raceNo:target,
        disp:"SJ0315",
        skbn:"1"
      }
    };

    if(!rr.ok){
      return jsonResponse(502,{
        ok:false,
        error:`公式レース情報POST HTTP ${rr.status}`,
        fetchAudit
      });
    }

    if(!/レース情報|出走表|競輪/.test(title)){
      return jsonResponse(422,{
        ok:false,
        error:"公式レース情報ページを取得できません",
        fetchAudit,
        responsePreview:safePreview(raceHtml)
      });
    }

    const cards=parseRaceCardHtml(raceHtml,{
      sourceUrl:RACE_URL,
      expectedRaceNo:target,
      expectedVenueCode:venueCode,
      expectedVenueName:venueName,
      transport:"POST /sp/race"
    });

    const exact=cards.races.filter(x=>x.raceNo===target);
    if(exact.length!==1){
      return jsonResponse(422,{
        ok:false,
        error:`${venueName} ${target}Rの出走表を一意に抽出できません`,
        expected:{venueCode,venueName,raceNo:target},
        diagnostics:cards.diagnostics,
        detectedRaces:cards.races.map(x=>({
          raceNo:x.raceNo,
          participantCount:x.participants.length,
          numbers:x.participants.map(p=>p.number)
        })),
        fetchAudit,
        responsePreview:safePreview(raceHtml)
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
        fetchAudit
      });
    }

    const line=inferLines({
      participants:card.participants,
      lineText:card.lineSource
    });

    const race={
      id:`${date}-${venueCode}-${target}`,
      venue:venueName,
      venueCode,
      raceNo:target,
      deadline:card.deadline,
      lineConfidence:line.confidence,
      participants:line.participants
    };

    const odds=parseKeirinTrifectaOddsHtml(raceHtml,{
      sourceUrl:RACE_URL,
      expectedRaceNo:target,
      transport:"POST /sp/race"
    });

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
      requestAudit:{date,venueCode,venueName,raceNo:target},
      fetchAudit,
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
    return jsonResponse(500,{
      ok:false,
      error:e.message
    });
  }
};

function extractEncp(html){
  const patterns=[
    /"encp"\s*:\s*"([^"]+)"/,
    /name=["']encp["'][^>]*value=["']([^"']+)["']/i,
    /value=["']([^"']+)["'][^>]*name=["']encp["']/i
  ];
  for(const pattern of patterns){
    const value=String(html||"").match(pattern)?.[1];
    if(value)return value;
  }
  return null;
}

function extractTitle(html){
  return String(html||"")
    .match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    ?.replace(/<[^>]+>/g,"")
    .replace(/\s+/g," ")
    .trim()||"";
}

function safePreview(html){
  return String(html||"")
    .replace(/<script[\s\S]*?<\/script>/gi,"")
    .replace(/<style[\s\S]*?<\/style>/gi,"")
    .replace(/<[^>]+>/g," ")
    .replace(/\s+/g," ")
    .trim()
    .slice(0,500);
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
  header(){
    return[...this.c].map(([k,v])=>`${k}=${v}`).join("; ");
  }
}

async function fw(url,jar,referer=null,options={}){
  const headers={
    "user-agent":"Mozilla/5.0 (compatible; ChariNekoDev/0.6; personal-use)",
    "accept-language":"ja",
    "accept":"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    ...(options.headers||{})
  };

  if(jar.header())headers.cookie=jar.header();
  if(referer)headers.referer=referer;

  const r=await fetch(url,{
    ...options,
    headers,
    redirect:"follow"
  });

  jar.ingest(r);
  return r;
}
