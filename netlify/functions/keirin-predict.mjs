import{jsonResponse}from"../../keirin/parser/utils.mjs";

const BASE="https://keirin.jp";

export default async req=>{
  const u=new URL(req.url),
    venueCode=String(u.searchParams.get("venueCode")||"").padStart(2,"0"),
    venueName=u.searchParams.get("venueName")||"競輪場",
    date=u.searchParams.get("date")||"",
    target=Number(u.searchParams.get("raceNo")||0);

  if(!/^\d{8}$/.test(date))
    return jsonResponse(400,{ok:false,error:"日付形式不正"});
  if(!/^\d{2}$/.test(venueCode))
    return jsonResponse(400,{ok:false,error:"会場コード不正"});
  if(!Number.isInteger(target)||target<1||target>12)
    return jsonResponse(400,{ok:false,error:"レース番号不正"});

  const jar=new Jar();

  try{
    const probe=await probeOfficialPages(jar);
    const tokenSource=probe.pages.find(x=>x.tokens.hhEncSelR);

    if(!tokenSource){
      return jsonResponse(422,{
        ok:false,
        error:"公式一覧ページから暗号パラメータを取得できません",
        requestAudit:{date,venueCode,venueName,raceNo:target},
        tokenProbe:probe
      });
    }

    const encp=tokenSource.tokens.hhEncSelR;
    const discoveredTypes=new Set([
      "JSJ035",
      ...tokenSource.jsonTypes,
      ...probe.pages.flatMap(x=>x.jsonTypes)
    ]);

    const jsonResults=[];
    for(const type of discoveredTypes){
      const result=await fetchOfficialJson(encp,type,jar,tokenSource.url);
      jsonResults.push(result);
    }

    const basic=jsonResults.find(x=>
      x.ok&&
      getPath(x.data,["CO201data","joName"])&&
      Number(getPath(x.data,["CO201data","selRaceNo"]))>0
    );

    const participantCandidates=[];
    for(const item of jsonResults){
      if(!item.ok)continue;
      const found=findParticipantObjects(item.data);
      if(found.length){
        participantCandidates.push({
          type:item.type,
          count:found.length,
          sample:found.slice(0,9)
        });
      }
    }

    const audit={
      requested:{date,venueCode,venueName,raceNo:target},
      tokenSource:{
        url:tokenSource.url,
        title:tokenSource.title,
        tokenIds:Object.keys(tokenSource.tokens),
        encpLength:encp.length
      },
      jsonTypes:[...discoveredTypes],
      basicRaceInfo:basic?.data?.CO201data||null,
      participantCandidates
    };

    if(!basic){
      return jsonResponse(422,{
        ok:false,
        error:"公式JSONには接続できましたが基本レース情報を確認できません",
        audit,
        jsonResults:jsonResults.map(summarizeJsonResult)
      });
    }

    const info=basic.data.CO201data;
    const actualName=String(info.joName||"");
    const actualRace=Number(info.selRaceNo||0);
    const actualDate=String(info.txtEventDate||"").replace(/\D/g,"");

    if(
      actualName!==venueName||
      actualRace!==target||
      actualDate!==date
    ){
      return jsonResponse(422,{
        ok:false,
        error:"公式JSONの会場・日付・R番号が選択内容と一致しません",
        audit,
        mismatch:{
          expected:{venueName,date,raceNo:target},
          actual:{venueName:actualName,date:actualDate,raceNo:actualRace}
        }
      });
    }

    if(!participantCandidates.length){
      return jsonResponse(422,{
        ok:false,
        error:"基本レース情報の取得成功。出走選手JSONの種類を探索中です",
        audit,
        jsonResults:jsonResults.map(summarizeJsonResult)
      });
    }

    return jsonResponse(422,{
      ok:false,
      error:"出走選手データ候補を発見しました。次のパッチで正式変換します",
      audit,
      jsonResults:jsonResults.map(summarizeJsonResult)
    });
  }catch(e){
    return jsonResponse(500,{
      ok:false,
      error:e.message
    });
  }
};

async function probeOfficialPages(jar){
  const queue=[
    `${BASE}/sp/`,
    `${BASE}/sp/top`,
    `${BASE}/sp/race`
  ];
  const seen=new Set();
  const pages=[];

  while(queue.length&&pages.length<12){
    const url=queue.shift();
    if(seen.has(url))continue;
    seen.add(url);

    try{
      const res=await fw(url,jar);
      const html=await res.text();
      const page={
        url:res.url,
        status:res.status,
        title:extractTitle(html),
        htmlLength:html.length,
        tokens:extractHiddenTokens(html),
        jsonTypes:extractJsonTypes(html),
        links:extractCandidateLinks(html,res.url)
      };
      pages.push(page);

      for(const link of page.links){
        if(!seen.has(link)&&queue.length<20)queue.push(link);
      }
    }catch(e){
      pages.push({
        url,
        status:0,
        title:"",
        htmlLength:0,
        tokens:{},
        jsonTypes:[],
        links:[],
        error:e.message
      });
    }
  }

  return {pages};
}

