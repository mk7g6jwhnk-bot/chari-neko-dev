import crypto from 'node:crypto';

export const MARK_TICKET_SHADOW_VERSION='MARK_TICKET_SHADOW_V1';
export const CANDIDATE_CODES=new Set(['ADOPTED','THIRD_VARIANT_AMBIGUITY','THIRD_VARIANT_BOUNDARY']);
export const MARKS=['◎','○','▲','△','☆','×'];

const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
const ratio=(n,d)=>d?n/d:null;
const round=(n,digits=6)=>finite(n)?Number(Number(n).toFixed(digits)):null;
export const orderKey=value=>(Array.isArray(value)?value:String(value||'').match(/\d+/g)||[]).map(Number).join('-');

function quantile(values,p){const a=values.filter(finite).map(Number).sort((x,y)=>x-y);if(!a.length)return null;const i=(a.length-1)*p,lo=Math.floor(i),hi=Math.ceil(i);return a[lo]+(a[hi]-a[lo])*(i-lo)}
function sumTrace(trace){return Array.isArray(trace)?trace.reduce((sum,row)=>sum+(finite(row?.contribution)?Number(row.contribution):0),0):null}

export function deriveSavedMarks(row){
  const riders=(row?.prediction?.riderScores||[]).map(rider=>({
    number:Number(rider.number),
    overall:finite(rider.score)?Number(rider.score):null,
    first:finite(rider.score)?Number(rider.score):sumTrace(rider?.scoreTrace?.first),
    second:sumTrace(rider?.scoreTrace?.second),
    third:sumTrace(rider?.scoreTrace?.third)
  })).filter(rider=>Number.isFinite(rider.number));
  const rank=key=>new Map(riders.filter(r=>finite(r[key])).sort((a,b)=>b[key]-a[key]||a.number-b.number).map((r,index)=>[r.number,{rank:index+1,mark:MARKS[Math.min(index,MARKS.length-1)],score:r[key]}]));
  const maps={overall:rank('overall'),first:rank('first'),second:rank('second'),third:rank('third')};
  return {complete:riders.length>=5&&['overall','first','second','third'].every(key=>maps[key].size===riders.length),riders,maps};
}

function markStrength(entry){if(!entry)return 0;return [1,.78,.56,.34,.16,0][Math.min(5,Math.max(0,entry.rank-1))]}

export function markFeaturesForOrder(order,marks){
  const numbers=orderKey(order).split('-').map(Number),[first,second,third]=numbers;
  const overall=n=>markStrength(marks.maps.overall.get(n)),position=(n,key)=>markStrength(marks.maps[key].get(n));
  const overallValues=numbers.map(overall),topCount=overallValues.filter(value=>value>=.56).length;
  return {
    firstOverall:overall(first),secondOverall:overall(second),thirdOverall:overall(third),
    firstPosition:position(first,'first'),secondPosition:position(second,'second'),thirdPosition:position(third,'third'),
    topThreeCount:topCount,allTopThree:topCount===3,twoOfThreeTop:topCount>=2,
    allUnmarked:overallValues.every(value=>value===0),containsBottom:overallValues.some(value=>value===0)
  };
}

export function markScore(features,variant='MARK_SCORE_C'){
  if(variant==='MARK_SCORE_A')return features.firstOverall;
  if(variant==='MARK_SCORE_B')return (features.firstOverall+features.secondOverall+features.thirdOverall)/3;
  if(variant==='MARK_SCORE_D')return features.topThreeCount/3;
  return .45*features.firstPosition+.25*features.secondPosition+.15*features.thirdPosition+.15*((features.firstOverall+features.secondOverall+features.thirdOverall)/3);
}

