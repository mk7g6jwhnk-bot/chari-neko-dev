import { jsonResponse } from "../../keirin/parser/utils.mjs";

export default async function handler(req) {
  if(req.method!=="GET")return jsonResponse(405,{ok:false,code:"METHOD_NOT_ALLOWED"});
  const url=new URL(req.url),raceKey=String(url.searchParams.get("raceKey")||""),expectedHash=String(url.searchParams.get("predictionHash")||""),metadataOnly=url.searchParams.get("metadata")==="1";
  if(!/^\d{8}-[A-Za-z0-9]+-\d{1,2}$/.test(raceKey))return jsonResponse(400,{ok:false,code:"INVALID_RACE_KEY"});
  const base=String(process.env.KEIRIN_BROWSER_SERVICE_URL||"").trim().replace(/\/$/,"");
  if(!base)return jsonResponse(500,{ok:false,code:"SAVED_PREDICTION_PROXY_NOT_CONFIGURED"});
  try{
    const response=await fetch(`${base}/keirin/read/predictions/${encodeURIComponent(raceKey)}`,{headers:{accept:"application/json"},signal:AbortSignal.timeout(20000)}),text=await response.text();
    let data;try{data=JSON.parse(text)}catch{return jsonResponse(502,{ok:false,code:"UPSTREAM_INVALID_JSON"})}
    if(response.ok&&expectedHash&&data?.predictionHash!==expectedHash)return jsonResponse(409,{ok:false,code:"PREDICTION_HASH_MISMATCH",expectedHash,actualHash:data?.predictionHash||null});
    const prediction=data?.predictionPayload?.prediction||{},plan=prediction?.canonicalPurchasePlan?.standardTickets||prediction?.standardPurchasePlan||prediction?.purchasePlan||[];
    const body=metadataOnly&&response.ok?{ok:true,raceKey:data.raceKey,predictionHash:data.predictionHash,predictionVersion:data.predictionVersion||prediction.engineVersion,purchaseVersion:data.purchaseVersion||prediction?.purchase?.purchaseVersion,predictionHashVersion:data.predictionHashVersion||data?.predictionIdentity?.predictionHashVersion,predictionSealedAt:data.predictionSealedAt,integrityStatus:data.integrityStatus,temporalStatus:data.temporalStatus,tickets:plan.map(row=>({order:row.order,macroScenarioId:row.macroScenarioId||null,eventId:row.eventId||null,terminalId:row.terminalId||null,ticketClass:row.ticketClass||row.betClass||null,scenarioPurchaseClass:row.scenarioPurchaseClass||null}))}:data;
    const result=jsonResponse(response.status,body);
    for(const name of ["server-timing","x-response-bytes"])if(response.headers.get(name))result.headers.set(name,response.headers.get(name));
    return result;
  }catch(error){return jsonResponse(502,{ok:false,code:"SAVED_PREDICTION_UPSTREAM_FAILED",error:error instanceof Error?error.message:String(error)})}
}
