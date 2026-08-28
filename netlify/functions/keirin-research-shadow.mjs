import crypto from"node:crypto";
import{runResearchStateGraph}from"../../research/state-engine/state-engine.mjs";
import{generateResearchTerminals}from"../../research/state-engine/terminal-generator.mjs";
import{jsonResponse}from"../../keirin/parser/utils.mjs";

export default async function handler(req){
  if(!authorized(req))return jsonResponse(403,{ok:false,error:"forbidden"});
  const url=new URL(req.url);
  let payload;
  try{payload=await readAutoSealedPrediction(url)}
  catch(error){return jsonResponse(error?.status||502,{ok:false,error:String(error?.message||error),stage:error?.stage||"SEALED_PREDICTION_READ_FAILED"})}
  try{return jsonResponse(200,buildResearchShadowPayload({predictionPayload:payload,requestedScheduledStartAt:new URL(req.url).searchParams.get("scheduledStartAt")||null,now:new Date()}));}
  catch(error){return jsonResponse(422,{ok:false,error:String(error?.message||error),stage:error?.stage||"RESEARCH_ENGINE_FAILED"});}
}

export async function readAutoSealedPrediction(url,fetchImpl=fetch,env=process.env){
  const base=String(env.KEIRIN_BROWSER_SERVICE_URL||"").trim().replace(/\/$/,"");
  if(!base)throw httpError("KEIRIN_BROWSER_SERVICE_URL is not configured",500,"SEALED_PREDICTION_READ_FAILED");
  const query=new URLSearchParams({date:url.searchParams.get("date")||"",venueCode:url.searchParams.get("venueCode")||"",raceNo:url.searchParams.get("raceNo")||""});
  const response=await fetchImpl(`${base}/keirin/research/shadow/prediction?${query}`,{headers:{accept:"application/json"},signal:AbortSignal.timeout(12000)});
  const contentType=String(response.headers?.get?.("content-type")||"");
  const body=await response.text();
  let data=null;try{data=JSON.parse(body)}catch{}
  if(!response.ok||!data?.ok||!data?.predictionPayload){
    const detail=data?.error||`${contentType||"unknown content-type"}: ${body.slice(0,160)||"empty response"}`;
    throw httpError(detail,response.status===404?409:(response.status||502),response.status===404?"SEALED_PREDICTION_NOT_READY":"SEALED_PREDICTION_READ_FAILED");
  }
  return data.predictionPayload;
}

