import{scoreKeirinParticipants}from"../../keirin/sports/keirin-scoring.mjs";
import{buildLines}from"../../keirin/sports/keirin-lines.mjs";
import{buildKeirinInitiativeAssessment}from"../../keirin/sports/keirin-initiative.mjs";
import{CALIBRATION_STATUS,createResearchStateNode,normalizeModelWeights}from"./schema.mjs";
import{createInitialRaceState,transitionRaceState}from"./race-state.mjs";

export function runResearchStateGraph({race,venueProfile={}}){
  const scored=scoreKeirinParticipants({race,venueProfile});
  const lines=buildLines(scored);
  const initialState=createInitialRaceState({race,scored,lines});
  const initiative=buildKeirinInitiativeAssessment({scored,lines,raceCategory:race.raceCategory||"standard"});
  let paths=[{pathId:"ROOT",probability:1,state:initialState,nodes:[]}];
  paths=expand(paths,"INITIATIVE",path=>initiativeTransitions(path,{initiative,lines}));
  paths=expand(paths,"ATTACK_OUTCOME",path=>attackTransitions(path,{scored}));
  paths=expand(paths,"LINE_TRACKING",path=>trackingTransitions(path,{scored,lines}));
  paths=expand(paths,"OTHER_LINE_SURVIVAL",path=>otherLineTransitions(path,{scored,lines}));
  paths=expand(paths,"FOURTH_CORNER_POSITION",path=>fourthCornerTransitions(path,{scored,lines}));
  return{
    version:"RESEARCH-STATE-ENGINE-MVP-1.0",mode:"RESEARCH_ONLY",
    productionWriteAllowed:false,purchaseEngineConnected:false,
    calibrationStatus:CALIBRATION_STATUS,calibratedProbability:null,
    scored,lines,initialState,initiativeAssessment:initiative,paths,
    audit:{pathCount:paths.length,probabilityMass:sum(paths.map(path=>path.probability)),stateTypes:["INITIATIVE","ATTACK_OUTCOME","LINE_TRACKING","OTHER_LINE_SURVIVAL","FOURTH_CORNER_POSITION"],unknownNodeCount:paths.flatMap(path=>path.nodes).filter(node=>node.status==="UNKNOWN").length}
  };
}

function expand(paths,stateType,builder){
  const next=[];
  for(const path of paths){
    const candidates=normalizeModelWeights(builder(path));
    candidates.forEach((candidate,index)=>{
      const probability=path.probability*candidate.conditionalTransitionProbability;
      const stateId=`${path.pathId}/${stateType}:${candidate.outcomeCode}:${index+1}`;
      const resultingRaceState=transitionRaceState(path.state,candidate.patch,{stateType,outcomeCode:candidate.outcomeCode});
      const node=createResearchStateNode({...candidate,stateType,stateId,parentStateId:path.nodes.at(-1)?.stateId||null,scenarioProbability:probability,resultingRaceState});
      next.push({pathId:stateId,probability,state:resultingRaceState,nodes:[...path.nodes,node]});
    });
  }
  return next;
}

function initiativeTransitions(_path,{initiative,lines}){
  const candidates=(initiative.candidates||[]).filter(row=>row.evidence?.usable!==false).map(row=>({
    outcomeCode:`RIDER_${row.riderNumber}`,modelWeight:row.probability,
    patch:{initiativeLineId:row.lineId,initiativeRiderNumber:row.riderNumber},
    establishmentConditions:["official line leader exists","initiative evidence is usable"],
    contradictionConditions:["official line unavailable","B evidence unusable"],
    supportingEvidence:row.scoreTrace.filter(item=>item.available).map(item=>evidence(item.key,item.value)),
    counterEvidence:[],unknownEvidence:row.scoreTrace.filter(item=>!item.available).map(item=>item.key),
    transitionConditions:["initiative candidate selected before attack evaluation"]
  }));
  if(candidates.length)return candidates;
  return[unknown("INITIATIVE_UNKNOWN",[lines.length?"usable initiative evidence missing":"official line missing"],{unknowns:["INITIATIVE"]})];
}

function attackTransitions(path,{scored}){
  const rider=scored.find(row=>Number(row.number)===Number(path.state.initiativeRiderNumber));
  if(!rider)return[unknown("ATTACK_UNKNOWN",["initiative rider unresolved"],{attack:{outcome:"UNKNOWN"},unknowns:[...path.state.unknowns,"ATTACK_OUTCOME"]})];
  const values=[rider.evidence?.start,rider.evidence?.sprint,rider.evidence?.finish].filter(finite).map(value=>Number(value)/10);
  if(!values.length)return[unknown("ATTACK_UNKNOWN",["start/sprint/finish evidence missing"],{attack:{riderNumber:rider.number,method:"UNRESOLVED",outcome:"UNKNOWN"},unknowns:[...path.state.unknowns,"ATTACK_OUTCOME"]})];
  const success=geometric(values),missing=1-values.length/3;
  return[
    transition("ATTACK_SUCCESS",success,{attack:{riderNumber:rider.number,method:"LEAD_OR_MAKURI_UNRESOLVED",outcome:"SUCCESS"}},rider,values,"existing start/sprint/finish evidence supports successful move"),
    transition("ATTACK_FAILURE",1-success,{attack:{riderNumber:rider.number,method:"LEAD_OR_MAKURI_UNRESOLVED",outcome:"FAILURE"}},rider,values,"complement of uncalibrated success evidence"),
    ...(missing>0?[unknown("ATTACK_UNKNOWN",["one or more attack evidence axes missing"],{attack:{riderNumber:rider.number,method:"UNRESOLVED",outcome:"UNKNOWN"},unknowns:[...path.state.unknowns,"ATTACK_OUTCOME"]},missing)]:[])
  ];
}

