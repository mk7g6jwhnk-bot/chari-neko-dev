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
      const screening=buildScreeningPreview(payload?.officialData||{},odds);
      return jsonResponse(200,{ok:true,race:{date,venueCode,venueName:returnedVenue||venueName,raceNo,startTime,deadline},odds,screening,checkedAt:new Date().toISOString(),diagnostics:{attempts}});
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


export function buildScreeningPreview(officialData,odds){
  const basic=officialData?.basic||{},participants=Array.isArray(officialData?.participants)?officialData.participants:[],lines=Array.isArray(officialData?.lines)?officialData.lines:[];
  const text=[basic.className,basic.raceName,basic.grade,...participants.map(item=>item?.className)].filter(Boolean).join(" ");
  const raceCategory=/(ガールズ|女子|Ｌ級|L級|ガ予|ガ決)/i.test(text)?"girls":"standard";
  const groups=groupLinePreview(lines),covered=new Set(lines.map(item=>Number(item?.number)).filter(number=>number>=1&&number<=9)).size;
  const participantCount=participants.length||covered;
  const lineVerified=raceCategory==="girls"?true:Boolean(groups.length&&covered>=Math.max(3,participantCount-1)&&groups.every(group=>group.ordered));
  const maxLineLength=groups.length?Math.max(...groups.map(group=>group.numbers.length)):0;
  const lineDominance=raceCategory==="girls"?.35:(participantCount?maxLineLength/participantCount:0);
  const values=Object.values(odds?.odds||{}).map(Number).filter(value=>Number.isFinite(value)&&value>1).sort((a,b)=>a-b);
  const minOdds=values[0]??null,q25Odds=quantile(values,.25),medianOdds=quantile(values,.5),q75Odds=quantile(values,.75);
  const popularity=minOdds?clamp01(1/(1+Math.log10(Math.max(1,minOdds)))):0;
  const lineQuality=raceCategory==="girls"?.60:(lineVerified?1:.15);
  const predictability=clamp01(.45*popularity+.30*lineDominance+.25*lineQuality);
  const medianLevel=medianOdds?clamp01(Math.log10(Math.max(1,medianOdds))/3):0;
  const spread=q25Odds&&q75Odds?clamp01(Math.log10(Math.max(1,q75Odds/q25Odds)+1)):0;
  const valuePotential=clamp01(.62*medianLevel+.38*spread);
  return{
    stage:"PRIMARY_SCREENING",
    raceCategory,
    participantCount,
    fixedLineApplicable:raceCategory!=="girls",
    lineVerified,
    lineGroups:groups,
    lineCount:groups.length,
    maxLineLength,
    oddsCount:values.length,
    minOdds,q25Odds,medianOdds,q75Odds,
    predictability,valuePotential,
    note:raceCategory==="girls"?"固定ラインではなく主導権・仕掛け順を個別深掘りで評価":"公式並びの順序監査を一次選別へ使用"
  };
}
function groupLinePreview(lines){
  const groups=new Map();
  for(const item of lines||[]){
    const number=Number(item?.number),id=lineIdentity(item);
    if(!(number>=1&&number<=9)||!id)continue;
    if(!groups.has(id))groups.set(id,[]);
    groups.get(id).push({number,position:Number(item?.position??item?.order)});
  }
  return[...groups.entries()].map(([id,items])=>{
    const sorted=items.sort((a,b)=>(Number.isFinite(a.position)?a.position:99)-(Number.isFinite(b.position)?b.position:99));
    const ordered=sorted.every((item,index)=>Number.isFinite(item.position)&&item.position===index+1);
    return{id,numbers:sorted.map(item=>item.number),ordered};
  }).sort((a,b)=>String(a.id).localeCompare(String(b.id),"en"));
}
function lineIdentity(item){const raw=String(item?.lineId||item?.groupId||item?.className||"").trim();if(!raw)return null;if(/^(?:line|group)[-_ ]?\d+$/i.test(raw))return raw.toLowerCase().replace(/[ _]+/g,"-");if(/^\d+$/.test(raw))return`line-${raw}`;return null}
function quantile(values,q){if(!values.length)return null;const pos=(values.length-1)*q,lo=Math.floor(pos),hi=Math.ceil(pos);return lo===hi?values[lo]:values[lo]+(values[hi]-values[lo])*(pos-lo)}
function clamp01(value){return Math.max(0,Math.min(1,Number(value)||0))}
