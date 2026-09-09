const THIRD_CODES=new Set(["THIRD_VARIANT_AMBIGUITY","THIRD_VARIANT_BOUNDARY"]);

export const THIRD_VARIANT_SHADOW_RULES=Object.freeze({
  CONTROL:Object.freeze({id:"CONTROL",rescueCodes:[],maxPerPair:0,maxPerRace:0}),
  AMBIGUITY_ONE:Object.freeze({id:"AMBIGUITY_ONE",rescueCodes:["THIRD_VARIANT_AMBIGUITY"],maxPerPair:1,maxPerRace:2}),
  BOUNDARY_ONE:Object.freeze({id:"BOUNDARY_ONE",rescueCodes:["THIRD_VARIANT_BOUNDARY"],maxPerPair:1,maxPerRace:2}),
  PAIR_TOP_ONE:Object.freeze({id:"PAIR_TOP_ONE",rescueCodes:[...THIRD_CODES],maxPerPair:1,maxPerRace:2})
});

export function shadowPurchasePlan(record,rule=THIRD_VARIANT_SHADOW_RULES.CONTROL){
  const prediction=sealedPrediction(record),control=uniquePlan(prediction?.standardPurchasePlan||[]);
  const eligibility=prediction?.purchaseEligibility||prediction?.purchase?.audit?.purchaseEligibility||null;
  if(!eligibility?.canPurchase||!rule?.maxPerRace)return{ruleId:rule?.id||"CONTROL",control,candidate:control,rescued:[]};
  const lifecycle=prediction?.purchase?.audit?.terminalLifecycleAudit||prediction?.audit?.purchaseAudit?.terminalLifecycleAudit||null;
  const rows=Array.isArray(lifecycle)?lifecycle:Array.isArray(lifecycle?.rows)?lifecycle.rows:[];
  const classByBranch=new Map(),classByFirst=new Map();
  for(const row of rows){
    const betClass=normalizedClass(row?.betClass);
    if(!betClass)continue;
    if(row?.dominantBranchId&&!classByBranch.has(row.dominantBranchId))classByBranch.set(row.dominantBranchId,betClass);
    const order=normalizeOrder(row?.order);if(order&&!classByFirst.has(order[0]))classByFirst.set(order[0],betClass);
  }
  const allowed=new Set(rule.rescueCodes||[]),byPair=new Map();
  for(const row of rows){
    if(!allowed.has(String(row?.purchaseRejectCode||"")))continue;
    const order=normalizeOrder(row?.order);if(!order)continue;
    const key=order.slice(0,2).join("-");
    if(!byPair.has(key))byPair.set(key,[]);
    byPair.get(key).push({...row,order});
  }
  const pool=[];
  for(const [pair,pairRows] of byPair){
    pairRows.sort(compareRows);
    for(const row of pairRows.slice(0,rule.maxPerPair||0)){
      const betClass=classByBranch.get(row.dominantBranchId)||classByFirst.get(row.order[0])||null;
      // MAIN/COVERの意味を推測で新設しない。既存採用から継承できない候補は救済しない。
      if(betClass)pool.push({...row,pair,betClass});
    }
  }
  pool.sort(compareRows);
  const controlKeys=new Set(control.map(x=>x.order.join("-"))),rescued=[];
  for(const row of pool){
    if(rescued.length>=rule.maxPerRace)break;
    const key=row.order.join("-");if(controlKeys.has(key))continue;
    controlKeys.add(key);rescued.push({order:row.order,betClass:row.betClass,probability:Number(row.probability)||0,pair:row.pair,sourceRejectCode:row.purchaseRejectCode,dominantBranchId:row.dominantBranchId||null,shadowOnly:true});
  }
  return{ruleId:rule.id,control,candidate:[...control,...rescued],rescued};
}

