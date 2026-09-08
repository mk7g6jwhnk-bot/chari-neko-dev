import crypto from "node:crypto";
import RIDER_DB from "../../data/rider-db.json" with {type:"json"};

export const CANDIDATE_ID="DB-BASE-FIRST-PAIR-1.0";
export const CANDIDATE_POLICY=Object.freeze({
  candidateId:CANDIDATE_ID,classification:"SHADOW_CANDIDATE_ONLY",productionWriteAllowed:false,
  autoPromotion:false,existingResearchCalibrationTemperature:0.5,validationCohort:"303-402",
  finalTestCohort:"403-502",developmentCohort:"1-302",terminalAggregation:"EXISTING_RESEARCH_UNCHANGED",
  behaviorTraitStatus:"BEHAVIOR_TRAITS_NOT_ENOUGH_DATA"
});

const clamp=(value,min,max)=>Math.min(max,Math.max(min,Number(value)));
const finite=value=>value!==null&&value!==undefined&&value!==""&&Number.isFinite(Number(value));
const id=value=>String(value??"").replace(/\D/g,"").padStart(6,"0").slice(-6);
const score=value=>finite(value)?clamp(Number(value),0,10):null;
const percent=value=>finite(value)?clamp(Number(value)/10,0,10):null;

export function buildDbBaseline(participant,{riderDb=RIDER_DB,raceDate=null}={}){
  const riderId=id(participant?.registration??participant?.riderId),record=riderDb?.riders?.[riderId]||null;
  const recent=record?.recent_4_months||{},rates=record?.derived_finish_rates||{},methods=record?.winning_method_share_among_top2||{};
  const starts=Number(record?.metadata?.sample_size??recent.starts)||0;
  const firstRate=number(recent.official_first_rate??rates.first_rate),top2Rate=number(recent.official_top2_rate??rates.top2_rate),top3Rate=number(recent.official_top3_rate??rates.top3_rate);
  const secondOnly=firstRate===null||top2Rate===null?null:Math.max(0,top2Rate-firstRate);
  const thirdOnly=top2Rate===null||top3Rate===null?null:Math.max(0,top3Rate-top2Rate);
  const homeRate=starts>0&&finite(recent.home)?Number(recent.home)/starts:null,backRate=starts>0&&finite(recent.back)?Number(recent.back)/starts:null;
  const racePoints=number(recent.race_points),overall=racePoints===null?null:clamp((racePoints-50)/8,0,10);
  const firstAbility=weighted([[percent(firstRate),.42],[overall,.30],[rateScore(homeRate),.14],[rateScore(backRate),.14]]);
  const secondAbility=weighted([[percent(secondOnly),.30],[percent(top2Rate),.20],[overall,.22],[percent(methods.mark),.18],[rateScore(backRate),.10]]);
  const thirdAbility=weighted([[percent(thirdOnly),.25],[percent(top3Rate),.30],[overall,.20],[percent(methods.mark),.15],[rateScore(backRate),.10]]);
  const initiative=weighted([[rateScore(homeRate),.55],[rateScore(backRate),.25],[percent(methods.escape),.20]]);
  const sprint=weighted([[percent(methods.sprint),.65],[percent(methods.pass),.35]]);
  const finish=weighted([[percent(firstRate),.45],[percent(methods.sprint),.30],[percent(methods.pass),.25]]);
  const tracking=weighted([[percent(top3Rate),.55],[percent(methods.mark),.45]]);
  const freshness=freshnessDays(record,raceDate),stale=record?.metadata?.stale?.any===true||(freshness!==null&&freshness>30);
  return{riderId,matched:Boolean(record),baseAbility:{overall,firstAbility,secondAbility,thirdAbility,sprint,finish,tracking,stamina:null,initiative,attackTiming:null},behaviorTraits:emptyBehaviorTraits(),reliability:{sampleCount:starts,freshnessDays:freshness,stale,confidence:record?.metadata?.confidence||"unknown",missingFields:record?.metadata?.missing_fields||[],qualityStatus:record?.metadata?.quality_status||"missing"},source:{type:"RIDER_DB_OFFICIAL_SNAPSHOT",period:record?.metadata?.period||null,retrievedAt:record?.metadata?.retrieved_at||null},rawEvidence:{racePoints,firstRate,top2Rate,top3Rate,home:nullable(recent.home),back:nullable(recent.back),winningMethods:{escape:nullable(methods.escape),sprint:nullable(methods.sprint),pass:nullable(methods.pass),mark:nullable(methods.mark)}}};
}

