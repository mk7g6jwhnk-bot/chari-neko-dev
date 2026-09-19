const ratio=(n,d)=>d?n/d:null;
const orderSizes=sizes=>[...sizes].sort((a,b)=>b-a);

export function deriveRaceStructure(row,{derivedAt=null}={}){
  const input=row?.prediction?.structureInput||{};
  const raceType=String(input.raceType||'UNKNOWN').toUpperCase()==='GIRLS'?'GIRLS':'STANDARD';
  const fieldSize=Number.isInteger(Number(input.fieldSize))?Number(input.fieldSize):null;
  if(raceType==='GIRLS')return structure(row,{raceType,fieldSize,available:false,reason:'GIRLS_FIXED_LINE_NOT_APPLICABLE'},derivedAt);
  if(input.lineDataAvailable!==true||!Array.isArray(input.lines))return structure(row,{raceType,fieldSize,available:false,reason:input.reason||'OFFICIAL_LINE_UNKNOWN'},derivedAt);
  const groups=input.lines.map(line=>({type:line.type||'UNKNOWN',members:[...new Set((line.members||[]).map(Number).filter(Number.isInteger))]})).filter(x=>x.members.length);
  const lines=groups.filter(x=>x.members.length>1&&(x.type==='ライン'||x.type==='LINE'||x.members.length>1));
  const explicitSolo=groups.filter(x=>x.members.length===1||x.type==='単騎'||x.type==='SOLO').reduce((n,x)=>n+x.members.length,0);
  const covered=new Set(groups.flatMap(x=>x.members)).size;
  const inferredSolo=fieldSize!==null?Math.max(0,fieldSize-covered):0;
  const soloCount=explicitSolo+inferredSolo;
  const lineSizes=orderSizes(lines.map(x=>x.members.length));
  if(!lineSizes.length&&soloCount===0)return structure(row,{raceType,fieldSize,available:false,reason:'OFFICIAL_LINE_UNKNOWN'},derivedAt);
  const pattern=orderSizes([...lineSizes,...Array.from({length:soloCount},()=>1)]);
  return structure(row,{raceType,fieldSize,available:true,lineCount:lineSizes.length,soloCount,lineSizePattern:pattern.join('-'),lineSizes,maxLineSize:lineSizes.length?Math.max(...lineSizes):null,minLineSize:lineSizes.length?Math.min(...lineSizes):null,hasThreeManLine:lineSizes.some(n=>n===3),hasFourManLine:lineSizes.some(n=>n>=4),multiSolo:soloCount>=2,fragmentedStructure:lineSizes.length>=4||soloCount>=2},derivedAt);
}

function structure(row,value,derivedAt){return{raceKey:row.raceKey,fieldSize:value.fieldSize??null,lineCount:value.available?value.lineCount:null,soloCount:value.available?value.soloCount:null,lineSizePattern:value.available?value.lineSizePattern:'UNKNOWN',raceType:value.raceType,structureAvailable:value.available,reason:value.reason||null,lineSizes:value.lineSizes||[],maxLineSize:value.maxLineSize??null,minLineSize:value.minLineSize??null,hasThreeManLine:value.hasThreeManLine??null,hasFourManLine:value.hasFourManLine??null,multiSolo:value.multiSolo??null,fragmentedStructure:value.fragmentedStructure??null,source:'SAVED_PRE_RESULT_OFFICIAL_LINE',derivedAt,predictionHash:row.hashes?.predictionHash||null,referenceHash:row.hashes?.inputHash||null};}

