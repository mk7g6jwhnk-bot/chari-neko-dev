const LABELS={MAIN:"本線",COVER:"押さえ",SCENARIO_BREAK:"展開崩れ",HIGH_PAYOUT:"高配当",UNKNOWN:"分類未確認"};
const V2_VERSION="MULTI_WORLD_TICKET_CLASS_V2";

const text=value=>String(value||"").trim().toUpperCase();
const orderKey=row=>(row?.order||[]).map(Number).filter(Number.isFinite).join("-");

export function canonicalTicketDisplayClass(row={}){
  const ticketClass=text(row.ticketClass),worldClass=text(row.worldClass),isV2=row.ticketClassVersion===V2_VERSION||row.classificationSource==="CANONICAL_V2"||Boolean(row.worldClass);
  if(isV2){
    if(ticketClass==="MAIN")return"MAIN";
    if(ticketClass==="COVER")return"COVER";
    if(ticketClass==="SCENARIO_BREAK")return"SCENARIO_BREAK";
    if(ticketClass==="HIGH_PAYOUT"||ticketClass==="BUYABLE_HIGH")return"HIGH_PAYOUT";
    if(worldClass==="MAIN")return"MAIN";
    if(worldClass==="SECONDARY")return"COVER";
    if(worldClass==="SCENARIO_BREAK")return"SCENARIO_BREAK";
    return"UNKNOWN";
  }
  const legacy=text(row.category||row.betClass);
  if(legacy==="MAIN")return"MAIN";
  if(legacy==="COVER")return"COVER";
  if(legacy==="SCENARIO_BREAK")return"SCENARIO_BREAK";
  if(legacy==="BUYABLE_HIGH"||legacy==="HIGH_PAYOUT")return"HIGH_PAYOUT";
  return"UNKNOWN";
}

export function buildCanonicalTicketOverview(rows=[]){
  const groups=new Map(["MAIN","COVER","SCENARIO_BREAK","HIGH_PAYOUT","UNKNOWN"].map(key=>[key,[]])),seen=new Set();
  let duplicateCount=0;
  for(const row of rows){
    const order=orderKey(row);if(!order)continue;
    if(seen.has(order)){duplicateCount+=1;continue}seen.add(order);
    const displayClass=canonicalTicketDisplayClass(row);
    groups.get(displayClass).push({order,displayClass,label:LABELS[displayClass],ticketClass:row.ticketClass||null,worldClass:row.worldClass||null,thick:row.thick===true||row.thickQualified===true,sourceRow:row});
  }
  return{groups:[...groups].map(([key,tickets])=>({key,label:LABELS[key],tickets})).filter(group=>group.tickets.length),total:seen.size,sourceCount:rows.length,duplicateCount};
}
