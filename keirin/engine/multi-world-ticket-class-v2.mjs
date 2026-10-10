export const MULTI_WORLD_TICKET_CLASS_VERSION="MULTI_WORLD_TICKET_CLASS_V2";
export const MULTI_WORLD_CLASSIFICATION_SOURCE="CANONICAL_V2";
export const MULTI_WORLD_TICKET_CLASS_RULE_VERSION="MULTI_WORLD_WORLD_CLASS_MAPPING_V1";

const finite=value=>value===null||value===undefined||value===""?null:Number.isFinite(Number(value))?Number(value):null;
const orderKey=row=>(row?.order||[]).map(Number).join("-");

function classificationRank(row){
  return finite(row?.rankWithinScenario)??finite(row?.scenarioTicketRank)??finite(row?.rankWithinEvent)??finite(row?.globalRank);
}

function mainWorldContext(rows){
  const source=(rows||[]).map((row,index)=>({row,index,rank:classificationRank(row)}));
  if(source.length===1)return{status:"SOLE_TERMINAL",strengthField:null,boundaryRank:1,boundaryGap:null};
  if(source.length<2)return{status:"INSUFFICIENT_MAIN_EVIDENCE",strengthField:null,boundaryRank:null,boundaryGap:null};
  if(source.some(item=>item.rank===null)||new Set(source.map(item=>item.rank)).size!==source.length){
    return{status:"INSUFFICIENT_MAIN_EVIDENCE",strengthField:null,boundaryRank:null,boundaryGap:null};
  }
  source.sort((a,b)=>a.rank-b.rank||a.index-b.index);
  const strengthField=source.every(item=>finite(item.row?.terminalRelativeScore)!==null)
    ?"terminalRelativeScore"
    :source.every(item=>finite(item.row?.terminalScore)!==null)?"terminalScore":null;
  if(!strengthField)return{status:"INSUFFICIENT_MAIN_EVIDENCE",strengthField:null,boundaryRank:null,boundaryGap:null};
  let boundaryIndex=null,maxGap=0;
  for(let index=0;index<source.length-1;index++){
    const current=finite(source[index].row[strengthField]),next=finite(source[index+1].row[strengthField]);
    const gap=current-next,tolerance=Number.EPSILON*Math.max(1,Math.abs(current),Math.abs(next));
    if(gap>tolerance&&gap>maxGap){maxGap=gap;boundaryIndex=index;}
  }
  if(boundaryIndex===null)return{status:"INSUFFICIENT_MAIN_EVIDENCE",strengthField,boundaryRank:null,boundaryGap:null};
  return{status:"NATURAL_TERMINAL_GAP_OBSERVED",strengthField,boundaryRank:boundaryIndex+1,boundaryGap:maxGap};
}

export function worldClassForScenarioRank(rank){
  return rank===1?"MAIN":rank===2?"SECONDARY":Number.isInteger(rank)&&rank>=3?"SCENARIO_BREAK":null;
}

export function ticketClassForWorldClass(worldClass){
  return worldClass==="MAIN"?"MAIN":worldClass==="SECONDARY"?"COVER":worldClass==="SCENARIO_BREAK"?"SCENARIO_BREAK":null;
}

export function classifyMultiWorldTicketV2(_row,scenarioRank){
  const worldClass=worldClassForScenarioRank(scenarioRank);
  if(!worldClass)return null;
  const ticketClass=ticketClassForWorldClass(worldClass);
  const ticketClassReasonCode=worldClass==="MAIN"?"MAIN_WORLD_CLASS":worldClass==="SECONDARY"?"SECONDARY_WORLD_COVER":"SCENARIO_BREAK_WORLD";
  return{worldClass,ticketClass,ticketClassReasonCode};
}

export function auditWorldTicketClassInvariant(rows){
  const worlds=new Map();
  for(const row of rows||[]){
    const id=String(row?.macroScenarioId||"");
    if(!id||!row?.worldClass||!row?.ticketClass)continue;
    if(!worlds.has(id))worlds.set(id,{worldClasses:new Set(),ticketClasses:new Set(),tickets:0});
    const world=worlds.get(id);world.worldClasses.add(row.worldClass);world.ticketClasses.add(row.ticketClass);world.tickets++;
  }
  const violations=[];
  for(const [macroScenarioId,world] of worlds){
    const worldClasses=[...world.worldClasses],ticketClasses=[...world.ticketClasses],expected=worldClasses.length===1?ticketClassForWorldClass(worldClasses[0]):null;
    if(worldClasses.length!==1||ticketClasses.length!==1||ticketClasses[0]!==expected)violations.push({macroScenarioId,worldClasses,ticketClasses,expected,tickets:world.tickets});
  }
  return{passed:violations.length===0,checkedWorlds:worlds.size,violations};
}

