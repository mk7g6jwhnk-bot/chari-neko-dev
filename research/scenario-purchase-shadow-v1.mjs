import{shadowPurchasePlan,THIRD_VARIANT_SHADOW_RULES}from"./third-variant-shadow-v1.mjs";

export const SCENARIO_SHADOW_RULES=Object.freeze({CONTROL:{id:"CONTROL"},S1:{id:"S1",coverScenarios:1,ensureDistinctFirst:false},S2:{id:"S2",coverScenarios:2,ensureDistinctFirst:true},S3:{id:"S3",coverScenarios:2,ensureDistinctFirst:true,ambiguityOne:true}});
const NATURAL_CODES=new Set(["ADOPTED","THIRD_VARIANT_AMBIGUITY","THIRD_VARIANT_BOUNDARY"]);

export function scenarioConcentration(record){
  const rows=naturalRows(record),groups=groupScenarios(rows),mass=groups.reduce((s,x)=>s+x.mass,0)||1,shares=groups.map(x=>x.mass/mass),top1=shares[0]||0,top2=top1+(shares[1]||0),top3=top2+(shares[2]||0),entropy=-shares.reduce((s,x)=>x>0?s+x*Math.log(x):s,0),normalizedEntropy=shares.length>1?entropy/Math.log(shares.length):0,gap=top1-(shares[1]||0);
  const level=top1>=.60||gap>=.30?"HIGH_CONCENTRATION":top2>=.70||normalizedEntropy<=.72?"MEDIUM_CONCENTRATION":"LOW_CONCENTRATION";
  return{level,scenarioCount:groups.length,top1,top2,top3,entropy,normalizedEntropy,gap,groups};
}

export function buildScenarioShadowPlan(record,rule=SCENARIO_SHADOW_RULES.CONTROL){
  const prediction=sealedPrediction(record),control=uniquePlan(prediction?.standardPurchasePlan||[]),eligibility=prediction?.purchaseEligibility||prediction?.purchase?.audit?.purchaseEligibility;
  if(rule.id==="CONTROL"||!eligibility?.canPurchase)return{ruleId:rule.id,control,candidate:control,concentration:scenarioConcentration(record),selectedScenarios:scenarioIds(control),explanations:[]};
  const concentration=scenarioConcentration(record),groups=concentration.groups;
  if(!groups.length)return{ruleId:rule.id,control,candidate:control,concentration,selectedScenarios:scenarioIds(control),explanations:[]};
  const scenarioCap=1+Number(rule.coverScenarios||0),desired=concentration.level==="LOW_CONCENTRATION"?3:2,wanted=Math.min(desired,scenarioCap,groups.length);
  const selected=[groups[0]];
  const remaining=groups.slice(1),ordered=rule.ensureDistinctFirst
    ?[...remaining.filter(group=>!selected[0].firstFamilies.has(group.primaryFirst)),...remaining.filter(group=>selected[0].firstFamilies.has(group.primaryFirst))]
    :remaining;
  for(const group of ordered){if(selected.length>=wanted)break;selected.push(group);}
  const terminalsPerScenario=concentration.level==="HIGH_CONCENTRATION"?1:2,candidate=[];
  selected.forEach((group,index)=>{
    group.rows.slice(0,terminalsPerScenario).forEach(row=>candidate.push(toPlan(row,index===0?"MAIN":"COVER",group,index===0?null:selected[0])));
  });
  if(rule.ambiguityOne){
    const rescued=shadowPurchasePlan(record,THIRD_VARIANT_SHADOW_RULES.AMBIGUITY_ONE).rescued;
    const keys=new Set(candidate.map(x=>x.order.join("-"))),baseLength=candidate.length;
    for(const row of rescued)if(!keys.has(row.order.join("-"))&&candidate.length<baseLength+2){candidate.push({...row,scenarioFamilyId:row.dominantBranchId,originatingScenarioFamily:row.dominantBranchId,shadowReason:"AMBIGUITY_ONE_PAIR_LOCAL_RESCUE"});keys.add(row.order.join("-"));}
  }
  return{ruleId:rule.id,control,candidate:uniquePlan(candidate),concentration,selectedScenarios:selected.map(x=>x.id),explanations:selected.map((x,i)=>({scenarioId:x.id,betClass:i===0?"MAIN":"COVER",reason:i===0?"highest pre-result scenario mass":`independent alternate to ${selected[0].id}`,mass:x.mass}))};
}

