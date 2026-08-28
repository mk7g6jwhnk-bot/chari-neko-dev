import { jsonResponse } from "../../keirin/parser/utils.mjs";

export default async function handler(req) {
  const url=new URL(req.url),date=url.searchParams.get("date")||"",venueCode=String(url.searchParams.get("venueCode")||"").padStart(2,"0"),raceNo=Number(url.searchParams.get("raceNo")||0);
  if(!/^\d{8}$/.test(date)||!/^\d{2}$/.test(venueCode)||!Number.isInteger(raceNo)||raceNo<1||raceNo>12)return jsonResponse(400,{ok:false,error:"レースIDが不正です"});
  const base=String(process.env.KEIRIN_BROWSER_SERVICE_URL||"").trim().replace(/\/$/,"");
  if(!base)return jsonResponse(500,{ok:false,error:"KEIRIN_BROWSER_SERVICE_URLが設定されていません"});
  try{
    const query=new URLSearchParams({date,venueCode,raceNo:String(raceNo)});
    const response=await fetch(`${base}/keirin/research/shadow/prediction?${query}`,{headers:{accept:"application/json"},signal:AbortSignal.timeout(12000)});
    let data=null;try{data=await response.json()}catch{}
    if(response.status===404)return jsonResponse(404,{ok:false,error:"自動取得済み予想はありません",raceKey:`${date}-${venueCode}-${raceNo}`});
    if(!response.ok||!data)return jsonResponse(response.status||502,{ok:false,error:data?.error||"自動取得済み予想を読み取れません"});
    return jsonResponse(200,data);
  }catch(error){return jsonResponse(502,{ok:false,error:error instanceof Error?error.message:String(error)})}
}