export function buildResearchShadowPayload({predictionPayload,requestedScheduledStartAt=null,now=new Date()}){
  const race=structuredClone(predictionPayload?.race||{});
  if(!Array.isArray(race.participants)||race.participants.length<3)throw stageError("normalized race input missing","PRE_RACE_INPUT_FETCH_FAILED");
  if(hasConfirmedResult(race)||hasConfirmedResult(predictionPayload?.officialData?.result))throw stageError("RESULT_DATA_FORBIDDEN_IN_SHADOW_SEAL_INPUT","RESULT_DATA_FORBIDDEN_IN_SHADOW_SEAL_INPUT");
  const inputObservedAt=predictionPayload?.checkedAt||predictionPayload?.predictionRequestedAt;
  const predictionSealedAt=now.toISOString();
  const scheduledStartAt=requestedScheduledStartAt||scheduledAt(race.date,race.startTime);
  if(!Number.isFinite(Date.parse(scheduledStartAt))||Date.parse(predictionSealedAt)>=Date.parse(scheduledStartAt))throw stageError("PREDICTION_SEAL_NOT_BEFORE_START","PREDICTION_SEAL_NOT_BEFORE_START");
  if(Date.parse(inputObservedAt)>Date.parse(predictionSealedAt))throw stageError("INPUT_AFTER_PREDICTION_SEAL","INPUT_AFTER_PREDICTION_SEAL");
  const immutableInput=deepFreeze({race,venueProfile:predictionPayload?.officialData?.venueProfile||predictionPayload?.officialData?.basic?.venueProfile||{}});
  const inputHash=hash(immutableInput);
  let graph;try{graph=runResearchStateGraph(immutableInput)}catch(error){throw stageError(String(error?.message||error),"RESEARCH_ENGINE_FAILED")}
  const research=generateResearchTerminals(graph);
  const currentTerminals=(predictionPayload?.prediction?.prediction?.terminals||predictionPayload?.prediction?.terminals||[]).map(row=>({order:row.order.map(Number),probability:Number(row.probability)||0}));
  const standardPurchaseOrders=(predictionPayload?.prediction?.standardPurchasePlan||[]).map(row=>row.order.map(Number));
  return{ok:true,version:"RESEARCH-SHADOW-COMPUTE-1.1",raceKey:raceKey(race),scheduledStartAt,inputObservedAt,predictionSealedAt,currentInputHash:inputHash,researchInputHash:inputHash,preRaceInput:immutableInput,current:{predictionVersion:predictionPayload.prediction?.prediction?.predictionVersion||predictionPayload.prediction?.engineVersion||null,terminals:currentTerminals,standardPurchaseOrders,noBet:Boolean(predictionPayload?.prediction?.noBet),noBetReason:predictionPayload?.prediction?.noBetReason||null},research:compactResearch(graph,research),audit:{sameImmutableInput:true,purchaseOutputStored:true,oddsUsedForResearch:false,calibratedProbability:null,calibrationStatus:research.calibrationStatus,apiResponseIsolation:"NEW_RESEARCH_ONLY_FUNCTION"}};
}

function compactResearch(graph,output){return{version:graph.version,calibrationStatus:graph.calibrationStatus,calibratedProbability:null,paths:graph.paths.map(path=>({pathId:path.pathId,scenarioProbability:path.probability,states:path.nodes.map(node=>({stateType:node.stateType,outcomeCode:node.outcomeCode,status:node.status,conditionalTransitionProbability:node.conditionalTransitionProbability,calibratedProbability:null,supportingEvidence:node.supportingEvidence,counterEvidence:node.counterEvidence,unknownEvidence:node.unknownEvidence}))})),terminals:output.terminals.map(row=>({order:row.order,terminalProbability:row.terminalProbability,calibratedProbability:null,pathIds:row.contributions.map(item=>item.pathId)})),audit:output.audit}}
function authorized(req){const secret=String(process.env.AUTO_RESEARCH_CALLBACK_SECRET||"");return Boolean(secret)&&req.headers.get("x-auto-research-secret")===secret}
function scheduledAt(date,time){const day=String(date||"").replace(/\D/g,""),m=String(time||"").match(/(\d{1,2}):(\d{2})/);return/^\d{8}$/.test(day)&&m?`${day.slice(0,4)}-${day.slice(4,6)}-${day.slice(6,8)}T${m[1].padStart(2,"0")}:${m[2]}:00+09:00`:null}
function raceKey(race){return`${String(race.date||"").replace(/\D/g,"")}-${String(race.venueCode||"").padStart(2,"0")}-${Number(race.raceNo)}`}
function hash(value){return crypto.createHash("sha256").update(stable(value)).digest("hex")}
function stable(v){if(Array.isArray(v))return`[${v.map(stable).join(",")}]`;if(v&&typeof v==="object")return`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`;return JSON.stringify(v)}
function deepFreeze(v){if(!v||typeof v!=="object"||Object.isFrozen(v))return v;Object.values(v).forEach(deepFreeze);return Object.freeze(v)}
function hasConfirmedResult(value){if(!value||typeof value!=="object")return false;if(value.status==="confirmed"||value.confirmed===true)return true;if(Array.isArray(value.finishOrder)&&value.finishOrder.length>=3)return true;return hasConfirmedResult(value.result)||hasConfirmedResult(value.officialResult)}
function stageError(message,stage){const error=new Error(message);error.stage=stage;return error}
function httpError(message,status,stage){const error=stageError(message,stage);error.status=status;return error}
