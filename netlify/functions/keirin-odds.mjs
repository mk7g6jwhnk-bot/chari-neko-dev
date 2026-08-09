function jsonResponse(status,body){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}})}

export default async function handler(req){
  const url=new URL(req.url),date=(url.searchParams.get("date")||"").replace(/\D/g,"").slice(0,8),venueCode=String(url.searchParams.get("venueCode")||"").padStart(2,"0"),venueName=url.searchParams.get("venueName")||"",raceNo=Number(url.searchParams.get("raceNo")||0);
  if(!/^\d{8}$/.test(date)||!/^\d{2}$/.test(venueCode)||!raceNo)return jsonResponse(400,{ok:false,error:"日付・会場コード・R番号が不足しています"});
  const base=String(process.env.KEIRIN_BROWSER_SERVICE_URL||"").trim().replace(/\/$/,"");
  if(!base)return jsonResponse(500,{ok:false,error:"KEIRIN_BROWSER_SERVICE_URLが設定されていません"});
  const q=new URLSearchParams({date,venueCode,venueName,raceNo:String(raceNo)}),attempts=[];
  for(let attempt=1;attempt<=2;attempt++){
    try{
      const response=await fetch(`${base}/keirin/race?${q}`,{headers:{accept:"application/json"},signal:AbortSignal.timeout(90000)});
      let payload;try{payload=await response.json()}catch{payload=null}
      attempts.push({attempt,status:response.status,error:payload?.error||null});
      if(!response.ok||payload?.ok===false){if(attempt<2&&(response.status>=500||/page crashed|target closed|browser|navigation|timeout/i.test(String(payload?.error||"")))){await sleep(650);continue}return jsonResponse(response.status||502,{ok:false,error:payload?.error||"公式オッズ取得失敗",attempts})}
      const basic=payload?.officialData?.basic||{},returnedDate=String(basic.date||"").replace(/\D/g,"").slice(0,8),returnedRace=Number(basic.raceNo||0),returnedVenue=String(basic.venueName||"");
      if(returnedDate!==date||returnedRace!==raceNo||(venueName&&returnedVenue&&returnedVenue!==venueName))return jsonResponse(409,{ok:false,error:"取得したレースが選択内容と一致しません",requested:{date,venueCode,venueName,raceNo},returned:{date:returnedDate,venueName:returnedVenue,raceNo:returnedRace}});
      const odds=normalizeOdds(payload?.officialData?.odds),startTime=String(basic.startTime||basic.deadline||""),deadline=String(basic.deadline||basic.startTime||"");
      return jsonResponse(200,{ok:true,race:{date,venueCode,venueName:returnedVenue||venueName,raceNo,startTime,deadline},odds,checkedAt:new Date().toISOString(),diagnostics:{attempts}});
    }catch(error){const message=error instanceof Error?error.message:String(error);attempts.push({attempt,error:message});if(attempt<2){await sleep(650);continue}return jsonResponse(502,{ok:false,error:"公式情報取得サービスが一時的に不安定です。再試行してください。",detail:message,attempts})}
  }
}

function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms))}

function normalizeOdds(raw){
  const source=raw&&typeof raw==="object"?(raw.odds&&typeof raw.odds==="object"?raw.odds:raw.oddsByOrder&&typeof raw.oddsByOrder==="object"?raw.oddsByOrder:raw):{},odds={};
  for(const [key,value] of Object.entries(source||{})){
    const normalized=String(key).replace(/^OZZ/i,"").replace(/[^1-9]/g,"").split("").slice(0,3).join("-");
    const n=Number(value);
    if(/^[1-9]-[1-9]-[1-9]$/.test(normalized)&&Number.isFinite(n)&&n>1)odds[normalized]=n;
  }
  return{available:Object.keys(odds).length>0,count:Object.keys(odds).length,odds};
}