function canonicalCandidateRows(row){
  const byOrder=new Map();
  for(const terminal of row?.prediction?.terminals||[]){
    if(!CANDIDATE_CODES.has(String(terminal?.purchaseRejectCode||'')))continue;
    const key=orderKey(terminal.order);if(!key)continue;
    const old=byOrder.get(key);
    if(!old||Number(terminal.terminalGlobalRank??Infinity)<Number(old.terminalGlobalRank??Infinity)||Number(terminal.terminalScore||0)>Number(old.terminalScore||0))byOrder.set(key,terminal);
  }
  for(const [index,ticket] of (row?.purchase?.tickets||[]).entries()){
    const key=orderKey(ticket.order);if(!key)continue;
    if(!byOrder.has(key))byOrder.set(key,{order:key,terminalGlobalRank:index+1,terminalScore:null,purchaseRejectCode:'ADOPTED',betClass:ticket.class,thick:Boolean(ticket.thick)});
  }
  return [...byOrder.entries()].map(([key,terminal])=>({key,terminal}));
}

function normalizeScores(candidates){
  const scores=candidates.map(x=>Number(x.terminal?.terminalScore)).filter(Number.isFinite),min=scores.length?Math.min(...scores):0,max=scores.length?Math.max(...scores):0;
  for(const [index,candidate] of candidates.entries())candidate.originalNormalized=max>min&&finite(candidate.terminal?.terminalScore)?(Number(candidate.terminal.terminalScore)-min)/(max-min):1-index/Math.max(1,candidates.length-1);
}

export function rankShadowCandidates(row,{variant='MARK_SCORE_C',blendWeight=.2}={}){
  const marks=deriveSavedMarks(row),candidates=canonicalCandidateRows(row).sort((a,b)=>Number(a.terminal.terminalGlobalRank??Infinity)-Number(b.terminal.terminalGlobalRank??Infinity)||Number(b.terminal.terminalScore||0)-Number(a.terminal.terminalScore||0)||a.key.localeCompare(b.key,'en'));
  normalizeScores(candidates);
  candidates.forEach((candidate,index)=>{
    candidate.originalRank=index+1;candidate.originalScore=finite(candidate.terminal.terminalScore)?Number(candidate.terminal.terminalScore):null;
    candidate.markFeatures=markFeaturesForOrder(candidate.key,marks);candidate.markScore=markScore(candidate.markFeatures,variant);
    candidate.adjustedScore=(1-blendWeight)*candidate.originalNormalized+blendWeight*candidate.markScore;
  });
  const ranked=[...candidates].sort((a,b)=>b.adjustedScore-a.adjustedScore||a.originalRank-b.originalRank||a.key.localeCompare(b.key,'en'));
  ranked.forEach((candidate,index)=>{candidate.adjustedRank=index+1;candidate.rankDelta=candidate.originalRank-candidate.adjustedRank});
  return {marks,candidates:ranked};
}

function canonicalSelection(row){return (row?.purchase?.tickets||[]).map((ticket,index)=>({key:orderKey(ticket.order),position:index+1,source:'CURRENT_CANONICAL'})).filter(x=>x.key)}
function uniqueFill(primary,secondary,cap){if(cap<=0)return[];const seen=new Set(),out=[];for(const candidate of [...primary,...secondary]){const key=typeof candidate==='string'?candidate:candidate.key;if(!key||seen.has(key))continue;seen.add(key);out.push({key,position:out.length+1});if(out.length>=cap)break}return out}

export function selectShadowSets(row,ranked){
  const baseline=canonicalSelection(row),cap=baseline.length,adjusted=ranked.map(x=>({key:x.key,source:'MARK_ADJUSTED_SHADOW'}));
  const takeA=Math.floor(cap*2/3),takeB=Math.floor(cap*4/5),takeC=Math.max(0,cap-1);
  return {
    CURRENT_CANONICAL:baseline,
    MARK_ADJUSTED_SHADOW:uniqueFill(adjusted,baseline,cap),
    HYBRID_A:uniqueFill(baseline.slice(0,takeA),adjusted,cap),
    HYBRID_B:uniqueFill(baseline.slice(0,takeB),adjusted,cap),
    HYBRID_C:uniqueFill(baseline.slice(0,takeC),adjusted,cap)
  };
}

function hybridFullRanking(row,ranked,name){
  const baseline=canonicalSelection(row),cap=baseline.length,adjusted=ranked.map(x=>({key:x.key})),original=[...ranked].sort((a,b)=>a.originalRank-b.originalRank).map(x=>({key:x.key}));
  const keep=name==='HYBRID_A'?Math.floor(cap*2/3):name==='HYBRID_B'?Math.floor(cap*4/5):Math.max(0,cap-1);
  return uniqueFill(baseline.slice(0,keep),[...adjusted,...original],Math.max(ranked.length,baseline.length));
}

