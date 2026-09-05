import { jsonResponse } from "../../keirin/parser/utils.mjs";

export default async function handler(req){
  if(req.method!=="GET")return jsonResponse(405,{ok:false,code:"METHOD_NOT_ALLOWED"});
  const url=new URL(req.url),to=normalizeDate(url.searchParams.get("to"))||japanDate(),from=normalizeDate(url.searchParams.get("from"))||shiftDate(to,-6),dates=dateRange(from,to,31);
  if(!dates.length)return jsonResponse(400,{ok:false,code:"INVALID_DATE_RANGE"});
  const base=String(process.env.KEIRIN_BROWSER_SERVICE_URL||"").trim().replace(/\/$/,"");
  if(!base)return jsonResponse(500,{ok:false,code:"PREDICTION_HISTORY_NOT_CONFIGURED"});
  const records=[],errors=[];
  for(let index=0;index<dates.length;index+=5){
    const batch=await Promise.all(dates.slice(index,index+5).map(date=>readDay(base,date)));
    for(const row of batch)row.ok?records.push(...row.records):errors.push({date:row.date,code:row.code});
  }
  records.sort((a,b)=>String(b.predictionSealedAt||"").localeCompare(String(a.predictionSealedAt||"")));
  return jsonResponse(200,{ok:true,from,to,dateCount:dates.length,count:records.length,records,partial:errors.length>0,errors,readOnly:true});
}

async function readDay(base,date){try{const response=await fetch(`${base}/keirin/read/predictions?date=${date}`,{headers:{accept:"application/json"},signal:AbortSignal.timeout(12000)}),data=await response.json();return response.ok&&data?.ok?{ok:true,date,records:Array.isArray(data.records)?data.records:[]}:{ok:false,date,code:data?.code||`HTTP_${response.status}`}}catch(error){return{ok:false,date,code:error?.name==="TimeoutError"?"TIMEOUT":"UPSTREAM_FAILED"}}}
function normalizeDate(value){const text=String(value||"").replace(/\D/g,"");return /^\d{8}$/.test(text)?text:null}
function parseDate(value){return new Date(`${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}T00:00:00+09:00`)}
function compact(date){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit"}).format(date).replace(/-/g,"")}
function shiftDate(value,days){const date=parseDate(value);date.setUTCDate(date.getUTCDate()+days);return compact(date)}
function dateRange(from,to,max){const start=parseDate(from),end=parseDate(to);if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||start>end)return[];const out=[];for(let date=start;date<=end&&out.length<max;date=new Date(date.getTime()+86400000))out.push(compact(date));return out}
function japanDate(){return compact(new Date())}
