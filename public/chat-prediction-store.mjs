export const CHAT_PREDICTION_STORAGE_KEY="chari-neko:keirin-chat-predictions:v1";
export const CHAT_PREDICTION_SCHEMA_VERSION="CHAT-KEIRIN-IMPORT-v1";

export function chatRaceKey(race){return [normalizeDate(race?.date),String(race?.venueCode||""),Number(race?.raceNo)].join(":")}

export function parseChatPrediction(text,currentRace=null,now=new Date()){
  const raw=extractJson(String(text||""));
  if(!raw)throw new Error("チャット予想のJSONを読み取れません。JSON形式の予想を貼り付けてください。");
  let input;
  try{input=JSON.parse(raw)}catch(error){throw new Error(`JSONの形式が正しくありません: ${error.message}`)}
  if(!input||typeof input!=="object"||Array.isArray(input))throw new Error("チャット予想はJSONオブジェクトで入力してください。");
  const race=normalizeRace(input.race||input.targetRace||{},currentRace);
  validateRaceMatch(race,currentRace);
  const terminals=normalizeTerminals(input.terminals||input.terminalLedger||input.bets||input.betSelections||[]);
  if(!terminals.length)throw new Error("終端または買い目が1件もありません。terminals に1-2-3着を入れてください。");
  return {
    chatPredictionId:`${chatRaceKey(race)}:${now.toISOString()}`,
    schemaVersion:String(input.schemaVersion||CHAT_PREDICTION_SCHEMA_VERSION),
    importedAt:now.toISOString(),
    generatedAt:String(input.generatedAt||input.createdAt||""),
    race,
    mainScenario:normalizeMainScenario(input.mainScenario||input.primaryScenario||input.scenario||null),
    riderMarks:normalizeRiderMarks(input.riderMarks||input.marks||input.riderRatings||[]),
    firstCandidates:normalizeFirstCandidates(input.firstCandidates||input.firstPlaceCandidates||[]),
    pairBranches:normalizePairBranches(input.pairBranches||input.pairs||input.secondPlaceBranches||[]),
    terminals,
    ratings:normalizeRatings(input.ratings||input.summary||{}),
    notes:normalizeStringArray(input.notes||input.auditNotes||[]),
    rawSource:input
  };
}

export function saveChatPrediction(storage,prediction){
  const all=loadChatPredictions(storage);
  const key=chatRaceKey(prediction.race);
  const filtered=all.filter(x=>chatRaceKey(x.race)!==key);
  filtered.unshift(compactChatPrediction(prediction));
  persistChatPredictions(storage,filtered.slice(0,40));
  return prediction;
}

export function loadChatPredictions(storage){try{const value=JSON.parse(storage.getItem(CHAT_PREDICTION_STORAGE_KEY)||"[]");return Array.isArray(value)?value:[]}catch{return[]}}
export function findChatPrediction(storage,race){const key=chatRaceKey(race);return loadChatPredictions(storage).find(x=>chatRaceKey(x.race)===key)||null}
export function removeChatPrediction(storage,race){const key=chatRaceKey(race),next=loadChatPredictions(storage).filter(x=>chatRaceKey(x.race)!==key);persistChatPredictions(storage,next);return next.length}

function extractJson(text){
  const trimmed=text.trim();
  const fenced=trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if(fenced)return fenced[1].trim();
  const start=trimmed.indexOf("{"),end=trimmed.lastIndexOf("}");
  if(start>=0&&end>start)return trimmed.slice(start,end+1);
  return trimmed;
}
function normalizeRace(value,current){
  const fallback=current||{};
  return {
    date:normalizeDate(value.date||fallback.date),
    venueCode:String(value.venueCode||fallback.venueCode||""),
    venueName:String(value.venueName||value.venue||fallback.venueName||fallback.venue||""),
    raceNo:Number(value.raceNo||fallback.raceNo)
  };
}
function validateRaceMatch(race,current){
  if(!race.date||!Number.isFinite(race.raceNo)||race.raceNo<=0)throw new Error("race.date と race.raceNo が必要です。");
  if(!current)return;
  const currentDate=normalizeDate(current.date),currentNo=Number(current.raceNo),currentCode=String(current.venueCode||"");
  if(currentDate&&race.date!==currentDate)throw new Error(`別日の予想です（貼付 ${race.date} / 表示中 ${currentDate}）。`);
  if(Number.isFinite(currentNo)&&currentNo>0&&race.raceNo!==currentNo)throw new Error(`別レースの予想です（貼付 ${race.raceNo}R / 表示中 ${currentNo}R）。`);
  if(currentCode&&race.venueCode&&race.venueCode!==currentCode)throw new Error(`別会場の予想です（会場コード ${race.venueCode} / ${currentCode}）。`);
}
function normalizeMainScenario(value){
  if(!value)return null;
  if(typeof value==="string")return{title:"主展開",description:value,evidence:[],counterEvidence:[]};
  return {title:String(value.title||value.label||"主展開"),description:String(value.description||value.reason||""),evidence:normalizeStringArray(value.evidence||value.reasons||[]),counterEvidence:normalizeStringArray(value.counterEvidence||value.risks||[])};
}