export function buildTodayAdjustments(participant,baseline,{apply=true}={}){
  const neutral=(name,reason)=>({name,source:null,evidence:null,confidence:"none",appliedValue:1,reason});
  if(!apply)return[neutral("recentFormAdjustment","ABLATION_DISABLED"),neutral("currentRacePointAdjustment","ABLATION_DISABLED"),neutral("lineRoleAdjustment","ABLATION_DISABLED"),neutral("matchupAdjustment","NO_BOUNDED_RULE"),neutral("conditionAdjustment","NO_VERIFIED_EVIDENCE")];
  const dbPoints=baseline.rawEvidence.racePoints,livePoints=number(participant?.officialScore??participant?.officialProfile?.currentScore);
  const recent=score(participant?.recentForm),recentApplied=recent===null?1:clamp(1+(recent-5)*.018,.94,1.06);
  const pointsApplied=dbPoints===null||livePoints===null?1:clamp(1+(livePoints-dbPoints)/200,.94,1.06);
  const role=String(participant?.role||""),roleApplied=role==="自力"?1.025:role==="番手"?1.015:role==="三番手"?.99:1;
  return[
    {name:"recentFormAdjustment",source:"CURRENT_RACE_OFFICIAL_PROFILE",evidence:recent,confidence:recent===null?"none":"medium",appliedValue:recentApplied,reason:recent===null?"EVIDENCE_MISSING":"BOUNDED_AROUND_NEUTRAL"},
    {name:"currentRacePointAdjustment",source:"CURRENT_RACE_OFFICIAL_PROFILE",evidence:{livePoints,dbPoints},confidence:livePoints===null||dbPoints===null?"none":"high",appliedValue:pointsApplied,reason:livePoints===null||dbPoints===null?"EVIDENCE_MISSING":"BOUNDED_DB_DELTA"},
    {name:"lineRoleAdjustment",source:"CURRENT_OFFICIAL_LINE",evidence:role||null,confidence:role?"high":"none",appliedValue:roleApplied,reason:role?"BOUNDED_ROLE_PRIOR":"EVIDENCE_MISSING"},
    neutral("matchupAdjustment","NO_BOUNDED_RULE"),neutral("conditionAdjustment","NO_VERIFIED_EVIDENCE")
  ];
}

export function classifyBehaviorTraitSources(observations=[]){
  const resultOnly=new Set(["FIRST","SECOND","THIRD"]),mediaRequired=new Set(["BANTE_SUPPORT","SELF_WIN_PRIORITY_FROM_BANTE","EARLY_MOVE_FROM_BANTE","LINE_PROTECTION","FRONT_SAVING","SWITCHING","TOBIKOMI","BLOCK","LINE_TRACKING","INITIATIVE_PREFERENCE","ENERGY_SAVING"]);
  return observations.map(row=>({...row,derivability:resultOnly.has(row.nodeType)?"AUTO_DERIVABLE":mediaRequired.has(row.nodeType)||row.requiresMedia?"MEDIA_REQUIRED":"UNVERIFIED"}));
}