export function evaluateThirdVariantShadow(records,{limit=100}={}){
  const input=[...(records||[])].filter(isV2).sort((a,b)=>sealedAt(b).localeCompare(sealedAt(a))).slice(0,limit);
  const rules=Object.values(THIRD_VARIANT_SHADOW_RULES),raceEvaluations=[];
  for(const record of input){
    const result=record?.result?.result||{},finish=normalizeOrder(result.finishOrder),payout=finite(result.payout??result.trifectaPayout);
    const candidates=Object.fromEntries(rules.map(rule=>[rule.id,shadowPurchasePlan(record,rule)]));
    raceEvaluations.push({raceKey:record.raceKey,confirmed:String(result.status||"").toLowerCase()==="confirmed"&&Boolean(finish)&&payout!==null,finish,payout,candidates});
  }
  const summaries=Object.fromEntries(rules.map(rule=>[rule.id,summarize(raceEvaluations,rule.id)]));
  return{version:"THIRD-VARIANT-SHADOW-1.0",readOnly:true,productionWriteAllowed:false,autoPromotion:false,sampleSize:input.length,confirmedRaces:raceEvaluations.filter(x=>x.confirmed).length,rules:THIRD_VARIANT_SHADOW_RULES,summaries,races:raceEvaluations};
}

function summarize(races,id){
  const plans=races.map(r=>r.candidates[id].candidate),counts=plans.map(x=>x.length),confirmed=races.filter(x=>x.confirmed),hitRows=confirmed.filter(r=>r.candidates[id].candidate.some(x=>x.order.join("-")===r.finish.join("-"))),ticketCount=confirmed.reduce((n,r)=>n+r.candidates[id].candidate.length,0),investment=ticketCount*100,returned=hitRows.reduce((n,r)=>n+r.payout,0),controlId="CONTROL",inflation=races.map(r=>r.candidates[id].candidate.length-r.candidates[controlId].candidate.length);
  return{ticketDistribution:distribution(counts),rescuedTickets:races.reduce((n,r)=>n+r.candidates[id].rescued.length,0),changedRaces:inflation.filter(x=>x>0).length,inflation:{mean:mean(inflation),median:quantile(inflation,.5),p90:quantile(inflation,.9),max:Math.max(0,...inflation),plus1To2:inflation.filter(x=>x>=1&&x<=2).length,plus3To5:inflation.filter(x=>x>=3&&x<=5).length,plus6OrMore:inflation.filter(x=>x>=6).length},flat:{betRaces:confirmed.filter(r=>r.candidates[id].candidate.length>0).length,hitRaces:hitRows.length,ticketCount,investment,return:returned,roi:investment?returned/investment:null}};
}
function distribution(values){return{mean:mean(values),median:quantile(values,.5),p75:quantile(values,.75),p90:quantile(values,.9),max:Math.max(0,...values),one:values.filter(x=>x===1).length,twoTo3:values.filter(x=>x>=2&&x<=3).length,fourTo6:values.filter(x=>x>=4&&x<=6).length,sevenTo10:values.filter(x=>x>=7&&x<=10).length,elevenOrMore:values.filter(x=>x>=11).length,sixteenOrMore:values.filter(x=>x>=16).length};}
function sealedPrediction(r){const q=r?.sealed?.researchPrediction||{};return q.prediction?.performanceSchemaVersion==="PURCHASE_PERFORMANCE_V2"?q.prediction:q;}
function isV2(r){return sealedPrediction(r)?.performanceSchemaVersion==="PURCHASE_PERFORMANCE_V2";}
function sealedAt(r){return String(r?.sealed?.predictionSealedAt||"");}
function normalizedClass(v){const x=String(v||"").toUpperCase();return x==="MAIN"||x==="COVER"?x:null;}
function normalizeOrder(v){const n=(Array.isArray(v)?v:String(v||"").match(/\d+/g)||[]).map(Number).slice(0,3);return n.length===3&&n.every(Number.isFinite)?n:null;}
function uniquePlan(rows){const m=new Map();for(const row of rows||[]){const order=normalizeOrder(row?.order||row?.combination),betClass=normalizedClass(row?.betClass||row?.category);if(order&&betClass&&!m.has(order.join("-")))m.set(order.join("-"),{...row,order,betClass});}return[...m.values()];}
function compareRows(a,b){return(Number(b?.probability)||0)-(Number(a?.probability)||0)||String(a?.order||"").localeCompare(String(b?.order||""),"en");}
function finite(v){if(v===null||v===undefined||v==="")return null;const n=Number(v);return Number.isFinite(n)?n:null;}
function mean(a){return a.length?a.reduce((s,x)=>s+x,0)/a.length:null;}
function quantile(a,q){if(!a.length)return null;const s=[...a].sort((x,y)=>x-y),i=(s.length-1)*q,l=Math.floor(i),h=Math.ceil(i);return s[l]+(s[h]-s[l])*(i-l);}
