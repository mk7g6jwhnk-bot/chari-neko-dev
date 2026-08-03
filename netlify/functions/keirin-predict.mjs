import{jsonResponse}from"../../keirin/parser/utils.mjs";

const BASE="https://keirin.jp";
const TYPES=["JSJ035","JSJ036","JSJ037"];

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
    // Cookie取得
    const bootstrap=await fetchText(`${BASE}/sp/`,jar);

    // 公式レース一覧へ、確認できた項目名を中心に複数パターンで接続
    const attempts=await probeRaceList({
      jar,date,venueCode,target
    });

    const tokenAttempt=attempts.find(x=>x.tokens.hhEncSelR);

    if(!tokenAttempt){
      return jsonResponse(422,{
        ok:false,
        error:"公式レース一覧は取得できましたがhhEncSelRを抽出できません",
        requestAudit:{date,venueCode,venueName,raceNo:target},
        bootstrap:summarizePage(bootstrap),
        raceListAttempts:attempts.map(summarizePage)
      });
    }

    const encp=tokenAttempt.tokens.hhEncSelR;
    const jsonResults=[];

    for(const type of TYPES){
      jsonResults.push(
        await fetchJson(
          `${BASE}/sp/json?encp=${encodeURIComponent(encp)}&type=${type}`,
          jar,
          tokenAttempt.url,
          type
        )
      );
    }

    const j35=jsonResults.find(x=>x.type==="JSJ035"&&x.ok)?.data;
    const j36=jsonResults.find(x=>x.type==="JSJ036"&&x.ok)?.data;
    const j37=jsonResults.find(x=>x.type==="JSJ037"&&x.ok)?.data;

    const basic=extractBasic(j35);
    const lines=extractLines(j36);
    const participants=extractParticipants(j37);

    const actualDate=String(basic.date||"").replace(/\D/g,"");
    const identityPassed=
      basic.venueName===venueName&&
      Number(basic.raceNo)===target&&
      actualDate===date;

    const audit={
      requested:{date,venueCode,venueName,raceNo:target},
      tokenSource:{
        method:tokenAttempt.method,
        url:tokenAttempt.url,
        title:tokenAttempt.title,
        encpLength:encp.length,
        availableTokens:Object.keys(tokenAttempt.tokens)
      },
      basic,
      lineCount:lines.length,
      participantCount:participants.length,
      participantNumbers:participants.map(x=>x.number),
      identityPassed
    };

    if(!identityPassed){
      return jsonResponse(422,{
        ok:false,
        error:"公式JSONの会場・日付・R番号が選択内容と一致しません",
        audit,
        jsonResults:jsonResults.map(summarizeJson)
      });
    }

    if(participants.length<5||participants.length>9){
      return jsonResponse(422,{
        ok:false,
        error:"公式JSON接続成功。出走選手数の監査に合格しません",
        audit,
        participants,
        lines,
        jsonResults:jsonResults.map(summarizeJson)
      });
    }

    const numbers=participants.map(x=>x.number);
    if(new Set(numbers).size!==numbers.length){
      return jsonResponse(422,{
        ok:false,
        error:"公式JSON接続成功。車番重複を検出しました",
        audit,
        participants,
        lines
      });
    }

    // この段階では既存エンジンへの変換前。
    // 正しい公式データだけを表示し、誤予想は生成しない。
    return jsonResponse(200,{
      ok:false,
      error:"公式JSONから基本情報・ライン・出走選手を取得できました。次段階で予想エンジンへ接続します",
      officialData:{
        basic,
        lines,
        participants
      },
      audit,
      jsonResults:jsonResults.map(summarizeJson),
      checkedAt:new Date().toISOString()
    });
  }catch(e){
    return jsonResponse(500,{ok:false,error:e.message});
  }
};

async function probeRaceList({jar,date,venueCode,target}){
  const url=`${BASE}/sp/racelist`;
  const forms=[
    {
      name:"official-field-set",
      body:{
        disp:"SJ0305",
        skbn:"1",
        bkcd:venueCode,
        kday:date,
        rnum:String(target),
        kake:"",
        mode:"",
        searchOzz:"",
        hoji:""
      }
    },
    {
      name:"minimal",
      body:{
        bkcd:venueCode,
        kday:date,
        rnum:String(target)
      }
    },
    {
      name:"alternate",
      body:{
        jcd:venueCode,
        date,
        raceNo:String(target)
      }
    }
  ];

  const out=[];

  // GET候補
  for(const query of [
    {bkcd:venueCode,kday:date,rnum:String(target)},
    {jcd:venueCode,date,raceNo:String(target)}
  ]){
    const q=new URLSearchParams(query);
    out.push(await fetchText(`${url}?${q}`,jar,`${BASE}/sp/`,"GET"));
  }

  // POST候補
  for(const form of forms){
    const body=new URLSearchParams(form.body).toString();
    const page=await fetchText(url,jar,`${BASE}/sp/`,"POST",{
      method:"POST",
      headers:{
        "content-type":"application/x-www-form-urlencoded",
        "origin":BASE
      },
      body
    });
    page.formName=form.name;
    out.push(page);
  }

  return out;
}

