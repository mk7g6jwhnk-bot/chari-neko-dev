import{jsonResponse}from"../../keirin/parser/utils.mjs";
export default async function handler(req){
  const u=new URL(req.url),date=u.searchParams.get("date")||"",venueCode=String(u.searchParams.get("venueCode")||"").padStart(2,"0"),venueName=u.searchParams.get("venueName")||"",raceNo=Number(u.searchParams.get("raceNo")||0);
  if(!/^\d{8}$/.test(date)||!/^\d{2}$/.test(venueCode)||!venueName||raceNo<1||raceNo>12)return jsonResponse(400,{ok:false,error:"結果取得に必要なレースIDが不正です"});
  const base=String(process.env.KEIRIN_BROWSER_SERVICE_URL||"").trim().replace(/\/$/,"");
  if(!base)return jsonResponse(500,{ok:false,error:"KEIRIN_BROWSER_SERVICE_URLが設定されていません"});
  const q=new URLSearchParams({date,venueCode,venueName,raceNo:String(raceNo)}),attempts=[];
  try{
    const response=await fetch(`${base}/keirin/result?${q}`,{headers:{accept:"application/json"},signal:AbortSignal.timeout(22000)});
    let data=null;try{data=await response.json()}catch{}
    attempts.push({path:"/keirin/result",status:response.status,error:data?.error||null});
    const result=normalizeResult(data?.result||data?.officialData?.result||data?.officialResult);
    if(response.ok&&result)return jsonResponse(200,{ok:true,race:{date,venueCode,venueName,raceNo},result,checkedAt:data?.checkedAt||new Date().toISOString()});
    if(response.status!==404&&response.status!==405)return jsonResponse(409,{ok:false,error:data?.error||"公式結果は未確定、または結果取得サービスが一時的に利用できません",attempts});
  }catch(error){
    attempts.push({path:"/keirin/result",error:error instanceof Error?error.message:String(error)});
    return jsonResponse(409,{ok:false,error:"公式結果取得サービスが時間内に応答しませんでした。少し待って再試行してください。",attempts});
  }
  // /keirin/resultが存在しない旧Railway版だけ互換フォールバック。
  try{
    const response=await fetch(`${base}/keirin/race?${q}`,{headers:{accept:"application/json"},signal:AbortSignal.timeout(22000)});
    let data=null;try{data=await response.json()}catch{}
    attempts.push({path:"/keirin/race",status:response.status,error:data?.error||null});
    const result=normalizeResult(data?.result||data?.officialData?.result||data?.officialResult);
    if(response.ok&&result)return jsonResponse(200,{ok:true,race:{date,venueCode,venueName,raceNo},result,checkedAt:data?.checkedAt||new Date().toISOString()});
  }catch(error){attempts.push({path:"/keirin/race",error:error instanceof Error?error.message:String(error)})}
  return jsonResponse(409,{ok:false,error:"公式結果は未確定、または結果取得サービスが一時的に利用できません",attempts});
}
export function normalizeResult(value){if(!value||typeof value!=="object")return null;const rawStatus=String(value.status||value.resultStatus||"").toLowerCase();if(rawStatus==="not_finished")return{status:"not_finished",finishOrder:[],payout:null,source:value.source||value.sourceType||"official"};const status=["cancelled","canceled","中止"].includes(rawStatus)?"cancelled":["refund","refunded","返還"].includes(rawStatus)?"refund":"confirmed";const finishOrder=(value.finishOrder||value.order||value.arrivalOrder||[]).map(x=>Number(x?.number??x)).filter(Number.isFinite).slice(0,3);if(status==="confirmed"&&finishOrder.length<3)return null;const combination=finishOrder.join("-"),trifecta=Array.isArray(value.payouts?.trifecta)?value.payouts.trifecta.find(x=>String(x.combination||"").replace(/\D/g,"")===combination.replace(/\D/g,""))||value.payouts.trifecta[0]:null;return{status,finishOrder,payout:Number(value.payout||value.trifectaPayout||trifecta?.payout||0)||null,source:value.source||value.sourceType||"official"}}