function worldOfExact(row,key){
  const terminal=(row?.prediction?.terminals||[]).filter(t=>orderKey(t.order)===key).sort((a,b)=>Number(a.terminalGlobalRank??Infinity)-Number(b.terminalGlobalRank??Infinity))[0];
  const explicit=String(terminal?.worldClass||terminal?.macroScenarioClass||terminal?.scenarioWorld||'').toUpperCase();
  if(explicit.includes('MAIN'))return'MAIN';if(explicit.includes('SECONDARY'))return'SECONDARY';if(explicit.includes('BREAK')||explicit.includes('ALT'))return'BREAK_ALT';return'UNKNOWN';
}

function evaluateRace(row,variant='MARK_SCORE_C'){
  const {marks,candidates}=rankShadowCandidates(row,{variant}),sets=selectShadowSets(row,candidates),actual=orderKey(row?.result?.finishOrder),payout=Number(row?.result?.payout)||0;
  const original=candidates.find(x=>x.key===actual),world=worldOfExact(row,actual),methods={};
  for(const [name,selected] of Object.entries(sets)){const position=selected.findIndex(x=>x.key===actual)+1,fullRank=name==='CURRENT_CANONICAL'?original?.originalRank:name==='MARK_ADJUSTED_SHADOW'?original?.adjustedRank:hybridFullRanking(row,candidates,name).findIndex(x=>x.key===actual)+1;methods[name]={ticketCount:selected.length,hit:position>0,return:position>0?payout:0,selectedRank:position||null,fullExactRank:fullRank||null,selected:selected.map(x=>x.key)}}
  return {raceKey:row.raceKey,phase:null,actual,payout,world,marksComplete:marks.complete,candidateCount:candidates.length,baselineExactRank:original?.originalRank??null,adjustedExactRank:original?.adjustedRank??null,rankDelta:original?.rankDelta??null,exactTrace:original?{originalRank:original.originalRank,originalScore:round(original.originalScore),markScore:round(original.markScore),adjustedScore:round(original.adjustedScore),adjustedRank:original.adjustedRank,rankDelta:original.rankDelta,markFeatures:original.markFeatures}:null,methods};
}

function methodSummary(races,name){
  const rows=races.map(r=>({...r,method:r.methods[name]})),hits=rows.filter(r=>r.method.hit),payouts=hits.map(r=>r.payout),ranks=rows.map(r=>r.method.fullExactRank).filter(finite).map(Number);
  return {method:name,races:rows.length,tickets:rows.reduce((sum,r)=>sum+r.method.ticketCount,0),hits:hits.length,misses:rows.length-hits.length,hitRate:ratio(hits.length,rows.length),investment:rows.reduce((sum,r)=>sum+r.method.ticketCount,0)*100,return:hits.reduce((sum,r)=>sum+r.payout,0),roi:ratio(hits.reduce((sum,r)=>sum+r.payout,0),rows.reduce((sum,r)=>sum+r.method.ticketCount,0)*100),manHits:hits.filter(r=>r.payout>=10000).length,payout20k:hits.filter(r=>r.payout>=20000).length,payout30k:hits.filter(r=>r.payout>=30000).length,averagePayout:ratio(payouts.reduce((a,b)=>a+b,0),payouts.length),medianPayout:quantile(payouts,.5),exactRankMean:ratio(ranks.reduce((a,b)=>a+b,0),ranks.length),exactRankMedian:quantile(ranks,.5)};
}