function normalizeRiderMarks(rows){
  const source=Array.isArray(rows)?rows:Object.entries(rows||{}).map(([number,value])=>typeof value==="string"?{number,overall:value}:{number,...(value||{})});
  return source.map(row=>({
    number:Number(row?.number??row?.riderNumber),
    overallMark:normalizeMark(row?.overallMark??row?.overall??row?.mark),
    firstMark:normalizeMark(row?.firstMark??row?.first??row?.head),
    secondMark:normalizeMark(row?.secondMark??row?.second),
    thirdMark:normalizeMark(row?.thirdMark??row?.third),
    reason:String(row?.reason||"")
  })).filter(x=>Number.isFinite(x.number)&&x.number>0);
}
function normalizeMark(v){const s=String(v||"").trim();return ["◎","○","▲","△","☆","×","？"].includes(s)?s:"？"}
function normalizeFirstCandidates(rows){return (Array.isArray(rows)?rows:[]).map((row,index)=>typeof row==="number"?{number:row,rank:index+1,probability:null,reason:""}:{number:Number(row?.number??row?.first),rank:Number(row?.rank)||index+1,probability:finiteOrNull(row?.probability??row?.share),reason:String(row?.reason||"")}).filter(x=>Number.isFinite(x.number)&&x.number>0)}
function normalizePairBranches(rows){return (Array.isArray(rows)?rows:[]).map((row,index)=>{const order=normalizeOrder(row?.order||row?.pair,2);return{order,rank:Number(row?.rank)||index+1,probability:finiteOrNull(row?.probability),scenario:String(row?.scenario||row?.scenarioLabel||""),reason:String(row?.reason||"")}}).filter(x=>x.order.length===2)}
function normalizeTerminals(rows){return (Array.isArray(rows)?rows:[]).map((row,index)=>{
  if(Array.isArray(row))row={order:row};
  if(typeof row==="string")row={order:row};
  const order=normalizeOrder(row?.order||row?.bet||row?.combination,3);
  return {order,rank:Number(row?.rank)||index+1,probability:finiteOrNull(row?.probability),category:normalizeCategory(row?.category||row?.betClass||row?.class),purchaseStatus:normalizePurchase(row?.purchaseStatus||row?.purchase||row?.status),reason:String(row?.reason||row?.purchaseReason||""),scenario:String(row?.scenario||row?.scenarioLabel||row?.branchLabel||"")};
}).filter(x=>x.order.length===3)}
function normalizeRatings(value){return {confidence:finiteOrNull(value?.confidence),concentration:finiteOrNull(value?.concentration),rollover:finiteOrNull(value?.rollover),verdict:String(value?.verdict||value?.recommendation||"")}}
function normalizeCategory(value){const v=String(value||"").toUpperCase();if(["MAIN","本線"].includes(v))return"MAIN";if(["COVER","押さえ","おさえ"].includes(v))return"COVER";if(["BUYABLE_HIGH","HIGH","買える高配当","買える万車"].includes(v))return"BUYABLE_HIGH";return"UNCLASSIFIED"}
function normalizePurchase(value){const v=String(value||"").toUpperCase();if(["ADOPTED","BUY","購入","採用","購入採用"].includes(v))return"ADOPTED";if(["REJECTED","NO_BUY","不採用","購入不採用"].includes(v))return"REJECTED";return"UNSPECIFIED"}
function normalizeOrder(value,length){const parts=Array.isArray(value)?value:String(value||"").split(/[-ー－,>→\s]+/);const out=parts.map(Number).filter(n=>Number.isFinite(n)&&n>0);return out.length===length&&new Set(out).size===length?out:[]}
function normalizeStringArray(value){if(Array.isArray(value))return value.map(x=>String(x||"").trim()).filter(Boolean);if(typeof value==="string"&&value.trim())return[value.trim()];return[]}
function finiteOrNull(value){const n=Number(value);return Number.isFinite(n)?n:null}
function normalizeDate(value){return String(value||"").replace(/\D/g,"").slice(0,8)}

function compactChatPrediction(p){const {rawSource,...rest}=p||{};return rest}
function persistChatPredictions(storage,rows){let list=(rows||[]).map(compactChatPrediction);for(const limit of [40,20,10,5]){try{storage.setItem(CHAT_PREDICTION_STORAGE_KEY,JSON.stringify(list.slice(0,limit)));return}catch(error){if(!(error?.name==="QuotaExceededError"||/quota/i.test(String(error?.message||""))))throw error}}throw new Error("チャット予想の保存領域がいっぱいです。古い比較予想を整理してください。")}
