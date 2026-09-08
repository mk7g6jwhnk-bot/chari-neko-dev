import RIDER_DB from "../../data/rider-db.json" with {type:"json"};
import {buildDbBaseline} from "../db-baseline/candidate.mjs";

export const RELATIVE_CANDIDATE_ID="DB-RELATIVE-FIRST-PAIR-1.0";
export const WEIGHT_GRID=Object.freeze([-.25,-.125,0,.125,.25]);
const clamp=(v,a=-1,b=1)=>Math.min(b,Math.max(a,Number(v)));

export function buildRelativeFeatures(race,{riderDb=RIDER_DB}={}){
  const riders=(race?.participants||[]).map(p=>({participant:p,base:buildDbBaseline(p,{riderDb,raceDate:race?.date})}));
  const usable=riders.filter(x=>reliable(x.base));
  const definitions={racePointDiff:x=>x.base.rawEvidence.racePoints,winRateDiff:x=>x.base.rawEvidence.firstRate,HBDiff:x=>hb(x.base),sprintFinishDiff:x=>sprintFinish(x.base),trackingDiff:x=>tracking(x.base)};
  const normalized={};for(const[name,get]of Object.entries(definitions)){const values=usable.map(get).filter(Number.isFinite),center=median(values),scale=robustScale(values);normalized[name]=new Map(riders.map(x=>[Number(x.participant.number),reliable(x.base)&&Number.isFinite(get(x))?clamp((get(x)-center)/scale):null]));}
  return{riders,normalized,reliability:{minimumSample:10,requireNotStale:true,requireQualitySuccess:true,requireTargetFeaturePresentForBoth:true,bothRidersComparable:true},behaviorTraitStatus:"BEHAVIOR_TRAITS_NOT_ENOUGH_DATA"};
}

export function reweightExistingResearch({race,terminals,weights={},riderDb=RIDER_DB}){
  const features=buildRelativeFeatures(race,{riderDb}),participants=new Map((race.participants||[]).map(x=>[Number(x.number),x]));
  const rows=terminals.map(row=>{const first=Number(row.order[0]),second=Number(row.order[1]),a=participants.get(first),b=participants.get(second);let log=0,used=[];
    for(const name of["racePointDiff","winRateDiff","HBDiff","sprintFinishDiff"]){const value=features.normalized[name].get(first),weight=Number(weights[name])||0;if(weight&&value!==null){log+=weight*value;used.push(name)}}
    const trackingA=features.normalized.trackingDiff.get(first),trackingB=features.normalized.trackingDiff.get(second),trackingWeight=Number(weights.trackingDiff)||0;if(trackingWeight&&trackingA!==null&&trackingB!==null){log+=trackingWeight*clamp(trackingB-trackingA);used.push("trackingDiff")}
    const sameLineRoleWeight=Number(weights.sameLineRole)||0;if(sameLineRoleWeight&&a&&b&&a.lineId&&a.lineId===b.lineId){const value=b.role==="番手"?1:b.role==="三番手"?.5:.25;log+=sameLineRoleWeight*value;used.push("sameLineRole")}
    return{order:row.order.map(Number),terminalProbability:Number(row.terminalProbability)||0,multiplier:Math.exp(clamp(log,-.35,.35)),used};});
  const total=rows.reduce((n,x)=>n+x.terminalProbability*x.multiplier,0)||1;return{terminals:rows.map(x=>({...x,terminalProbability:x.terminalProbability*x.multiplier/total})).sort((a,b)=>b.terminalProbability-a.terminalProbability||a.order.join("-").localeCompare(b.order.join("-"),"en")),terminalGenerationChanged:false,thirdModelChanged:false,productionWriteAllowed:false,features};
}

function reliable(base){return Boolean(base?.matched&&!base.reliability.stale&&base.reliability.sampleCount>=10&&base.reliability.qualityStatus==="success")}
function hb(base){const r=base.rawEvidence,s=base.reliability.sampleCount;return s>0&&Number.isFinite(r.home)&&Number.isFinite(r.back)?(r.home+r.back)/s:null}
function sprintFinish(base){const m=base.rawEvidence.winningMethods,v=[m.sprint,m.pass].filter(Number.isFinite);return v.length?v.reduce((a,b)=>a+b,0)/v.length:null}
function tracking(base){const r=base.rawEvidence,m=r.winningMethods,v=[r.top3Rate,m.mark].filter(Number.isFinite);return v.length?v.reduce((a,b)=>a+b,0)/v.length:null}
function median(v){if(!v.length)return 0;const a=[...v].sort((x,y)=>x-y),m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2}
function robustScale(v){if(v.length<2)return 1;const a=[...v].sort((x,y)=>x-y),q=p=>a[Math.min(a.length-1,Math.floor((a.length-1)*p))],iqr=q(.75)-q(.25);return Math.max(Math.abs(iqr),1e-6)}
