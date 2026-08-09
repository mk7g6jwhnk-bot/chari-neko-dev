function jsonResponse(status,body){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}})}

export default async function handler(req){
  const url=new URL(req.url),date=(url.searchParams.get("date")||"").replace(/\D/g,"").slice(0,8),venueCodes=[...new Set(String(url.searchParams.get("venueCodes")||"").split(",").map(code=>String(code||"").replace(/\D/g,"").padStart(2,"0")).filter(code=>/^\d{2}$/.test(code)))].slice(0,16);
  if(!/^\d{8}$/.test(date)||!venueCodes.length)return jsonResponse(400,{ok:false,error:"日付・会場コードが不足しています"});
  const base=String(process.env.KEIRIN_BROWSER_SERVICE_URL||"").trim().replace(/\/$/,"");
  if(!base)return jsonResponse(500,{ok:false,error:"KEIRIN_BROWSER_SERVICE_URLが設定されていません"});
  const q=new URLSearchParams({date,venueCodes:venueCodes.join(",")});
  try{
    const response=await fetch(`${base}/keirin/active-races?${q}`,{headers:{accept:"application/json"},signal:AbortSignal.timeout(15000)});
    let payload;try{payload=await response.json()}catch{payload=null}
    if(!response.ok||payload?.ok===false)return jsonResponse(response.status||502,{ok:false,error:payload?.error||"残りレース確認に失敗しました"});
    return jsonResponse(200,{ok:true,date,venues:Array.isArray(payload?.venues)?payload.venues:[],checkedAt:payload?.checkedAt||new Date().toISOString(),cacheHit:Boolean(payload?.cacheHit)});
  }catch(error){return jsonResponse(502,{ok:false,error:"残りレース確認が時間内に完了しませんでした",detail:error instanceof Error?error.message:String(error)})}
}