export function attachCanonicalMultiWorldTicketClasses(prediction,{enabled=false}={}){
  if(!enabled)return prediction;
  const scenarios=prediction?.multiWorldScenario?.scenarios||[];
  const rankById=new Map(scenarios.map(row=>[String(row?.macroScenarioId||""),Number(row?.scenarioRank)]));
  const standard=prediction?.standardPurchasePlan||[];
  const mainRows=standard.filter(row=>rankById.get(String(row?.macroScenarioId||""))===1);
  const mainContext=mainWorldContext(mainRows);
  const classified=standard.map(row=>{
    const scenarioRank=rankById.get(String(row?.macroScenarioId||""));
    const classification=classifyMultiWorldTicketV2(row,scenarioRank);
    if(!classification)return{...row,ticketClass:null,worldClass:null,scenarioRank:Number.isInteger(scenarioRank)?scenarioRank:null,ticketClassVersion:MULTI_WORLD_TICKET_CLASS_VERSION,classificationSource:"CANONICAL_V2_INVALID",classificationResultDataUsed:false,thick:Boolean(row?.thick===true||row?.thickQualified===true)};
    return{...row,...classification,scenarioPurchaseClass:classification.worldClass,scenarioRank,
      ticketClassVersion:MULTI_WORLD_TICKET_CLASS_VERSION,classificationSource:MULTI_WORLD_CLASSIFICATION_SOURCE,
      ticketClassRuleVersion:MULTI_WORLD_TICKET_CLASS_RULE_VERSION,
      mainEvidenceStrengthField:classification.worldClass==="MAIN"?mainContext.strengthField:null,
      mainEvidenceStrength:classification.worldClass==="MAIN"&&mainContext.strengthField?finite(row?.[mainContext.strengthField]):null,
      mainEvidenceBoundaryRank:classification.worldClass==="MAIN"?mainContext.boundaryRank:null,
      mainEvidenceBoundaryGap:classification.worldClass==="MAIN"?mainContext.boundaryGap:null,
      mainEvidenceResultDataUsed:false,
      classificationResultDataUsed:false,thick:Boolean(row?.thick===true||row?.thickQualified===true)};
  });
  const worldInvariant=auditWorldTicketClassInvariant(classified);
  if(!worldInvariant.passed){const error=new Error("MULTI_WORLD_TICKET_CLASS_WORLD_MIXED");error.code="MULTI_WORLD_TICKET_CLASS_WORLD_MIXED";error.violations=worldInvariant.violations;throw error;}
  const byOrder=new Map(classified.map(row=>[orderKey(row),row]));
  const propagate=rows=>(rows||[]).map(row=>{const source=byOrder.get(orderKey(row));return source?{...row,worldClass:source.worldClass,scenarioRank:source.scenarioRank,ticketClass:source.ticketClass,scenarioPurchaseClass:source.scenarioPurchaseClass,thick:source.thick,ticketClassVersion:source.ticketClassVersion,classificationSource:source.classificationSource,ticketClassRuleVersion:source.ticketClassRuleVersion,ticketClassReasonCode:source.ticketClassReasonCode,mainEvidenceStrengthField:source.mainEvidenceStrengthField,mainEvidenceStrength:source.mainEvidenceStrength,mainEvidenceBoundaryRank:source.mainEvidenceBoundaryRank,mainEvidenceBoundaryGap:source.mainEvidenceBoundaryGap,mainEvidenceResultDataUsed:false,classificationResultDataUsed:false}:row;});
  return{...prediction,
    standardPurchasePlan:classified,
    purchasePlan:propagate(prediction?.purchasePlan),
    terminals:propagate(prediction?.terminals),
    audit:{...(prediction?.audit||{}),multiWorldPurchase:{...(prediction?.audit?.multiWorldPurchase||{}),ticketClassVersion:MULTI_WORLD_TICKET_CLASS_VERSION,classificationSource:classified.every(row=>row.classificationSource===MULTI_WORLD_CLASSIFICATION_SOURCE)?MULTI_WORLD_CLASSIFICATION_SOURCE:"CANONICAL_V2_INVALID",ticketClassRuleVersion:MULTI_WORLD_TICKET_CLASS_RULE_VERSION,worldTicketClassInvariant:worldInvariant,mainEvidenceStatus:mainContext.status,mainEvidenceStrengthField:mainContext.strengthField,mainEvidenceBoundaryRank:mainContext.boundaryRank,mainEvidenceBoundaryGap:mainContext.boundaryGap,mainEvidenceResultDataUsed:false}}
  };
}
