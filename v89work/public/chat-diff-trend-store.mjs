export const CHAT_DIFF_TREND_STORAGE_KEY="chari-neko:keirin-chat-diff-trends:v1";
export const CHAT_DIFF_TREND_VERSION="CHAT-DIFF-TREND-v1";
const STAGE_ORDER=[
  ["FIRST_PLACE_EVALUATION","1着評価"],
  ["PAIR_BRANCH","1-2着枝"],
  ["TERMINAL_GENERATION","3着終端"],
  ["BET_CLASSIFICATION","買い目分類"],
  ["PURCHASE_DECISION","購入採否"]
];

export function trendRaceKey(race){return [normalizeDate(race?.date),String(race?.venueCode||""),Number(race?.raceNo)||0].join(":")}

export function recordChatDiffTrend(storage,race,comparison,now=new Date()){
  if(!storage||!race||!comparison)return null;
  const row=compactComparison(race,comparison,now);
  let all=loadChatDiffTrends(storage).filter(x=>x.raceKey!==row.raceKey);
  all.unshift(row);all=all.slice(0,60);
  try{storage.setItem(CHAT_DIFF_TREND_STORAGE_KEY,JSON.stringify(all))}catch{}
  return row;
}

export function loadChatDiffTrends(storage){
  try{const value=JSON.parse(storage.getItem(CHAT_DIFF_TREND_STORAGE_KEY)||"[]");return Array.isArray(value)?value:[]}catch{return[]}
}

export function summarizeChatDiffTrends(rows){
  const data=Array.isArray(rows)?rows:[];
  const stages=STAGE_ORDER.map(([stage,label])=>{
    const comparable=data.filter(r=>r.stages?.[stage]&&r.stages[stage]!=="UNKNOWN");
    const diffRows=comparable.filter(r=>r.stages[stage]==="DIFF");
    const diffItems=diffRows.reduce((sum,r)=>sum+(Number(r.diffCounts?.[stage])||1),0);
    return {stage,label,compared:comparable.length,diffRaces:diffRows.length,diffRate:comparable.length?diffRows.length/comparable.length:0,diffItems};
  });
  const ranked=stages.filter(s=>s.compared>0).sort((a,b)=>b.diffRate-a.diffRate||b.diffRaces-a.diffRaces||stageIndex(a.stage)-stageIndex(b.stage));
  const priority=ranked[0]||null;
  const firstDivergenceCounts={};
  for(const r of data){if(r.firstDivergence)firstDivergenceCounts[r.firstDivergence]=(firstDivergenceCounts[r.firstDivergence]||0)+1}
  return {version:CHAT_DIFF_TREND_VERSION,raceCount:data.length,stages,priority,firstDivergenceCounts};
}

function compactComparison(race,comparison,now){
  const stages={};const diffCounts={};
  for(const s of comparison.stages||[]){
    stages[s.stage]=s.status;
    if(s.status==="DIFF")diffCounts[s.stage]=countDetails(s);
  }
  return {version:CHAT_DIFF_TREND_VERSION,raceKey:trendRaceKey(race),race:{date:normalizeDate(race?.date),venueCode:String(race?.venueCode||""),venueName:String(race?.venueName||""),raceNo:Number(race?.raceNo)||0},recordedAt:now.toISOString(),firstDivergence:comparison.firstDivergence?.stage||null,stages,diffCounts,totals:{chatTerminals:Number(comparison.totals?.chatTerminals)||0,appTerminals:Number(comparison.totals?.appTerminals)||0,chatPurchased:Number(comparison.totals?.chatPurchased)||0,appPurchased:Number(comparison.totals?.appPurchased)||0}};
}
function countDetails(stage){const d=stage?.details||{};if(Array.isArray(d.rows))return d.rows.length;if(Array.isArray(d.chatOnly))return d.chatOnly.length;return 1}
function stageIndex(stage){const i=STAGE_ORDER.findIndex(x=>x[0]===stage);return i<0?999:i}
function normalizeDate(v){return String(v||"").replace(/\D/g,"").slice(0,8)}
