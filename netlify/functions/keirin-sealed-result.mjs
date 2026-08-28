import { jsonResponse } from "../../keirin/parser/utils.mjs";

export default async function handler(req) {
  if(req.method!=="GET")return jsonResponse(405,{ok:false,code:"METHOD_NOT_ALLOWED"});
  const url=new URL(req.url),raceKey=String(url.searchParams.get("raceKey")||""),date=String(url.searchParams.get("date")||"");
  if(!/^\d{8}-[A-Za-z0-9]+-\d{1,2}$/.test(raceKey)&&!/^\d{8}$/.test(date))return jsonResponse(400,{ok:false,code:"INVALID_QUERY"});
  const base=String(process.env.KEIRIN_BROWSER_SERVICE_URL||"").trim().replace(/\/$/,""),secret=String(process.env.AUTO_RESEARCH_CALLBACK_SECRET||"");
  if(!base||!secret)return jsonResponse(500,{ok:false,code:"SEALED_RESULT_PROXY_NOT_CONFIGURED"});
  const upstream=raceKey?`${base}/keirin/predictions/sealed/${encodeURIComponent(raceKey)}/result`:`${base}/keirin/predictions/sealed?date=${encodeURIComponent(date)}`;
  try{
    const response=await fetch(upstream,{headers:{accept:"application/json","x-auto-research-secret":secret},signal:AbortSignal.timeout(12000)});
    const contentType=String(response.headers.get("content-type")||""),text=await response.text();
    if(!contentType.toLowerCase().includes("application/json"))return jsonResponse(502,{ok:false,code:"UPSTREAM_NON_JSON",upstreamStatus:response.status,contentType,bodyPrefix:text.slice(0,160)});
    let data;try{data=JSON.parse(text)}catch{return jsonResponse(502,{ok:false,code:"UPSTREAM_INVALID_JSON",upstreamStatus:response.status,bodyPrefix:text.slice(0,160)})}
    if(!response.ok&&!([404,409].includes(response.status)))return jsonResponse(502,{ok:false,code:"UPSTREAM_ERROR",upstreamStatus:response.status,upstream:data});
    return jsonResponse(response.status,data);
  }catch(error){return jsonResponse(502,{ok:false,code:"SEALED_RESULT_UPSTREAM_FAILED",error:error instanceof Error?error.message:String(error)})}
}
