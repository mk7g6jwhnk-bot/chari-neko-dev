import {buildCandidateTerminals,CANDIDATE_POLICY,trainingHash} from "./candidate.mjs";

export function runDevelopmentBacktest(records,{graphRunner,limit=302}={}){
  if(typeof graphRunner!=="function")throw new Error("GRAPH_RUNNER_REQUIRED");
  const ordered=[...records].filter(valid).sort(order).slice(0,limit);
  if(ordered.length!==302)throw new Error(`DEVELOPMENT_COHORT_INCOMPLETE:${ordered.length}/302`);
  const raceKeys=ordered.map(x=>x.raceKey),variants={C0:[],C1:[],C2:[],C3:[],C4:[]};
  for(const record of ordered){
    variants.C0.push(evaluate(record.research.terminals,record.result.finishOrder));
    const graph=graphRunner(record.preRaceInput);
    for(const name of ["C1","C2","C3","C4"])variants[name].push(evaluate(buildCandidateTerminals({race:record.preRaceInput.race,existingGraph:graph,variant:name}).terminals,record.result.finishOrder));
  }
  const metrics=Object.fromEntries(Object.entries(variants).map(([name,rows])=>[name,aggregate(rows)]));
  return{candidatePolicy:CANDIDATE_POLICY,development:{count:302,raceKeys,trainingHash:trainingHash(raceKeys),indexRange:"1-302",validationTouched:false,finalTestTouched:false},metrics,headToHead:candidateHeadToHead(variants.C0,variants.C4),tailRisk:tailRisk(variants.C0,variants.C4),ablation:{C0:"Existing Research",C1:"DB baseline schema only",C2:"DB baseline + today adjustment",C3:"DB baseline + first",C4:"DB baseline + first + pair",C5:"BEHAVIOR_TRAITS_NOT_ENOUGH_DATA"},productionWriteAllowed:false};
}

export function aggregate(rows){const rank=rows.map(x=>x.exactRank).sort((a,b)=>a-b),pair=rows.map(x=>x.pairRank),first=rows.map(x=>x.firstRank);return{sampleCount:rows.length,exactMeanRank:mean(rank),exactMedianRank:median(rank),mrr:mean(rank.map(x=>1/x)),top10:rate(rank,x=>x<=10),top20:rate(rank,x=>x<=20),top30:rate(rank,x=>x<=30),firstTop1:rate(first,x=>x<=1),firstTop3:rate(first,x=>x<=3),firstMeanRank:mean(first),pairTop3:rate(pair,x=>x<=3),pairTop5:rate(pair,x=>x<=5),pairMeanRank:mean(pair),thirdTop3:rate(rows,x=>x.thirdRank<=3),thirdTop5:rate(rows,x=>x.thirdRank<=5)};}
function evaluate(ledger,result){const order=result.slice(0,3).map(Number),rows=[...ledger].sort((a,b)=>Number(b.terminalProbability)-Number(a.terminalProbability)||a.order.join("-").localeCompare(b.order.join("-"),"en")),exact=rows.findIndex(x=>same(x.order,order))+1,first=rank(group(rows,x=>`${x.order[0]}`),`${order[0]}`),pair=rank(group(rows,x=>`${x.order[0]}-${x.order[1]}`),`${order[0]}-${order[1]}`),third=rank(group(rows.filter(x=>Number(x.order[0])===order[0]&&Number(x.order[1])===order[1]),x=>`${x.order[2]}`),`${order[2]}`);return{exactRank:exact||Infinity,firstRank:first,pairRank:pair,thirdRank:third};}
function group(rows,key){const map=new Map();for(const row of rows)map.set(key(row),(map.get(key(row))||0)+Number(row.terminalProbability||0));return[...map].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],"en"));}
function rank(rows,key){const i=rows.findIndex(x=>x[0]===key);return i<0?Infinity:i+1;}
function candidateHeadToHead(a,b){let candidateWins=0,existingWins=0,ties=0;for(let i=0;i<a.length;i++){if(b[i].exactRank<a[i].exactRank)candidateWins++;else if(a[i].exactRank<b[i].exactRank)existingWins++;else ties++;}return{candidateWins,existingWins,ties};}
function tailRisk(a,b){const d=b.map((x,i)=>x.exactRank-a[i].exactRank).sort((x,y)=>x-y);return{worsening30Plus:d.filter(x=>x>=30).length,worsening50Plus:d.filter(x=>x>=50).length,worstDelta:d.at(-1),p10Delta:d[Math.max(0,Math.ceil(d.length*.9)-1)]};}
function valid(x){return x?.state==="COMPARED"&&x?.preRaceInput?.race&&Array.isArray(x?.research?.terminals)&&x?.result?.status==="confirmed"&&x.result.finishOrder?.length>=3;}
function order(a,b){return Date.parse(a.comparedAt||a.predictionSealedAt)-Date.parse(b.comparedAt||b.predictionSealedAt)||String(a.raceKey).localeCompare(String(b.raceKey),"en");}
function same(a,b){return a.slice(0,3).map(Number).join("-")===b.join("-");}function mean(a){return a.length?a.reduce((n,x)=>n+x,0)/a.length:null}function median(a){const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2}function rate(a,p){return a.length?a.filter(p).length/a.length:0}