export function buildCandidateTerminals({race,existingGraph,variant="C4",riderDb=RIDER_DB}){
  const baselines=new Map((race?.participants||[]).map(p=>[Number(p.number),buildDbBaseline(p,{riderDb,raceDate:race?.date})]));
  const adjustments=new Map((race?.participants||[]).map(p=>[Number(p.number),buildTodayAdjustments(p,baselines.get(Number(p.number)),{apply:["C2","C3","C4","C5"].includes(variant)})]));
  const useFirst=["C3","C4","C5"].includes(variant),usePair=["C4","C5"].includes(variant);
  const map=new Map(),riders=existingGraph.scored,paths=existingGraph.paths;
  for(const path of paths){
    const pos=new Map((path.state.fourthCornerOrder||[]).map((n,i)=>[Number(n),i]));
    const first=normalize(riders.map(r=>({r,weight:position(r,pos,riders.length)*axis(r,baselines.get(Number(r.number)),adjustments.get(Number(r.number)),"first",useFirst)})));
    for(const a of first){
      const second=normalize(riders.filter(r=>r.id!==a.r.id).map(r=>({r,weight:position(r,pos,riders.length)*axis(r,baselines.get(Number(r.number)),adjustments.get(Number(r.number)),"second",usePair)*pairFactor(a.r,r)})));
      for(const b of second){
        const third=normalize(riders.filter(r=>r.id!==a.r.id&&r.id!==b.r.id).map(r=>({r,weight:position(r,pos,riders.length)*Math.max(.001,Number(r.roleScores?.third)||.001)})));
        for(const c of third){const order=[a.r.number,b.r.number,c.r.number].map(Number),key=order.join("-"),mass=path.probability*a.probability*b.probability*c.probability;map.set(key,{order,terminalProbability:(map.get(key)?.terminalProbability||0)+mass});}
      }
    }
  }
  const terminals=[...map.values()],total=terminals.reduce((n,x)=>n+x.terminalProbability,0)||1;for(const row of terminals)row.terminalProbability/=total;
  terminals.sort((a,b)=>b.terminalProbability-a.terminalProbability||a.order.join("-").localeCompare(b.order.join("-"),"en"));
  return{variant,terminals,baselines:[...baselines.values()],adjustments:[...adjustments.entries()].map(([riderNumber,rules])=>({riderNumber,rules})),behaviorTraitsUsed:false,behaviorTraitStatus:"BEHAVIOR_TRAITS_NOT_ENOUGH_DATA",terminalAggregationChanged:false,productionWriteAllowed:false};
}

export function trainingHash(raceKeys){return crypto.createHash("sha256").update([...raceKeys].join("\n")).digest("hex");}

function axis(rider,base,rules,target,useDb){if(!useDb||!base?.matched)return Math.max(.001,Number(rider.roleScores?.[target])||.001);const raw=target==="first"?base.baseAbility.firstAbility:base.baseAbility.secondAbility;if(raw===null)return Math.max(.001,Number(rider.roleScores?.[target])||.001);return Math.max(.001,raw*rules.reduce((v,x)=>v*x.appliedValue,1));}
function pairFactor(first,second){let value=1;if(first.lineId&&first.lineId===second.lineId)value*=second.role==="番手"?1.12:1.05;if(second.role==="番手")value*=1.04;return clamp(value,.9,1.16);}
function position(rider,index,count){const i=index.has(Number(rider.number))?index.get(Number(rider.number)):count-1;return Math.max(1,count-i)/Math.max(1,count);}
function normalize(rows){const total=rows.reduce((n,x)=>n+x.weight,0)||1;return rows.map(x=>({...x,probability:x.weight/total}));}
function weighted(items){const rows=items.filter(([v])=>v!==null),total=rows.reduce((n,[,w])=>n+w,0);return total?rows.reduce((n,[v,w])=>n+v*w,0)/total:null;}
function rateScore(value){return value===null?null:clamp(value*25,0,10);}
function number(value){return finite(value)?Number(value):null;}
function nullable(value){return finite(value)?Number(value):null;}
function freshnessDays(record,raceDate){const at=Date.parse(record?.metadata?.recent_updated_at||record?.metadata?.retrieved_at||""),date=String(raceDate||"").replace(/\D/g,"").slice(0,8),race=/^\d{8}$/.test(date)?Date.parse(`${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}T23:59:59+09:00`):NaN;return Number.isFinite(at)&&Number.isFinite(race)?Number(((race-at)/86400000).toFixed(3)):null;}
function emptyBehaviorTraits(){return Object.fromEntries(["banteSupportTendency","selfWinPriorityFromBante","earlyMoveFromBante","lineProtectionTendency","frontSavingTendency","switchingTendency","tobikomiTendency","blockTendency","lineTrackingReliability","initiativePreference","energySavingTendency"].map(name=>[name,{value:null,sampleCount:0,confidence:"none",period:null,updatedAt:null,sourceTypes:[],verifiedLevel:"UNVERIFIED",contexts:[]}]))}