function trackingTransitions(path,{scored,lines}){
  const line=lines.find(row=>row.id===path.state.initiativeLineId),bante=line?.bante;
  if(!bante)return[unknown("TRACKING_UNKNOWN",["official bante unavailable"],{unknowns:[...path.state.unknowns,"LINE_TRACKING"]})];
  const tracking=bante.evidence?.tracking;
  if(!finite(tracking))return[unknown("TRACKING_UNKNOWN",["bante tracking evidence missing"],{lineMemberStatus:{[bante.number]:"UNKNOWN"},unknowns:[...path.state.unknowns,"LINE_TRACKING"]})];
  const support=Number(tracking)/10;
  return[
    transition("BANTE_TRACKS",support,{lineMemberStatus:{[bante.number]:"TRACKING"}},bante,[support],"tracking evidence supports remaining attached"),
    transition("BANTE_DETACHED",1-support,{lineMemberStatus:{[bante.number]:"DETACHED"}},bante,[support],"complement of uncalibrated tracking evidence")
  ];
}

function otherLineTransitions(path,{lines}){
  const others=lines.filter(line=>line.type==="ライン"&&line.id!==path.state.initiativeLineId&&line.leader);
  const candidates=others.flatMap(line=>{
    const values=[line.leader.evidence?.finish,line.leader.evidence?.recent].filter(finite).map(value=>Number(value)/10);
    return values.length?[{outcomeCode:`LINE_${line.id}_SURVIVES`,modelWeight:geometric(values),patch:{survivingOtherLineId:line.id},establishmentConditions:["other official line exists"],contradictionConditions:[],supportingEvidence:values.map((value,index)=>evidence(index?"recent":"finish",value*10)),counterEvidence:[],unknownEvidence:values.length<2?["finish/recent partial"]:[],transitionConditions:["evaluate remaining line at fourth corner"]}]:[];
  });
  if(candidates.length){
    const strongest=Math.max(...candidates.map(row=>row.modelWeight));
    candidates.push({outcomeCode:"NO_OTHER_LINE_SURVIVES",modelWeight:1-strongest,patch:{survivingOtherLineId:null},establishmentConditions:["other-line survival evidence weak"],contradictionConditions:[],supportingEvidence:[],counterEvidence:[evidence("strongestOtherLineSupport",strongest)],unknownEvidence:[],transitionConditions:["build fourth-corner order without other line"]});
    return candidates;
  }
  return[unknown("OTHER_LINE_UNKNOWN",["no usable other-line finish/recent evidence"],{unknowns:[...path.state.unknowns,"OTHER_LINE_SURVIVAL"]})];
}

function fourthCornerTransitions(path,{scored,lines}){
  const initiativeLine=lines.find(line=>line.id===path.state.initiativeLineId);
  const otherLine=lines.find(line=>line.id===path.state.survivingOtherLineId);
  const initiativeMembers=(initiativeLine?.members||[]).filter(member=>path.state.lineMemberStatus[member.number]!=="DETACHED").map(member=>member.number);
  const otherMembers=(otherLine?.members||[]).map(member=>member.number);
  let front=[];
  if(path.state.attack.outcome==="SUCCESS")front=[...initiativeMembers,...otherMembers];
  else if(path.state.attack.outcome==="FAILURE")front=[...otherMembers,...initiativeMembers];
  else front=[...initiativeMembers,...otherMembers];
  const rest=scored.map(row=>row.number).filter(number=>!front.includes(number));
  const order=[...new Set([...front,...rest])];
  const unknown=path.state.attack.outcome==="UNKNOWN"||path.state.unknowns.includes("LINE_TRACKING");
  return[{outcomeCode:unknown?"FOURTH_CORNER_UNKNOWN":"FOURTH_CORNER_DERIVED",modelWeight:1,status:unknown?"UNKNOWN":"SUPPORTED",patch:{fourthCornerOrder:order,unknowns:unknown?[...path.state.unknowns,"FOURTH_CORNER_POSITION"]:path.state.unknowns},establishmentConditions:["derived only from prior research states"],contradictionConditions:[],supportingEvidence:order.map((number,index)=>evidence("ordinalPosition",index+1,{number})),counterEvidence:[],unknownEvidence:unknown?["upstream state unresolved"]:[],transitionConditions:["generate finish terminals without purchase filtering"]}];
}

function transition(outcomeCode,modelWeight,patch,rider,values,reason){return{outcomeCode,modelWeight,patch,establishmentConditions:[reason],contradictionConditions:[],supportingEvidence:[evidence("rider",rider.number),...values.map((value,index)=>evidence(`axis${index+1}`,value))],counterEvidence:[],unknownEvidence:[],transitionConditions:["continue only as an uncalibrated research path"]}}
function unknown(outcomeCode,reasons,patch={},modelWeight=1){return{outcomeCode,modelWeight,status:"UNKNOWN",patch,establishmentConditions:[],contradictionConditions:[],supportingEvidence:[],counterEvidence:[],unknownEvidence:reasons,transitionConditions:["preserve uncertainty; do not infer missing state"]}}
function evidence(key,value,extra={}){return{key,value,...extra,source:"PRE_RACE_INPUT"}}
function finite(value){return value!==null&&value!==undefined&&value!==""&&Number.isFinite(Number(value))}
function geometric(values){return values.length?Math.exp(values.reduce((sum,value)=>sum+Math.log(Math.max(1e-9,value)),0)/values.length):0}
function sum(values){return values.reduce((total,value)=>total+Number(value||0),0)}
