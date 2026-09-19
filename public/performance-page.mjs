// Presentation of Priority 1 read models only. No ticket selection or KPI aggregation.
export const PERIODS = {today:"今日",recent7:"7日",recent30:"30日",cumulative:"累積"};
const CACHE_KEY="chari-neko:performance-view:v1", HISTORY_PREFIX="chari-neko:performance-day:v1:";
const MAX_AGE=10*60*1000;
export const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const number=value=>value==null||!Number.isFinite(Number(value))?"—":Number(value).toLocaleString("ja-JP");
const percent=value=>value==null||!Number.isFinite(Number(value))?"—":`${(Number(value)*100).toFixed(1)}%`;
const money=value=>value==null?"—":`${number(value)}円`;
const dateLabel=value=>String(value||"").replace(/^(\d{4})(\d{2})(\d{2})$/,"$1-$2-$3");
export function japanDate(now=Date.now()){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(now)).replace(/-/g,"")}
export function shiftDay(day,delta){const d=new Date(`${dateLabel(day)}T00:00:00+09:00`);d.setUTCDate(d.getUTCDate()+delta);return japanDate(d)}
function read(storage,key){try{return JSON.parse(storage.getItem(key)||"null")}catch{return null}}
function write(storage,key,value){try{storage.setItem(key,JSON.stringify(value))}catch{}}
export function performanceSnapshot(status,cached=null,now=Date.now()){
  const report=status?.purchasePerformance;
  const valid=report?.performanceSchemaVersion==="PURCHASE_PERFORMANCE_V2"||report?.version==="PURCHASE_PERFORMANCE_V2";
  const current=valid&&report.periods?{report,date:status.dailyDate,observedAt:status.autoObservedAt||report.generatedAt}:null;
  const snapshot=current||cached;
  if(!snapshot?.report?.periods)return {snapshot:null,stale:true};
  const age=now-Date.parse(snapshot.observedAt||"");
  return {snapshot,stale:!current||status?.statusReadFailed===true||status?.autoCurrent===false||status?.localCache===true||!Number.isFinite(age)||age>MAX_AGE||snapshot.date!==japanDate(now)};
}
export function canonicalPurchaseHit(row){return row?.canonicalEligibility?.isPurchaseTarget===true&&row?.purchaseEvaluation?.purchaseEligibility==="PURCHASE_ALLOWED"&&row.purchaseEvaluation.standardHit===true&&row.resultAttached===true}
export function lifecycleCode(row,now=Date.now()){
  const code=row?.resultLifecycleState||row?.lifecycleStatus||row?.state;
  if(row?.resultAttached||row?.resultObservedAt||code==="RESULT_CONFIRMED")return "RESULT_CONFIRMED";
  if(["RESULT_PENDING","RESULT_RETRYING","RESULT_FETCH_FAILED"].includes(code))return code;
  return row?.collectionState==="RESULT_PENDING"||Date.parse(row?.scheduledStartTime||"")<=now?"RESULT_PENDING":"UNKNOWN";
}
const lifecycleLabel={RESULT_CONFIRMED:"結果確定",RESULT_PENDING:"結果待ち",RESULT_RETRYING:"結果再試行中",RESULT_FETCH_FAILED:"結果取得失敗",UNKNOWN:"状態未確認"};
const metric=(label,value,key="")=>`<div class="performanceMetric"${key?` data-kpi="${key}"`:""}><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
export function periodHtml(report,period="today"){
  const p=report?.periods?.[period];
  if(!p)return '<p class="muted">保存済みcanonical集計を確認できません。</p>';
  const fields=[["対象R",number(p.evaluatedRaces),"evaluatedRaces"],["購入対象R",number(p.betRaces),"betRaces"],["的中R",number(p.hitRaces),"hitRaces"],["的中率",percent(p.hitRate),"hitRate"],["投資額",money(p.investment),"investment"],["払戻",money(p.return),"return"],["ROI",percent(p.roi),"roi"]];
  return `${p.evaluatedRaces===0?'<p class="muted">まだ集計対象レースがありません。</p>':""}<div class="performanceKpis">${fields.map(row=>metric(...row)).join("")}</div><h2>3連単・区分別成績</h2><p class="muted">的中率は各区分の購入対象Rに対する的中R。THICKはMAIN/COVERと重なる属性です。</p><div class="performanceCategories">${[["MAIN","main"],["COVER / 押さえ","cover"],["THICK / 厚め","thick"]].map(([label,key])=>{const c=p.categories?.[key];return `<details class="performanceCategory" data-category="${key}"><summary>${label}<small>ROI ${percent(c?.roi)}</small></summary><div class="performanceKpis">${[["ticket数",number(c?.ticketCount),"ticketCount"],["的中R",number(c?.hitRaces),"hitRaces"],["的中率",percent(c?.hitRate),"hitRate"],["投資",money(c?.investment),"investment"],["払戻",money(c?.return),"return"],["ROI",percent(c?.roi),"roi"]].map(row=>metric(...row)).join("")}</div></details>`}).join("")}</div>`;
}
export function historyHtml(rows=[]){
  const hits=rows.filter(canonicalPurchaseHit);
  return hits.length?hits.map((row,index)=>{const e=row.purchaseEvaluation;return `<article class="performanceHit"><div class="sectionHead"><strong>${escapeHtml(dateLabel(row.raceKey.slice(0,8)))} ${escapeHtml(row.venue||row.venueName||row.raceKey.split("-")[1])} ${number(row.raceNumber)}R</strong><span class="pill success">購入的中</span></div><p>購入点数：MAIN ${number(row.mainTicketCount)}点 / COVER ${number(row.coverTicketCount)}点<br>THICK：${row.thick===true?"あり（重複属性）":row.thick===false?"なし":"未提供"}</p><div class="performanceKpis">${metric("購入払戻",money(e.return))}${metric("race ROI",percent(e.roi))}</div><p class="muted">結果確定 · RESULT_CONFIRMED</p><button class="secondary" data-performance-hit="${index}">レース詳細へ</button></article>`}).join(""):'<p class="muted">この日のcanonical購入的中はありません。</p>';
}
export function createPerformancePage({root,storage,fetchJson,openRace,now=()=>Date.now()}){
  let period="today",status=null,cached=read(storage,CACHE_KEY),day=japanDate(now()),dayData=null,dayStale=false,loading=false,error="",active=false,requestId=0;
  const days=new Map();
  const bounds=()=>{const end=japanDate(now()),start=period==="today"?end:period==="recent7"?shiftDay(end,-6):period==="recent30"?shiftDay(end,-29):cached?.report?.firstEligibleRaceKey?.slice(0,8)||end;return{start,end}};
  function render(){
    if(!root)return;
    const view=performanceSnapshot(status,cached,now()),s=view.snapshot,range=bounds(),rows=dayData?.records||[],lifecycleRows=rows.map(row=>({...row,resultLifecycleState:(status?.races||[]).find(r=>r.raceKey===row.raceKey)?.resultLifecycleState||row.resultLifecycleState}));
    root.innerHTML=`<nav class="performancePeriods" aria-label="成績の期間">${Object.entries(PERIODS).map(([key,label])=>`<button data-period="${key}" aria-pressed="${key===period}" class="raceTab ${key===period?"active":""}">${label}</button>`).join("")}</nav><p class="performanceFreshness ${view.stale?"isStale":""}" role="status">${s?`${view.stale?"stale・保存済みデータ（更新待ち）":"保存済みcanonical集計"} / 集計基準日 ${escapeHtml(dateLabel(s.date))} / 最終確認 ${escapeHtml(s.observedAt||"不明")}`:"保存済み集計なし・取得待ち"}</p><section class="card compact"><h2>${PERIODS[period]}の購入成績</h2><p class="muted">100円平買い。購入判定と確定結果を保存できたレースが対象です。</p>${periodHtml(s?.report,period)}</section><details class="card compact"><summary>日別推移・レースクラス別について</summary><p class="muted">現在の保存済みAPIには日別・クラス別のcanonical集計がないため未提供です。UNKNOWNの推測分類は行いません。HIGH_PAYOUT独立区分・2車単・3連複は正式KPIに含めません。</p></details><section class="card compact"><h2>購入的中レース履歴</h2><p class="muted">選択期間内を1日ずつ表示します。集計カードは期間全体、履歴は下記の日付のみです。</p><div class="performanceDay"><button class="secondary" data-day-step="-1" ${day<=range.start?"disabled":""}>前日</button><label>履歴の日付<input id="performanceDay" type="date" min="${dateLabel(range.start)}" max="${dateLabel(range.end)}" value="${dateLabel(day)}"></label><button class="secondary" data-day-step="1" ${day>=range.end?"disabled":""}>翌日</button></div><p role="status" class="performanceHistoryNotice ${dayStale?"isStale":""}">${loading?"保存済み履歴を読み取り中…":error?escapeHtml(error):dayStale?"stale・前回保存した履歴（更新待ち）":dayData?"保存済みcanonical履歴":"未取得"}</p>${dayData?historyHtml(rows):'<p class="muted">履歴を確認できません。</p>'}<button class="secondary" id="refreshPerformanceHistory" ${loading?"disabled":""}>この日の履歴を更新</button><details class="performanceLifecycle"><summary>この日の結果ライフサイクル</summary>${lifecycleRows.length?lifecycleRows.map(row=>{const code=lifecycleCode(row);return `<p>${escapeHtml(row.venue||row.venueName||row.raceKey)} ${number(row.raceNumber)}R <strong>${lifecycleLabel[code]}</strong><small>${code}</small></p>`}).join(""):'<p class="muted">保存済み状態がありません。</p>'}</details></section>`;
    root.querySelectorAll("[data-period]").forEach(button=>button.onclick=()=>{period=button.dataset.period;const b=bounds();if(day<b.start||day>b.end)day=b.end;void loadDay()});
    root.querySelectorAll("[data-day-step]").forEach(button=>button.onclick=()=>{day=shiftDay(day,Number(button.dataset.dayStep));void loadDay()});
    root.querySelector("#performanceDay").onchange=event=>{const value=event.target.value.replace(/-/g,"");if(value>=range.start&&value<=range.end){day=value;void loadDay()}else render()};
    root.querySelector("#refreshPerformanceHistory").onclick=()=>void loadDay(true);
    const hits=rows.filter(canonicalPurchaseHit);
    root.querySelectorAll("[data-performance-hit]").forEach(button=>button.onclick=()=>openRace(hits[Number(button.dataset.performanceHit)]));
  }
  async function loadDay(force=false){
    const id=++requestId,requestedDay=day,key=HISTORY_PREFIX+day;
    dayData=days.get(requestedDay)||read(storage,key);dayStale=Boolean(dayData);error="";loading=false;
    if(!force&&dayData&&now()-dayData.fetchedAt<5*60*1000){dayStale=false;render();return}
    loading=true;render();
    try{const data=await fetchJson(`/.netlify/functions/keirin-prediction-history?from=${requestedDay}&to=${requestedDay}`);if(data?.ok===false||data?.partial||!Array.isArray(data?.records))throw new Error("一部取得失敗");const next={records:data.records,fetchedAt:now()};days.set(requestedDay,next);write(storage,key,next);if(id!==requestId)return;dayData=next;dayStale=false}
    catch{if(id!==requestId)return;dayStale=Boolean(dayData);error=dayData?"stale・履歴取得失敗。前回保存した同日の履歴を表示中。":"履歴を取得できません。この日の履歴を更新してください。"}
    finally{if(id===requestId){loading=false;render()}}
  }
  return {updateStatus(value){status=value;const view=performanceSnapshot(status,cached,now());if(view.snapshot){cached=view.snapshot;write(storage,CACHE_KEY,cached)}render()},open(){active=true;const b=bounds();if(day<b.start||day>b.end)day=b.end;void loadDay()},refresh(){if(active)render()}};
}