async function fetchText(url,jar,referer=null,method="GET",options={}){
  const res=await fw(url,jar,referer,{
    ...options,
    method:options.method||method
  });
  const html=await res.text();
  return {
    method:options.method||method,
    url:res.url,
    status:res.status,
    ok:res.ok,
    title:extractTitle(html),
    htmlLength:html.length,
    tokens:extractHiddenTokens(html),
    preview:safePreview(html)
  };
}

async function fetchJson(url,jar,referer,type){
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

function extractBasic(data){
  const root=data?.CO201data||data?.co201data||data||{};
  return {
    venueName:String(root.joName||""),
    date:String(root.txtEventDate||""),
    raceNo:Number(root.selRaceNo||0),
    raceName:String(root.raceName||""),
    grade:String(root.imgGradeAlt||""),
    className:String(root.syumoku||""),
    deadline:String(root.aftBetTime||root.bfrBetTime||""),
    startTime:String(root.aftStartTime||root.bfrStartTime||"")
  };
}

function extractLines(data){
  const root=data?.narabiyoso||data?.narabiYoso||data||{};
  const raw=root.shaban;
  const rows=Array.isArray(raw)?raw:[];
  return rows.map((x,index)=>({
    order:index+1,
    position:Number(x.ichi||index+1),
    number:Number(x.shaban||0),
    className:String(x.classname||"")
  })).filter(x=>x.number>=1&&x.number<=9);
}

function extractParticipants(data){
  const candidates=findArrays(data);
  const source=candidates
    .filter(arr=>arr.length>=5&&arr.length<=9)
    .find(arr=>arr.every(x=>x&&typeof x==="object"&&(
      "sensyuRegistNo" in x||
      "sensyuName" in x||
      "syaban" in x
    )))||[];

  return source.map(x=>({
    number:Number(x.syaban||x.shaban||0),
    registration:String(x.sensyuRegistNo||""),
    name:String(x.sensyuName||""),
    prefecture:String(x.huken||""),
    className:String(x.kyuhan||x.prevKyuhan||""),
    style:String(x.kyakusitu||""),
    score:toNumber(x.heikinTokuten),
    escapeCount:toNumber(x.nigeCnt),
    makuriCount:toNumber(x.makuriCnt),
    differenceCount:toNumber(x.sasiCnt),
    markCount:toNumber(x.markCnt),
    backCount:toNumber(x.backCnt)
  })).filter(x=>x.number>=1&&x.number<=9);
}

function findArrays(value,out=[]){
  if(Array.isArray(value)){
    out.push(value);
    for(const item of value)findArrays(item,out);
  }else if(value&&typeof value==="object"){
    for(const item of Object.values(value))findArrays(item,out);
  }
  return out;
}

function extractHiddenTokens(html){
  const ids=[
    "hhEncSelR",
    "hhEncSelK",
    "hhEncPrmS",
    "hhEncParaS"
  ];
  const out={};

  for(const id of ids){
    const patterns=[
      new RegExp(`<input[^>]+id=["']${id}["'][^>]+value=["']([^"']+)["']`,"i"),
      new RegExp(`<input[^>]+value=["']([^"']+)["'][^>]+id=["']${id}["']`,"i")
    ];
    for(const pattern of patterns){
      const value=String(html||"").match(pattern)?.[1];
      if(value){
        out[id]=decodeHtml(value);
        break;
      }
    }
  }
  return out;
}

function decodeHtml(value){
  return String(value)
    .replace(/&amp;/g,"&")
    .replace(/&quot;/g,'"')
    .replace(/&#39;/g,"'")
    .replace(/&lt;/g,"<")
    .replace(/&gt;/g,">");
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
    .slice(0,300);
}

function summarizePage(x){
  return {
    method:x.method,
    formName:x.formName||null,
    url:x.url,
    status:x.status,
    ok:x.ok,
    title:x.title,
    htmlLength:x.htmlLength,
    tokenIds:Object.keys(x.tokens||{}),
    preview:x.preview
  };
}

function summarizeJson(x){
  return {
    type:x.type,
    status:x.status,
    ok:x.ok,
    contentType:x.contentType||null,
    textLength:x.textLength||0,
    topKeys:x.data&&typeof x.data==="object"
      ?Object.keys(x.data).slice(0,20):[],
    error:x.error||null
  };
}

function toNumber(value){
  const n=Number(String(value??"").replace(/[^\d.-]/g,""));
  return Number.isFinite(n)?n:null;
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
