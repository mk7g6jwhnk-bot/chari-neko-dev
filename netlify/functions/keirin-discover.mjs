export default async function handler(req){
  const url=new URL(req.url),date=url.searchParams.get("date")||"";
  if(!/^\d{8}$/.test(date))return jsonResponse(400,{ok:false,error:"日付形式不正"});
  const base=String(process.env.KEIRIN_BROWSER_SERVICE_URL||"").trim().replace(/\/$/,"");
  if(!base)return jsonResponse(500,{ok:false,error:"KEIRIN_BROWSER_SERVICE_URLが設定されていません"});
  try{
    const response=await fetch(`${base}/keirin/discover?${new URLSearchParams({date})}`,{headers:{accept:"application/json"},signal:AbortSignal.timeout(120000)});
    const payload=await response.json();
    if(!response.ok||payload?.ok===false)return jsonResponse(response.status||502,{ok:false,error:payload?.error||"公式開催取得サービスでエラーが発生しました",browserService:payload});
    if(String(payload?.date||"")!==date)return jsonResponse(409,{ok:false,error:"開催取得結果の日付が要求と一致しません",requestedDate:date,returnedDate:String(payload?.date||"")});
    const meetings=(Array.isArray(payload?.meetings)?payload.meetings:[]).filter(meeting=>String(meeting?.date||date)===date&&meeting?.identityPassed===true&&String(meeting?.venueCode||"")!=="32"&&Array.isArray(meeting?.raceNumbers)&&meeting.raceNumbers.length>0).map(meeting=>adaptMeeting(base,date,meeting));
    return jsonResponse(200,{ok:true,date,meetings,diagnostics:{source:"KEIRIN_BROWSER_SERVICE_URL",railwayMeetingCount:Array.isArray(payload?.meetings)?payload.meetings.length:0,adaptedMeetingCount:meetings.length},checkedAt:new Date().toISOString()});
  }catch(error){return jsonResponse(502,{ok:false,error:error instanceof Error?error.message:String(error)});}
}

function adaptMeeting(base,date,meeting){
  const venueCode=String(meeting.venueCode||"").padStart(2,"0"),venueName=String(meeting.venueName||"");
  const raceUrl=`${base}/keirin/race?${new URLSearchParams({date,venueCode,venueName,raceNo:"1"})}`;
  return {date,venueCode,venueName,raceNumbers:meeting.raceNumbers.map(Number).filter(Number.isInteger),identityPassed:true,verifiedMeeting:true,discoveredUrl:raceUrl,discovery:{ok:true,links:{raceCards:[],odds:[],results:[],other:[{text:"公式出走表",context:`${venueName} ${date}`,url:raceUrl}]},diagnostics:{source:"railway-adapter"}}};
}

function jsonResponse(status,body){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});}
