export const DIFF_ENGINE_VERSION="CHAT-APP-DIFF-v1";

export function compareChatAndApp(chat,snapshot){
  if(!chat||!snapshot)return null;
  const chatView=normalizeChat(chat),appView=normalizeApp(snapshot);
  const stages=[];
  stages.push(compareFirst(chatView,appView));
  stages.push(comparePairs(chatView,appView));
  stages.push(compareTerminals(chatView,appView));
  stages.push(compareClassification(chatView,appView));
  stages.push(comparePurchase(chatView,appView));
  const firstDivergence=stages.find(s=>s.status==="DIFF")||null;
  return {
    version:DIFF_ENGINE_VERSION,
    firstDivergence:firstDivergence?{stage:firstDivergence.stage,label:firstDivergence.label,summary:firstDivergence.summary}:null,
    stages,
    totals:{chatTerminals:chatView.terminals.length,appTerminals:appView.terminals.length,chatPurchased:chatView.purchased.length,appPurchased:appView.purchased.length}
  };
}

function normalizeChat(chat){
  const terminals=(chat.terminals||[]).map(normalizeTerminal).filter(Boolean);
  const firstCandidates=(chat.firstCandidates||[]).map(x=>Number(x.number)).filter(validNumber);
  const pairBranches=(chat.pairBranches||[]).map(x=>keyN(x.order,2)).filter(Boolean);
  return {
    first:firstCandidates.length?unique(firstCandidates):rankFirstFamilies(terminals),
    pairs:pairBranches.length?unique(pairBranches):rankPrefixes(terminals,2),
    terminals,
    purchased:terminals.filter(t=>t.purchaseStatus==="ADOPTED")
  };
}
function normalizeApp(snapshot){
  const terminals=(snapshot.terminalLedger||[]).map(t=>normalizeTerminal({order:t.order,probability:t.probability,category:t.betClass,purchaseStatus:normalizeAppPurchase(t.purchaseStatus),reason:t.purchaseReason})).filter(Boolean);
  const purchased=(snapshot.betSelections||[]).map(b=>normalizeTerminal({order:b.order,probability:b.probability,category:b.category,purchaseStatus:"ADOPTED",reason:b.reason})).filter(Boolean);
  const merged=mergeTerminalState(terminals,purchased);
  return {first:rankFirstFamilies(merged),pairs:rankPrefixes(merged,2),terminals:merged,purchased:merged.filter(t=>t.purchaseStatus==="ADOPTED")};
}
function compareFirst(chat,app){
  if(!chat.first.length)return unknown("FIRST_PLACE_EVALUATION","1着評価","チャット側に1着候補データがありません。");
  const chatTop=chat.first[0],appTop=app.first[0];
  if(chatTop===appTop)return ok("FIRST_PLACE_EVALUATION","1着評価",`最上位は両方 ${chatTop}番です。`);
  return diff("FIRST_PLACE_EVALUATION","1着評価",`最上位がチャット ${fmt(chatTop)}番 / アプリ ${fmt(appTop)}番で分かれています。`,{chatOnly:chat.first.filter(x=>!app.first.includes(x)),appOnly:app.first.filter(x=>!chat.first.includes(x)),chatTop,appTop});
}
function comparePairs(chat,app){
  if(!chat.pairs.length)return unknown("PAIR_BRANCH","1-2着枝","チャット側に1-2着枝データがありません。");
  const a=new Set(chat.pairs),b=new Set(app.pairs),chatOnly=[...a].filter(x=>!b.has(x)),appOnly=[...b].filter(x=>!a.has(x));
  if(!chatOnly.length)return ok("PAIR_BRANCH","1-2着枝",`チャットの ${a.size}枝はすべてアプリにも生成されています。`,{appExtra:appOnly});
  return diff("PAIR_BRANCH","1-2着枝",`チャットにある1-2着枝のうち ${chatOnly.length}枝がアプリにありません。`,{chatOnly,appOnly});
}
function compareTerminals(chat,app){
  if(!chat.terminals.length)return unknown("TERMINAL_GENERATION","3着終端","チャット側に終端データがありません。");
  const a=new Set(chat.terminals.map(t=>t.key)),b=new Set(app.terminals.map(t=>t.key)),chatOnly=[...a].filter(x=>!b.has(x)),appOnly=[...b].filter(x=>!a.has(x));
  if(!chatOnly.length)return ok("TERMINAL_GENERATION","3着終端",`チャットの ${a.size}終端はすべてアプリにも生成されています。`,{appExtraCount:appOnly.length});
  return diff("TERMINAL_GENERATION","3着終端",`チャットにある終端のうち ${chatOnly.length}件がアプリで未生成です。`,{chatOnly,appOnlyCount:appOnly.length});
}
function compareClassification(chat,app){
  const appMap=new Map(app.terminals.map(t=>[t.key,t]));
  const rows=chat.terminals.filter(t=>t.category&&t.category!=="UNCLASSIFIED"&&appMap.has(t.key)).map(t=>({key:t.key,chat:t.category,app:appMap.get(t.key).category||"UNCLASSIFIED"})).filter(x=>x.chat!==x.app);
  if(!rows.length)return ok("BET_CLASSIFICATION","買い目分類","共通終端の本線・押さえ・高配当分類に大きな不一致はありません。");
  return diff("BET_CLASSIFICATION","買い目分類",`共通終端のうち ${rows.length}件で分類が違います。`,{rows});
}
function comparePurchase(chat,app){
  const appMap=new Map(app.terminals.map(t=>[t.key,t]));
  const specified=chat.terminals.filter(t=>t.purchaseStatus&&t.purchaseStatus!=="UNSPECIFIED"&&appMap.has(t.key));
  if(!specified.length)return unknown("PURCHASE_DECISION","購入採否","チャット側に購入採否が指定された共通終端がありません。");
  const rows=specified.map(t=>({key:t.key,chat:t.purchaseStatus,app:appMap.get(t.key).purchaseStatus||"REJECTED"})).filter(x=>x.chat!==x.app);
  if(!rows.length)return ok("PURCHASE_DECISION","購入採否",`比較可能な ${specified.length}終端で購入採否が一致しています。`);
  return diff("PURCHASE_DECISION","購入採否",`比較可能な終端のうち ${rows.length}件で購入採否が違います。`,{rows});
}
function normalizeTerminal(row){const order=(row?.order||[]).map(Number);if(order.length!==3||new Set(order).size!==3||!order.every(validNumber))return null;return{key:order.join("-"),order,probability:finite(row?.probability),category:normalizeCategory(row?.category),purchaseStatus:normalizePurchase(row?.purchaseStatus),reason:String(row?.reason||"")}}
function mergeTerminalState(ledger,purchased){const map=new Map(ledger.map(t=>[t.key,t]));for(const b of purchased){const prev=map.get(b.key)||b;map.set(b.key,{...prev,...b,purchaseStatus:"ADOPTED",category:b.category&&b.category!=="UNCLASSIFIED"?b.category:prev.category})}return[...map.values()]}
function rankFirstFamilies(terminals){const sums=new Map();for(const t of terminals)sums.set(t.order[0],(sums.get(t.order[0])||0)+(Number.isFinite(t.probability)?t.probability:0));return[...sums.entries()].sort((a,b)=>b[1]-a[1]||a[0]-b[0]).map(x=>x[0])}
function rankPrefixes(terminals,n){const sums=new Map();for(const t of terminals){const k=t.order.slice(0,n).join("-");sums.set(k,(sums.get(k)||0)+(Number.isFinite(t.probability)?t.probability:0))}return[...sums.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(x=>x[0])}
function keyN(order,n){const a=(order||[]).map(Number);return a.length===n&&a.every(validNumber)&&new Set(a).size===n?a.join("-"):""}
function normalizeCategory(v){const s=String(v||"").toUpperCase();if(s==="MAIN"||s==="本線")return"MAIN";if(s==="COVER"||s==="押さえ")return"COVER";if(["BUYABLE_HIGH","HIGH","買える高配当","買える万車"].includes(s))return"BUYABLE_HIGH";return"UNCLASSIFIED"}
function normalizePurchase(v){const s=String(v||"").toUpperCase();if(["ADOPTED","BUY","購入","採用","購入採用"].includes(s))return"ADOPTED";if(["REJECTED","NO_BUY","不採用","購入不採用"].includes(s))return"REJECTED";return"UNSPECIFIED"}
function normalizeAppPurchase(v){const s=String(v||"").toUpperCase();return ["ADOPTED","BUY","購入","採用","購入採用"].includes(s)?"ADOPTED":"REJECTED"}
function unique(a){return[...new Set(a)]}
function finite(v){const n=Number(v);return Number.isFinite(n)?n:null}
function validNumber(n){return Number.isFinite(n)&&n>0}
function fmt(v){return Number.isFinite(Number(v))?String(v):"-"}
function ok(stage,label,summary,details={}){return{stage,label,status:"OK",summary,details}}
function diff(stage,label,summary,details={}){return{stage,label,status:"DIFF",summary,details}}
function unknown(stage,label,summary,details={}){return{stage,label,status:"UNKNOWN",summary,details}}