export function evaluateScenarioShadow(records,{limit=100}={}){
  const all=[...(records||[])].filter(isV2).sort((a,b)=>sealedAt(b).localeCompare(sealedAt(a))),sample=all.slice(0,limit),rules=Object.values(SCENARIO_SHADOW_RULES),races=sample.map(record=>evaluateRace(record,rules)),allConfirmed=all.filter(isConfirmed).map(record=>evaluateRace(record,rules));
  return{version:"SCENARIO-PURCHASE-SHADOW-1.0",readOnly:true,productionWriteAllowed:false,autoPromotion:false,sampleSize:sample.length,allV2Count:all.length,confirmedCount:allConfirmed.length,concentration:counts(races.map(x=>x.concentration)),summaries:Object.fromEntries(rules.map(rule=>[rule.id,summarize(races,allConfirmed,rule.id)])),races};
}
function evaluateRace(record,rules){const result=record?.result?.result||{},finish=normalizeOrder(result.finishOrder),plans=Object.fromEntries(rules.map(rule=>[rule.id,buildScenarioShadowPlan(record,rule)])),c=plans.CONTROL.concentration;return{raceKey:record.raceKey,concentration:c.level,confirmed:isConfirmed(record)&&Boolean(finish),finish,payout:finite(result.payout??result.trifectaPayout),plans};}
function summarize(races,confirmed,id){const ps=races.map(x=>x.plans[id].candidate),n=ps.map(x=>x.length),div=ps.map(plan=>diversity(plan)),hits=confirmed.filter(x=>x.plans[id].candidate.some(y=>key(y.order)===key(x.finish))),tickets=confirmed.reduce((s,x)=>s+x.plans[id].candidate.length,0),investment=tickets*100,returned=hits.reduce((s,x)=>s+(x.payout||0),0);return{ticketDistribution:distribution(n),scenarioDiversity:{meanScenarios:mean(div.map(x=>x.scenarios)),meanMainScenarios:mean(div.map(x=>x.main)),meanCoverScenarios:mean(div.map(x=>x.cover)),meanFirstFamilies:mean(div.map(x=>x.firsts)),meanPairs:mean(div.map(x=>x.pairs))},results:{betRaces:confirmed.filter(x=>x.plans[id].candidate.length).length,hitRaces:hits.length,tickets,investment,return:returned,roi:investment?returned/investment:null}};}
function naturalRows(record){const p=sealedPrediction(record),u=p?.purchase?.audit?.terminalLifecycleAudit||p?.audit?.purchaseAudit?.terminalLifecycleAudit,rows=Array.isArray(u)?u:Array.isArray(u?.rows)?u.rows:[];return rows.filter(x=>NATURAL_CODES.has(String(x.purchaseRejectCode))).map(x=>({...x,order:normalizeOrder(x.order)})).filter(x=>x.order).sort(compare);}
function groupScenarios(rows){const map=new Map();for(const row of rows){const id=String(row.dominantBranchId||"UNRESOLVED");if(!map.has(id))map.set(id,{id,mass:0,rows:[],firstFamilies:new Set});const g=map.get(id);g.mass+=Number(row.probability)||0;g.rows.push(row);g.firstFamilies.add(row.order[0]);}return[...map.values()].map(g=>({...g,primaryFirst:g.rows[0]?.order[0],rows:g.rows.sort(compare)})).sort((a,b)=>b.mass-a.mass||a.id.localeCompare(b.id,"en"));}
function toPlan(row,betClass,group,main){return{order:row.order,betClass,probability:Number(row.probability)||0,scenarioFamilyId:group.id,originatingScenarioFamily:group.id,dominantBranchId:group.id,shadowOnly:true,shadowReason:betClass==="MAIN"?"TOP_SCENARIO":"ALTERNATE_SCENARIO",mainDifferenceReason:betClass==="COVER"?`${group.id} differs from MAIN ${main?.id||"UNKNOWN"}`:null};}
function diversity(plan){const scenarios=new Set(plan.map(x=>x.scenarioFamilyId||x.originatingScenarioFamily||x.dominantBranchId).filter(Boolean)),main=new Set(plan.filter(x=>x.betClass==="MAIN").map(x=>x.scenarioFamilyId||x.dominantBranchId)),cover=new Set(plan.filter(x=>x.betClass==="COVER").map(x=>x.scenarioFamilyId||x.dominantBranchId)),firsts=new Set(plan.map(x=>x.order?.[0])),pairs=new Set(plan.map(x=>x.order?.slice(0,2).join("-")));return{scenarios:scenarios.size,main:main.size,cover:cover.size,firsts:firsts.size,pairs:pairs.size};}
function distribution(a){return{mean:mean(a),median:q(a,.5),p75:q(a,.75),p90:q(a,.9),max:Math.max(0,...a),one:a.filter(x=>x===1).length,twoTo3:a.filter(x=>x>=2&&x<=3).length,fourTo6:a.filter(x=>x>=4&&x<=6).length,sevenTo10:a.filter(x=>x>=7&&x<=10).length,elevenTo15:a.filter(x=>x>=11&&x<=15).length,sixteenOrMore:a.filter(x=>x>=16).length};}
function sealedPrediction(r){const x=r?.sealed?.researchPrediction||{};return x.prediction?.performanceSchemaVersion==="PURCHASE_PERFORMANCE_V2"?x.prediction:x;}function isV2(r){return sealedPrediction(r)?.performanceSchemaVersion==="PURCHASE_PERFORMANCE_V2";}function sealedAt(r){return String(r?.sealed?.predictionSealedAt||"");}function isConfirmed(r){return String(r?.result?.result?.status||"").toLowerCase()==="confirmed";}function normalizeOrder(v){const n=(Array.isArray(v)?v:String(v||"").match(/\d+/g)||[]).map(Number).slice(0,3);return n.length===3?n:null;}function key(v){return normalizeOrder(v)?.join("-")||"";}function uniquePlan(a){const m=new Map;for(const x of a||[]){const o=normalizeOrder(x.order||x.combination);if(o&&!m.has(o.join("-")))m.set(o.join("-"),{...x,order:o});}return[...m.values()];}function scenarioIds(a){return[...new Set(a.map(x=>x.scenarioFamilyId||x.originatingScenarioFamily||x.dominantBranchId).filter(Boolean))];}function compare(a,b){return(Number(b.probability)||0)-(Number(a.probability)||0)||key(a.order).localeCompare(key(b.order),"en");}function finite(v){const n=Number(v);return Number.isFinite(n)?n:null;}function mean(a){return a.length?a.reduce((s,x)=>s+x,0)/a.length:null;}function q(a,p){if(!a.length)return null;const s=[...a].sort((x,y)=>x-y),i=(s.length-1)*p,l=Math.floor(i),h=Math.ceil(i);return s[l]+(s[h]-s[l])*(i-l);}function counts(a){return a.reduce((o,x)=>(o[x]=(o[x]||0)+1,o),{});}