function comparison(races,name){
  const baseline='CURRENT_CANONICAL',gained=races.filter(r=>!r.methods[baseline].hit&&r.methods[name].hit),lost=races.filter(r=>r.methods[baseline].hit&&!r.methods[name].hit);
  return {method:name,newHits:gained.map(r=>r.raceKey),lostHits:lost.map(r=>r.raceKey),newManHits:gained.filter(r=>r.payout>=10000).map(r=>r.raceKey),lostManHits:lost.filter(r=>r.payout>=10000).map(r=>r.raceKey),new20k:gained.filter(r=>r.payout>=20000).map(r=>r.raceKey),lost20k:lost.filter(r=>r.payout>=20000).map(r=>r.raceKey),new30k:gained.filter(r=>r.payout>=30000).map(r=>r.raceKey),lost30k:lost.filter(r=>r.payout>=30000).map(r=>r.raceKey)};
}

function rankChanges(races,name){
  const rows=races.filter(r=>finite(r.baselineExactRank)&&finite(r.adjustedExactRank)),improved=rows.filter(r=>r.adjustedExactRank<r.baselineExactRank),worsened=rows.filter(r=>r.adjustedExactRank>r.baselineExactRank);
  return {method:name,evaluable:rows.length,improved:improved.length,worsened:worsened.length,unchanged:rows.length-improved.length-worsened.length,outsideToInside15:rows.filter(r=>r.baselineExactRank>15&&r.adjustedExactRank<=15).map(r=>r.raceKey),insideToOutside15:rows.filter(r=>r.baselineExactRank<=15&&r.adjustedExactRank>15).map(r=>r.raceKey),meanDelta:ratio(rows.reduce((s,r)=>s+(r.baselineExactRank-r.adjustedExactRank),0),rows.length),medianDelta:quantile(rows.map(r=>r.baselineExactRank-r.adjustedExactRank),.5)};
}

function highPayoutPreservation(races,name){const baseline=races.filter(r=>r.methods.CURRENT_CANONICAL.hit&&r.payout>=10000),kept=baseline.filter(r=>r.methods[name].hit);return{method:name,baselineHighPayoutHits:baseline.length,kept:kept.length,rate:ratio(kept.length,baseline.length),lostRaceKeys:baseline.filter(r=>!r.methods[name].hit).map(r=>r.raceKey)}}

function worldImpact(races){return ['MAIN','SECONDARY','BREAK_ALT','UNKNOWN'].map(world=>{const rows=races.filter(r=>r.world===world),delta=rows.filter(r=>finite(r.rankDelta)).map(r=>r.rankDelta);return{world,races:rows.length,rankImproved:delta.filter(x=>x>0).length,rankWorsened:delta.filter(x=>x<0).length,meanRankDelta:ratio(delta.reduce((a,b)=>a+b,0),delta.length)}})}

function positionImpact(races){
  const keys=['firstPosition','secondPosition','thirdPosition'];
  return keys.map(key=>{const rows=races.filter(r=>r.exactTrace),weighted=rows.map(r=>({strength:r.exactTrace.markFeatures[key],delta:r.rankDelta}));const high=weighted.filter(x=>x.strength>=.56),low=weighted.filter(x=>x.strength<.56);return{position:key,highMarkRaces:high.length,highMeanRankDelta:ratio(high.reduce((s,x)=>s+x.delta,0),high.length),lowMarkRaces:low.length,lowMeanRankDelta:ratio(low.reduce((s,x)=>s+x.delta,0),low.length)}});
}

function tradeoff(summary,base,cmp,preserve){
  if(summary.hits<base.hits&&summary.manHits<base.manHits&&summary.exactRankMean>=base.exactRankMean)return'BAD_TRADEOFF';
  if(summary.hits>base.hits&&preserve.rate!==null&&preserve.rate<.8)return'HIGH_PAYOUT_DAMAGE';
  if(summary.hits>base.hits&&summary.return>=base.return&&summary.exactRankMean<base.exactRankMean&&preserve.rate>=.8)return'TRUE_HYBRID_GAIN';
  if(summary.hits>base.hits&&preserve.rate>=.8)return'GOOD_COMPLEMENT';
  if(cmp.newHits.length===cmp.lostHits.length&&Math.abs(summary.exactRankMean-base.exactRankMean)<1)return'NO_ADDED_VALUE';
  return'INSUFFICIENT_SAMPLE';
}

