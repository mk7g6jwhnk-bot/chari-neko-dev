export const RESEARCH_STATE_VERSION="RESEARCH-STATE-MVP-1.0";
export const CALIBRATION_STATUS="UNCALIBRATED_MODEL_DISTRIBUTION";
export const STATE_TYPES=Object.freeze([
  "INITIATIVE","ATTACK_OUTCOME","LINE_TRACKING",
  "OTHER_LINE_SURVIVAL","FOURTH_CORNER_POSITION"
]);

export function createResearchStateNode(input={}){
  if(!STATE_TYPES.includes(input.stateType))throw new Error(`unsupported research state: ${input.stateType}`);
  const probability=finiteProbability(input.conditionalTransitionProbability);
  return deepFreeze({
    version:RESEARCH_STATE_VERSION,
    stateId:String(input.stateId||""),
    stateType:input.stateType,
    parentStateId:input.parentStateId||null,
    outcomeCode:String(input.outcomeCode||"UNKNOWN"),
    status:input.status||"SUPPORTED",
    modelWeight:finiteNonNegative(input.modelWeight),
    conditionalTransitionProbability:probability,
    scenarioProbability:finiteProbability(input.scenarioProbability),
    calibratedProbability:null,
    calibrationStatus:CALIBRATION_STATUS,
    establishmentConditions:[...(input.establishmentConditions||[])],
    contradictionConditions:[...(input.contradictionConditions||[])],
    supportingEvidence:[...(input.supportingEvidence||[])],
    counterEvidence:[...(input.counterEvidence||[])],
    unknownEvidence:[...(input.unknownEvidence||[])],
    transitionConditions:[...(input.transitionConditions||[])],
    resultingRaceState:input.resultingRaceState
  });
}

export function normalizeModelWeights(rows=[]){
  const weights=rows.map(row=>finiteNonNegative(row.modelWeight));
  const total=weights.reduce((sum,value)=>sum+value,0);
  if(total>0)return rows.map((row,index)=>({...row,conditionalTransitionProbability:weights[index]/total}));
  if(!rows.length)return[];
  return rows.map(row=>({...row,conditionalTransitionProbability:1/rows.length,status:"UNKNOWN"}));
}

export function deepFreeze(value){
  if(!value||typeof value!=="object"||Object.isFrozen(value))return value;
  for(const child of Object.values(value))deepFreeze(child);
  return Object.freeze(value);
}

function finiteNonNegative(value){const n=Number(value);return Number.isFinite(n)&&n>=0?n:0}
function finiteProbability(value){const n=Number(value);return Number.isFinite(n)?Math.max(0,Math.min(1,n)):0}