export function aggregateStructures(rows,distance){
  const distanceByKey=new Map((distance?.races||[]).map(x=>[x.raceKey,x]));
  const derivedAt=new Date().toISOString(),structures=rows.map(row=>deriveRaceStructure(row,{derivedAt}));
  const groups={fieldSize:new Map(),lineCount:new Map(),soloCount:new Map(),lineSizePattern:new Map()};
  for(const item of structures){add(groups.fieldSize,item.fieldSize??'UNKNOWN',item,rows,distanceByKey);add(groups.lineCount,item.structureAvailable?item.lineCount:'UNKNOWN',item,rows,distanceByKey);add(groups.soloCount,item.structureAvailable?item.soloCount:'UNKNOWN',item,rows,distanceByKey);add(groups.lineSizePattern,item.structureAvailable?item.lineSizePattern:'UNKNOWN',item,rows,distanceByKey);}
  return{schemaVersion:'DAILY_STRUCTURE_OBSERVATION_V1',definition:{source:'saved pre-result official line only',resultAwareDerivation:false,recommendationConnection:false,purchaseConnection:false},races:structures,summary:{available:structures.filter(x=>x.structureAvailable).length,unknown:structures.filter(x=>!x.structureAvailable&&x.raceType!=='GIRLS').length,girls:structures.filter(x=>x.raceType==='GIRLS').length,byFieldSize:finish(groups.fieldSize),byLineCount:finish(groups.lineCount),bySoloCount:finish(groups.soloCount),byLineSizePattern:finish(groups.lineSizePattern).filter(x=>x.races>=2||x.key==='UNKNOWN')}};
}

export function mergeStructureSummaries(previous={},current={}){const keys=['byFieldSize','byLineCount','bySoloCount','byLineSizePattern'],out={available:Number(previous.available||0)+Number(current.available||0),unknown:Number(previous.unknown||0)+Number(current.unknown||0),girls:Number(previous.girls||0)+Number(current.girls||0)};for(const name of keys){const map=new Map();for(const row of [...(previous[name]||[]),...(current[name]||[])]){const key=String(row.key),target=map.get(key)||{key,races:0,hits:0,investment:0,return:0,P3:0,P2:0,P1:0,P0:0,winnerTop3:0,meaningfulExactTerminal:0,correctInternalNotPurchased:0,upstreamMiss:0,pairDirectionMiss:0,reverse12:0,thirdConditionalMiss:0,purchaseSelectionMiss:0};for(const field of Object.keys(target).filter(x=>x!=='key'))target[field]+=Number(row[field]||0);map.set(key,target)}out[name]=[...map.values()].map(row=>({...row,hitRate:ratio(row.hits,row.investment/100),roi:ratio(row.return,row.investment),p2PlusRate:ratio(row.P3+row.P2,row.races)})).sort((a,b)=>a.key.localeCompare(b.key,undefined,{numeric:true}));}return out;}

function add(map,key,item,rows,distanceByKey){if(!map.has(String(key)))map.set(String(key),[]);map.get(String(key)).push({row:rows.find(x=>x.raceKey===item.raceKey),d:distanceByKey.get(item.raceKey)});}
function finish(map){return[...map].map(([key,items])=>metric(key,items)).sort((a,b)=>String(a.key).localeCompare(String(b.key),undefined,{numeric:true}));}
function metric(key,items){const purchased=items.flatMap(({row})=>row.purchase.eligibility==='PURCHASE_ALLOWED'?row.purchase.tickets.map(t=>({t,row})):[]),hits=purchased.filter(({t,row})=>t.order===(row.result.finishOrder||[]).join('-')),ret=hits.reduce((n,{row})=>n+(Number(row.result.payout)||0),0),count=p=>items.filter(({d})=>p(d)).length;return{key,races:items.length,hits:hits.length,hitRate:ratio(hits.length,purchased.length),investment:purchased.length*100,return:ret,roi:ratio(ret,purchased.length*100),P3:count(d=>d?.meaningfulRiderCount===3),P2:count(d=>d?.meaningfulRiderCount===2),P1:count(d=>d?.meaningfulRiderCount===1),P0:count(d=>d?.meaningfulRiderCount===0),p2PlusRate:ratio(count(d=>d?.meaningfulRiderCount>=2),items.length),winnerTop3:count(d=>Number(d?.winner?.rank)<=3),meaningfulExactTerminal:count(d=>d?.terminal?.meaningful),correctInternalNotPurchased:count(d=>d?.category==='C_CORRECT_INTERNAL_NOT_PURCHASED'),upstreamMiss:count(d=>d?.category==='E_UPSTREAM_MISS'),pairDirectionMiss:count(d=>d?.primaryCause==='PAIR_ORDER_MISS'),reverse12:count(d=>d?.primaryCause==='REVERSE_12'),thirdConditionalMiss:count(d=>d?.primaryCause==='THIRD_CONDITIONAL_MISS'),purchaseSelectionMiss:count(d=>d?.primaryCause==='PURCHASE_SELECTION_MISS')};}
