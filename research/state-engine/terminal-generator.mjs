import{CALIBRATION_STATUS}from"./schema.mjs";

export function generateResearchTerminals({scored,paths}){
  const riders=[...scored].sort((a,b)=>Number(a.number)-Number(b.number));
  const terminalMap=new Map();
  for(const path of paths){
    const positionIndex=new Map((path.state.fourthCornerOrder||[]).map((number,index)=>[Number(number),index]));
    const firstRows=normalize(riders.map(rider=>row(rider,"first",positionIndex,riders.length)));
    for(const first of firstRows){
      const secondRows=normalize(riders.filter(rider=>rider.id!==first.rider.id).map(rider=>row(rider,"second",positionIndex,riders.length)));
      for(const second of secondRows){
        const thirdRows=normalize(riders.filter(rider=>rider.id!==first.rider.id&&rider.id!==second.rider.id).map(rider=>row(rider,"third",positionIndex,riders.length)));
        for(const third of thirdRows){
          const order=[first.rider.number,second.rider.number,third.rider.number].map(Number);
          const conditionalTerminalProbability=first.probability*second.probability*third.probability;
          const contribution=path.probability*conditionalTerminalProbability;
          const detail={
            pathId:path.pathId,scenarioProbability:path.probability,
            conditionalTerminalProbability,contribution,
            firstScore:first.abilityScore,secondScore:second.abilityScore,thirdScore:third.abilityScore,
            firstPositionScore:first.positionScore,secondPositionScore:second.positionScore,thirdPositionScore:third.positionScore,
            transitionProbabilities:path.nodes.map(node=>({stateType:node.stateType,outcomeCode:node.outcomeCode,conditionalTransitionProbability:node.conditionalTransitionProbability,status:node.status}))
          };
          const key=order.join("-");
          if(!terminalMap.has(key))terminalMap.set(key,{order,rawModelMass:0,contributions:[]});
          const terminal=terminalMap.get(key);terminal.rawModelMass+=contribution;terminal.contributions.push(detail);
        }
      }
    }
  }
  const terminals=[...terminalMap.values()];
  const total=terminals.reduce((sum,row)=>sum+row.rawModelMass,0)||1;
  for(const terminal of terminals){
    terminal.terminalProbability=terminal.rawModelMass/total;
    terminal.probability=terminal.terminalProbability;
    terminal.calibratedProbability=null;
    terminal.calibrationStatus=CALIBRATION_STATUS;
    terminal.contributions.sort((a,b)=>b.contribution-a.contribution||a.pathId.localeCompare(b.pathId,"en"));
  }
  terminals.sort((a,b)=>b.terminalProbability-a.terminalProbability||a.order.join("-").localeCompare(b.order.join("-"),"en"));
  terminals.forEach((terminal,index)=>terminal.rank=index+1);
  return{
    version:"RESEARCH-TERMINALS-MVP-1.0",calibrationStatus:CALIBRATION_STATUS,
    calibratedProbability:null,terminals,
    audit:{terminalCount:terminals.length,terminalMass:terminals.reduce((sum,row)=>sum+row.terminalProbability,0),scenarioMass:paths.reduce((sum,path)=>sum+path.probability,0),purchaseFieldsPresent:false}
  };
}

function row(rider,target,positionIndex,count){
  const abilityScore=Math.max(0.001,Number(rider.roleScores?.[target])||0.001)/10;
  const index=positionIndex.has(Number(rider.number))?positionIndex.get(Number(rider.number)):count-1;
  const positionScore=Math.max(1,count-index)/Math.max(1,count);
  return{rider,abilityScore,positionScore,modelWeight:abilityScore*positionScore};
}
function normalize(rows){const total=rows.reduce((sum,row)=>sum+row.modelWeight,0)||1;return rows.map(row=>({...row,probability:row.modelWeight/total}))}
