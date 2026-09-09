export const SCENARIO_PROVENANCE_SCHEMA_VERSION="SCENARIO_PROVENANCE_V1";

export function buildScenarioProvenance({terminals=[],branches=[],lines=[],scored=[]}={}){
  const branchById=new Map(branches.map(branch=>[String(branch.id||branch.branchId||""),branch]));
  const riders=buildRiderMap(scored,lines),scenarioProvenances={},keyById=new Map(),terminalScenarioIds=new Map();
  let unknownFieldCount=0,mappedTerminalCount=0;
  for(const terminal of terminals){
    const order=normalizeOrder(terminal.order||terminal.combination);if(!order)continue;
    const branchId=String(terminal.dominantBranchId||terminal.branchId||terminal.branchContributions?.[0]?.branchId||"UNKNOWN");
    const branch=branchById.get(branchId)||{},first=riders.get(order[0])||{},second=riders.get(order[1])||{};
    const tuple=Object.freeze({
      branchType:value(branch.branchType||terminal.branchType),branchId:value(branchId),initiativeLineId:value(branch.primaryLineId||terminal.primaryLineId),
      firstLineId:value(first.lineId||first.line),firstRole:role(first),secondLineId:value(second.lineId||second.line),secondRole:role(second),
      firstSecondRelation:relation(first,second)
    });
    unknownFieldCount+=Object.values(tuple).filter(item=>item==="UNKNOWN").length;
    const canonical=JSON.stringify(tuple),base=`SP1-${fnv1a(canonical)}`;let scenarioId=base,suffix=1;
    while(keyById.has(scenarioId)&&keyById.get(scenarioId)!==canonical)scenarioId=`${base}-${++suffix}`;
    keyById.set(scenarioId,canonical);scenarioProvenances[scenarioId]??=tuple;terminalScenarioIds.set(order.join("-"),scenarioId);mappedTerminalCount++;
  }
  return{scenarioProvenanceSchemaVersion:SCENARIO_PROVENANCE_SCHEMA_VERSION,scenarioProvenanceStatus:"AVAILABLE",scenarioProvenances,terminalScenarioIds,audit:{scenarioCount:Object.keys(scenarioProvenances).length,mappedTerminalCount,unknownFieldCount,thirdPositionUsed:false,resultFieldsUsed:[]}};
}

export function attachScenarioProvenanceId(terminal,terminalScenarioIds){const order=normalizeOrder(terminal?.order||terminal?.combination),scenarioProvenanceId=order?terminalScenarioIds.get(order.join("-"))||null:null;return{...terminal,scenarioProvenanceId};}

function buildRiderMap(scored,lines){const rows=[...(scored||[])];for(const line of lines||[])for(const[index,rider]of(line.members||[]).entries())rows.push({...rider,lineId:rider.lineId||line.id,linePosition:rider.linePosition??rider.lineOrder??index});return new Map(rows.map(row=>[Number(row.number||row.id),row]));}
function value(item){return item===null||item===undefined||item===""?"UNKNOWN":String(item);}
function role(rider){const position=Number(rider.linePosition??rider.lineOrder);if(Number.isFinite(position))return position===0?"LEADER":position===1?"BANTE":"LINE_TAIL";const text=String(rider.role||"").toUpperCase();if(/自力|LEADER/.test(text))return"LEADER";if(/番手|BANTE/.test(text))return"BANTE";return value(rider.lineId||rider.line)==="UNKNOWN"?"UNKNOWN":"LINE_MEMBER";}
function relation(first,second){const a=value(first.lineId||first.line),b=value(second.lineId||second.line);if(a==="UNKNOWN"||b==="UNKNOWN")return"UNKNOWN";if(a!==b)return"CROSS_LINE";const ap=Number(first.linePosition??first.lineOrder),bp=Number(second.linePosition??second.lineOrder);if(!Number.isFinite(ap)||!Number.isFinite(bp))return"SAME_LINE";return ap<bp?"SAME_LINE_FORWARD":ap>bp?"SAME_LINE_REVERSE":"SAME_LINE";}
function normalizeOrder(input){const order=(Array.isArray(input)?input:String(input||"").match(/\d+/g)||[]).map(Number).slice(0,3);return order.length===3?order:null;}
function fnv1a(text){let hash=0x811c9dc5;for(let index=0;index<text.length;index++){hash^=text.charCodeAt(index);hash=Math.imul(hash,0x01000193);}return(hash>>>0).toString(36).padStart(7,"0");}
