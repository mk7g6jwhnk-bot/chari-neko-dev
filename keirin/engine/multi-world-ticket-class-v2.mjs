export const MULTI_WORLD_TICKET_CLASS_VERSION="MULTI_WORLD_TICKET_CLASS_V2";
export const MULTI_WORLD_CLASSIFICATION_SOURCE="CANONICAL_V2";

const number=value=>Number.isFinite(Number(value))?Number(value):0;
const orderKey=row=>(row?.order||[]).map(Number).join("-");

function mainWorldTicketClass(row){
  const convergence=number(row?.naturalConvergenceScore);
  const mainThreshold=row?.lineIndependentMainSupport===true?.54:.58;
  if(row?.directMainBranchSupport===true&&row?.branchHeadMatched===true&&convergence>=mainThreshold)return"MAIN";
  if(row?.chatForecastRole==="main"&&convergence>=.46)return"MAIN";
  if(Number(row?.rankWithinEvent)===1)return"MAIN";
  const existing=String(row?.preMultiWorldTicketClass||row?.ticketClass||row?.mainCoverClassification||row?.betClass||"").toUpperCase();
  return existing==="MAIN"?"MAIN":"COVER";
}

export function worldClassForScenarioRank(rank){
  return rank===1?"MAIN":rank===2?"SECONDARY":Number.isInteger(rank)&&rank>=3?"SCENARIO_BREAK":null;
}

export function classifyMultiWorldTicketV2(row,scenarioRank){
  const worldClass=worldClassForScenarioRank(scenarioRank);
  if(!worldClass)return null;
  const ticketClass=worldClass==="SCENARIO_BREAK"?"SCENARIO_BREAK":worldClass==="SECONDARY"?"COVER":mainWorldTicketClass(row);
  return{worldClass,ticketClass};
}

export function attachCanonicalMultiWorldTicketClasses(prediction,{enabled=false}={}){
  if(!enabled)return prediction;
  const scenarios=prediction?.multiWorldScenario?.scenarios||[];
  const rankById=new Map(scenarios.map(row=>[String(row?.macroScenarioId||""),Number(row?.scenarioRank)]));
  const standard=prediction?.standardPurchasePlan||[];
  const classified=standard.map(row=>{
    const scenarioRank=rankById.get(String(row?.macroScenarioId||""));
    const classification=classifyMultiWorldTicketV2(row,scenarioRank);
    if(!classification)return{...row,ticketClass:null,worldClass:null,scenarioRank:Number.isInteger(scenarioRank)?scenarioRank:null,ticketClassVersion:MULTI_WORLD_TICKET_CLASS_VERSION,classificationSource:"CANONICAL_V2_INVALID",classificationResultDataUsed:false,thick:Boolean(row?.thick===true||row?.thickQualified===true)};
    return{...row,...classification,scenarioPurchaseClass:classification.worldClass,scenarioRank,
      ticketClassVersion:MULTI_WORLD_TICKET_CLASS_VERSION,classificationSource:MULTI_WORLD_CLASSIFICATION_SOURCE,
      classificationResultDataUsed:false,thick:Boolean(row?.thick===true||row?.thickQualified===true)};
  });
  const byOrder=new Map(classified.map(row=>[orderKey(row),row]));
  const propagate=rows=>(rows||[]).map(row=>{const source=byOrder.get(orderKey(row));return source?{...row,worldClass:source.worldClass,scenarioRank:source.scenarioRank,ticketClass:source.ticketClass,scenarioPurchaseClass:source.scenarioPurchaseClass,thick:source.thick,ticketClassVersion:source.ticketClassVersion,classificationSource:source.classificationSource,classificationResultDataUsed:false}:row;});
  return{...prediction,
    standardPurchasePlan:classified,
    purchasePlan:propagate(prediction?.purchasePlan),
    terminals:propagate(prediction?.terminals),
    audit:{...(prediction?.audit||{}),multiWorldPurchase:{...(prediction?.audit?.multiWorldPurchase||{}),ticketClassVersion:MULTI_WORLD_TICKET_CLASS_VERSION,classificationSource:classified.every(row=>row.classificationSource===MULTI_WORLD_CLASSIFICATION_SOURCE)?MULTI_WORLD_CLASSIFICATION_SOURCE:"CANONICAL_V2_INVALID"}}
  };
}
