import{deepFreeze}from"./schema.mjs";

export function createInitialRaceState({race,scored,lines}){
  return deepFreeze({
    version:"IMMUTABLE-RACE-STATE-1.0",
    raceId:race.id||null,
    participants:scored.map(rider=>({id:rider.id,number:Number(rider.number),lineId:rider.lineId||null,role:rider.role||null})),
    officialLines:lines.map(line=>({id:line.id,type:line.type,members:line.members.map(member=>Number(member.number))})),
    initiativeLineId:null,initiativeRiderNumber:null,
    attack:{riderNumber:null,method:null,outcome:"UNKNOWN"},
    lineMemberStatus:{},survivingOtherLineId:null,
    fourthCornerOrder:[],unknowns:[],history:[]
  });
}

export function transitionRaceState(state,patch,event){
  const next=clone(state);
  merge(next,patch||{});
  next.history=[...(state.history||[]),event];
  return deepFreeze(next);
}

function clone(value){return typeof structuredClone==="function"?structuredClone(value):JSON.parse(JSON.stringify(value))}
function merge(target,patch){for(const[key,value]of Object.entries(patch)){if(value&&typeof value==="object"&&!Array.isArray(value)&&target[key]&&typeof target[key]==="object"&&!Array.isArray(target[key]))merge(target[key],value);else target[key]=value}return target}