export function evaluateMarkTicketShadow(source,{variant='MARK_SCORE_C'}={}){
  const rows=source?.rows||[],sorted=[...rows].sort((a,b)=>String(a.resultObservedAt||a.predictionSealedAt||a.raceKey).localeCompare(String(b.resultObservedAt||b.predictionSealedAt||b.raceKey))),cut=Math.floor(sorted.length/2);
  const races=sorted.map((row,index)=>({...evaluateRace(row,variant),phase:index<cut?'DISCOVERY':'VALIDATION'}));
  const methodNames=['CURRENT_CANONICAL','MARK_ADJUSTED_SHADOW','HYBRID_A','HYBRID_B','HYBRID_C'];
  const overall=Object.fromEntries(methodNames.map(name=>[name,methodSummary(races,name)]));
  const phases=Object.fromEntries(['DISCOVERY','VALIDATION'].map(phase=>[phase,Object.fromEntries(methodNames.map(name=>[name,methodSummary(races.filter(r=>r.phase===phase),name)]))]));
  const comparisons=Object.fromEntries(methodNames.slice(1).map(name=>[name,comparison(races,name)])),preservation=Object.fromEntries(methodNames.slice(1).map(name=>[name,highPayoutPreservation(races,name)]));
  const rankChange=rankChanges(races,'MARK_ADJUSTED_SHADOW'),tradeoffs=Object.fromEntries(methodNames.slice(1).map(name=>[name,tradeoff(overall[name],overall.CURRENT_CANONICAL,comparisons[name],preservation[name])]));
  const markVariants=Object.fromEntries(['MARK_SCORE_A','MARK_SCORE_B','MARK_SCORE_C','MARK_SCORE_D'].map(id=>{const variantRaces=sorted.map((row,index)=>({...evaluateRace(row,id),phase:index<cut?'DISCOVERY':'VALIDATION'}));return[id,{overall:methodSummary(variantRaces,'MARK_ADJUSTED_SHADOW'),discovery:methodSummary(variantRaces.filter(r=>r.phase==='DISCOVERY'),'MARK_ADJUSTED_SHADOW'),validation:methodSummary(variantRaces.filter(r=>r.phase==='VALIDATION'),'MARK_ADJUSTED_SHADOW')}]}));
  return {schemaVersion:MARK_TICKET_SHADOW_VERSION,generatedAt:new Date().toISOString(),definition:{source:'fixed 300R saved prediction/purchase cohort',primaryMarkVariant:variant,blendWeight:.2,candidateCodes:[...CANDIDATE_CODES],candidateGenerationChanged:false,capRule:'each race uses the saved canonical ticket count',discoveryValidation:'temporal 150/150; formulas frozen before result aggregation',markInput:'saved prediction-time riderScores and scoreTrace only',resultUse:'evaluation labels only'},dataset:{races:races.length,purchaseable:races.filter(r=>r.methods.CURRENT_CANONICAL.ticketCount>0).length,ineligible:races.filter(r=>r.methods.CURRENT_CANONICAL.ticketCount===0).length,markComplete:races.filter(r=>r.marksComplete).length,markMissing:races.filter(r=>!r.marksComplete).length,candidateMissing:races.filter(r=>r.candidateCount===0).length,resultPayout10k:races.filter(r=>r.payout>=10000).length,resultPayout20k:races.filter(r=>r.payout>=20000).length,resultPayout30k:races.filter(r=>r.payout>=30000).length,cohortKeyHash:source.cohortKeyHash},overall,phases,markVariants,comparisons,rankChange,worldImpact:worldImpact(races),positionImpact:positionImpact(races),highPayoutPreservation:preservation,tradeoffs,races,safety:{predictionRegeneration:0,purchaseRegeneration:0,canonicalPurchaseChanged:false,recommendationChanged:false,historicalMutation:0,resultLeakage:0,deploy:0,protectedFinalUsed:Number(source?.cohort?.protectedFinalIncluded)||0,predictionHashMismatch:Number(source?.hashes?.predictionMismatch)||0,purchaseHashMismatch:Number(source?.hashes?.purchaseMismatch)||0,sealedResultMismatch:Number(source?.hashes?.sealedResultMismatch)||0,sourceSha256:crypto.createHash('sha256').update(JSON.stringify(source)).digest('hex')}};
}
