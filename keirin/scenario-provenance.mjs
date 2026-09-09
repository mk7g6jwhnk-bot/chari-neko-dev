export const SCENARIO_PROVENANCE_SCHEMA_VERSION="SCENARIO_PROVENANCE_V1";
const UNKNOWN="UNKNOWN";

export function attachScenarioProvenance(prediction={},race={}){
  const terminals=Array.isArray(prediction.terminals)?prediction.terminals:[],branches=new Map((prediction.branches||[]).map(row=>[String(row.id||""),row])),participants=new Map((race.participants||[]).map(row=>[Number(row.number),row]));
  const entries=terminals.map(terminal=>{const order=(terminal.order||terminal.combination||[]).map(Number),branchId=String(terminal.dominantBranchId||terminal.branchId||UNKNOWN),branch=branches.get(branchId)||{},first=participants.get(order[0])||{},second=participants.get(order[1])||{},firstLineId=value(first.lineId),secondLineId=value(second.lineId),tuple={branchType:value(branch.branchType||terminal.branchType),branchId:value(branch.id||branchId),initiativeLineId:value(branch.primaryLineId),firstLineId,firstRole:value(first.role),secondLineId,secondRole:value(second.role),firstSecondLineRelation:firstLineId===UNKNOWN||secondLineId===UNKNOWN?UNKNOWN:firstLineId===secondLineId?"SAME_LINE":"OTHER_LINE"};return{terminal,tuple,key:JSON.stringify(tuple)}});
  const keys=[...new Set(entries.map(row=>row.key))].sort((a,b)=>a.localeCompare(b,"en")),ids=new Map(keys.map((key,index)=>[key,`SP1-${String(index+1).padStart(3,"0")}`])),scenarioProvenances={};
  for(const key of keys)scenarioProvenances[ids.get(key)]=JSON.parse(key);
  for(const row of entries)row.terminal.scenarioProvenanceId=ids.get(row.key);
  prediction.scenarioProvenanceSchemaVersion=SCENARIO_PROVENANCE_SCHEMA_VERSION;
  prediction.scenarioProvenances=scenarioProvenances;
  return{schemaVersion:SCENARIO_PROVENANCE_SCHEMA_VERSION,scenarioCount:keys.length,terminalCount:entries.length,unknownFieldCount:Object.values(scenarioProvenances).reduce((n,row)=>n+Object.values(row).filter(x=>x===UNKNOWN).length,0),fieldCount:Object.values(scenarioProvenances).reduce((n,row)=>n+Object.keys(row).length,0)};
}

export function summarizeScenarioProvenance(prediction={}){const table=prediction.scenarioProvenances&&typeof prediction.scenarioProvenances==="object"?prediction.scenarioProvenances:{},terminals=Array.isArray(prediction.terminals)?prediction.terminals:[],ids=new Set(Object.keys(table)),mapped=terminals.filter(row=>ids.has(String(row.scenarioProvenanceId||""))).length,totalFields=Object.values(table).reduce((n,row)=>n+Object.keys(row||{}).length,0),unknownFields=Object.values(table).reduce((n,row)=>n+Object.values(row||{}).filter(x=>x===UNKNOWN).length,0);return{available:prediction.scenarioProvenanceSchemaVersion===SCENARIO_PROVENANCE_SCHEMA_VERSION&&ids.size>0,status:ids.size?"AVAILABLE":"UNAVAILABLE_LEGACY",schemaVersion:prediction.scenarioProvenanceSchemaVersion||null,scenarioCount:ids.size,terminalCount:terminals.length,mappedTerminalCount:mapped,mappingPassed:terminals.length>0&&mapped===terminals.length,unknownRate:totalFields?unknownFields/totalFields:null}}
function value(input){return input===null||input===undefined||String(input).trim()===""?UNKNOWN:String(input)}