async function fetchOfficialJson(encp,type,jar,referer){
  const url=`${BASE}/sp/json?encp=${encodeURIComponent(encp)}&type=${encodeURIComponent(type)}`;
  try{
    const res=await fw(url,jar,referer,{
      headers:{accept:"application/json,text/plain,*/*"}
    });
    const text=await res.text();
    let data=null;
    try{data=JSON.parse(text)}catch{}
    return {
      type,
      url,
      status:res.status,
      ok:res.ok&&data!==null,
      contentType:res.headers.get("content-type")||null,
      textLength:text.length,
      data,
      preview:data===null?text.slice(0,180):null
    };
  }catch(e){
    return {type,url,status:0,ok:false,error:e.message};
  }
}

function extractHiddenTokens(html){
  const ids=["hhEncSelR","hhEncSelK","hhEncPrmS","hhEncParaS"];
  const out={};
  for(const id of ids){
    const patterns=[
      new RegExp(`<input[^>]+id=["']${id}["'][^>]+value=["']([^"']+)["']`,"i"),
      new RegExp(`<input[^>]+value=["']([^"']+)["'][^>]+id=["']${id}["']`,"i")
    ];
    for(const pattern of patterns){
      const value=String(html||"").match(pattern)?.[1];
      if(value){out[id]=value;break}
    }
  }
  return out;
}

function extractJsonTypes(html){
  const out=new Set();
  const text=String(html||"");
  for(const m of text.matchAll(/type[=:]["']?(J[A-Z0-9]{4,12})/gi))
    out.add(m[1]);
  for(const m of text.matchAll(/[?&]type=(J[A-Z0-9]{4,12})/gi))
    out.add(m[1]);
  return [...out];
}

function extractCandidateLinks(html,baseUrl){
  const out=new Set();
  const text=String(html||"");
  for(const m of text.matchAll(/(?:href|action)=["']([^"']+)["']/gi)){
    try{
      const url=new URL(m[1],baseUrl);
      if(
        url.hostname==="keirin.jp"&&
        url.pathname.startsWith("/sp/")&&
        /(race|top|kaisai|schedule|index)/i.test(url.pathname+url.search)
      ){
        out.add(url.href);
      }
    }catch{}
  }
  return [...out].slice(0,8);
}

function findParticipantObjects(value,path="$",out=[]){
  if(out.length>=20)return out;
  if(Array.isArray(value)){
    value.forEach((v,i)=>findParticipantObjects(v,`${path}[${i}]`,out));
    return out;
  }
  if(!value||typeof value!=="object")return out;

  const keys=Object.keys(value);
  const regKey=keys.find(k=>/sensyu.*regist|registration|registNo/i.test(k));
  const nameKey=keys.find(k=>/sensyu.*name|player.*name|nameSensyu/i.test(k));

  if(regKey&&nameKey){
    const numberKey=keys.find(k=>/syaban|carNo|number|shaban|waku/i.test(k));
    out.push({
      path,
      registration:String(value[regKey]??""),
      name:String(value[nameKey]??""),
      number:numberKey?Number(value[numberKey]||0):null,
      keys:keys.slice(0,20)
    });
  }

  for(const [k,v] of Object.entries(value))
    findParticipantObjects(v,`${path}.${k}`,out);

  return out;
}

function summarizeJsonResult(x){
  return {
    type:x.type,
    status:x.status,
    ok:x.ok,
    contentType:x.contentType||null,
    textLength:x.textLength||0,
    topKeys:x.data&&typeof x.data==="object"?Object.keys(x.data).slice(0,20):[],
    error:x.error||null
  };
}

function getPath(value,path){
  let current=value;
  for(const key of path){
    if(current==null)return null;
    current=current[key];
  }
  return current;
}

function extractTitle(html){
  return String(html||"")
    .match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    ?.replace(/<[^>]+>/g,"")
    .replace(/\s+/g," ")
    .trim()||"";
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
    "user-agent":"Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 Chrome/122 Safari/537.36",
    "accept-language":"ja-JP,ja;q=0.9",
    "accept":"text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
    ...(options.headers||{})
  };
  if(jar.header())headers.cookie=jar.header();
  if(referer)headers.referer=referer;

  const res=await fetch(url,{
    ...options,
    headers,
    redirect:"follow"
  });
  jar.ingest(res);
  return res;
}
