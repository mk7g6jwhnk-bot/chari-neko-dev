import{acknowledgeCanaryRollback,activateCanaryRun,attachResult,attachShadowComparisonResult,backfillResearchLearningLedger,buildCanaryActivationPlan,buildShadowComparisonRecord,canaryRunFor,createSnapshot,finalApprovalFor,findLatestSnapshot,isResultPending,loadCanaryRuns,loadFinalPromotionApprovals,loadShadowComparisons,loadSnapshots,loadResearchLearningRecords,loadPromotionReviews,promotionReviewFor,raceKey,refreshCanaryRuns,researchEvidenceQueue,saveFinalPromotionApproval,savePromotionReview,saveShadowComparison,saveSnapshot,stopCanaryRun,summarizeCanaryRuns,summarizeFinalPromotionApprovals,summarizePromotionReviews,summarizeResearchLearning,summarizeShadowComparisons,updateResearchConditionEvidence}from"./prediction-store.mjs";
import{derivePredictionRatings,starText}from"./prediction-ratings.mjs";
import{findChatPrediction,parseChatPrediction,removeChatPrediction,saveChatPrediction}from"./chat-prediction-store.mjs";
import{compareChatAndApp}from"./chat-app-diff.mjs";
import{loadChatDiffTrends,recordChatDiffTrend,summarizeChatDiffTrends}from"./chat-diff-trend-store.mjs";
import{loadOperationalLearningState,runOperationalLearningPipeline}from"./research-auto-pipeline.mjs";
import{buildResultOnlyPredictionCrosscheckLedger,hasResultOnlyResearch,saveResultOnlyResearch,summarizeResultOnlyResearch}from"./result-only-research.mjs";
import{allocatePreviewStakes,deriveThickBets}from"./purchase-funding.mjs";
const $=id=>document.getElementById(id),screens=[...document.querySelectorAll(".screen")];
const state={screen:"home",history:[],date:localDate(),meeting:null,meetings:[],meetingTab:"today",race:null,payload:null,snapshot:null,legacySnapshot:null,retry:null,busy:false,oddsBusyKey:null,bulkBusy:false,bulkDone:0,bulkTotal:0,screeningBusy:false,deepDiveBusy:false,deepDiveCurrentKeys:[]};
const BATCH_LOCK_KEY="chari-neko:keirin-batch-lock:v1",TAB_INSTANCE_ID=(globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`),BATCH_LOCK_TTL_MS=10*60*1000;
const ODDS_CACHE_KEY="chari-neko:keirin-odds-cache:v1";
const RACE_META_CACHE_KEY="chari-neko:keirin-race-meta-cache:v1";
const RESULT_CACHE_KEY="chari-neko:keirin-result-cache:v1";
const MEETING_CACHE_KEY="chari-neko:keirin-meeting-cache:v1";
const APP_RELEASE="KEIRIN-0.18.0-main-invariant-diagnostic-only";
const APP_UPDATE_CHECK_INTERVAL_MS=5*60*1000;
let lastAppUpdateCheckAt=0,appUpdateCheckBusy=false;
const VENUE_CODES={函館:"11",青森:"12",いわき平:"13",弥彦:"21",前橋:"22",取手:"23",宇都宮:"24",大宮:"25",西武園:"26",京王閣:"27",立川:"28",松戸:"31",千葉:"32",川崎:"34",平塚:"35",小田原:"36",伊東:"37",静岡:"38",名古屋:"42",岐阜:"43",大垣:"44",豊橋:"45",富山:"46",松阪:"47",四日市:"48",福井:"51",奈良:"53",向日町:"54",和歌山:"55",岸和田:"56",玉野:"61",広島:"62",防府:"63",高松:"71",小松島:"73",高知:"74",松山:"75",小倉:"81",久留米:"83",武雄:"84",佐世保:"85",別府:"86",熊本:"87"};

$("todayKeirin").onclick=()=>openMeetings();$("homeBtn").onclick=$("brand").onclick=()=>goHome();$("headerBack").onclick=()=>goBack();$("venueSelectBtn").onclick=()=>openVenueSelection();$("raceSelectBtn").onclick=()=>openRaceSelection();$("reloadMeetings").onclick=()=>loadMeetings();$("bulkRefresh").onclick=()=>bulkRefreshRaceInfo();$("runScreening").onclick=()=>runPrimaryScreening();$("runDeepDiveTop").onclick=()=>runDeepDiveTop();$("runDirectDeepDive").onclick=()=>runFiveRaceDeepDive();$("raceDate").onchange=e=>{state.date=e.target.value;loadMeetings()};$("tabToday").onclick=()=>setMeetingTab("today");$("tabScreening").onclick=()=>setMeetingTab("screening");$("tabBattle").onclick=()=>setMeetingTab("battle");$("tabVenues").onclick=()=>setMeetingTab("venues");$("predictBtn").onclick=()=>handleDetailPrimary();$("retryDetail").onclick=()=>handleDetailSecondary();$("backToDetail").onclick=()=>{if(state.snapshot){openSavedDetail(state.snapshot);return}renderDetail();show("detail")};$("checkResult").onclick=()=>checkResult();$("retryBtn").onclick=()=>state.retry?.();$("errorHome").onclick=()=>goHome();
window.addEventListener("popstate",()=>{if(state.history.length){state.history.pop();show(state.history.pop()||"home",false)}});
$("recommendationLimit").onchange=()=>renderHomeRecommendations();$("sportKeirin").onchange=()=>renderHomeRecommendations();
try{runOperationalLearningPipeline(localStorage)}catch{}
renderSaved();renderHomeRecommendations();
setupAutoUpdate();

function setupAutoUpdate(){checkForAppUpdate();document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")checkForAppUpdate()});window.addEventListener("online",()=>checkForAppUpdate(true))}
async function checkForAppUpdate(force=false){if(appUpdateCheckBusy||state.busy)return;const now=Date.now();if(!force&&now-lastAppUpdateCheckAt<APP_UPDATE_CHECK_INTERVAL_MS)return;lastAppUpdateCheckAt=now;appUpdateCheckBusy=true;try{const response=await fetch(`/version.json?t=${now}`,{cache:"no-store",headers:{accept:"application/json"}});if(!response.ok)return;const remote=await response.json();const remoteVersion=String(remote?.version||"").trim();if(!remoteVersion)return;if(remoteVersion===APP_RELEASE){const current=new URL(location.href);if(current.searchParams.has("appv")){current.searchParams.delete("appv");history.replaceState(history.state,"",current.toString())}return}const current=new URL(location.href);if(current.searchParams.get("appv")===remoteVersion)return;const attemptedKey=`chari-neko:auto-update-attempt:${remoteVersion}`;if(sessionStorage.getItem(attemptedKey)==="1")return;sessionStorage.setItem(attemptedKey,"1");current.searchParams.set("appv",remoteVersion);location.replace(current.toString())}catch{}finally{appUpdateCheckBusy=false}}

function show(id,push=true){if(push&&state.screen!==id){state.history.push(state.screen);history.pushState({screen:id},"")}state.screen=id;screens.forEach(x=>x.classList.toggle("active",x.id===id));updateHeaderNav(id);window.scrollTo(0,0)}
function updateHeaderNav(id){const simple=id==="home"||id==="loading"||id==="error";$("headerBack").classList.toggle("hidden",id==="home"||id==="loading");$("venueSelectBtn").classList.toggle("hidden",simple);const canPickRace=!simple&&Boolean(resolveCurrentMeeting());$("raceSelectBtn").classList.toggle("hidden",!canPickRace)}
function resolveCurrentMeeting(){const code=String(state.race?.venueCode||state.meeting?.venueCode||"").padStart(2,"0"),name=state.race?.venueName||state.meeting?.venueName||"";return(state.meetings||[]).find(m=>(code&&venueCode(m)===code)||(name&&m.venueName===name))||state.meeting||null}
function openVenueSelection(){state.meetingTab="venues";if(!state.date)state.date=localDate();$("raceDate").value=state.date;if(state.meetings.length){renderMeetingTabs();show("meetings");return}show("meetings");loadMeetings()}
function openRaceSelection(){const meeting=resolveCurrentMeeting();if(meeting){openRaces(meeting);return}openVenueSelection()}
function goBack(){show(state.history.pop()||"home",false)}function goHome(){state.history=[];show("home",false);renderSaved();renderHomeRecommendations()}
function localDate(){const d=new Date(),z=new Date(d.getTime()-d.getTimezoneOffset()*60000);return z.toISOString().slice(0,10)}function compact(v){return String(v).replaceAll("-","")}
function setLoading(title,message){$("loadingTitle").textContent=title;$("loadingMessage").textContent=message;show("loading")}
function fail(title,error,retry){state.retry=retry;$("errorTitle").textContent=title;$("errorMessage").textContent=error?.message||String(error);show("error")}
function isCurrentSnapshot(snapshot){return Boolean(snapshot&&snapshot.predictionVersion===APP_RELEASE)}
function snapshotsForRace(race){return loadSnapshots(localStorage).filter(x=>raceKey(x.targetRace)===raceKey(race)).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))}
function currentSnapshotForRace(race){return snapshotsForRace(race).find(isCurrentSnapshot)||null}
function legacySnapshotForRace(race){return snapshotsForRace(race).find(x=>!isCurrentSnapshot(x))||null}
function displaySnapshotForRace(race){const current=currentSnapshotForRace(race);if(current)return current;return raceStatus(race).label==="終了"?findLatestSnapshot(localStorage,race):null}
async function jsonFetch(url){const r=await fetch(url,{cache:"no-store"});let p;try{p=await r.json()}catch{throw new Error(`サーバー応答を読み取れません（HTTP ${r.status}）`)}if(!r.ok||p.ok===false)throw new Error(p.error||`取得失敗（HTTP ${r.status}）`);return p}


function renderHomeRecommendations(){
  const list=$("todayRecommendations"),count=$("recommendationCount");
  if(!list||!count)return;
  const enabled=$("sportKeirin")?.checked!==false;
  const limit=Math.max(1,Number($("recommendationLimit")?.value)||5);
  const today=compact(localDate());
  if(!enabled){
    count.textContent="0件";
    list.innerHTML='<p class="empty">表示する競技を選んでください。</p>';
    return;
  }

  const all=loadSnapshots(localStorage)
    .filter(s=>String(s.targetRace?.date||"").replace(/\D/g,"")===today&&!s.result&&isCurrentSnapshot(s))
    .map(s=>({snapshot:s,rec:evaluateRecommendation(s)}))
    .sort((a,b)=>b.rec.score-a.rec.score||new Date(b.snapshot.createdAt)-new Date(a.snapshot.createdAt));

  const recommended=all.filter(x=>x.rec.level==="RECOMMENDED").slice(0,limit);
  const watch=all.filter(x=>x.rec.level==="WATCH").slice(0,Math.max(0,limit-recommended.length));
  const rows=[...recommended,...watch].slice(0,limit);

  count.textContent=`${recommended.length}件`;
  list.innerHTML=rows.length?rows.map(({snapshot:s,rec})=>{
    const r=s.targetRace,bets=s.betSelections||[],rating=ratingOf(s);
    const thick=deriveThickBets(s).length;
    const tags=[
      rec.level==="RECOMMENDED"?"おすすめ":"要監査",
      bets.some(b=>b.category==="BUYABLE_HIGH")?"高配当あり":null,
      thick?`厚め${thick}点`:null
    ].filter(Boolean);
    return `<article class="recommendationItem"><button class="recommendationOpen" data-rec-id="${esc(s.predictionSnapshotId)}"><span class="recommendationMain"><strong>${esc(r.venueName)} ${r.raceNo}R</strong><small>${r.scheduledStart?`発走 ${esc(r.scheduledStart)}`:"発走時刻確認中"} ・ ${bets.length}点 ・ 構造評価 ${rec.score.toFixed(0)}</small><small>${esc(rec.reason)} / 信頼 ${starText(rating.confidence)} / 集中 ${starText(rating.concentration)}</small></span><span class="recommendationTags">${tags.map(t=>`<em>${esc(t)}</em>`).join("")}</span></button></article>`
  }).join(""):'<p class="empty">現在、構造監査を通過したおすすめレースはありません。</p>';
  list.querySelectorAll("[data-rec-id]").forEach(b=>b.onclick=()=>{
    const s=loadSnapshots(localStorage).find(x=>x.predictionSnapshotId===b.dataset.recId);
    if(s)openSavedDetail(s)
  });
}

function evaluateRecommendation(snapshot){
  const bets=Array.isArray(snapshot?.betSelections)?snapshot.betSelections:[];
  const mains=bets.filter(b=>b.category==="MAIN");
  const audit=snapshot?.audit||{};
  const linkageHigh=countAuditSeverity(audit?.wholeLinkageAudit,"high");
  const riderBranchHigh=countAuditSeverity(audit?.riderBranchLinkAudit,"high");
  const mainInvariant=audit?.chatSpec?.mainInvariant||audit?.mainInvariant||null;
  const oddsReady=bets.length>0&&bets.every(b=>Number.isFinite(Number(b.odds))&&Number(b.odds)>1);
  const avgNatural=average(bets.map(b=>Number(b.naturalConvergenceScore)).filter(Number.isFinite));
  const mainNatural=average(mains.map(b=>Number(b.naturalConvergenceScore)).filter(Number.isFinite));
  const mainShare=bets.length?mains.length/bets.length:0;
  const rating=ratingOf(snapshot);

  const blockers=[];
  if(snapshot?.noBet)blockers.push("見送り判定");
  if(!bets.length)blockers.push("購入候補なし");
  if(!mains.length)blockers.push("本線なし");
  if(mainInvariant&&mainInvariant.passed===false)blockers.push("本線成立監査NG");
  if(linkageHigh>0)blockers.push("展開連動に高重要度警告");
  if(riderBranchHigh>0)blockers.push("選手評価→主展開に高重要度警告");
  if(rating.verdictTone==="stop"&&!snapshot?.noBet)blockers.push(`表示評価:${rating.verdict}`);

  let score=0;
  score+=Math.min(35,Math.max(0,(mainNatural||0)*35));
  score+=Math.min(20,Math.max(0,(avgNatural||0)*20));
  score+=Math.min(15,mainShare*15);
  score+=oddsReady?15:5;
  score+=Math.max(0,15-5*(linkageHigh+riderBranchHigh));
  score=Math.max(0,Math.min(100,score));

  if(blockers.length)return{level:"HOLD",score,reason:blockers.join("・"),blockers};
  if(score>=65&&oddsReady&&rating.verdictTone==="go")return{level:"RECOMMENDED",score,reason:"本線・連動・自然収束・オッズ・購入質量の構造条件を通過",blockers:[]};
  if(rating.verdictTone==="caution")return{level:"WATCH",score,reason:`${rating.verdict}：${rating.diagnostics?.massStatus||rating.reason}`,blockers:[]};
  return{level:"WATCH",score,reason:oddsReady?"構造条件は成立、優先度は比較待ち":"オッズ確認待ち",blockers:[]};
}

function countAuditSeverity(audit,severity){
  return (Array.isArray(audit?.warnings)?audit.warnings:[]).filter(w=>w?.severity===severity).length;
}
function average(values){
  return values.length?values.reduce((a,b)=>a+b,0)/values.length:0;
}
function openMeetings(){state.date=localDate();state.meetingTab="today";$("raceDate").value=state.date;show("meetings");loadMeetings()}
async function loadMeetings(){setLoading("開催情報を取得中","KEIRIN.JPの今日の開催を確認しています。");const dateKey=compact(state.date);try{const p=await jsonFetch(`/.netlify/functions/keirin-discover?date=${dateKey}`),items=(p.meetings||[]).filter(m=>getCard(m)).sort((a,b)=>Number(venueCode(a))-Number(venueCode(b)));state.meetings=items;storeMeetingCache(dateKey,items,p.checkedAt);$("meetingCount").textContent=`${items.length}会場`;renderVenueGrid(items);renderMeetingTabs();updateBulkRefreshUi(p.stale?"開催取得サービスが不安定なため、直近の開催情報を表示しています。":"一括更新で未終了レースの締切時間・オッズをまとめて更新できます。");show("meetings");void collectFinishedResultOnlyResearch()}catch(e){const cached=meetingCacheFor(dateKey);if(cached?.meetings?.length){state.meetings=cached.meetings;$("meetingCount").textContent=`${cached.meetings.length}会場`;renderVenueGrid(state.meetings);renderMeetingTabs();updateBulkRefreshUi("開催情報の再取得に失敗しました。保存済み一覧を表示中です。一括更新は再試行できます。");show("meetings");return}fail("開催情報の取得失敗",new Error("開催取得サービスが一時的に停止しています。数秒後に再試行してください。"),loadMeetings)}}
function renderVenueGrid(items){$("meetingList").className="venueGrid";$("meetingList").innerHTML=items.length?items.map((m,i)=>{const nums=raceNumbersOf(m),count=nums.length||12,range=nums.length?`${nums[0]}R〜${nums[nums.length-1]}R`:`${count}R`,next=meetingNextDeadline(m),band=meetingTimeBand(m);return `<button class="venueCard venue-${band.key}" data-meeting="${i}" aria-label="${esc(m.venueName)}のレースを見る"><span class="venueCode">${esc(venueCode(m))}</span><span class="venueBand">${band.label}</span><strong>${esc(m.venueName)}</strong><small>${range}・${count}レース</small><span class="venueDeadline">${esc(next)}</span><span class="venueState ${getOdds(m)?"ready":"waiting"}">${getOdds(m)?"オッズ接続":"オッズ待ち"}</span></button>`}).join(""):'<section class="card empty venueEmpty">この日の開催は見つかりませんでした。</section>';$("meetingList").querySelectorAll("[data-meeting]").forEach(b=>b.onclick=()=>openRaces(items[Number(b.dataset.meeting)]))}
function setMeetingTab(tab){state.meetingTab=tab;renderMeetingTabs()}
function renderMeetingTabs(){const tab=state.meetingTab||"today";[["tabToday","today"],["tabScreening","screening"],["tabBattle","battle"],["tabVenues","venues"]].forEach(([id,key])=>$(id).classList.toggle("active",tab===key));$("todayRaceList").classList.toggle("hidden",tab!=="today");$("screeningRaceList").classList.toggle("hidden",tab!=="screening");$("battleRaceList").classList.toggle("hidden",tab!=="battle");$("meetingList").classList.toggle("hidden",tab!=="venues");if(tab==="today")renderFlatRaceList($("todayRaceList"),allMeetingRaces(),false);if(tab==="screening")renderPrimaryScreening();if(tab==="battle")renderFlatRaceList($("battleRaceList"),allMeetingRaces().filter(isBattleRace),true)}
function allMeetingRaces(){return(state.meetings||[]).flatMap(m=>{const nums=raceNumbersOf(m),use=nums.length?nums:Array.from({length:12},(_,i)=>i+1);return use.map(n=>raceFrom(m,n))}).sort((a,b)=>{const ta=parseTime(a.date,a.scheduledStart),tb=parseTime(b.date,b.scheduledStart);if(ta&&tb&&ta!==tb)return ta-tb;if(ta&&!tb)return-1;if(!ta&&tb)return 1;return Number(a.venueCode)-Number(b.venueCode)||a.raceNo-b.raceNo})}
function battleKeys(){try{return new Set(JSON.parse(localStorage.getItem("chari-neko-battle-races")||"[]"))}catch{return new Set()}}
function isBattleRace(r){return battleKeys().has(raceKey(r))}
function toggleBattleRace(r){const keys=battleKeys(),key=raceKey(r);keys.has(key)?keys.delete(key):keys.add(key);localStorage.setItem("chari-neko-battle-races",JSON.stringify([...keys]));renderMeetingTabs()}
function renderFlatRaceList(root,races,battleOnly){if(!races.length){root.innerHTML=`<section class="card empty">${battleOnly?"勝負レースはまだ登録されていません。":"この日のレースは見つかりませんでした。"}</section>`;return}const row=(r,i)=>{const s=raceStatus(r),battle=isBattleRace(r),saved=displaySnapshotForRace(r),cached=oddsCacheFor(r),rating=oddsRating(saved,cached),busy=state.oddsBusyKey===raceKey(r),ended=s.label==="終了",deadline=deadlineOf(r),action=ended?(saved?"結果・詳細を見る":"結果を見る"):(saved?"詳細を見る":"予想する");return `<article class="timelineRace ${s.className?`race-${s.className}`:""}"><div class="timelineBody"><button class="timelineMain" data-flat-race="${i}"><span class="timelineVenue"><strong>${esc(r.venueName)} ${r.raceNo}R</strong><small>${deadline?`締切 ${esc(deadline)}`:"締切確認中"}${saved?" ・ 予想保存済み":""}</small><em class="raceListAction">${action} ›</em></span><span class="status ${s.className}">${s.label}</span></button><div class="timelineOdds"><span class="oddsEvaluation ${rating.className}">${esc(rating.label)}</span><button class="oddsRefresh" data-odds-race="${i}" ${busy||ended?"disabled":""}>${busy?"更新中…":"オッズ更新"}</button></div></div><button class="battleToggle ${battle?"active":""}" data-battle-race="${i}" aria-label="勝負レース${battle?"解除":"登録"}">${battle?"★":"☆"}</button></article>`};let shown=races;if(!battleOnly){const upcoming=races.filter(r=>raceStatus(r).label!=="終了").slice(0,10),finished=races.filter(r=>raceStatus(r).label==="終了").sort((a,b)=>(parseTime(b.date,b.scheduledStart)||0)-(parseTime(a.date,a.scheduledStart)||0));shown=[...upcoming,...finished];const upcomingHtml=upcoming.length?`<div class="raceSectionHead"><strong>これからのレース</strong><span>${upcoming.length}件表示</span></div>${upcoming.map((r,i)=>row(r,i)).join("")}`:'<section class="card empty compactEmpty">これからのレースはありません。</section>';const finishedOffset=upcoming.length,finishedHtml=finished.length?`<details class="finishedRaces"><summary>終了したレース <span>${finished.length}件</span></summary><div class="finishedRaceList">${finished.map((r,j)=>row(r,finishedOffset+j)).join("")}</div></details>`:"";root.innerHTML=upcomingHtml+finishedHtml}else root.innerHTML=shown.map((r,i)=>row(r,i)).join("");root.querySelectorAll("[data-flat-race]").forEach(b=>b.onclick=()=>openDetail(shown[Number(b.dataset.flatRace)]));root.querySelectorAll("[data-battle-race]").forEach(b=>b.onclick=e=>{e.stopPropagation();toggleBattleRace(shown[Number(b.dataset.battleRace)])});root.querySelectorAll("[data-odds-race]").forEach(b=>b.onclick=e=>{e.stopPropagation();refreshRaceOdds(shown[Number(b.dataset.oddsRace)])})}

function acquireBatchLock(kind){try{const now=Date.now(),raw=JSON.parse(localStorage.getItem(BATCH_LOCK_KEY)||"null");if(raw&&raw.owner!==TAB_INSTANCE_ID&&Number(raw.expiresAt)>now)return false;const next={owner:TAB_INSTANCE_ID,kind,expiresAt:now+BATCH_LOCK_TTL_MS};localStorage.setItem(BATCH_LOCK_KEY,JSON.stringify(next));const verify=JSON.parse(localStorage.getItem(BATCH_LOCK_KEY)||"null");return verify?.owner===TAB_INSTANCE_ID}catch{return true}}
function releaseBatchLock(){try{const raw=JSON.parse(localStorage.getItem(BATCH_LOCK_KEY)||"null");if(raw?.owner===TAB_INSTANCE_ID)localStorage.removeItem(BATCH_LOCK_KEY)}catch{}}
window.addEventListener("pagehide",releaseBatchLock);

const DEEP_DIVE_PROGRESS_KEY="chari-neko:five-race-deep-dive:v1";
const PRIMARY_SCREENING_PROGRESS_KEY="chari-neko:primary-screening:v5";
const SCREENING_BATCH_SIZE=6,SCREENING_MIN_ROWS=3,SCREENING_PROBE_SIZE=3,SCREENING_CANDIDATE_SCAN_LIMIT=24,FALLBACK_DEEP_DIVE_SCAN_LIMIT=6,SCREENING_TIME_BUDGET_MS=55*1000,SCREENING_CACHE_FRESH_MS=5*60*1000;
function loadDeepDiveProgress(){const all=loadJsonCache(DEEP_DIVE_PROGRESS_KEY),date=compact(state.date),entry=all[date];return entry&&Array.isArray(entry.keys)?entry:{keys:[],updatedAt:null}}
function saveDeepDiveProgress(keys){const all=loadJsonCache(DEEP_DIVE_PROGRESS_KEY),date=compact(state.date);all[date]={keys:[...new Set(keys)],updatedAt:new Date().toISOString()};saveJsonCache(DEEP_DIVE_PROGRESS_KEY,all,14)}
function markDeepDiveProcessed(r){const progress=loadDeepDiveProgress(),key=raceKey(r);if(!progress.keys.includes(key)){progress.keys.push(key);saveDeepDiveProgress(progress.keys)}}
function loadPrimaryScreeningProgress(){const all=loadJsonCache(PRIMARY_SCREENING_PROGRESS_KEY),date=compact(state.date),entry=all[date];return entry&&Array.isArray(entry.processedKeys)?entry:{processedKeys:[],currentKeys:[],lastStats:null,updatedAt:null}}
function savePrimaryScreeningProgress(progress){const all=loadJsonCache(PRIMARY_SCREENING_PROGRESS_KEY),date=compact(state.date);all[date]={processedKeys:[...new Set(progress.processedKeys||[])],currentKeys:[...new Set(progress.currentKeys||[])],lastStats:progress.lastStats||null,updatedAt:new Date().toISOString()};saveJsonCache(PRIMARY_SCREENING_PROGRESS_KEY,all,14)}
function screeningCandidateOrder(){const now=Date.now(),margin=5*60000,estimate=estimatedRaceNoForClock(),known=[],unknown=[];for(const r of allMeetingRaces()){if(raceStatus(r).label==="終了")continue;const t=parseTime(r.date,deadlineOf(r));if(t){if(t>now+margin)known.push(r)}else unknown.push(r)}known.sort(raceSort);unknown.sort((a,b)=>Math.abs(a.raceNo-estimate)-Math.abs(b.raceNo-estimate)||Number(a.venueCode)-Number(b.venueCode)||a.raceNo-b.raceNo);return[...known,...unknown]}
function screeningDeadlineCandidates(excludedKeys=new Set(),limit=SCREENING_CANDIDATE_SCAN_LIMIT){const now=Date.now(),margin=5*60000,out=[];for(const r of screeningCandidateOrder()){const key=raceKey(r);if(excludedKeys.has(key))continue;const t=parseTime(r.date,deadlineOf(r));if(!t||t<=now+margin)continue;out.push(r);if(out.length>=limit)break}return out}
function estimatedRaceNoForClock(){const d=new Date(),minutes=d.getHours()*60+d.getMinutes();if(minutes<10*60)return 3;if(minutes<13*60)return 5;if(minutes<17*60)return 8;if(minutes<20*60+30)return 9;if(minutes<22*60)return 10;return 11}
function withCurrentRaceMeta(r){const meeting=(state.meetings||[]).find(m=>venueCode(m)===String(r.venueCode).padStart(2,"0")||m.venueName===r.venueName);return meeting?raceFrom(meeting,r.raceNo):r}
async function fetchAndSavePredictionForRace(r,{enforceFutureWindow=false}={}){const fixed={...r,key:raceKey(r)},requestedAt=Date.now(),q=new URLSearchParams({date:fixed.date,venueName:fixed.venueName,venueCode:fixed.venueCode,raceCardUrl:fixed.raceCardUrl||"",raceNo:String(fixed.raceNo),budget:"3000"});if(fixed.oddsUrl)q.set("oddsUrl",fixed.oddsUrl);const p=await jsonFetch(`/.netlify/functions/keirin-predict?${q}`);if(raceKey(p.race)!==fixed.key)throw new Error("取得したレースが選択内容と一致しません");const updatedRace={...fixed,...p.race,venueName:p.race.venue||p.race.venueName||fixed.venueName};storeRaceMetaCache(updatedRace,{race:p.race,checkedAt:p.checkedAt});const cutoff=parseTime(updatedRace.date,deadlineOf(updatedRace));if(enforceFutureWindow&&cutoff&&cutoff<=requestedAt+5*60000){const error=new Error("締切済み、または締切5分以内のため比較対象から除外しました");error.code="TOO_LATE_FOR_DEEP_DIVE";throw error}const snapshot=saveSnapshot(localStorage,createSnapshot(p));return{payload:p,snapshot,race:updatedRace}}
function isFreshScreeningCache(r){const cache=oddsCacheFor(r);if(!cache?.screening||!cache?.checkedAt)return false;const age=Date.now()-new Date(cache.checkedAt).getTime();return Number.isFinite(age)&&age>=0&&age<SCREENING_CACHE_FRESH_MS}
function groupRacesByVenue(races){const groups=new Map();for(const r of races||[]){const key=`${r.date}:${r.venueCode}:${r.venueName}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r)}return[...groups.values()]}
async function fetchRaceInfoBatch(races){if(!races?.length)return{items:[],failures:[]};const first=races[0],q=new URLSearchParams({date:String(first.date).replace(/\D/g,"").slice(0,8),venueCode:String(first.venueCode||""),venueName:first.venueName||"",raceNos:races.map(r=>r.raceNo).join(",")});try{const response=await fetch(`/.netlify/functions/keirin-screening-batch?${q}`,{cache:"no-store",headers:{accept:"application/json"}});let p;try{p=await response.json()}catch{p=null}if(!response.ok||p?.ok===false){const reason=p?.error||`一次選別取得失敗（HTTP ${response.status}）`;return{items:[],failures:races.map(r=>({raceNo:r.raceNo,error:reason,status:response.status})),diagnostics:p?.diagnostics||null}}for(const item of p.items||[]){const r=races.find(x=>Number(x.raceNo)===Number(item.race?.raceNo));if(!r)continue;storeOddsCache(r,item);storeRaceMetaCache(r,item)}return{...p,failures:Array.isArray(p.failures)?p.failures:[]}}catch(error){const reason=error?.message||String(error);return{items:[],failures:races.map(r=>({raceNo:r.raceNo,error:reason,status:0}))}}}
async function ensureScreeningData(races,{deadlineAt=Infinity}={}){const stale=(races||[]).filter(r=>!isFreshScreeningCache(r));let success=0,failed=0,attempted=0,timedOut=false;const failureDetails=[];for(const group of groupRacesByVenue(stale)){if(Date.now()>=deadlineAt){timedOut=true;break}attempted+=group.length;const p=await fetchRaceInfoBatch(group),itemNos=new Set((p.items||[]).map(item=>Number(item.race?.raceNo||item.raceNo)));success+=itemNos.size;const knownFailures=new Map((p.failures||[]).map(f=>[Number(f.raceNo),f]));for(const r of group){if(itemNos.has(Number(r.raceNo)))continue;const f=knownFailures.get(Number(r.raceNo))||{};failureDetails.push({key:raceKey(r),venueName:r.venueName,raceNo:r.raceNo,error:String(f.error||"一次選別データを取得できませんでした"),status:Number(f.status)||0});failed++}if(Date.now()>=deadlineAt)timedOut=true}return{success,failed,attempted,timedOut,failureDetails}}
function screeningFailureLabel(detail){const text=String(detail?.error||"");if(/未公開|未発売|指定\d+Rを確認できません/.test(text))return"公式ページ未公開・未発売";if(/トークン/.test(text))return"公式データ準備中";if(/出走選手監査|出走データ/.test(text))return"出走データ未確定";if(/503|混雑|本予想処理中|BROWSER_BUSY/i.test(text))return"取得サービス使用中";if(/timeout|timed out|時間内/i.test(text))return"取得タイムアウト";if(/締切|終了/.test(text))return"締切済み・終了";return"preview取得失敗"}
function screeningFailureDetailsHtml(details){const rows=(details||[]).slice(0,12);if(!rows.length)return"";return `<details class="finishedRaces screeningFailures"><summary>取得できなかったR <span>${rows.length}件</span></summary><div class="finishedRaceList">${rows.map(d=>`<div class="abilityRow"><strong>${esc(d.venueName||"-")} ${Number(d.raceNo)||"-"}R</strong><span>${esc(screeningFailureLabel(d))}</span></div>`).join("")}</div></details>`}
async function fetchActiveRaceMap(){const venueCodes=[...new Set((state.meetings||[]).map(venueCode).filter(code=>/^\d{2}$/.test(code)))];if(!venueCodes.length)return new Map();const q=new URLSearchParams({date:compact(state.date),venueCodes:venueCodes.join(",")}),p=await jsonFetch(`/.netlify/functions/keirin-active-races?${q}`),map=new Map();for(const row of p.venues||[])map.set(String(row.venueCode||"").padStart(2,"0"),row);return map}
function nextFrontierRaces(activeMap,excludedKeys=new Set(),limit=SCREENING_BATCH_SIZE){const estimate=estimatedRaceNoForClock(),queues=[];for(const m of state.meetings||[]){const code=venueCode(m),hasScan=activeMap.has(code),entry=activeMap.get(code)||{},official=(entry.activeRaceNos||[]).map(Number).filter(n=>n>=1&&n<=12).sort((a,b)=>a-b),ended=(entry.endedRaceNos||[]).map(Number).filter(n=>n>=1&&n<=12).sort((a,b)=>a-b),unknown=(entry.unknownRaceNos||[]).map(Number).filter(n=>n>=1&&n<=12).sort((a,b)=>a-b),listed=raceNumbersOf(m),fallback=(listed.length?listed:Array.from({length:12},(_,i)=>i+1)).map(Number).filter(n=>n>=1&&n<=12);let pool;if(hasScan){const endedMax=ended.length?Math.max(...ended):0,activeMax=official.length?Math.max(...official):0,floor=Math.max(endedMax,activeMax),futureUnknown=unknown.filter(n=>n>floor),knownFuture=[...new Set([...official,...futureUnknown])].sort((a,b)=>a-b);pool=knownFuture;if(!pool.length){const allFinished=ended.length>=Math.max(1,listed.length||12);if(allFinished)continue;pool=unknown.filter(n=>n>endedMax)}if(!pool.length)continue}else pool=fallback.sort((a,b)=>Math.abs(a-estimate)-Math.abs(b-estimate)||a-b);const available=pool.filter(n=>!excludedKeys.has(raceKey({date:compact(state.date),venueCode:code,venueName:m.venueName,raceNo:n}))).map(n=>raceFrom(m,n));if(available.length)queues.push(available)}const out=[];for(let depth=0;out.length<limit;depth++){let added=false;for(const queue of queues){if(out.length>=limit)break;if(queue[depth]){out.push(queue[depth]);added=true}}if(!added)break}return out}
async function preparePrimaryScreening({advance=false}={}){const startedAt=Date.now(),deadlineAt=startedAt+SCREENING_TIME_BUDGET_MS,progress=loadPrimaryScreeningProgress(),processed=new Set(progress.processedKeys||[]);if(advance)for(const key of progress.currentKeys||[])processed.add(key);updateBulkRefreshUi("締切時刻を基準に残りRを確認中…");let candidatePool=screeningDeadlineCandidates(processed,SCREENING_CANDIDATE_SCAN_LIMIT),candidateSource="deadline";if(candidatePool.length<SCREENING_MIN_ROWS){try{const activeMap=await fetchActiveRaceMap(),already=new Set([...processed,...candidatePool.map(raceKey)]),supplement=nextFrontierRaces(activeMap,already,SCREENING_CANDIDATE_SCAN_LIMIT-candidatePool.length);candidatePool=[...candidatePool,...supplement];candidateSource="deadline+active-fallback"}catch{candidateSource="deadline-only"}}const tried=[],triedKeys=new Set();let retrieval={success:0,failed:0,attempted:0,timedOut:false,failureDetails:[]},valid=[];for(let offset=0;offset<candidatePool.length&&valid.length<SCREENING_MIN_ROWS&&Date.now()<deadlineAt;offset+=SCREENING_PROBE_SIZE){const probe=candidatePool.slice(offset,offset+SCREENING_PROBE_SIZE).filter(r=>!triedKeys.has(raceKey(r)));if(!probe.length)continue;probe.forEach(r=>{tried.push(r);triedKeys.add(raceKey(r))});updateBulkRefreshUi(`一次選別データ取得中：${tried.length}R確認 / 成功${valid.length}R（最低${SCREENING_MIN_ROWS}Rで成立）`);const more=await ensureScreeningData(probe,{deadlineAt});retrieval={success:retrieval.success+more.success,failed:retrieval.failed+more.failed,attempted:retrieval.attempted+more.attempted,timedOut:retrieval.timedOut||more.timedOut,failureDetails:[...retrieval.failureDetails,...(more.failureDetails||[])]};const now=Date.now();valid=tried.map(withCurrentRaceMeta).filter(r=>{const t=parseTime(r.date,deadlineOf(r));return isFreshScreeningCache(r)&&(!t||t>now+5*60000)}).sort(raceSort)}const rows=valid.slice(0,SCREENING_BATCH_SIZE),keys=rows.map(raceKey),attempted=tried.length,success=rows.length,failed=Math.max(0,attempted-success),established=rows.length>=SCREENING_MIN_ROWS,timedOut=retrieval.timedOut||Date.now()>=deadlineAt,lastStats={attempted,success,failed,established,timedOut,elapsedMs:Date.now()-startedAt,candidateSource,failureDetails:(retrieval.failureDetails||[]).filter((d,i,a)=>a.findIndex(x=>x.key===d.key)===i).slice(0,24)};savePrimaryScreeningProgress({processedKeys:[...processed],currentKeys:keys,lastStats});state.deepDiveCurrentKeys=keys;return{rows,success,failed,attempted,established,timedOut,elapsedMs:lastStats.elapsedMs,processed:[...processed],failureDetails:lastStats.failureDetails,candidateSource}}
async function runPrimaryScreening(){if(state.screeningBusy)return;if(!acquireBatchLock("primary-screening")){updateBulkRefreshUi("別のチャリ猫タブで一括更新・一次選別を実行中です。完了後に再実行してください。");return}if(!(state.meetings||[]).length){releaseBatchLock();await loadMeetings();return}state.screeningBusy=true;state.meetingTab="screening";renderMeetingTabs();const button=$("runScreening"),progress=loadPrimaryScreeningProgress();if(button){button.disabled=true;button.textContent="一次選別中…"}try{const result=await preparePrimaryScreening({advance:Boolean(progress.currentKeys?.length)});renderPrimaryScreening();if(result.established)updateBulkRefreshUi(`一次選別成立：取得${result.attempted} / 成功${result.success} / 失敗${result.failed}。上位だけ深掘りできます。`);else{updateBulkRefreshUi(`一次選別不成立 ${result.success}/${SCREENING_BATCH_SIZE}。3R揃わないため締切順3Rを直接深掘り比較します…`);const fallback=await runFallbackDeepDiveComparison(3);renderPrimaryScreening();updateBulkRefreshUi(`一次選別不成立 ${result.success}/${SCREENING_BATCH_SIZE} → 直接深掘り ${fallback.done}R保存${fallback.skipped?` / 締切除外${fallback.skipped}`:""}${fallback.failed?` / 失敗${fallback.failed}`:""}`)}}catch(error){updateBulkRefreshUi(error?.message||"一次選別に失敗しました")}finally{state.screeningBusy=false;releaseBatchLock();if(button){button.disabled=false;button.textContent="次の6Rを一次選別"}renderPrimaryScreening()}}
function screeningRows(){const progress=loadPrimaryScreeningProgress(),raceMap=new Map(allMeetingRaces().map(r=>[raceKey(r),r]));return(progress.currentKeys||[]).map(key=>{const r=raceMap.get(key);if(!r)return null;const cache=oddsCacheFor(r);return cache?.screening?{r,cache}:null}).filter(Boolean).sort((a,b)=>raceSort(a.r,b.r))}
function screeningNormalScore(row){const s=row.cache?.screening||{},coverage=Math.min(1,(Number(s.oddsCount)||0)/210),line=s.raceCategory==="girls"?.60:(s.lineVerified?1:.20);return 100*(.62*(Number(s.predictability)||0)+.23*coverage+.15*line)}
function screeningHighScore(row){const s=row.cache?.screening||{},coverage=Math.min(1,(Number(s.oddsCount)||0)/210);return 100*(.60*(Number(s.valuePotential)||0)+.25*(Number(s.predictability)||0)+.15*coverage)}
function screeningGroups(rows=screeningRows()){if((rows||[]).length<SCREENING_MIN_ROWS)return{normal:[],high:[],hold:[...(rows||[])],established:false};const normal=selectNaturalScreeningCluster(rows,"predictability",3),normalKeys=new Set(normal.map(x=>raceKey(x.r))),highPool=rows.filter(x=>!normalKeys.has(raceKey(x.r))),high=selectNaturalScreeningCluster(highPool,"valuePotential",3),selectedKeys=new Set([...normal,...high].map(x=>raceKey(x.r))),hold=rows.filter(x=>!selectedKeys.has(raceKey(x.r)));return{normal,high,hold,established:true}}
function recommendedScreeningRows(rows=screeningRows()){const groups=screeningGroups(rows);if(!groups.established)return[];return[...groups.normal,...groups.high].slice(0,3)}
async function deepDiveRace(r){let snapshot=currentSnapshotForRace(r);if(!snapshot){const result=await fetchAndSavePredictionForRace(r,{enforceFutureWindow:true});snapshot=result.snapshot}markDeepDiveProcessed(r);renderHomeRecommendations();return snapshot}
function fallbackDeepDiveCandidates(limit=FALLBACK_DEEP_DIVE_SCAN_LIMIT){const done=new Set(loadDeepDiveProgress().keys),seen=new Set(),current=screeningRows().map(x=>x.r),ordered=[...current,...screeningCandidateOrder()],now=Date.now(),out=[];for(const r of ordered){const key=raceKey(r);if(seen.has(key)||done.has(key))continue;seen.add(key);const t=parseTime(r.date,deadlineOf(r));if(t&&t<=now+5*60000)continue;out.push(r);if(out.length>=limit)break}return out}
async function runFallbackDeepDiveComparison(limit=3){const candidates=fallbackDeepDiveCandidates(FALLBACK_DEEP_DIVE_SCAN_LIMIT);state.deepDiveCurrentKeys=candidates.map(raceKey);let done=0,failed=0,skipped=0,attempted=0;const failureDetails=[];for(const r of candidates){if(done>=limit)break;attempted++;try{await deepDiveRace(r);done++}catch(error){if(error?.code==="TOO_LATE_FOR_DEEP_DIVE")skipped++;else{failed++;failureDetails.push({venueName:r.venueName,raceNo:r.raceNo,error:error?.message||String(error)})}}finally{renderPrimaryScreening()}}return{requested:attempted,done,failed,skipped,failureDetails}}
async function runDeepDiveTop(){if(state.deepDiveBusy||state.screeningBusy)return;const rows=recommendedScreeningRows();if(!rows.length){updateBulkRefreshUi("先に一次選別を実行してください。");return}if(!acquireBatchLock("deep-dive-top")){updateBulkRefreshUi("別のチャリ猫タブで解析中です。");return}state.deepDiveBusy=true;const button=$("runDeepDiveTop");if(button){button.disabled=true;button.textContent=`深掘り 0/${rows.length}`}let done=0,failed=0;try{for(const row of rows){try{await deepDiveRace(row.r);done++}catch{failed++}finally{if(button)button.textContent=`深掘り ${done+failed}/${rows.length}`;renderPrimaryScreening()}}updateBulkRefreshUi(`上位深掘り完了：${done}R保存${failed?` / ${failed}R失敗`:""}。最終評価は未校正のため検証対象として扱います。`)}finally{state.deepDiveBusy=false;releaseBatchLock();if(button){button.disabled=false;button.textContent="上位3Rを深掘り"}renderPrimaryScreening()}}
async function runFiveRaceDeepDive(){if(state.deepDiveBusy||state.screeningBusy)return;if(!acquireBatchLock("direct-deep-dive")){updateBulkRefreshUi("別のチャリ猫タブで解析中です。");return}const progress=loadDeepDiveProgress(),doneSet=new Set(progress.keys),batch=screeningCandidateOrder().filter(r=>!doneSet.has(raceKey(r))).slice(0,5);if(!batch.length){releaseBatchLock();updateBulkRefreshUi("直接深掘りできる残りレースはありません。");return}state.deepDiveBusy=true;const button=$("runDirectDeepDive");if(button){button.disabled=true;button.textContent=`直接深掘り 0/${batch.length}`}let done=0,failed=0,skipped=0;try{for(const r of batch){try{await deepDiveRace(r);done++}catch(error){if(error?.code==="TOO_LATE_FOR_DEEP_DIVE")skipped++;else failed++}finally{if(button)button.textContent=`直接深掘り ${done+failed+skipped}/${batch.length}`;renderPrimaryScreening()}}updateBulkRefreshUi(`5R直接深掘り：${done}R保存${skipped?` / 締切除外${skipped}`:""}${failed?` / 失敗${failed}`:""}`)}finally{state.deepDiveBusy=false;releaseBatchLock();if(button){button.disabled=false;button.textContent="5R直接深掘り"}renderPrimaryScreening()}}
function deepDiveRows(){const progress=loadDeepDiveProgress(),raceMap=new Map(allMeetingRaces().map(r=>[raceKey(r),r]));return progress.keys.map(key=>{const r=raceMap.get(key);if(!r)return null;const snapshot=currentSnapshotForRace(r);return snapshot?{r,snapshot,rating:ratingOf(snapshot)}:null}).filter(Boolean)}
function deepDiveComposite(row){const n=Number(row?.rating?.diagnostics?.evaluationIndex);return Number.isFinite(n)?n:20*(.40*(Number(row?.rating?.confidence)||1)+.35*(Number(row?.rating?.concentration)||1)+.25*(Number(row?.rating?.rollover)||1))}
function maxHighOdds(snapshot){let max=0;for(const b of snapshot?.betSelections||[]){if(b.category!=="BUYABLE_HIGH"&&!(b.category==="MAIN"&&Number(b.odds)>=100))continue;const n=Number(b.odds);if(Number.isFinite(n))max=Math.max(max,n)}return max}
function renderPrimaryScreening(){const root=$("screeningRaceList");if(!root)return;const rows=screeningRows(),progress=loadPrimaryScreeningProgress(),stats=progress.lastStats||{attempted:rows.length,success:rows.length,failed:0,established:rows.length>=SCREENING_MIN_ROWS},failureHtml=screeningFailureDetailsHtml(stats.failureDetails),groups=screeningGroups(rows),recommended=recommendedScreeningRows(rows),recKeys=new Set(recommended.map(x=>raceKey(x.r))),deep=deepDiveRows().filter(x=>recKeys.has(raceKey(x.r))||state.deepDiveCurrentKeys.includes(raceKey(x.r))).sort((a,b)=>deepDiveComposite(b)-deepDiveComposite(a)),topBtn=$("runDeepDiveTop");if(topBtn&&!state.deepDiveBusy)topBtn.disabled=!groups.established;if(!rows.length&&!deep.length){root.innerHTML='<section class="card empty">「一括更新」で締切が近いレースを3R以上集めて一次選別します。3R揃わない場合は締切順3Rの直接深掘り比較へ自動で切り替えます。</section>';return}const statusText=groups.established?`一次選別成立 ${rows.length}/${SCREENING_BATCH_SIZE}`:`一次選別不成立 ${rows.length}/${SCREENING_BATCH_SIZE}`;const screeningHtml=groups.established?`${screeningGroup("通常候補",groups.normal,"solid")}${screeningGroup("高配当寄り",groups.high,"high")}${groups.hold.length?`<details class="finishedRaces"><summary>見送り候補・保留 <span>${groups.hold.length}件</span></summary><div class="finishedRaceList">${groups.hold.map(x=>screeningPendingRow(x,"保留")).join("")}</div></details>`:""}`:`<section class="card compact auditWarning"><strong>${statusText}</strong><p>比較に必要な最低3Rが揃っていないため順位・通常候補・高配当候補は出しません。取得済みRは比較保留です。</p></section>${rows.length?`<section class="screeningGroup"><div class="raceSectionHead"><strong>取得済み・比較保留</strong><span>${rows.length}件</span></div>${rows.map(x=>screeningPendingRow(x,"比較保留")).join("")}</section>`:""}`;root.innerHTML=`<section class="screeningIntro"><strong>締切順3〜6R 一次選別</strong><span>${statusText} / 取得${Number(stats.attempted)||0}・成功${Number(stats.success)||0}・失敗${Number(stats.failed)||0}${stats.candidateSource?`・候補 ${esc(stats.candidateSource==="deadline"?"締切時刻":"締切時刻＋補助探索")}`:""}</span></section><section class="card compact auditWarning"><strong>評価監査中</strong><p>信頼度・集中度・コロがし・総合点は未校正です。現時点の順位は研究用で、結果照合が進むまで購入判断へ直結させません。</p></section>${screeningHtml}${failureHtml}${deep.length?`<section class="screeningIntro deepDiveIntro"><strong>深掘り結果（暫定評価）</strong><span>${deep.length}R / 評価は未校正</span></section>${deepDiveGroup("完全解析済み",deep,"solid")}`:""}`;root.querySelectorAll("[data-screen-race]").forEach(b=>{b.onclick=()=>{const key=b.dataset.screenRace,row=deep.find(x=>raceKey(x.r)===key);if(row)openSavedDetail(row.snapshot)}});root.querySelectorAll("[data-screen-preview]").forEach(b=>{b.onclick=()=>{const key=b.dataset.screenPreview,row=rows.find(x=>raceKey(x.r)===key);if(row)openDetail(row.r)}});root.querySelectorAll("[data-deep-race]").forEach(b=>{b.onclick=async e=>{e.stopPropagation();const key=b.dataset.deepRace,row=rows.find(x=>raceKey(x.r)===key);if(!row||state.deepDiveBusy)return;state.deepDiveBusy=true;b.disabled=true;b.textContent="深掘り中…";try{await deepDiveRace(row.r);renderPrimaryScreening()}catch(error){updateBulkRefreshUi(error?.message||"深掘り失敗")}finally{state.deepDiveBusy=false}}})}
function screeningGroup(title,rows,tone){return `<section class="screeningGroup screening-${tone}"><div class="raceSectionHead"><strong>${title}</strong><span>${rows.length}件</span></div>${rows.length?rows.map(row=>screeningRow(row,tone)).join(""):'<section class="card empty compactEmpty">該当なし</section>'}</section>`}
function screeningRow(row,tone="solid"){const{r,cache}=row,s=cache.screening||{},deadline=deadlineOf(r),score=tone==="high"?screeningHighScore(row):screeningNormalScore(row),label=tone==="high"?"高配当候補":"通常候補",line=s.raceCategory==="girls"?"ガールズ・主導権は深掘り":(s.lineVerified?"ライン順序確認":"ライン要監査");return `<article class="timelineRace screeningRace"><div class="timelineBody"><button class="timelineMain" data-screen-preview="${esc(raceKey(r))}"><span class="timelineVenue"><strong>${esc(r.venueName)} ${r.raceNo}R</strong><small>${deadline?`予想締切 ${esc(deadline)} ・ `:""}${esc(line)}</small><small>予測しやすさ ${(Number(s.predictability||0)*100).toFixed(0)} / 高配当余地 ${(Number(s.valuePotential||0)*100).toFixed(0)} / オッズ ${Number(s.oddsCount)||0}件</small><em class="raceListAction">レース詳細へ ›</em></span><span class="screeningScore"><b>${score.toFixed(0)}</b><small>一次</small><em>${label}</em></span></button><button class="screeningDeepBtn" data-deep-race="${esc(raceKey(r))}">深掘り</button></div></article>`}
function screeningPendingRow(row,label="比較保留"){const{r,cache}=row,s=cache.screening||{},deadline=deadlineOf(r),line=s.raceCategory==="girls"?"ガールズ・主導権は深掘り":(s.lineVerified?"ライン順序確認":"ライン要監査");return `<article class="timelineRace screeningRace"><button class="timelineMain" data-screen-preview="${esc(raceKey(r))}"><span class="timelineVenue"><strong>${esc(r.venueName)} ${r.raceNo}R</strong><small>${deadline?`予想締切 ${esc(deadline)} ・ `:""}${esc(line)}</small><small>予測しやすさ ${(Number(s.predictability||0)*100).toFixed(0)} / 高配当余地 ${(Number(s.valuePotential||0)*100).toFixed(0)} / オッズ ${Number(s.oddsCount)||0}件</small><em class="raceListAction">レース詳細へ ›</em></span><span class="screeningScore"><small>一次</small><em>${esc(label)}</em></span></button></article>`}
function deepDiveGroup(title,rows,tone){return `<section class="screeningGroup screening-${tone}"><div class="raceSectionHead"><strong>${title}</strong><span>${rows.length}件</span></div>${rows.length?rows.map(deepDiveRow).join(""):'<section class="card empty compactEmpty">該当なし</section>'}</section>`}
function deepDiveRow(row){const{r,snapshot,rating}=row,deadline=deadlineOf(snapshot.targetRace||r),bets=standardSelections(snapshot),high=maxHighOdds(snapshot),score=deepDiveComposite(row),flags=rating.auditFlags||[];return `<article class="timelineRace screeningRace"><button class="timelineMain" data-screen-race="${esc(raceKey(r))}"><span class="timelineVenue"><strong>${esc(r.venueName)} ${r.raceNo}R</strong><small>${deadline?`予想締切 ${esc(deadline)} ・ `:""}${bets.length}点 ・ ${esc(rating.verdict||"-")}</small><small>信頼 ${starText(rating.confidence)} / 集中 ${starText(rating.concentration)} / コロ ${starText(rating.rollover)}${high?` / 高配当 ${high.toFixed(1)}倍`:""}</small>${flags.length?`<small class="auditFlagText">要監査: ${esc(flags.slice(0,2).join(" / "))}</small>`:""}<em class="raceListAction">保存済み詳細へ ›</em></span><span class="screeningScore"><b>${score.toFixed(1)}</b><small>暫定</small><em>未校正</em></span></button></article>`}
function selectNaturalScreeningCluster(rows,metric,maxItems=5){const sorted=[...(rows||[])].sort((a,b)=>Number(b.cache?.screening?.[metric]||0)-Number(a.cache?.screening?.[metric]||0)||raceSort(a.r,b.r));if(sorted.length<=1)return sorted;const scores=sorted.map(x=>Number(x.cache?.screening?.[metric]||0)),eps=1e-9,top=scores[0],ties=sorted.filter((_,i)=>Math.abs(scores[i]-top)<=eps);if(ties.length>1)return ties.slice(0,maxItems);const examine=Math.min(sorted.length,maxItems+2),gaps=[];for(let i=0;i<examine-1;i++)gaps.push(Math.max(0,scores[i]-scores[i+1]));const med=medianScreen(gaps),mad=medianScreen(gaps.map(g=>Math.abs(g-med)));let best=-1,bestIndex=-1;for(let i=0;i<gaps.length;i++){if(gaps[i]>best){best=gaps[i];bestIndex=i}}const natural=bestIndex>=0&&best>med+mad+eps&&best>eps;return sorted.slice(0,natural?Math.min(maxItems,bestIndex+1):1)}
function medianScreen(values){const v=(values||[]).filter(Number.isFinite).sort((a,b)=>a-b);if(!v.length)return 0;const m=Math.floor(v.length/2);return v.length%2?v[m]:(v[m-1]+v[m])/2}
function raceSort(a,b){const ta=parseTime(a.date,deadlineOf(a))||Infinity,tb=parseTime(b.date,deadlineOf(b))||Infinity;return ta-tb||Number(a.venueCode)-Number(b.venueCode)||a.raceNo-b.raceNo}

function loadJsonCache(key){try{const v=JSON.parse(localStorage.getItem(key)||"{}");return v&&typeof v==="object"?v:{}}catch{return{}}}
function loadMeetingCache(){return loadJsonCache(MEETING_CACHE_KEY)}
function meetingCacheFor(date){return loadMeetingCache()[String(date||"").replace(/\D/g,"").slice(0,8)]||null}
function storeMeetingCache(date,meetings,checkedAt=new Date().toISOString()){const all=loadMeetingCache(),key=String(date||"").replace(/\D/g,"").slice(0,8);all[key]={checkedAt,meetings:Array.isArray(meetings)?meetings:[]};saveJsonCache(MEETING_CACHE_KEY,all,14)}
function saveJsonCache(key,value,limit=120){const entries=Object.entries(value||{}).sort((a,b)=>String(b[1]?.checkedAt||"").localeCompare(String(a[1]?.checkedAt||""))).slice(0,limit);localStorage.setItem(key,JSON.stringify(Object.fromEntries(entries)))}
function loadOddsCache(){return loadJsonCache(ODDS_CACHE_KEY)}
function loadRaceMetaCache(){return loadJsonCache(RACE_META_CACHE_KEY)}
function raceMetaCacheFor(r){return loadRaceMetaCache()[raceKey(r)]||null}
function storeRaceMetaCache(r,payload){const all=loadRaceMetaCache(),key=raceKey(r),race=payload?.race||payload||{};all[key]={checkedAt:payload?.checkedAt||new Date().toISOString(),startTime:String(race.startTime||race.scheduledStart||race.deadline||""),deadline:String(race.deadline||race.cutoffTime||race.startTime||"")};saveJsonCache(RACE_META_CACHE_KEY,all,160)}
function loadResultCache(){return loadJsonCache(RESULT_CACHE_KEY)}
function resultCacheFor(r){return loadResultCache()[raceKey(r)]||null}
function storeResultCache(r,result,checkedAt=new Date().toISOString()){const all=loadResultCache();all[raceKey(r)]={...result,checkedAt};saveJsonCache(RESULT_CACHE_KEY,all,160)}
function oddsCacheFor(r){return loadOddsCache()[raceKey(r)]||null}
function storeOddsCache(r,payload){const all=loadOddsCache(),key=raceKey(r);all[key]={checkedAt:payload.checkedAt||new Date().toISOString(),odds:payload.odds?.odds||{},available:Boolean(payload.odds?.available),count:Number(payload.odds?.count)||0,screening:payload.screening||all[key]?.screening||null};saveJsonCache(ODDS_CACHE_KEY,all,160)}
async function fetchRaceInfo(r){const q=new URLSearchParams({date:String(r.date).replace(/\D/g,"").slice(0,8),venueCode:String(r.venueCode||""),venueName:r.venueName||"",raceNo:String(r.raceNo)}),p=await jsonFetch(`/.netlify/functions/keirin-odds?${q}`);storeOddsCache(r,p);storeRaceMetaCache(r,p);return p}
async function refreshRaceOdds(r){const key=raceKey(r);if(state.oddsBusyKey||raceStatus(r).label==="終了")return;state.oddsBusyKey=key;renderMeetingTabs();try{await fetchRaceInfo(r)}catch(error){const all=loadOddsCache();all[key]={checkedAt:new Date().toISOString(),available:false,count:0,odds:{},error:error?.message||String(error)};saveJsonCache(ODDS_CACHE_KEY,all,100)}finally{state.oddsBusyKey=null;renderVenueGrid(state.meetings||[]);renderMeetingTabs()}}
function updateBulkRefreshUi(message){const button=$("bulkRefresh"),status=$("bulkRefreshStatus");if(button){button.disabled=state.bulkBusy;button.textContent=state.bulkBusy?(state.bulkTotal?`一括更新 ${state.bulkDone}/${state.bulkTotal}`:"高速更新中…"):"一括更新"}if(status&&message)status.textContent=message}
async function bulkRefreshRaceInfo(){
  if(state.bulkBusy||state.screeningBusy)return;
  if(!acquireBatchLock("bulk")){
    updateBulkRefreshUi("別のチャリ猫タブで一括更新・一次選別を実行中です。完了後に再実行してください。");
    return;
  }
  state.bulkBusy=true;
  state.bulkDone=0;
  state.bulkTotal=0;
  const button=$("bulkRefresh");
  if(button){button.disabled=true;button.textContent="一括更新 準備中…"}

  try{
    updateBulkRefreshUi("開催・締切情報を更新しています…");
    await refreshMeetingsInPlace();

    const targets=allMeetingRaces().filter(r=>raceStatus(r).label!=="終了");
    state.bulkTotal=targets.length;
    updateBulkRefreshUi(`一括更新開始：未終了${targets.length}Rの締切・オッズを更新します。`);

    let success=0,failed=0,available=0,waiting=0;
    const failures=[];

    for(const venueRaces of groupRacesByVenue(targets)){
      for(const chunk of chunkRows(venueRaces,4)){
        const result=await fetchRaceInfoBatch(chunk);
        const itemNos=new Set((result.items||[]).map(item=>Number(item.race?.raceNo||item.raceNo)));

        const missing=chunk.filter(r=>!itemNos.has(Number(r.raceNo)));
        for(const race of missing){
          const retry=await fetchRaceInfoBatch([race]);
          const got=(retry.items||[]).some(item=>Number(item.race?.raceNo||item.raceNo)===Number(race.raceNo));
          if(got)itemNos.add(Number(race.raceNo));
          else{
            const detail=(retry.failures||[])[0]||(result.failures||[]).find(f=>Number(f.raceNo)===Number(race.raceNo));
            failures.push({race,error:detail?.error||"取得できませんでした"});
          }
        }

        for(const race of chunk){
          if(itemNos.has(Number(race.raceNo))){
            success++;
            const cache=oddsCacheFor(race);
            if(cache?.available)available++;else waiting++;
          }else failed++;
          state.bulkDone++;
        }

        renderMeetingTabs();
        updateBulkRefreshUi(`一括更新中：${state.bulkDone}/${state.bulkTotal}R　成功${success} / オッズ公開${available} / 待ち${waiting} / 失敗${failed}`);
      }
    }

    renderVenueGrid(state.meetings||[]);
    renderMeetingTabs();
    const suffix=failures.length?`　失敗例: ${failures.slice(0,2).map(x=>`${x.race.venueName}${x.race.raceNo}R`).join("、")}`:"";
    updateBulkRefreshUi(`一括更新完了：${state.bulkTotal}R中 成功${success} / オッズ公開${available} / オッズ待ち${waiting} / 失敗${failed}。${suffix}`);
  }catch(error){
    updateBulkRefreshUi(`一括更新に失敗しました：${error?.message||String(error)}`);
  }finally{
    state.bulkBusy=false;
    state.bulkDone=0;
    state.bulkTotal=0;
    releaseBatchLock();
    if(button){button.disabled=false;button.textContent="一括更新"}
    renderVenueGrid(state.meetings||[]);
    renderMeetingTabs();
  }
}

async function refreshMeetingsInPlace(){
  const dateKey=compact(state.date);
  const p=await jsonFetch(`/.netlify/functions/keirin-discover?date=${dateKey}`);
  const items=(p.meetings||[]).filter(m=>getCard(m)).sort((a,b)=>Number(venueCode(a))-Number(venueCode(b)));
  if(items.length){
    state.meetings=items;
    storeMeetingCache(dateKey,items,p.checkedAt);
    $("meetingCount").textContent=`${items.length}会場`;
  }
  return p;
}

function chunkRows(rows,size=4){
  const out=[];
  for(let i=0;i<(rows||[]).length;i+=size)out.push(rows.slice(i,i+size));
  return out;
}
function oddsRating(snapshot,cached){if(!cached)return{label:"未更新",className:"muted"};if(!cached.available)return{label:"オッズ待ち",className:"waiting"};if(!snapshot)return{label:`オッズ公開 ${cached.count||0}件`,className:"ready"};const standard=standardSelections(snapshot);if(snapshot.noBet||!standard.length)return{label:"見送り寄り",className:"muted"};const rows=standard.map(b=>{const key=(b.order||[]).join("-"),odds=Number(cached.odds?.[key]),prob=Number(b.probability);return{...b,currentOdds:Number.isFinite(odds)?odds:null,value:Number.isFinite(odds)&&Number.isFinite(prob)?odds*prob:null}}).filter(x=>x.currentOdds);if(!rows.length)return{label:"買い目オッズ待ち",className:"waiting"};if(rows.some(x=>x.category==="MAIN"&&x.currentOdds>=100))return{label:"本線高配当",className:"high"};if(rows.some(x=>x.currentOdds>=100))return{label:"高配当あり",className:"high"};if(rows.some(x=>Number.isFinite(x.value)&&x.value>=1.12))return{label:"3連単妙味",className:"value"};if(rows.some(x=>x.currentOdds>=30))return{label:"中穴",className:"mid"};if(rows.every(x=>x.currentOdds<12))return{label:"人気集中",className:"popular"};return{label:"オッズ妙味なし",className:"muted"}}
function openRaces(meeting){state.meeting=meeting;$("venueTitle").textContent=meeting.venueName;$("raceDateLabel").textContent=formatDate(compact(state.date));const nums=raceNumbersOf(meeting),races=(nums.length?nums:Array.from({length:12},(_,i)=>i+1)).map(n=>raceFrom(meeting,n));$("raceCount").textContent=`${races.length}R`;$("raceList").innerHTML=races.map((r,i)=>{const s=raceStatus(r),battle=isBattleRace(r),deadline=deadlineOf(r),saved=displaySnapshotForRace(r),ended=s.label==="終了",action=ended?(saved?"結果・詳細 ›":"結果を見る ›"):(saved?"詳細を見る ›":"予想する ›");return `<article class="raceCardWrap"><button class="raceCard compactRace" data-race="${i}"><div class="raceTop"><h2>${r.raceNo}R</h2><span class="status ${s.className}">${s.label}</span></div><p class="raceDeadline">${deadline?`締切 ${esc(deadline)}`:"締切確認中"}${saved?" ・ 保存済み":""}</p><span class="raceAction">${action}</span></button><button class="raceBattle ${battle?"active":""}" data-race-battle="${i}" aria-label="勝負レース${battle?"解除":"登録"}">${battle?"★":"☆"}</button></article>`}).join("");$("raceList").querySelectorAll("[data-race]").forEach(b=>b.onclick=()=>openDetail(races[Number(b.dataset.race)]));$("raceList").querySelectorAll("[data-race-battle]").forEach(b=>b.onclick=e=>{e.stopPropagation();toggleBattleRace(races[Number(b.dataset.raceBattle)]);openRaces(meeting)});show("races")}
function raceFrom(m,raceNo){const base={date:compact(state.date),venueCode:venueCode(m),venueName:m.venueName,raceNo},saved=findLatestSnapshot(localStorage,base),meta=raceMetaOf(m,raceNo)||{},cached=raceMetaCacheFor(base)||{};return{...base,scheduledStart:cached.startTime||cached.scheduledStart||meta.scheduledStart||meta.startTime||meta.deadline||saved?.targetRace?.scheduledStart||"",deadline:cached.deadline||cached.cutoffTime||meta.deadline||meta.cutoffTime||meta.scheduledStart||meta.startTime||saved?.targetRace?.deadline||"",raceCardUrl:getCard(m)?.url||"",oddsUrl:getOdds(m)?.url||""}}
function raceNumbersOf(m){const raw=m?.raceNumbers||m?.discovery?.raceNumbers||m?.races?.map?.(x=>x.raceNo??x.number) || [];return [...new Set((Array.isArray(raw)?raw:[]).map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=12))].sort((a,b)=>a-b)}
function raceMetaOf(m,raceNo){return Array.isArray(m?.races)?m.races.find(x=>Number(x?.raceNo??x?.number)===Number(raceNo)):null}
function openDetail(race){state.race={...race};state.payload=null;state.snapshot=displaySnapshotForRace(race);state.legacySnapshot=state.snapshot&&isCurrentSnapshot(state.snapshot)?null:legacySnapshotForRace(race);if(raceStatus(race).label!=="終了"&&!isCurrentSnapshot(state.snapshot)){state.legacySnapshot=state.snapshot||legacySnapshotForRace(race);state.snapshot=null}renderDetail();show("detail")}
function openSavedDetail(snapshot){if(!snapshot)return;state.payload=null;state.snapshot=snapshot;const target=snapshot?.targetRace&&typeof snapshot.targetRace==="object"?snapshot.targetRace:{};state.race={...(state.race||{}),...target};try{renderDetail();show("detail")}catch(error){console.error("saved detail render failed",error);renderBasicDetailFallback(snapshot,error);show("detail")}}
function renderDetail(){const r=state.race,s=raceStatus(r),cachedResult=resultCacheFor(r),resultFinal=Boolean(cachedResult&&!isResultPending(cachedResult)),ended=s.label==="終了"||resultFinal,timeKnown=Boolean(deadlineOf(r)),displayStatus=ended?{label:"終了",className:"danger"}:s;$("detailDate").textContent=formatDate(r.date);$("detailTitle").textContent=`${r.venueName} ${r.raceNo}R`;$("raceStatus").textContent=displayStatus.label;$("raceStatus").className=`pill ${displayStatus.className}`;$("raceMeta").innerHTML=metas([["日付",formatDate(r.date)],["会場",r.venueName],["レース",`${r.raceNo}R`],["締切",deadlineOf(r)||"一括更新で取得"]]);renderOfficial(state.payload);renderPredictionDetail(state.snapshot);renderChatPredictionImport();renderDetailResult(state.snapshot?.result||cachedResult);if(state.snapshot){$("savedPrediction").classList.remove("hidden");$("savedPrediction").innerHTML=`<div class="sectionHead"><h2>保存済み予想あり</h2><span class="pill success">${formatTime(state.snapshot.createdAt)}</span></div><p class="muted">買い目・展開根拠は保存済みです。再生成しなくても確認できます。</p><button id="openSaved" class="secondary">保存済み買い目を見る</button>`;$("openSaved").onclick=()=>renderPrediction(state.snapshot)}else if(state.legacySnapshot&&!ended){$("savedPrediction").classList.remove("hidden");$("savedPrediction").innerHTML=`<div class="sectionHead"><h2>旧版の保存予想あり</h2><span class="pill warning">旧版</span></div><p class="muted">${esc(state.legacySnapshot.predictionVersion||"旧版")} の予想履歴は検証用に保持しています。未発走レースでは現行版の予想として使いません。</p><button id="openSaved" class="secondary">旧版履歴を見る</button>`;$("openSaved").onclick=()=>renderPrediction(state.legacySnapshot)}else $("savedPrediction").classList.add("hidden");$("predictBtn").disabled=false;if(ended){$("predictBtn").textContent=cachedResult||state.snapshot?.result?"公式結果を更新":"公式結果を見る";$("retryDetail").classList.toggle("hidden",!state.snapshot);if(state.snapshot)$("retryDetail").textContent="保存済み予想を見る"}else if(state.snapshot){$("predictBtn").textContent="保存済み買い目を見る";$("retryDetail").classList.remove("hidden");$("retryDetail").textContent="再予想"}else if(!timeKnown){$("predictBtn").textContent=cachedResult?"公式結果を更新":"公式結果を見る";$("retryDetail").classList.remove("hidden");$("retryDetail").textContent="このレースを予想"}else{$("predictBtn").textContent="このレースを予想";$("retryDetail").classList.add("hidden")}}
function handleDetailPrimary(){if(!state.race)return;const cachedResult=resultCacheFor(state.race),ended=raceStatus(state.race).label==="終了"||Boolean(cachedResult&&!isResultPending(cachedResult)),timeUnknown=!deadlineOf(state.race);if(ended||(!state.snapshot&&timeUnknown)){checkDetailResult();return}if(state.snapshot){renderPrediction(state.snapshot);return}predict()}
function handleDetailSecondary(){if(!state.race)return;const cachedResult=resultCacheFor(state.race),ended=raceStatus(state.race).label==="終了"||Boolean(cachedResult&&!isResultPending(cachedResult)),timeUnknown=!deadlineOf(state.race);if(ended&&state.snapshot){renderPrediction(state.snapshot);return}if(state.snapshot||timeUnknown)predict()}
async function fetchOfficialResult(r){const q=new URLSearchParams({date:r.date,venueCode:r.venueCode,venueName:r.venueName,raceNo:String(r.raceNo)}),p=await jsonFetch(`/.netlify/functions/keirin-result?${q}`);if(raceKey(p.race)!==raceKey(r))throw new Error("公式結果のレースが選択内容と一致しません");return p}
async function collectFinishedResultOnlyResearch(){
  const candidates=allMeetingRaces().filter(r=>raceStatus(r).label==="終了"&&!findLatestSnapshot(localStorage,r)&&!hasResultOnlyResearch(localStorage,r)).slice(0,24);
  if(!candidates.length)return;
  let cursor=0;
  async function worker(){while(cursor<candidates.length){const r=candidates[cursor++];try{const p=await fetchOfficialResult(r);storeResultCache(r,p.result,p.checkedAt);if(!isResultPending(p.result))saveResultOnlyResearch(localStorage,r,p.result,p.checkedAt)}catch{}}}
  await Promise.all(Array.from({length:Math.min(3,candidates.length)},()=>worker()));
}
async function checkDetailResult(){if(state.busy||!state.race)return;const fixed={...state.race};state.busy=true;$("predictBtn").disabled=true;$("predictBtn").textContent="結果取得中…";try{const p=await fetchOfficialResult(fixed);if(isResultPending(p.result)){storeResultCache(fixed,p.result,p.checkedAt);renderDetailResult({...p.result,checkedAt:p.checkedAt});return}storeResultCache(fixed,p.result,p.checkedAt);if(state.snapshot){state.snapshot=attachResult(localStorage,state.snapshot.predictionSnapshotId,p.result);try{runOperationalLearningPipeline(localStorage)}catch{}}else{try{saveResultOnlyResearch(localStorage,fixed,p.result,p.checkedAt)}catch{}}renderDetail();renderSaved();renderHomeRecommendations()}catch(e){fail("公式結果の取得に失敗",e,()=>checkDetailResult())}finally{state.busy=false;if(state.screen==="detail")renderDetail()}}
function renderDetailResult(result){const panel=$("detailResultPanel");if(!panel)return;if(!result){panel.classList.add("hidden");panel.innerHTML="";return}if(result.resultStatus){const cfg={hit:["○ 的中","resultHit"],miss:["✕ 不的中","resultMiss"],refund:["返還",""],cancelled:["中止",""]}[result.resultStatus]||[result.resultStatus,""];panel.className=`card ${cfg[1]}`;panel.innerHTML=`<div class="sectionHead"><h2>公式結果</h2><span class="pill success">確認済み</span></div><div class="resultMark">${cfg[0]}</div>${result.officialFinishOrder?.length?`<p>確定着順 <strong>${result.officialFinishOrder.join("-")}</strong></p>`:""}${result.matchedSelection?`<p>的中買い目 <strong>${result.matchedSelection.join("-")}</strong> / ${esc(result.betCategory||"")}</p>`:""}${result.officialPayout?`<p>3連単配当 <strong>${Number(result.officialPayout).toLocaleString()}円</strong></p>`:""}<p class="muted">確認 ${formatTime(result.checkedAt)}</p>`;panel.classList.remove("hidden");return}const status=String(result.status||"").toLowerCase();if(status==="not_finished"){panel.className="card";panel.innerHTML='<div class="sectionHead"><h2>公式結果</h2><span class="pill warning">未確定</span></div><p class="muted">公式結果はまだ確定していません。</p>';panel.classList.remove("hidden");return}const order=(result.finishOrder||result.order||[]).map(Number).filter(Number.isFinite).slice(0,3),label=status==="cancelled"?"中止":status==="refund"?"返還":"確定";panel.className="card";panel.innerHTML=`<div class="sectionHead"><h2>公式結果</h2><span class="pill success">${label}</span></div>${order.length?`<div class="resultMark compactResultMark">${order.join("-")}</div>`:""}${result.payout?`<p>3連単配当 <strong>${Number(result.payout).toLocaleString()}円</strong></p>`:""}<p class="muted">予想を生成していないレースでも結果だけ確認できます。${result.checkedAt?` / ${formatTime(result.checkedAt)}`:""}</p>`;panel.classList.remove("hidden")}
function renderOfficial(p){const race=p?.race;if(race){state.race={...state.race,scheduledStart:race.startTime||state.race?.scheduledStart||race.deadline||"",deadline:race.deadline||state.race?.deadline||race.startTime||"",raceCategory:race.raceCategory||state.race?.raceCategory||"standard",lineMode:race.lineMode||state.race?.lineMode||"official_line"};const scoredMap=new Map((p?.prediction?.scored||[]).map(x=>[Number(x.number),x]));$("participantCount").textContent=`${race.participants.length}名`;$("participants").innerHTML=race.participants.map(x=>{const scored=scoredMap.get(Number(x.number)),side=race.raceCategory==="girls"&&scored?girlsLeadLabel(scored):(displayParticipantRole(x)||x.className||x.prefecture||"");return `<div class="rider"><span class="riderNo">${x.number}</span><span><strong>${esc(x.name)}</strong><small>ID ${esc(x.registration||x.sourcePath||"公式車番")}</small></span><small>${esc(side)}</small></div>`}).join("");$("officialLine").textContent=lineText(race.participants,race.raceCategory,p?.prediction?.scored||[]);$("oddsStatus").textContent=p.odds?.ok?`3連単 ${Object.keys(p.odds.odds||{}).length}件`:"オッズ取得失敗";$("oddsStatus").className=`pill ${p.odds?.ok?"success":"warning"}`;$("detailNotice").innerHTML=p.warnings?.length?`<div class="notice">${p.warnings.map(esc).join(" / ")}</div>`:"";return}const saved=state.snapshot,participants=saved?.participants||[];if(saved&&participants.length){$("participantCount").textContent=`${participants.length}名`;const abilityMap=new Map((saved.abilitiesUsed||[]).map(x=>[Number(x.number),x]));$("participants").innerHTML=participants.map(x=>{const a=abilityMap.get(Number(x.number)),side=saved.targetRace?.raceCategory==="girls"&&a?girlsLeadLabel(a):(displayParticipantRole(x)||x.className||x.prefecture||"");return `<div class="rider"><span class="riderNo">${x.number}</span><span><strong>${esc(x.name)}</strong><small>ID ${esc(x.registration||x.sourcePath||"保存時車番")}</small></span><small>${esc(side)}</small></div>`}).join("");const hasLine=participants.some(x=>x.lineId||x.line);$("officialLine").textContent=hasLine?lineText(participants,saved.targetRace?.raceCategory,saved.abilitiesUsed||[]):"保存時のライン情報なし";const odds=saved.oddsSnapshot;$("oddsStatus").textContent=odds?.ok?`保存時3連単 ${Object.keys(odds.odds||{}).length}件`:"保存時オッズ";$("oddsStatus").className=`pill ${odds?.ok?"success":""}`;$("detailNotice").innerHTML='<div class="notice">保存済み予想を表示中です。再予想せずに買い目・根拠を確認できます。</div>';return}$("participantCount").textContent="未取得";$("participants").innerHTML='<p class="muted">出走選手は予想生成時に保存されます。</p>';$("officialLine").textContent="未取得";$("oddsStatus").textContent="オッズ未取得";$("detailNotice").innerHTML=""}

async function predict(){if(state.busy)return;const fixed={...state.race,key:raceKey(state.race)};state.busy=true;$("predictBtn").disabled=true;setLoading("予想を作成中","出走選手・公式ライン・3連単オッズを取得しています。");try{const result=await fetchAndSavePredictionForRace(fixed);state.payload=result.payload;state.race=result.race;state.snapshot=result.snapshot;renderOfficial(result.payload);renderHomeRecommendations();renderPrediction(result.snapshot)}catch(e){fail("予想の取得・保存に失敗",e,predict)}finally{state.busy=false;$("predictBtn").disabled=false}}

function standardSelections(snapshot){return (Array.isArray(snapshot?.betSelections)?snapshot.betSelections:[]).filter(b=>b?.category!=="REFERENCE");}
function referenceSelections(snapshot){const explicit=Array.isArray(snapshot?.referenceBetSelections)?snapshot.referenceBetSelections:[];if(explicit.length)return explicit;return (Array.isArray(snapshot?.betSelections)?snapshot.betSelections:[]).filter(b=>b?.category==="REFERENCE");}
function displaySelections(snapshot){return [...standardSelections(snapshot),...referenceSelections(snapshot)];}

function renderPrediction(snapshot){state.snapshot=snapshot;const r=snapshot?.targetRace||state.race||{},standard=standardSelections(snapshot),refs=referenceSelections(snapshot);state.race={...state.race,...r};$("predictionTitle").textContent=`${r.venueName} ${r.raceNo}R`;$("recommendation").textContent=snapshot.noBet?"見送り":"買い目";$("predictionUpdated").textContent=formatTime(snapshot.createdAt);const summary=[["標準買い目",`${standard.length}点`]];if(refs.length)summary.push(["参考買い目",`${refs.length}点`]);summary.push(["締切",deadlineOf(r)||"未取得"]);$("predictionSummary").innerHTML=metas(summary);renderRatings($("predictionRatings"),snapshot);renderPurchaseControls(snapshot);renderBetGroups(snapshot);renderResult(snapshot.result);show("prediction")}

function renderPurchaseControls(snapshot){const panel=$("purchaseControls"),bets=standardSelections(snapshot);if(!panel||snapshot.noBet||!bets.length){if(panel)panel.classList.add("hidden");return}const originalTotal=bets.reduce((sum,b)=>sum+(Number(b.stake)||0),0)||Math.max(1000,bets.length*100);const current=Math.max(0,Number(panel.dataset.budget)||originalTotal);const mode=panel.dataset.mode==="main"?"thick":panel.dataset.mode||"standard";const minimum=bets.length*100;const composite=calcCompositeOdds(bets);panel.innerHTML=`<div class="sectionHead"><h2>購入資金</h2><span class="pill">${bets.length}点</span></div><div class="fundingRow"><label>購入資金<input id="purchaseBudget" type="number" min="0" step="100" value="${current}"></label><label>配分<select id="allocationMode"><option value="standard"${mode==="standard"?" selected":""}>標準</option><option value="thick"${mode==="thick"||mode==="main"?" selected":""}>厚め優先</option><option value="high"${mode==="high"?" selected":""}>高配当重視</option></select></label></div><div class="quickBudget">${[1000,1500,2000,3000].map(v=>`<button type="button" data-budget="${v}">${v.toLocaleString()}円</button>`).join("")}</div><div class="purchaseStats"><span>最低必要資金 <strong>${minimum.toLocaleString()}円</strong></span><span>合成オッズ <strong>${composite?`${composite.toFixed(2)}倍`:"未取得"}</strong></span></div>${current<minimum?`<div class="notice">自然買い目${bets.length}点 / 必要最低資金${minimum.toLocaleString()}円。${current.toLocaleString()}円では全点購入できません。買い目は自動で削りません。</div>`:""}`;panel.classList.remove("hidden");panel.dataset.budget=String(current);panel.dataset.mode=mode;$("purchaseBudget").oninput=e=>{panel.dataset.budget=String(Math.max(0,Number(e.target.value)||0));renderBetGroups(snapshot);renderPurchaseControls(snapshot)};$("allocationMode").onchange=e=>{panel.dataset.mode=e.target.value;renderBetGroups(snapshot);renderPurchaseControls(snapshot)};panel.querySelectorAll("[data-budget]").forEach(b=>b.onclick=()=>{panel.dataset.budget=b.dataset.budget;renderBetGroups(snapshot);renderPurchaseControls(snapshot)})}
function renderBetGroups(snapshot){
  const groups=[["本線","MAIN"],["押さえ","COVER"],["買える高配当","BUYABLE_HIGH"]],
    bets=standardSelections(snapshot),refs=referenceSelections(snapshot),panel=$("purchaseControls"),
    budget=Number(panel?.dataset.budget)||bets.reduce((s,b)=>s+(Number(b.stake)||0),0),
    mode=panel?.dataset.mode||"standard",stakes=allocatePreviewStakes(bets,budget,mode),
    thickKeys=new Set(deriveThickBets(snapshot).map(x=>x.order.join("-")));
  const groupHtml=groups.map(([label,key])=>{
    const rows=bets.map((b,i)=>({b,i})).filter(x=>x.b.category===key);
    if(rows.length)return `<section class="betCard"><h3>${label}</h3><div class="betRows">${rows.map(({b,i})=>`<div class="betRow betRowSimple"><strong>${b.order.join("-")}${thickKeys.has(b.order.join("-"))?"　🔥厚め":""}</strong><span>${b.odds?`${Number(b.odds)}倍`:"オッズ確認待ち"}${stakes?` / ${Number(stakes[i]).toLocaleString()}円`:" / 配分不可"}</span></div>`).join("")}</div></section>`;
    if(key==="MAIN"&&bets.length)return `<section class="betCard"><h3>本線</h3><div class="notice">本線に該当する購入候補なし。主展開の自然終端が購入水準に届いていないか、分類監査が必要です。</div></section>`;
    return ""
  }).join("");
  const referenceHtml=refs.length?`<section class="betCard"><h3>参考買い目</h3><div class="betRows">${refs.map(b=>`<div class="betRow betRowSimple"><strong>${b.order.join("-")}</strong><span>${b.odds?`${Number(b.odds)}倍`:"オッズ確認待ち"} / 参考・資金配分対象外</span></div>`).join("")}</div><p class="muted">REFERENCEは標準購入ではありません。購入点数・資金配分・購入的中率から除外します。</p></section>`:"";
  const thick=deriveThickBets({ ...snapshot, betSelections:bets });
  const thickHtml=thick.length?`<section class="betCard"><h3>厚め</h3><div class="betRows">${thick.map(x=>`<div class="betRow betRowSimple"><strong>${x.order.join("-")}</strong><span>${esc(x.reason)}</span></div>`).join("")}</div><p class="muted">厚めは新しい買い目ではなく、既存購入候補の中で資金配分を優先する部分集合です。明確な上位クラスタがない場合は出しません。</p></section>`:"";
  $("betGroups").innerHTML=(groupHtml+referenceHtml+thickHtml)||(snapshot.noBet?`<section class="card empty"><strong>見送り</strong><p>${esc(noBetReasonText(snapshot.noBetReason))}</p></section>`:'<section class="card empty">購入対象の買い目はありません。</section>')
}
function calcCompositeOdds(bets){const valid=bets.map(b=>Number(b.odds)).filter(v=>Number.isFinite(v)&&v>0);if(!valid.length||valid.length!==bets.length)return null;const inv=valid.reduce((s,v)=>s+1/v,0);return inv>0?1/inv:null}

function renderNodeStateAudit(audit){
  const data=audit?.terminalGenerationAudit?.nodeStateAudit;
  if(!data)return "";
  const cs=data.conditionStats||{},stageText=["FIRST","SECOND","THIRD"].map(k=>{const x=cs[k]||{};return `${k}: ${Number(x.nodes)||0}ノード / 新規条件${Number(x.newConditions)||0} / 追加条件${Number(x.extra)||0}`}).join(" ｜ ");return `<details class="supportBranchAudit"><summary>1ノード1事象・親状態継承監査（${data.passed?"整合":"要修正"}）</summary><p>検査経路 ${Number(data.checkedPathCount)||0} / 違反 ${Number(data.violationCount)||0} / 親状態継承違反 ${Number(data.inheritanceViolationCount)||0} / 1ノード1事象違反 ${Number(data.oneNodeOneEventViolationCount)||0}</p><p>${esc(stageText)}</p><p class="muted">各ノードは親状態を保持し、その着順候補に新しく必要な条件だけを追加します。条件付き成立確率は、そのノードの候補スコアと新規条件の成立しやすさから算出します。</p></details>`;
}
function renderBranchSelectionAudit(audit){const data=audit?.branchSelectionAudit;if(!data||!Array.isArray(data.rows)||!data.rows.length)return"";const priorityLabel={main:"中心予測",contender:"有力な次候補",sub:"可能性として保持",risk:"例外・リスク"};const rows=data.rows.map((branch,index)=>{const trace=Array.isArray(branch.scoreTrace)?branch.scoreTrace:[];const traceText=trace.slice(0,5).map(item=>`${esc(item.key)} ${fmtRatio(item.value)}×${fmtRatio(item.weight)}=${fmtRatio(item.contribution)}`).join(" / ");return `<div class="detailBet"><strong>${index+1}. ${esc(branch.label||branch.id||"不明")}　${esc(priorityLabel[branch.priority]||branch.priority||"-")}</strong><p>枝スコア ${fmtRatio(branch.score)} / 全枝比 ${fmtPct(branch.share)} / 首位比 ${fmtPct(branch.relativeToTop)}${branch.primaryLineId?` / ライン ${esc(branch.primaryLineId)}`:""}</p>${traceText?`<p class="muted">内訳: ${traceText}</p>`:""}</div>`}).join("");const tier=data.tiering||{};let basis;if(data.mainSelectionMode==="HIERARCHICAL_NATURAL_TIERS"){const main=(data.mainBranchLabels||[]).map(esc).join(" / ")||"なし";const contenders=(data.contenderBranchLabels||[]).map(esc).join(" / ")||"なし";const cut=Number.isFinite(tier.contenderCutGap)?` 中心に次ぐ有力群と、単に成立可能な群の自然境界差 ${fmtRatio(tier.contenderCutGap)}。`:` 中心以外に明確な有力群を示す境界がないため、残りは「可能性として保持」に留めています。`;basis=`「成立可能」と「中心として予測」を分離。最上位（同点時のみ複数）だけを中心予測とし、中心以外はスコア分布に明確な自然境界がある場合だけ有力な次候補へ昇格します。境界がない枝は削除せず「可能性として保持」します。固定90%や点数都合の切り捨ては不使用。中心: ${main} / 有力な次候補: ${contenders}。${cut}`}else{const split=data.adaptiveSplit||{};const gap=Number.isFinite(split.cutGap)?` / 境界差 ${fmtRatio(split.cutGap)}`:"";basis=data.topStructuredBranchLabel?`旧方式: 枝スコア分布の2群分割。主展開候補: ${(data.mainBranchLabels||[]).map(esc).join(" / ")||"なし"}${gap}。`:"構造枝の主展開候補なし。"}return `<h3>展開枝の事前評価</h3><div class="auditCallout"><strong>展開分類の基準</strong><p>${basis}</p></div><div class="detailGroup">${rows}</div>`}
function renderPurchaseBorderAudit(audit){const data=audit?.purchaseBorderAudit;if(!data||!Array.isArray(data.rows)||!data.rows.length)return"";const adoptedBelow=Number(data.adoptedBelowBorderCount)||0;const rc=data.raceConcentration||{};const firstMetrics=data.rows?.[0]?.metrics||{};const skipActive=Boolean(firstMetrics.skipLinkedActive);const skipText=Number.isFinite(Number(firstMetrics.skipLinkedTopFamilyCoverage))?` / 初回最上位頭カバー ${fmtPct(firstMetrics.skipLinkedTopFamilyCoverage)} / 見送り連動 ${skipActive?"発動":"なし"}`:"";const flow=data.flowAudit||firstMetrics.purchaseFlowAudit||null;const flowReasonLabels={COMPOSITE_BORDER_ZERO:"複合購入ボーダーの時点で通過0件",RACE_CONCENTRATION_BORDER_ZERO:"レース分散補正で通過0件",FAMILY_DECISION_AND_RECOVERY_ZERO:"ボーダー通過候補はあったが購入分類・初回回復後も0件",SKIP_LINKED_BORDER_ZERO:"見送り連動の追加ボーダーで通過0件",SKIP_LINKED_DECISION_ZERO:"見送り連動後の購入分類で0件",FINAL_ZERO_AFTER_PURCHASE_PIPELINE:"購入工程の最終段階で0件",STANDARD_PURCHASE_REMAINS:"標準購入あり"};const funnelStages=Array.isArray(flow?.stages)?flow.stages.map(row=>`${esc(row.stage)} ${Number(row.count)||0}件`).join(" → "):"";const failureText=(rows=[])=>rows.length?rows.map(row=>`${esc(row.code)} ${Number(row.count)||0}件`).join(" / "):"なし";const flowText=flow?`<p><strong>購入実経路:</strong> ${funnelStages||`初回 ${Number(flow.firstPassPurchased)||0}点 → 2段階目 ${flow.tightenedPurchased==null?"—":Number(flow.tightenedPurchased)}点 → 最終 ${Number(flow.finalPurchased)||0}点`}</p>${Number(flow.finalPurchased)===0?`<p><strong>標準0点の直接理由:</strong> ${esc(flowReasonLabels[flow.directReason]||flow.directReason||"不明")}</p><p class="muted">複合ボーダー主因: ${failureText(flow.baseTopFailures)}<br>分散補正後主因: ${failureText(flow.dispersionTopFailures)}${flow.skipLinkedActive?`<br>見送り連動後主因: ${failureText(flow.tightenedTopFailures)}`:""}</p>`:""}${flow.recoveryLockReason?`<p class="muted">回復制御: ${esc(flow.recoveryLockReason)}</p>`:""}`:"";const rcText=Number.isFinite(Number(rc.severity))?`展開1位 ${fmtPct(rc.topBranchShare)} / 1着集中 ${fmtPct(rc.topFamilyShare)} / 上位5終端 ${fmtPct(rc.top5Share)} / 分散度 ${fmtPct(rc.severity)}（${esc(rc.regime||"NORMAL")}）${skipText}`:"全体集中度 未記録";const rows=data.rows.filter(row=>!row.eligible||row.adopted).slice(0,60).map(row=>{const m=row.metrics||{};const status=row.adopted?"購入":"不採用";const why=Array.isArray(row.failures)&&row.failures.length?row.failures.join(" / "):"通過";const t=m.adaptiveThresholds||{};const adaptive=m.raceConcentrationAnchor?"アンカー":"適応ボーダー";return `<div class="abilityRow auditKeyValueRow"><strong>${esc(row.order)} ${esc(status)}</strong><span>終端 ${fmtPct(m.terminalRelative)} / 頭 ${fmtPct(m.familyRelative)} / 枝 ${fmtPct(m.branchRelative)} / 2着 ${fmtPct(m.secondRelative)} / 3着 ${fmtPct(m.thirdRelative)} / 条件負荷 ${fmtPct(m.burdenFactor)} / ${esc(adaptive)} [${fmtPct(t.terminal)}・${fmtPct(t.family)}・${fmtPct(t.branch)}・${fmtPct(t.second)}・${fmtPct(t.third)}] / ${esc(why)}</span></div>`}).join("");return `<h3>買い目化ボーダー監査</h3><div class="auditCallout ${adoptedBelow?"danger":""}"><strong>${adoptedBelow?"ボーダー未達の通常購入あり":"ボーダー未達の通常購入なし"}</strong><p>${rcText}</p>${flowText}<p>通過 ${Number(data.eligibleCount)||0}件 / 未達 ${Number(data.rejectedCount)||0}件。v218では見送り連動の2段階目ボーダー発動後、確率質量カバー不足を理由に派生終端を再追加する2回目回復を禁止します。</p><p class="muted">基準値: 終端45% / 頭45% / 枝50% / 2着50% / 3着50%。分散補正に加え、見送り連動発動時は派生終端へ終端+6pt・頭+8pt・枝+7pt・2着+5pt・3着+5ptを追加。アンカー終端は追加締め付け対象外、高配当は別の妙味ゲートで評価します。</p></div>${rows?`<div class="abilityList auditKeyValueList">${rows}</div>`:""}`};
function renderPurchaseFamilyAudit(audit){
  const data=audit?.purchaseFamilyAudit;
  if(!data||!Array.isArray(data.rows)||!data.rows.length)return"";
  const tierLabel={main:"中心予測の頭",contender:"有力な次候補の頭",sub:"可能性として保持する頭",risk:"例外・リスク頭"};
  const totalProbability=Number(audit?.terminalProbabilitySum)||1;
  const rows=data.rows.map(row=>{
    const headShare=Number.isFinite(Number(row.probabilityShare))?Number(row.probabilityShare):(Number(row.probability)||0)/totalProbability;
    const adoptedShare=Number.isFinite(Number(row.adoptedProbabilityShare))?Number(row.adoptedProbabilityShare):(Number(row.adoptedProbability)||0)/totalProbability;
    const rejectedShare=Number.isFinite(Number(row.rejectedProbabilityShare))?Number(row.rejectedProbabilityShare):Math.max(0,headShare-adoptedShare);
    const coverage=Number.isFinite(Number(row.adoptedCoverage))?Number(row.adoptedCoverage):(Number(row.probability)>0?(Number(row.adoptedProbability)||0)/Number(row.probability):0);
    const coverageLabel=row.coverageLabel||(coverage>=.70?"カバー良好":coverage>=.50?"カバー注意":"カバー要監査");
    const coverageClass=coverage>=.70?"success":coverage>=.50?"warning":"danger";
    const target=row.coverageTarget!=null&&Number.isFinite(Number(row.coverageTarget))?Number(row.coverageTarget):.70;
    const primary=Boolean(row.isPrimaryFirstFamily);
    const targetText=primary?` / <b>優先カバー目標</b> ${fmtPct(target)}${row.coverageTargetMet?" 達成":" 未達"}`:` / 補完目標 ${fmtPct(target)}`;
    const candidateText=Number.isFinite(Number(row.candidateCoverage))?` / 構造上カバー可能 ${fmtPct(Number(row.candidateCoverage))}`:"";
    return `<div class="detailBet"><div class="sectionHead"><strong>${row.first}番頭　${primary?"★最上位頭 / ":""}${esc(tierLabel[row.tier]||row.tier||"-")}</strong><span class="pill ${coverageClass}">${esc(coverageLabel)}</span></div><p><b>頭確率</b> ${fmtPct(headShare)} / <b>購入でカバー</b> ${fmtPct(adoptedShare)}（頭内 ${fmtPct(coverage)}）${targetText} / <b>未採用</b> ${fmtPct(rejectedShare)}</p><p class="muted">生成 ${row.generated}終端 / 自然候補 ${row.naturalCandidateCount} / 採用 ${row.adopted}（本線${row.main}・押さえ${row.cover}・高配当${row.buyableHigh}）${candidateText}</p></div>`;
  }).join("");
  return `<h3>1着ファミリー購入カバー監査</h3><div class="auditCallout"><strong>最上位頭を先にカバーしてから別頭へ</strong><p>最も1着確率が高いファミリーを先に確率質量順で採用し、その頭のカバー目標に到達してから有力別頭・高配当を補完します。点数固定ではなく、同じ頭の2着・3着独立支持と累積確率で決めます。</p><p class="muted">最上位頭の暫定目標は頭集中度に応じ70〜80%。構造支持だけでは目標まで届かない場合は無理に買い目を追加せず、未達として監査に残します。</p></div><div class="detailGroup">${rows}</div>`;
}
function renderAdoptedTerminalAudit(audit){const rows=Array.isArray(audit?.adoptedTerminalAudit)?audit.adoptedTerminalAudit:[];if(!rows.length)return"";const priorityLabel={main:"本命展開",contender:"有力展開",sub:"別展開",risk:"リスク枝",unknown:"不明"};const tierCounts=audit.adoptedBranchTierCounts||{};const tierSummary=["main","contender","sub","risk"].filter(key=>Number(tierCounts[key]||0)>0).map(key=>`${priorityLabel[key]} ${tierCounts[key]}点`).join(" / ");const branchRows=Object.entries(audit.adoptedBranchCounts||{}).sort((a,b)=>b[1]-a[1]).map(([label,count])=>`<div class="abilityRow"><strong>${esc(label)}</strong><span>${count}件</span></div>`).join("");const terminalRows=rows.map(item=>{const r=item.decisionRatios||{};const ratios=`1着 ${fmtRatio(r.first)} / 2着 ${fmtRatio(r.second)} / 3着 ${fmtRatio(r.third)}`;const supportBranches=Array.isArray(item.supportBranches)?item.supportBranches:[];const supportPreview=supportBranches.slice(0,8),supportRows=supportPreview.map((branch,index)=>`<div class="abilityRow"><strong>${index+1}. ${esc(branch.branchLabel||branch.branchId||"不明")}</strong><span>${esc(priorityLabel[branch.branchPriority]||branch.branchPriority||"-")} / 寄与 ${fmtRatio(branch.probability)} / 枝内適合 ${fmtRatio(branch.withinBranchFit)} / 枝強度 ${fmtRatio(branch.branchStrengthRatio)} / 加重 ${fmtRatio(branch.weightedSupport)}</span></div>`).join("");const dup=Array.isArray(item.duplicateSupportLabels)&&item.duplicateSupportLabels.length?`<p class="auditWarn">重複ラベル: ${item.duplicateSupportLabels.map(x=>`${esc(x.label)}×${x.count}`).join(" / ")}</p>`:"";const value=Number(item.expectedValueIndex);const probability=Number(item.probability);const auditLine=`終端確率 ${Number.isFinite(probability)?fmtPct(probability):"-"} / 全${audit.generatedTerminalCount||"-"}終端中 ${item.globalRank??"-"}位 / ${item.firstFamilyNumber??"-"}番頭内 ${item.familyRank??"-"}位 / 同1-2着内 ${item.pairRank??"-"}位${Number.isFinite(Number(item.odds))?` / オッズ ${Number(item.odds).toFixed(1)}倍`:""}${Number.isFinite(value)?` / 確率×オッズ ${value.toFixed(2)}`:""}`;const familyAudit=item.firstFamilyNumber?`<p class="muted">1着ファミリー: ${item.firstFamilyNumber}番頭 / ${esc(item.firstFamilyTier||"-")} / 頭確率 ${fmtPct(item.firstFamilyProbability)}${Number.isFinite(Number(item.firstFamilyProbabilityShare))?`（全体${fmtPct(item.firstFamilyProbabilityShare)}）`:""} / 2着首位比 ${fmtRatio(item.secondFamilyRelativeToBest)} / 3着首位比 ${fmtRatio(item.thirdFamilyRelativeToBest)}${Number.isFinite(Number(item.subValueIndex))?` / 別展開妙味指数 ${Number(item.subValueIndex).toFixed(2)}`:""}</p>`:"";const thirdAudit=item.thirdVariantGroupSize?`<p class="muted">旧枝内3着監査: 群${item.thirdVariantGroupSize}件 / 首位比 ${fmtRatio(item.thirdVariantRelativeToBest)} / 群内確率質量 ${fmtRatio(item.thirdVariantConditionalShare)}${item.thirdVariantNaturalCutDetected?` / 自然境界差 ${fmtRatio(item.thirdVariantCutGap)}`:" / 明確な自然境界なし"}</p>`:"";const oddsAudit=item.highPayoutAttribute?`<p class="muted">高配当属性: ${esc(item.highPayoutAttributeLabel||"高配当")}（実オッズ評価済み・展開ランクは変更しない）</p>`:item.highPayoutCandidate?`<p class="muted">高配当候補: ${item.oddsEvaluationStatus==="ODDS_AVAILABLE"?"実オッズ評価済み":"オッズ待ち（買える高配当には未昇格）"}</p>`:"";const tier=item.dominantBranchTierLabel||priorityLabel[item.dominantBranchPriority]||"不明";return `<div class="detailBet"><strong>${esc(item.order)}　${esc(item.betClass||"")}</strong><p><b>採用監査</b> ${auditLine}</p><p><b>採用理由</b> ${esc(item.purchaseReason||"-")}</p><p><b>展開ランク ${esc(tier)}</b> / ${esc(item.dominantBranchLabel||"由来枝不明")} / 枝適合 ${fmtRatio(item.branchFit)} / 枝内${item.branchRank??"-"}位 / 由来枝${item.branchSupport??0}（固有${item.uniqueSupportBranchCount??item.branchSupport??0}） / 加重支持 ${fmtRatio(item.weightedBranchSupport)}</p><p class="muted">${ratios}</p>${familyAudit}${thirdAudit}${oddsAudit}${supportRows?`<details class="supportBranchAudit"><summary>支持枝を見る（${supportBranches.length}本）</summary><div class="abilityList">${supportRows}</div>${supportBranches.length>supportPreview.length?`<p class="muted">表示負荷を抑えるため先頭${supportPreview.length}本を表示。残り${supportBranches.length-supportPreview.length}本は保存データ内に保持しています。</p>`:""}${dup}</details>`:""}</div>`}).join("");return `<h3>採用終端の購入監査</h3>${tierSummary?`<div class="auditCallout"><strong>採用買い目の展開ランク内訳</strong><p>${esc(tierSummary)}</p><p class="muted">各買い目について、終端確率・全体順位・1着ファミリー順位・オッズ妙味・採用理由を同時に確認します。</p></div>`:""}${branchRows?`<div class="abilityList">${branchRows}</div>`:""}<div class="detailGroup">${terminalRows}</div>`}
function betClassLabel(category){return({MAIN:"本線",COVER:"押さえ",BUYABLE_HIGH:"買える高配当",REFERENCE:"参考買い目"})[category]||"購入候補"}
function friendlyPurchaseReason(b){
  const order=Array.isArray(b?.order)?b.order.map(Number):[];
  const [first,second,third]=order;
  const category=b?.category||"";
  const familyTier=String(b?.firstFamilyTier||"").toLowerCase();
  const pieces=[];
  if(category==="MAIN")pieces.push(`${first||"この選手"}番を1着とする主展開から自然に残った組み合わせ`);
  else if(category==="COVER")pieces.push(`${first||"この選手"}番を1着とする有力な補完展開として残った組み合わせ`);
  else if(category==="BUYABLE_HIGH")pieces.push(`別展開でも成立可能性があり、実オッズまで確認して購入価値が残った組み合わせ`);
  else pieces.push(`展開と着順評価から購入候補に残った組み合わせ`);
  if(second&&third)pieces.push(`${second}番の2着評価と${third}番の3着評価を個別に確認`);
  const famProb=Number(b?.firstFamilyProbabilityShare ?? b?.firstFamilyProbability);
  if(Number.isFinite(famProb)&&famProb>0)pieces.push(`${first}番頭の全体確率は約${(famProb*100).toFixed(1)}%`);
  if(Number.isFinite(Number(b?.familyRank)))pieces.push(`${first}番頭の中で${Number(b.familyRank)}位`);
  return pieces.join("。")+"。";
}
function friendlyPurchaseChecks(b){
  const rows=[];
  const probability=Number(b?.probability);
  const odds=Number(b?.odds);
  if(Number.isFinite(probability))rows.push(`この並びの推定確率 ${fmtPct(probability)}`);
  if(Number.isFinite(odds))rows.push(`実オッズ ${odds.toFixed(1)}倍`);
  if(Number.isFinite(Number(b?.globalRank)))rows.push(`全終端中 ${Number(b.globalRank)}位`);
  if(Number.isFinite(Number(b?.familyRank)))rows.push(`同じ1着候補内 ${Number(b.familyRank)}位`);
  if(Number.isFinite(Number(b?.pairRank)))rows.push(`同じ1-2着内 ${Number(b.pairRank)}位`);
  return rows;
}
function friendlyPurchaseCaution(b){
  const odds=Number(b?.odds);
  if(b?.category==="MAIN"&&Number.isFinite(odds)&&odds>=100)return "高配当だから本線なのではなく、主展開由来で本線に分類されています。";
  if(b?.category==="BUYABLE_HIGH")return "高配当だけを理由に採用せず、別展開の成立可能性と実オッズの両方を確認しています。";
  if(b?.category==="COVER")return "本線とは別の有力な残り方を補う買い目です。";
  return "";
}
function renderFriendlyBetReason(b){
  const order=Array.isArray(b?.order)?b.order.join("-"):esc(b?.order||"-");
  const label=betClassLabel(b?.category);
  const checks=friendlyPurchaseChecks(b);
  const caution=friendlyPurchaseCaution(b);
  const rawReason=b?.reason||"";
  const rawBranch=b?.branchLabel||"";
  return `<div class="detailBet"><strong>${esc(order)}　${esc(label)}</strong><p><b>なぜ買う？</b> ${esc(friendlyPurchaseReason(b))}</p>${checks.length?`<p class="muted"><b>判断材料</b> ${checks.map(esc).join(" / ")}</p>`:""}${caution?`<p class="auditWarn"><b>分類チェック</b> ${esc(caution)}</p>`:""}<details class="supportBranchAudit"><summary>詳しい監査情報</summary>${rawReason?`<p><b>内部の採用理由</b> ${esc(rawReason)}</p>`:""}${rawBranch?`<p class="muted"><b>保存された展開ラベル</b> ${esc(rawBranch)}</p>`:""}${b?.evidenceSummary?`<p class="muted"><b>根拠データ</b> ${esc(b.evidenceSummary)}</p>`:""}<p class="muted">内部コードや枝ラベルは開発・監査用です。通常判断は上の日本語説明を基準にします。</p></details></div>`;
}
function safeFriendlyBetReason(b){try{return renderFriendlyBetReason(b)}catch(error){console.error("friendly purchase reason render failed",error);const order=Array.isArray(b?.order)?b.order.join("-"):String(b?.order||"-");return `<div class="detailBet"><strong>${esc(order)}　${esc(betClassLabel(b?.category))}</strong><p class="muted">買い目の理由表示だけ読み込めませんでした。保存済み買い目は保持されています。</p></div>`}}
function renderChatPredictionImport(){
  const panel=$("chatPredictionImport");if(!panel||!state.race)return;
  const saved=findChatPrediction(localStorage,state.race);
  const main=saved?.mainScenario;
  const comparison=saved&&state.snapshot?compareChatAndApp(saved,state.snapshot):null;
  if(comparison)recordChatDiffTrend(localStorage,state.race,comparison);
  const comparisonHtml=renderChatAppComparison(comparison,saved);
  const summary=saved?`<div class="chatImportSaved"><div class="sectionHead"><strong>チャット予想 保存済み</strong><span class="pill success">比較用</span></div>${main?.description?`<p><b>主展開</b> ${esc(main.description)}</p>`:""}<p class="muted">選手印 ${saved.riderMarks?.length||0}人 / 1着候補 ${saved.firstCandidates?.length||0}件 / 1-2着枝 ${saved.pairBranches?.length||0}件 / 終端 ${saved.terminals?.length||0}件</p>${comparisonHtml}<button id="removeChatPrediction" class="secondary" type="button">取り込みを削除</button></div>`:"";
  panel.innerHTML=`<div class="sectionHead"><div><small>比較・修正点洗い出し用</small><h2>チャット予想を取り込む</h2></div><span class="pill">STEP 2-3</span></div><p class="muted">チャット予想はアプリ予想を上書きしません。保存後、同じレースのアプリ予想と工程ごとに比較し、最初にズレた場所を表示します。</p>${summary}<details class="predictionAccordion"><summary>${saved?"チャット予想を更新する":"チャット予想を貼り付ける"}</summary><div class="accordionBody"><textarea id="chatPredictionText" class="chatPredictionTextarea" rows="10" placeholder='チャットで「アプリ取り込み形式で出して」と依頼し、JSON全体をここへ貼り付け'></textarea><div id="chatPredictionImportMessage" class="muted"></div><button id="saveChatPrediction" class="primary" type="button">チャット予想を保存</button><details class="supportBranchAudit"><summary>必要な形式を見る</summary><pre class="chatPredictionExample">${esc(chatPredictionExample(state.race))}</pre></details></div></details>`;
  const saveBtn=$("saveChatPrediction"),textarea=$("chatPredictionText"),message=$("chatPredictionImportMessage");
  if(saveBtn&&textarea)saveBtn.onclick=()=>{try{const parsed=parseChatPrediction(textarea.value,state.race);saveChatPrediction(localStorage,parsed);renderChatPredictionImport()}catch(error){if(message){message.className="auditWarn";message.textContent=error?.message||String(error)}}};
  const removeBtn=$("removeChatPrediction");if(removeBtn)removeBtn.onclick=()=>{removeChatPrediction(localStorage,state.race);renderChatPredictionImport()};
}
function renderChatAppComparison(comparison,saved){
  if(!saved)return"";
  if(!state.snapshot)return `<section class="chatDiffBox"><div class="sectionHead"><strong>チャット対アプリ差分監査</strong><span class="pill warning">アプリ予想待ち</span></div><p class="muted">チャット予想は保存済みです。このレースをアプリでも予想すると、自動で差分監査を開始します。</p></section>`;
  if(!comparison)return"";
  const first=comparison.firstDivergence;
  const headline=first?`最初のズレ：${esc(first.label)}`:"主要工程は一致";
  const headlineClass=first?"auditWarn":"auditOk";
  const stageRows=(comparison.stages||[]).map(stage=>{
    const icon=stage.status==="OK"?"○":stage.status==="DIFF"?"!":"△";
    const cls=stage.status==="OK"?"diffOk":stage.status==="DIFF"?"diffBad":"diffUnknown";
    const details=renderChatDiffDetails(stage);
    return `<div class="chatDiffStage ${cls}"><strong>${icon} ${esc(stage.label)}</strong><p>${esc(stage.summary||"")}</p>${details}</div>`;
  }).join("");
  const trend=renderChatDiffTrendSummary();
  return `<section class="chatDiffBox"><div class="sectionHead"><strong>チャット対アプリ差分監査</strong><span class="pill ${first?"warning":"success"}">${first?"差分あり":"主要工程一致"}</span></div><p class="${headlineClass}"><b>${headline}</b>${first?.summary?` — ${esc(first.summary)}`:""}</p><p class="muted">比較順：選手印 → 1着評価 → 1-2着枝 → 3着終端 → 買い目分類 → 購入採否。後段の差より、最初にズレた工程を優先して修正します。</p>${trend}<details class="predictionAccordion"><summary>差分の内訳を見る</summary><div class="accordionBody">${stageRows}<p class="muted">終端数 チャット ${comparison.totals?.chatTerminals??0} / アプリ ${comparison.totals?.appTerminals??0}　購入 チャット ${comparison.totals?.chatPurchased??0} / アプリ ${comparison.totals?.appPurchased??0}</p></div></details></section>`;
}

function renderChatDiffTrendSummary(){
  const summary=summarizeChatDiffTrends(loadChatDiffTrends(localStorage));
  if(!summary.raceCount)return"";
  const rows=(summary.stages||[]).filter(s=>s.compared>0).map(s=>`<div class="chatTrendRow"><span>${esc(s.label)}</span><strong>${s.diffRaces}/${s.compared}R</strong><small>${Math.round(s.diffRate*100)}%</small></div>`).join("");
  const p=summary.priority;
  const priority=p?`<p class="auditWarn"><b>現在の優先修正：${esc(p.label)}</b> — ${p.compared}R中${p.diffRaces}Rで差分（${Math.round(p.diffRate*100)}%）</p>`:"";
  return `<details class="predictionAccordion chatTrendAudit" open><summary>複数レースの差分傾向（${summary.raceCount}R）</summary><div class="accordionBody">${priority}<div class="chatTrendGrid">${rows}</div><p class="muted">同じレースを再比較した場合は最新結果で置き換えます。終端本体は重複保存せず、工程別の差分だけを軽量保存します。</p></div></details>`;
}
function renderChatDiffDetails(stage){
  const d=stage?.details||{};let rows=[];
  if(Array.isArray(d.chatOnly)&&d.chatOnly.length)rows.push(`チャットにあってアプリにない: ${d.chatOnly.slice(0,12).map(esc).join(" / ")}${d.chatOnly.length>12?` ほか${d.chatOnly.length-12}件`:""}`);
  if(Array.isArray(d.rows)&&d.rows.length)rows.push(d.rows.slice(0,10).map(r=>`${esc(r.key)}：チャット ${esc(diffValueLabel(r.chat))} / アプリ ${esc(diffValueLabel(r.app))}`).join("<br>"));
  if(Number.isFinite(Number(d.appOnlyCount))&&Number(d.appOnlyCount)>0)rows.push(`アプリだけにある終端: ${Number(d.appOnlyCount)}件`);
  return rows.length?`<p class="muted">${rows.join("<br>")}</p>`:"";
}
function diffValueLabel(v){return({MAIN:"本線",COVER:"押さえ",BUYABLE_HIGH:"買える高配当",REFERENCE:"参考買い目",ADOPTED:"購入",REJECTED:"不採用",UNCLASSIFIED:"未分類",UNSPECIFIED:"未指定"})[v]||String(v||"-")}
function chatPredictionExample(race){return JSON.stringify({schemaVersion:"CHAT-KEIRIN-IMPORT-v1",race:{date:String(race?.date||"").replace(/\D/g,"").slice(0,8),venueCode:String(race?.venueCode||""),venueName:race?.venueName||"",raceNo:Number(race?.raceNo)||0},mainScenario:{title:"主展開",description:"誰が主導権を取り、誰がどの位置から残るかを日本語で記載",evidence:["主展開を支持する根拠"],counterEvidence:["反対材料"]},riderMarks:[{number:1,overallMark:"◎",firstMark:"◎",secondMark:"○",thirdMark:"△",reason:"印の理由"}],firstCandidates:[{number:1,rank:1,probability:0.30,reason:"1着候補の理由"}],pairBranches:[{order:[1,2],rank:1,probability:0.12,scenario:"主展開",reason:"1-2着になる理由"}],terminals:[{order:[1,2,3],rank:1,probability:0.05,category:"MAIN",purchaseStatus:"ADOPTED",scenario:"主展開",reason:"3着まで含めた終端理由"}],ratings:{confidence:3,concentration:3,rollover:2,verdict:"通常"},notes:[]},null,2)}
function renderPredictionDetail(snapshot){
  const panel=$("predictionDetail"),ratingPanel=$("detailRatings");
  if(!panel)return;
  if(!snapshot){panel.classList.add("hidden");panel.innerHTML="";if(ratingPanel)ratingPanel.classList.add("hidden");return}
  try{renderRatings(ratingPanel,snapshot)}catch(error){console.error("rating detail render failed",error);if(ratingPanel){ratingPanel.classList.add("hidden");ratingPanel.innerHTML=""}}
  try{
    const selections=displaySelections(snapshot);
    const abilitiesUsed=Array.isArray(snapshot?.abilitiesUsed)?snapshot.abilitiesUsed:[];
    const groups=[["本線","MAIN"],["押さえ","COVER"],["買える高配当","BUYABLE_HIGH"],["参考買い目","REFERENCE"]];
    const betDetail=groups.map(([label,key])=>{
      const bets=selections.filter(b=>b?.category===key);
      if(!bets.length)return"";
      return `<div class="detailGroup"><h3>${label}</h3>${bets.map(safeFriendlyBetReason).join("")}</div>`
    }).join("");
    const participantMap=new Map((Array.isArray(snapshot?.participants)?snapshot.participants:[]).map(p=>[Number(p.number),p]));
    const abilities=abilitiesUsed.map(a=>{const p=participantMap.get(Number(a?.number))||{},v2=a?.riderEvaluationV2||{},fm=v2?.firstMechanisms||{},sm=v2?.secondMechanisms||{},tm=v2?.thirdMechanisms||{},rs=a?.roleScores||{};return `<div class="abilityRow"><strong>${a?.number??"-"}番</strong><span><b>${esc(p?.name||"")}</b>　1着 ${fmtAbility(rs.first)} / 2着 ${fmtAbility(rs.second)} / 3着 ${fmtAbility(rs.third)} / 信頼 ${esc(v2?.confidence||"不明")}<br><small>選手評価v2: 逃げ ${fmtAbility(fm.escape)} / 捲り ${fmtAbility(fm.makuri)} / 差し ${fmtAbility(fm.sashi)} / 番手差し ${fmtAbility(fm.banteSashi)} / 2着追走 ${fmtAbility(sm.lineFollower)} / 先行残り ${fmtAbility(sm.leaderRemain)} / 3着位置残り ${fmtAbility(tm.positionRemain)}</small><br><small>基礎: 近況 ${fmtAbility(a?.recentForm)} / 主導権 ${fmtAbility(a?.startPower)} / まくり ${fmtAbility(a?.sprintPower)} / 差し ${fmtAbility(a?.finishPower)} / 追走 ${fmtAbility(a?.trackingSkill)}</small></span></div>`}).join("");
    const audit=snapshot?.predictionOutput?.audit&&typeof snapshot.predictionOutput.audit==="object"?snapshot.predictionOutput.audit:{};
    const riderBranchLinkHtml=renderRiderBranchLinkAudit(audit?.riderBranchLinkAudit);
    const wholeLinkageHtml=renderWholeLinkageAudit(audit?.wholeLinkageAudit);
    const extraConditionHtml=renderExtraConditionAudit(audit?.chatSpecV1?.extraConditionAudit);
    const scenarioExplanationHtml=renderScenarioExplanation(snapshot);
    const hasAudit=Number.isFinite(Number(audit.generatedTerminalCount));
    const auditSummary=hasAudit?`<details id="purchaseAuditDetails" class="predictionAccordion"><summary>詳しい購入監査を見る（開発用）</summary><div id="purchaseAuditBody" class="accordionBody"><p class="muted">監査データは詳細を開いた時だけ描画します。レース詳細の表示を優先しています。</p></div></details>`:"";
    panel.innerHTML=`<div class="sectionHead"><div><small>保存済み予想の根拠</small><h2>予想詳細</h2></div><span class="pill">詳細</span></div>${scenarioExplanationHtml}${renderNodeStateAudit(snapshot?.audit)}${riderBranchLinkHtml}${extraConditionHtml}${wholeLinkageHtml}${auditSummary}<details class="predictionAccordion"><summary>買い目の理由を見る</summary><div class="accordionBody">${betDetail||'<p class="muted">購入候補はありません。</p>'}</div></details>${abilities?`<details class="predictionAccordion" open><summary>着順別評価を見る</summary><div class="accordionBody"><p class="muted">印を介さず、1着・2着・3着の独立評価と展開役割を直接表示します。買い目との矛盾は全体連動監査で確認します。</p><div class="abilityList">${abilities}</div></div></details>`:""}${renderStartPowerInputAuditSafe(snapshot)}`;
    panel.classList.remove("hidden");
    const auditDetails=$("purchaseAuditDetails"),auditBody=$("purchaseAuditBody");
    if(auditDetails&&auditBody)auditDetails.addEventListener("toggle",()=>{if(!auditDetails.open||auditBody.dataset.loaded==="1")return;auditBody.dataset.loaded="1";renderPurchaseAuditLazy(audit,auditBody)},{once:false});
  }catch(error){
    console.error("prediction detail render failed",error);
    panel.innerHTML=`<div class="sectionHead"><div><small>保存済み予想の根拠</small><h2>予想詳細</h2></div><span class="pill danger">一部表示エラー</span></div><div class="auditWarning"><strong>詳細表示の一部だけ読み込めませんでした</strong><p>${esc(error?.message||String(error))}</p><p class="muted">この表示エラーでレース画面や保存済み予想を開けなくならないよう保護しています。</p></div>`;
    panel.classList.remove("hidden");
  }
}


function renderScenarioExplanation(snapshot){
  const explanation=snapshot?.predictionExplanation||snapshot?.prediction?.explanation||null;
  const bets=standardSelections(snapshot);
  const predictionHtml=renderPredictionAxisExplanation(explanation,snapshot?.prediction?.probabilityPathAudit||snapshot?.probabilityPathAudit||null,snapshot?.prediction?.conditionalProbabilityDistributionAudit||snapshot?.conditionalProbabilityDistributionAudit||null);
  const purchaseHtml=renderPurchaseScenarioExplanation(snapshot,bets);
  return `${predictionHtml}${purchaseHtml}`;
}

function renderPredictionAxisExplanation(explanation,probabilityPathAudit=null,conditionalDistributionAudit=null){
  const axis=explanation?.axis;
  if(!axis?.timeline)return `<div class="auditCallout"><strong>予測エンジンの軸展開</strong><p>保存された予測側の展開説明がありません。旧予想データの可能性があります。</p></div>`;
  const reasons=(axis.reasons||[]).map(r=>`<li>${esc(r.text||"")}</li>`).join("");
  const orders=(axis.naturalOrders||[]).slice(0,4).map(x=>`${(x.order||[]).join("-")} ${Number.isFinite(Number(x.terminalProbability))?`(${(Number(x.terminalProbability)*100).toFixed(2)}%)`:""}`).join(" / ");
  const alternatives=(explanation?.alternatives||[]).slice(0,3).map(a=>`<div class="detailBet"><strong>${esc(a.branchLabel||"代替展開")}</strong><p>${esc(a.timeline||"")}</p><p class="muted">枝寄与 ${(Number(a.branchProbabilityMass||0)*100).toFixed(1)}%${a.primaryOrder?.length?` / 代表終端 ${esc(a.primaryOrder.join("-"))}`:""}</p></div>`).join("");
  return `<details class="predictionAccordion" open><summary>軸になった展開と根拠</summary><div class="accordionBody">
    <div class="auditCallout"><strong>軸になった展開</strong><p>${esc(axis.timeline)}</p><p class="muted">予測枝 ${esc(axis.branchLabel||axis.branchId||"")} / 枝寄与 ${(Number(axis.branchProbabilityMass||0)*100).toFixed(1)}%${axis.primaryOrder?.length?` / 代表終端 ${esc(axis.primaryOrder.join("-"))}`:""}</p></div>
    <div class="auditCallout"><strong>この展開を軸にした根拠</strong>${reasons?`<ul>${reasons}</ul>`:'<p>根拠データなし</p>'}</div>
    ${renderAxisSelectionAudit(explanation?.axisSelectionAudit,axis)}
    ${renderLeaderHoldComparison(explanation?.leaderHoldComparison,axis)}
    ${orders?`<p class="muted"><b>この展開から自然につながる上位終端</b> ${esc(orders)}</p>`:""}
    ${alternatives?`<details class="predictionAccordion"><summary>代替展開を見る</summary><div class="accordionBody">${alternatives}</div></details>`:""}
    ${renderProbabilityPathAudit(probabilityPathAudit,axis?.primaryOrder)}
    ${renderConditionalDistributionAudit(conditionalDistributionAudit,axis?.primaryOrder)}
    <p class="muted">この説明は買い目ではなく、予測エンジンが保存した展開枝・着順条件・終端確率から生成しています。オッズ・購入分類・資金配分は使っていません。</p>
  </div></details>`;
}



function renderAxisSelectionAudit(audit,axis){
  if(!audit?.rows?.length)return "";
  const rows=audit.rows.slice(0,5).map(r=>`<li>${r.rank}位 ${esc(r.branchLabel||r.branchId||"")} / 終端確率質量 ${(Number(r.branchProbabilityMass||0)*100).toFixed(2)}% / branch score ${Number(r.branchScore||0).toFixed(3)}</li>`).join("");
  const mismatch=!audit?.audit?.axisMatchesSelection;
  const scoreNote=audit.selectionDrivenByMass?`<p><b>注意:</b> branch score最大の枝ではなく、終端確率質量が大きい枝が軸に選ばれています。</p>`:"";
  return `<details class="predictionAccordion" open><summary>実際の軸選択順位</summary><div class="accordionBody"><div class="auditCallout"><p>軸選択順: <b>終端確率質量 → branch score → ID</b>。比較対象は先にCENTER/main候補へ限定されます。</p><ul>${rows}</ul>${scoreNote}${mismatch?`<p><b>整合性エラー:</b> 保存された軸branchと再計算した1位branchが一致しません。</p>`:""}</div></div></details>`;
}

function renderLeaderHoldComparison(audit,axis){
  if(!audit?.rows?.length||!["LEADER_HOLD","BANTE_SASHI"].includes(axis?.branchType))return "";
  const axisNo=Number(audit.axisNumber);
  const rows=[...audit.rows].sort((a,b)=>{
    if(Number(a.number)===axisNo)return -1;
    if(Number(b.number)===axisNo)return 1;
    return (b.branchGenerated-a.branchGenerated)||((Number(b.branchScore)||-1)-(Number(a.branchScore)||-1));
  });
  const rowHtml=rows.map(row=>{
    const score=Number.isFinite(Number(row.branchScore))?Number(row.branchScore).toFixed(3):"—";
    const state=row.branchGenerated?`先行押し切り枝あり / score ${score}`:row.exclusionReason==="NOT_OFFICIAL_LINE_LEADER"?"先行押し切り枝なし：公式ラインの先頭役ではない":"先行押し切り枝なし：ライン信頼度または先行根拠ゲートで停止";
    const factors=(row.factors||[]).map(f=>{
      const value=Number.isFinite(Number(f.value))?Number(f.value).toFixed(2):"欠損";
      const contrib=Number.isFinite(Number(f.contribution))?` → 寄与 ${Number(f.contribution).toFixed(3)}`:"";
      return `${esc(f.label)} ${value}${contrib}`;
    }).join(" / ");
    return `<li><b>${row.number}番 ${esc(row.name||"")}${Number(row.number)===axisNo?"（軸）":""}</b>：${esc(state)}<br><span class="muted">${factors}</span></li>`;
  }).join("");
  const decisive=(audit.decisiveFactors||[]).slice(0,5).map(f=>{
    const sign=Number(f.delta)>=0?"軸側+":"軸側";
    return `<li>${esc(f.label)}：${sign}${Number(f.delta||0).toFixed(3)}（軸 ${Number(f.axisValue||0).toFixed(2)} / 比較 ${Number(f.rivalValue||0).toFixed(2)}）</li>`;
  }).join("");
  const rival=audit.strongestRivalNumber?`最強の他先行枝は${audit.strongestRivalNumber}番。`:"比較できる他の先行押し切り枝はありません。";
  const user=audit.userFacingComparison||null;
  const axisAdv=(user?.axisAdvantages||[]).slice(0,3).map(x=>`${esc(x.label)} +${Number(x.delta||0).toFixed(3)}`).join(" / ");
  const rivalAdv=(user?.rivalAdvantages||[]).slice(0,3).map(x=>`${esc(x.label)} ${Number(x.delta||0).toFixed(3)}`).join(" / ");
  const userHtml=user?`<div class="auditCallout"><strong>${esc(user.headline||"軸候補比較")}</strong><p>${esc(user.summary||"")}</p>${user.mode==="HEAD_TO_HEAD"?`<p><b>軸側が上回った項目</b> ${axisAdv||"なし"}</p><p><b>比較側が上回った項目</b> ${rivalAdv||"なし"}</p>`:""}<p class="muted">この比較は発走前の予測枝scoreと構成要素だけから生成しています。結果・オッズ・購入結果は使っていません。</p></div>`:"";
  return `<details class="predictionAccordion" open><summary>なぜこの先行役を軸にしたか</summary><div class="accordionBody">${userHtml}<div class="auditCallout"><strong>先行押し切り枝の入口比較</strong><p>${esc(rival)} 能力値が高くても、公式ライン先頭役でなければLEADER_HOLD枝は生成されません。</p><ul>${rowHtml}</ul></div>${decisive?`<div class="auditCallout"><strong>枝が両方ある場合の逆転要因</strong><ul>${decisive}</ul><p class="muted">branch scoreは 1着適性22%・先行押し切り力43%・主導権獲得力20%・直近10%・末脚5%（欠損時は残存項目で再正規化）の加重合成です。</p></div>`:""}</div></details>`;
}

function renderProbabilityPathAudit(audit,primaryOrder=[]){
  if(!audit?.rows?.length)return "";
  const key=(primaryOrder||[]).join("-");
  const row=audit.rows.find(r=>(r.order||[]).join("-")===key)||audit.rows[0];
  if(!row)return "";
  const pct=v=>`${(Number(v||0)*100).toFixed(2)}%`;
  const sibling=(audit.siblingGroups||[]).find(g=>String(g.key||"").endsWith(`|${row.order?.[0]}|${row.order?.[1]}`)&&g.items?.some(x=>(x.order||[]).join("-")===row.order.join("-")));
  const sibHtml=sibling?.items?.slice(0,6).map(x=>`<li>${esc((x.order||[]).join("-"))}: 3着条件 ${pct(x.thirdConditional)} / 3着score ${Number(x.thirdScore||0).toFixed(3)} / 最終 ${pct(x.terminalProbability)}</li>`).join("")||"";
  return `<details class="predictionAccordion"><summary>確率経路監査を見る</summary><div class="accordionBody"><div class="auditCallout"><strong>${esc((row.order||[]).join("-"))} が最終確率になるまで</strong><p>条件付き連鎖: 1着 ${pct(row.conditionalProbabilities?.first)} × 2着 ${pct(row.conditionalProbabilities?.second)} × 3着 ${pct(row.conditionalProbabilities?.third)} = <b>${pct(row.conditionalChainProduct)}</b></p><p>実際の最終確率: <b>${pct(row.finalProbability)}</b></p><p class="muted">最終確率は上の条件付き確率積を直接使わず、position score積 → 差分条件 → 枝内正規化 → branch寄与 → 複数枝合算 → 全終端正規化で作られています。</p></div>${sibHtml?`<div class="auditCallout"><strong>${row.order?.[0]}-${row.order?.[1]}-* の3着比較</strong><ul>${sibHtml}</ul>${sibling?.flatteningDetected?`<p><b>監査:</b> 3着条件付き確率の差より最終確率差が小さく、条件負荷がpathScoreへ十分伝播していない可能性があります。</p>`:""}</div>`:""}</div></details>`;
}


function renderConditionalDistributionAudit(audit,primaryOrder=[]){
  if(!audit?.totalGroupCount)return "";
  const pct=v=>`${(Number(v||0)*100).toFixed(1)}%`;
  const [first,second]=Array.isArray(primaryOrder)?primaryOrder.map(Number):[];
  const findRow=(stage)=>{
    const rows=audit?.[stage?.toLowerCase()]?.rows||[];
    if(stage==="FIRST")return rows.find(r=>String(r.key||"").length>0)||rows[0];
    if(stage==="SECOND")return rows.find(r=>String(r.key||"").endsWith(`|${first}`))||rows[0];
    if(stage==="THIRD")return rows.find(r=>String(r.key||"").endsWith(`|${first}|${second}`))||rows[0];
    return null;
  };
  const f=findRow("FIRST"),s=findRow("SECOND"),t=findRow("THIRD");
  const rowText=(label,row)=>row?`${label}候補合計 ${pct(row.conditionalSum)}${row.normalized?"（100%分布）":`（不足 ${pct(Math.max(0,row.missingMass))}）`}`:`${label}監査なし`;
  const status=audit.nodeConditionalValuesAreValidDistributions?"条件付き確率として使用可能":"現状は100%分布ではないため、厳密な条件付き確率としては使用不可";
  return `<details class="predictionAccordion"><summary>条件付き確率の100%監査</summary><div class="accordionBody"><div class="auditCallout"><strong>${esc(status)}</strong><p>${esc(rowText("1着",f))}<br>${esc(rowText("2着",s))}<br>${esc(rowText("3着",t))}</p><p class="muted">全 ${Number(audit.totalGroupCount||0)} 親状態中、100%分布 ${Number(audit.normalizedGroupCount||0)} / 非100%分布 ${Number(audit.nonNormalizedGroupCount||0)}。現在の値は score構成比 × 成立条件負荷 の後に再正規化していません。</p></div></div></details>`;
}

function renderPurchaseScenarioExplanation(snapshot,bets){
  const branches=Array.isArray(snapshot?.branches)?snapshot.branches:[];
  if(!bets.length)return `<div class="auditCallout"><strong>購入エンジンの判断</strong><p>標準購入候補はありません。上の軸展開は予測として保持されています。</p></div>`;
  const grouped=new Map();
  for(const bet of bets){
    const category=bet?.category||"";
    if(!["MAIN","COVER","BUYABLE_HIGH"].includes(category))continue;
    if(!grouped.has(category))grouped.set(category,[]);
    grouped.get(category).push(bet);
  }
  const main=grouped.get("MAIN")||[];
  const cover=grouped.get("COVER")||[];
  const value=grouped.get("BUYABLE_HIGH")||[];
  const mainSentences=[];
  if(main.length)mainSentences.push(`本線 ${main.length}点。予測側の終端を購入エンジンが確率・集中度・オッズで評価して採用しています。`);
  if(cover.length)mainSentences.push(`押さえ ${cover.length}点。主展開の派生または別の有力展開として残した終端です。`);
  if(value.length)mainSentences.push(`買える高配当 ${value.length}点。成立根拠とオッズ妙味の両方が残った終端です。`);
  const rows=bets.filter(b=>["MAIN","COVER","BUYABLE_HIGH"].includes(b?.category)).map(b=>scenarioBetSentence(b)).join("");
  return `<details class="predictionAccordion"><summary>購入エンジン：なぜこの買い目を採用したか</summary><div class="accordionBody"><div class="auditCallout">${mainSentences.map(x=>`<p>${esc(x)}</p>`).join("")}</div><div class="detailGroup">${rows}</div></div></details>`;
}

function scenarioBetSentence(b){
  const order=Array.isArray(b?.order)?b.order.map(Number):String(b?.order||"").split("-").map(Number);
  const [a,c,d]=order;
  const cls=betClassLabel(b?.category);
  const branch=b?.dominantBranchLabel||b?.branchLabel||"展開枝不明";
  const convRaw=b?.naturalConvergenceScore;
  const conv=convRaw===null||convRaw===undefined||convRaw===""?null:Number(convRaw);
  const convText=Number.isFinite(conv)?`${Math.round(conv*100)}%`:"不明";
  let sentence="";
  if(b?.category==="MAIN"){
    sentence=`「${branch}」から直接つながる自然終端として${a}-${c}-${d}を本線にしました。`;
  }else if(b?.category==="COVER"){
    sentence=`${a}-${c}-${d}は「${branch}」から成立するものの、本線より追加条件があるため押さえにしました。`;
  }else{
    sentence=`${a}-${c}-${d}は「${branch}」由来の別展開として成立し、自然さだけで本線には上げず、オッズ妙味が残るため高配当候補にしました。`;
  }
  const reason=b?.purchaseReason?` ${b.purchaseReason}`:"";
  const extraDetails=Array.isArray(b?.extraConditionDetails)?b.extraConditionDetails:[];
  const extraText=extraDetails.length?extraDetails.map(x=>{const p=Number(x?.probability);const prob=Number.isFinite(p)?`${(p*100).toFixed(1)}%`:"未校正";const mech=x?.mechanism?.label?`・${x.mechanism.label}`:"";return `${x?.stage||"構造"}:${x?.label||x?.id||"追加条件"}${mech} ${prob}${x?.critical===true?" 必須":""}`}).join(" ｜ "):"";
  return `<div class="detailBet"><strong>${esc(`${a}-${c}-${d}`)}　${esc(cls)}</strong><p>${esc(sentence)}</p><p class="muted">自然収束度 ${esc(convText)}${Number.isFinite(Number(b?.nodeConditionalProbability))?` / ノード連鎖 ${esc((Number(b.nodeConditionalProbability)*100).toFixed(2))}%`:""}${Number(b?.extraConditionCount)>0?` / 追加条件 ${Number(b.extraConditionCount)}件`:""}${Number.isFinite(Number(b?.extraConditionPenalty))?` / 条件後残存 ${(Number(b.extraConditionPenalty)*100).toFixed(0)}%`:""}${Number(b?.relativeConditionCount)>0?` / 差分条件 ${Number(b.relativeConditionCount)}件・微調整 ${(Math.max(0,1-Number(b.relativeConditionPenalty||1))*100).toFixed(1)}%`:""}${reason?` / ${esc(reason)}`:""}</p>${extraText?`<p class="auditMeta"><b>追加条件内訳</b> ${esc(extraText)}</p>`:""}${Array.isArray(b?.relativeConditionTrace)&&b.relativeConditionTrace.some(x=>Number(x?.count)>0)?`<p class="auditMeta"><b>差分条件内訳</b> ${esc(b.relativeConditionTrace.filter(x=>Number(x?.count)>0).map(x=>`${x.stage}:${x.label||"候補"} 最有力比${(Number(x.ratio||0)*100).toFixed(2)}% / -${(Number(x.penalty||0)*100).toFixed(2)}%`).join(" ｜ "))}</p>`:""}</div>`;
}

function countHeads(rows){
  const map=new Map();
  for(const row of rows||[]){
    const n=Number(Array.isArray(row?.order)?row.order[0]:String(row?.order||"").split("-")[0]);
    if(Number.isFinite(n))map.set(n,(map.get(n)||0)+1);
  }
  return map;
}
function unique(rows){
  return [...new Set((rows||[]).filter(Boolean))];
}
function renderRiderBranchLinkAudit(audit){
  if(!audit)return "";
  const rows=Array.isArray(audit.rows)?audit.rows:[];
  const warnings=Array.isArray(audit.warnings)?audit.warnings:[];
  const title=audit.status==="WARN"?"要修正":audit.status==="CHECK"?"要確認":"整合";
  return `<details class="supportBranchAudit" open><summary>選手評価v2 → 主展開枝 接続監査（${esc(title)}）</summary>
    ${warnings.length?`<div class="auditWarning">${warnings.map(w=>`<p>${w.severity==="high"?"⚠ ":"△ "}${esc(w.message)}</p>`).join("")}</div>`:`<p class="muted">1着能力と逃げ・捲り・番手差し枝の接続に大きな矛盾はありません。</p>`}
    <div class="compactAuditRows">${rows.slice(0,12).map(r=>`<p><strong>${esc(r.branchLabel)}</strong>　${r.firstNumber}番 / ${esc(r.mechanismName)} ${fmtAbility(r.mechanismScore)} / 1着 ${fmtAbility(r.firstPlacement)} / 枝 ${fmtAbility(r.branchScore)} / ${esc(r.priority)}</p>`).join("")}</div>
  </details>`;
}

function renderExtraConditionAudit(audit){
  if(!audit||typeof audit!=="object")return "";
  const status=String(audit.status||"OK");
  const extra=Number(audit.purchasedWithExtraCount)||0,uncal=Number(audit.uncalibratedStructuralCount)||0,fixed=Number(audit.fixedPenaltyCount)||0;
  const allOne=audit.allPurchasedExtrasDisplayedAsOne===true;
  const tone=uncal?"auditWarning":"notice";
  const title=uncal?"追加条件監査：未校正の構造条件あり":allOne?"追加条件監査：『1件』表示の中身を分解":"追加条件監査";
  const range=Number.isFinite(Number(audit.probabilityMin))&&Number.isFinite(Number(audit.probabilityMax))?`${(Number(audit.probabilityMin)*100).toFixed(1)}〜${(Number(audit.probabilityMax)*100).toFixed(1)}%`:"確率付き条件なし";
  return `<details class="predictionAccordion" ${uncal?"open":""}><summary>${esc(title)}</summary><div class="accordionBody"><div class="${tone}"><strong>${esc(status)}</strong><p>追加条件あり購入 ${extra}件 / 未校正構造条件 ${uncal}件 / 1件固定12%減点 ${fixed}件</p><p class="muted">条件確率レンジ ${esc(range)}。件数は表示用の粗い指標で、条件ID・機構・条件確率を優先して監査します。未校正構造条件は件数だけで同じ減点になっているため、確率校正前は要確認です。</p></div></div></details>`;
}

function renderWholeLinkageAudit(audit){
  if(!audit||typeof audit!=="object")return `<div class="auditWarning"><strong>全体連動監査：未記録</strong><p>この保存予想には全体連動監査がありません。新規予想で生成されます。</p></div>`;
  const stages=Array.isArray(audit.stageChecks)?audit.stageChecks:[];
  const traces=Array.isArray(audit.traces)?audit.traces:[];
  const warnings=Array.isArray(audit.warnings)?audit.warnings:[];
  const resolutions=Array.isArray(audit.resolutions)?audit.resolutions:[];
  const statusLabel=audit.status==="OK"?"整合":audit.status==="WARN"?"要修正":"要確認";
  const stageHtml=stages.map(s=>`<div class="abilityRow auditKeyValueRow"><strong>${esc(s.label||s.id)}</strong><span>${s.status==="OK"?"○ 整合":s.status==="WARN"?"! 要修正":"△ 要確認"}${Number(s.warningCount)?` (${Number(s.warningCount)}件)`:""}</span></div>`).join("");
  const traceHtml=traces.slice(0,20).map(t=>{
    const order=Array.isArray(t.order)?t.order.join("-"):"-";
    const line=Array.isArray(t.line)&&t.line.length?t.line.join("-"):"ライン不明";
    const conv=Number.isFinite(Number(t.naturalConvergenceScore))?`${(Number(t.naturalConvergenceScore)*100).toFixed(0)}%`:"-";
    const prob=Number.isFinite(Number(t.probability))?`${(Number(t.probability)*100).toFixed(2)}%`:"-";
    const ws=Array.isArray(t.warnings)?t.warnings:[];
    const rs=Array.isArray(t.resolutions)?t.resolutions:[];
    const details=Array.isArray(t.extraConditionDetails)?t.extraConditionDetails:[];
    const detailText=details.map(x=>{const p=Number(x?.probability);return `${x?.stage||"構造"}:${x?.mechanism?.label||x?.label||x?.id||"追加条件"} ${Number.isFinite(p)?`${(p*100).toFixed(1)}%`:"未校正"}`}).join(" ｜ ");
    return `<div class="detailBet"><strong>${esc(order)}　${esc(betClassLabel(t.category))}</strong><p><b>連動</b> 1着能力 ${fmtAbility(t.firstAbility)} → ライン ${esc(line)} → ${esc(t.branchLabel||"展開不明")} → 2着能力 ${fmtAbility(t.secondAbility)} → 3着能力 ${fmtAbility(t.thirdAbility)}</p><p class="muted">自然収束 ${esc(conv)} / 追加条件 ${Number(t.extraConditionCount)||0}${Number.isFinite(Number(t.extraConditionProbabilityMin))?` / 最低条件成立 ${(Number(t.extraConditionProbabilityMin)*100).toFixed(1)}%`:""} / 終端確率 ${esc(prob)}${Array.isArray(t.naturalConvergenceReasons)&&t.naturalConvergenceReasons.length?` / ${t.naturalConvergenceReasons.slice(0,3).map(esc).join(" / ")}`:""}</p>${detailText?`<p class="auditMeta"><b>追加条件</b> ${esc(detailText)}</p>`:""}${ws.length?`<p class="auditWarn">${ws.map(w=>esc(w.message)).join(" / ")}</p>`:rs.length?`<p class="auditOk">根拠確認済み: ${rs.map(r=>esc(r.message)).join(" / ")}</p>`:'<p class="auditOk">この終端は上流から購入まで大きな接続矛盾なし。</p>'}</div>`;
  }).join("");
  const warnHtml=warnings.length?`<div class="auditWarning"><strong>接続警告 ${warnings.length}件</strong>${warnings.slice(0,12).map(w=>`<p>${esc(w.message)}</p>`).join("")}</div>`:`<div class="notice success"><strong>全体連動：大きな接続矛盾なし</strong></div>`;
  const resolvedHtml=resolutions.length?`<div class="notice"><strong>根拠確認済み ${resolutions.length}件</strong>${resolutions.slice(0,8).map(r=>`<p>${esc(r.message)}</p>`).join("")}</div>`:"";
  return `<details class="predictionAccordion" open><summary>全体連動監査を見る（${esc(statusLabel)}）</summary><div class="accordionBody"><p class="muted">能力 → ライン/位置 → 1着シナリオ → 2着 → 3着 → 自然収束度 → 終端確率 → 購入採否を一本で追います。</p><div class="abilityList auditKeyValueList">${stageHtml}</div>${warnHtml}${resolvedHtml}<details class="supportBranchAudit"><summary>購入終端ごとの連動を見る（${traces.length}件）</summary><div class="detailGroup">${traceHtml||'<p class="muted">購入終端なし</p>'}</div></details></div></details>`;
}

function renderPurchaseAuditLazy(audit,root){try{const rejectLabels={FLAT_DISTRIBUTION:"分布が平坦",PRIMARY_COVERAGE_TARGET_REACHED:"最上位頭の優先カバー目標到達後",OTHER_FAMILY_COVERAGE_TARGET_REACHED:"別頭の補完カバー目標到達後",NO_FAMILY_TIER:"購入対象の1着ファミリー外",SECOND_POSITION_SUPPORT:"2着独立支持不足",THIRD_VARIANT_SUPPORT:"3着独立支持不足",SUB_ODDS_PENDING:"別展開・オッズ待ち",SUB_NOT_HIGH_PAYOUT:"別展開・高配当属性なし",SUB_VALUE_BELOW_BREAK_EVEN:"別展開・成立確率×オッズ不足",SUB_VALUE_NATURAL_BOUNDARY:"別展開・妙味上位群外",BRANCH_OR_POSITION_SUPPORT:"枝適合/着順支持不足",PURCHASE_BORDER:"買い目化ボーダー未達",POSITION_SUPPORT_WEAK:"2・3着の位置支持が弱い",NATURAL_CONVERGENCE_TOO_LOW:"自然収束度が購入水準未満",VALUE_NOT_ENOUGH:"成立確率×オッズの妙味不足",FAMILY_COVERAGE_ALREADY_MET:"同じ1着候補の購入カバーが十分",RISK_SCENARIO_ONLY:"例外・リスク枝のみ",ODDS_PENDING_FOR_VALUE:"高配当候補の実オッズ待ち",NO_NATURAL_VALUE_SEPARATION:"高配当候補間の差が不明確",UNKNOWN:"その他"};const rejectCounts=audit?.rejectCodeCounts&&typeof audit.rejectCodeCounts==="object"&&!Array.isArray(audit.rejectCodeCounts)?audit.rejectCodeCounts:{};const rejectRows=Object.entries(rejectCounts).sort((a,b)=>Number(b[1])-Number(a[1])).map(([code,count])=>`<div class="abilityRow auditKeyValueRow"><strong>${esc(rejectLabels[code]||code)}</strong><span>${Number(count)||0}件</span></div>`).join("");const lifecycle=audit?.terminalLifecycleAudit||{},mass=audit?.purchaseMassAudit||{};const massStatusLabel={BALANCED:"適正",UNDER_COVERED:"カバー不足",OVER_SPREAD:"広げ過ぎ",INEFFICIENT:"質量効率注意"}[mass.status]||"未記録";const lifecycleText=lifecycle.passed===true?"OK（理由なし削除なし）":lifecycle.passed===false?`要監査 ${Array.isArray(lifecycle.violations)?lifecycle.violations.length:0}件`:"未記録";root.innerHTML=`<div class="abilityList auditKeyValueList"><div class="abilityRow auditKeyValueRow"><strong>生成終端</strong><span>${Number(audit.generatedTerminalCount)||0}件</span></div><div class="abilityRow auditKeyValueRow"><strong>確率評価済み</strong><span>${Number(audit.probabilityEvaluatedTerminalCount??audit.terminalCount)||0}件</span></div><div class="abilityRow auditKeyValueRow"><strong>購入採用</strong><span>${Number(audit.adoptedTerminalCount??audit.finalBetCount)||0}件</span></div><div class="abilityRow auditKeyValueRow"><strong>購入不採用</strong><span>${Number(audit.rejectedTerminalCount)||0}件</span></div><div class="abilityRow auditKeyValueRow"><strong>購入確率質量</strong><span>${Number.isFinite(Number(mass.purchasedMassShare))?fmtPct(Number(mass.purchasedMassShare)):"-"}</span></div><div class="abilityRow auditKeyValueRow"><strong>自然候補カバー率</strong><span>${Number.isFinite(Number(mass.eligibleCoverage))?fmtPct(Number(mass.eligibleCoverage)):"-"} / 目標 ${Number.isFinite(Number(mass.weightedCoverageTarget))?fmtPct(Number(mass.weightedCoverageTarget)):"-"}</span></div><div class="abilityRow auditKeyValueRow"><strong>質量効率</strong><span>${Number.isFinite(Number(mass.massEfficiency))?fmtPct(Number(mass.massEfficiency)):"-"}</span></div><div class="abilityRow auditKeyValueRow"><strong>質量判定</strong><span>${esc(massStatusLabel)}</span></div><div class="abilityRow auditKeyValueRow"><strong>質量不足補正</strong><span>${mass.recoveryApplied===true?`実施 ${Number(mass.recoveryCount)||0}件`:"なし"}</span></div><div class="abilityRow auditKeyValueRow"><strong>終端保存監査</strong><span>${esc(lifecycleText)}</span></div><div class="abilityRow auditKeyValueRow"><strong>理由なし生成除外</strong><span>${Number(lifecycle.unexplainedGenerationExclusionCount)||0}件</span></div><div class="abilityRow auditKeyValueRow"><strong>理由なし購入不採用</strong><span>${Number(lifecycle.unreasonedPurchaseRejectCount)||0}件</span></div></div>${rejectRows?`<h3>不採用理由</h3><div class="abilityList auditKeyValueList">${rejectRows}</div>`:""}${safeAuditHtml(()=>renderBranchSelectionAudit(audit))}${safeAuditHtml(()=>renderPurchaseBorderAudit(audit))}${safeAuditHtml(()=>renderPurchaseFamilyAudit(audit))}${safeAuditHtml(()=>renderAdoptedTerminalAudit(audit))}<p class="muted">終端は低確率・人気・点数圧縮を理由に削除しません。生成後は全終端を確率評価し、買わない終端も不採用理由付きで保存します。</p>`}catch(error){console.error("purchase audit render failed",error);root.innerHTML=`<div class="auditWarning"><strong>監査表示だけ読み込めませんでした</strong><p>${esc(error?.message||String(error))}</p><p class="muted">保存済み買い目と予想自体は保持されています。</p></div>`}}
function safeAuditHtml(fn){try{return fn()||""}catch(error){console.error("audit section render failed",error);return `<div class="auditWarning"><strong>一部監査表示を省略</strong><p>${esc(error?.message||String(error))}</p></div>`}}
function renderStartPowerInputAuditSafe(snapshot){try{return renderStartPowerInputAudit(snapshot)}catch(error){console.error("start power audit render failed",error);return `<div class="auditWarning"><strong>主導権入力監査 表示エラー</strong><p>${esc(error?.message||"監査データの表示に失敗しました。")}</p></div>`}}

function renderStartPowerInputAudit(snapshot){const saved=snapshot?.predictionOutput?.audit?.startPowerInputAudit;const sourceRows=Array.isArray(saved?.rows)&&saved.rows.length?saved.rows:(Array.isArray(snapshot?.abilitiesUsed)?snapshot.abilitiesUsed:[]).map(a=>{const e=a?.startPowerEvidence||{};const missing=Array.isArray(e?.missingInputs)?e.missingInputs.filter(Boolean):[];return{number:a?.number,startPower:a?.startPower??null,status:!a?.startPowerEvidence?"EVIDENCE_UNAVAILABLE":missing.length?"MISSING_INPUTS":Number(e?.officialTotalStarts)===0?"ZERO_STARTS":"VERIFIED",confidence:e?.confidence||null,missingInputs:missing,officialTotalStarts:e?.officialTotalStarts??null,rawBackCount:e?.rawBackCount??null,rawHomeCount:e?.rawHomeCount??null,bFrequency:e?.bFrequency??null,hFrequency:e?.hFrequency??null,shrunkBFrequency:e?.shrunkBFrequency??null,shrunkHFrequency:e?.shrunkHFrequency??null,bPercentileScore:e?.bPercentileScore??null,hPercentileScore:e?.hPercentileScore??null,latentScore:e?.latentScore??null,raceCategory:e?.raceCategory||null,priorStrength:e?.priorStrength??null,startsQuality:e?.startsQuality??null}});if(!sourceRows.length)return '<div class="auditWarning"><strong>主導権入力監査不能</strong><p>主導権監査データが保存されていません。新規予想では監査データを必須保存します。</p></div>';const statusLabel={VERIFIED:"確認済み",MISSING_INPUTS:"入力欠損",ZERO_STARTS:"出走0",EVIDENCE_UNAVAILABLE:"根拠未取得",VALUE_UNAVAILABLE:"算出不能"};const rows=sourceRows.map(a=>{const missing=Array.isArray(a?.missingInputs)?a.missingInputs.filter(Boolean):[];const confidence=({low:"低",medium:"中",high:"高"})[a?.confidence]||a?.confidence||"-";const status=a?.status||"EVIDENCE_UNAVAILABLE";const statusText=missing.length?`${statusLabel[status]||status}: ${missing.join("/")}`:`${statusLabel[status]||status} / 信頼度 ${confidence}`;return `<div class="detailBet"><strong>${fmtAuditNumber(a?.number)}番　主導権 ${fmtAbility(a?.startPower)}</strong><p>B ${fmtAuditNumber(a?.rawBackCount)} / H ${fmtAuditNumber(a?.rawHomeCount)} / 出走 ${fmtAuditNumber(a?.officialTotalStarts)}　${esc(statusText)}</p><p class="muted">B率 ${fmtAuditRate(a?.bFrequency)} / H率 ${fmtAuditRate(a?.hFrequency)} → 縮小後B ${fmtAuditRate(a?.shrunkBFrequency)} / 縮小後H ${fmtAuditRate(a?.shrunkHFrequency)} / B分位 ${fmtAbility(a?.bPercentileScore)} / H分位 ${fmtAbility(a?.hPercentileScore)} / latent ${fmtAbility(a?.latentScore)}</p></div>`}).join("");const categories=[...new Set(sourceRows.map(row=>String(row?.raceCategory||"").trim()).filter(Boolean))];const priors=[...new Set(sourceRows.map(row=>Number(row?.priorStrength)).filter(Number.isFinite))];const categoryOk=categories.length===1&&(categories[0]==="standard"||categories[0]==="girls");const priorOk=priors.length===1&&priors[0]===15;const parameterOk=categoryOk&&priorOk;const parameterSummary=`<div class="${parameterOk?"auditOk":"auditWarning"}"><strong>主導権 共通パラメータ監査：${parameterOk?"正常":"要確認"}</strong><p>カテゴリ ${esc(categories.join(", ")||"未取得")} / prior ${priors.length?priors.join(", "):"未取得"}</p><p class="muted">現行baseline v1では通常競輪=standard、ガールズ=girls、prior=15を共通使用します。同一レース内のカテゴリ混在・prior不一致は要確認です。</p></div>`;const qualityRows=sourceRows.map(a=>`<div class="detailBet"><strong>${fmtAuditNumber(a?.number)}番</strong><p class="muted">startsQuality ${fmtRatio(a?.startsQuality)}</p></div>`).join("");const parameterDetails=`<details class="predictionAccordion"><summary>主導権の共通パラメータ監査を見る</summary><div class="accordionBody">${parameterSummary}<div class="detailGroup">${qualityRows}</div></div></details>`;const verified=sourceRows.filter(row=>row?.status==="VERIFIED").length;const incomplete=sourceRows.length-verified;return `<details class="predictionAccordion"><summary>主導権の入力監査を見る ${incomplete?`（要確認 ${incomplete}人）`:`（${verified}/${sourceRows.length}確認済み）`}</summary><div class="accordionBody"><p class="muted">主導権評価に使ったB/H入力と欠損を明示します。監査不能・欠損を通常の「省略」扱いにはしません。</p>${parameterDetails}<div class="detailGroup">${rows}</div></div></details>`}

function girlsLeadLabel(a){return hasUsableGirlsStartPower(a)?`主導権 ${fmtAbility(a.startPower)}`:"主導権 保留"}
function fmtRatio(v){const n=Number(v);return Number.isFinite(n)?String(Math.round(n*1000)/1000):"-"}
function fmtPct(v){const n=Number(v);return Number.isFinite(n)?`${(n*100).toFixed(1)}%`:"-"}
function fmtAuditNumber(v){const n=Number(v);return Number.isFinite(n)?String(Math.round(n*1000)/1000):"-"}
function fmtAuditRate(v){const n=Number(v);return Number.isFinite(n)?`${(n*100).toFixed(1)}%`:"-"}
function fmtAbility(v){return v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v))?Number(v).toFixed(2):"未取得"}
function ratingOf(snapshot){const saved=snapshot?.displayRatings;return saved?.ratingAlgorithmVersion==="DISPLAY-RATING-0.4-STRUCTURAL-SKIP-BOUNDARY"?saved:derivePredictionRatings(snapshot)}
function renderRatings(panel,snapshot){if(!panel)return;if(!snapshot){panel.classList.add("hidden");panel.innerHTML="";return}const r=ratingOf(snapshot),tone=r.verdictTone||"caution",flags=r.auditFlags||[],idx=Number(r.diagnostics?.evaluationIndex),consistency=r.consistencyAudit||{},adjustments=Array.isArray(consistency.adjustments)?consistency.adjustments:[],checks=Array.isArray(consistency.invariantChecks)?consistency.invariantChecks:[],failed=checks.filter(x=>!x.passed);const consistencyHtml=`<div class="evaluationAudit"><strong>評価整合監査: ${esc(consistency.label||"未監査")}</strong>${adjustments.length?`<p>${adjustments.map(esc).join(" / ")}</p>`:""}${failed.length?`<p class="auditWarn">矛盾: ${failed.map(x=>esc(x.label||x.id)).join(" / ")}</p>`:checks.length?'<p>信頼度・集中度・コロがし・最終判定の自動整合チェックを通過。</p>':""}</div>`;panel.className=`card compact ratingPanel rating-${tone}`;panel.innerHTML=`<div class="sectionHead"><div><small>表示用評価・監査中</small><h2>レース評価</h2></div><span class="pill ratingVerdict rating-${tone}">${esc(r.verdict)}</span></div><div class="ratingGrid"><div class="ratingItem"><span>信頼度</span><strong>${starText(r.confidence)}</strong></div><div class="ratingItem"><span>展開集中度</span><strong>${starText(r.concentration)}</strong></div><div class="ratingItem"><span>コロがし適性</span><strong>${starText(r.rollover)}</strong></div><div class="ratingItem"><span>最終判定</span><strong>${esc(r.verdict)}</strong></div></div><p class="ratingReason">${esc(r.reason||"")}${Number.isFinite(idx)?` ・ 暫定指数 ${idx.toFixed(1)}`:""}</p>${consistencyHtml}<div class="evaluationAudit"><strong>精度監査: ${esc(r.calibrationLabel||"未校正・検証対象")}</strong>${flags.length?`<p>${esc(flags.join(" / "))}</p>`:'<p>追加フラグなし。ただし的中率・回収率との校正は未実施です。</p>'}</div><p class="muted ratingNote">表示評価は買い目生成とは分離していますが、買い目点数と展開分布との矛盾は自動で上限補正します。確率自体は未校正です。</p>`;panel.classList.remove("hidden")}
function noBetReasonText(code){return({NO_TERMINALS:"展開候補を生成できませんでした。",FLAT_DISTRIBUTION_NO_SUPPORTED_CANDIDATE:"確率分布が平坦で、独立した展開根拠を持つ購入候補がありません。",BUDGET_BELOW_MINIMUM:"予算が最低購入単位を下回っています。",QUALITY_GATE:"データ品質基準を満たさないため購入を見送ります。",LINE_DATA_UNAVAILABLE:"公式ラインを確認できないため、通常の競輪予想としては購入判定を保留します。"})[code]||"購入価値を確認できないため見送ります。"}
async function checkResult(){if(state.busy||!state.snapshot)return;state.busy=true;setLoading("公式結果を確認中","レースIDを固定して確定着順と払戻を取得しています。");try{const r=state.snapshot.targetRace,p=await fetchOfficialResult(r);storeResultCache(r,p.result,p.checkedAt);if(isResultPending(p.result)){renderPrediction(state.snapshot);renderPendingResult();return}state.snapshot=attachResult(localStorage,state.snapshot.predictionSnapshotId,p.result);try{runOperationalLearningPipeline(localStorage)}catch{}renderSaved();renderHomeRecommendations();renderPrediction(state.snapshot)}catch(e){fail("公式結果の取得・保存に失敗",e,checkResult)}finally{state.busy=false}}
function renderPendingResult(){$("resultPanel").className="card";$("resultPanel").innerHTML='<div class="resultMark">結果はまだ確定していません</div><p class="muted">公式結果の確定後にもう一度確認してください。</p><button id="retryPendingResult" class="secondary">再試行</button>';$('retryPendingResult').onclick=()=>checkResult()}
function renderResult(result){
  if(!result){$("resultPanel").classList.add("hidden");return}
  const cfg={hit:["○ 的中","resultHit"],miss:["✕ 不的中","resultMiss"],refund:["返還",""],cancelled:["中止",""]}[result.resultStatus]||[result.resultStatus,""];
  const v=result.verification||null;
  const stageHtml=Array.isArray(v?.stages)?v.stages.map(row=>{
    const p=Number(row.conditionalProbability);
    const ptxt=Number.isFinite(p)?`${(p*100).toFixed(1)}%`:"未保存";
    return `<div class="detailBet"><strong>${row.position}着 ${row.number}番</strong><p>着順事象: 確定 / 予想ノード: ${row.predictedNodePresent?"あり":"なし"} / 条件付き成立 ${esc(ptxt)}</p><p class="muted">新規条件 ${row.newConditionCount??"-"} / 追加条件 ${row.extraConditionCount??"-"} / 原因検証 ${esc(row.conditionValidation?.status||"保留")}</p></div>`;
  }).join(""):"";
  const researchBackfillSummary=backfillResearchLearningLedger(localStorage);
  const researchSummary=summarizeResearchLearning(localStorage);
  const promotionReviewSummary=summarizePromotionReviews(localStorage);
  const shadowComparisonSummary=summarizeShadowComparisons(localStorage);
  const finalApprovalSummary=summarizeFinalPromotionApprovals(localStorage);
  refreshCanaryRuns(localStorage,shadowComparisonSummary);
  const canarySummary=summarizeCanaryRuns(localStorage);
  const operationalLearning=loadOperationalLearningState(localStorage)||runOperationalLearningPipeline(localStorage).state;
  buildResultOnlyPredictionCrosscheckLedger(localStorage,loadSnapshots(localStorage));
  const resultOnlySummary=summarizeResultOnlyResearch(localStorage,loadSnapshots(localStorage));
  const researchAggregateHtml=renderResearchLearningSummary(researchSummary,promotionReviewSummary,shadowComparisonSummary,finalApprovalSummary,canarySummary,researchBackfillSummary,operationalLearning,resultOnlySummary);
  const evidenceHtml=v?renderResultEvidenceReview(result):"";
  const verifyHtml=v?`<details class="predictionAccordion" open><summary>結果検証・研究学習</summary><div class="accordionBody">
    <p><strong>検証分類:</strong> ${esc(resultVerificationLabel(v.status))}</p>
    ${v.exactTerminalGenerated!=null?`<p>正解終端 ${v.exactTerminalGenerated?"生成済み":"未生成"} / 正解1着ファミリー ${v.firstPlaceFamilyGenerated?"生成済み":"未生成"} / 正解1-2枝 ${v.firstSecondPairGenerated?"生成済み":"未生成"}</p>`:""}
    ${Number.isFinite(Number(v.terminalProbability))?`<p>正解終端確率 ${(Number(v.terminalProbability)*100).toFixed(2)}%${v.terminalGlobalRank?` / 全体${v.terminalGlobalRank}位`:""}</p>`:""}
    ${stageHtml}
    ${renderOfficialEvidenceSummary(result.officialEvidence)}
    ${evidenceHtml}
    <p class="muted">研究版へ保存: ${v.researchLearning?.savedToResearch?"はい":"いいえ"} / 通常学習: ${v.researchLearning?.includeInNormalLearning?"対象":"対象外"} / 本番ロジック自動反映: しない</p>
    <p class="muted">確定着順だけで「捲り成功」「追走失敗」などの途中原因を成立扱いにはしません。原因ノードは公式経過・映像等の証拠が取れるまで保留です。</p>
    ${researchAggregateHtml}
  </div></details>`:"";
  $("resultPanel").className=`card ${cfg[1]}`;
  $("resultPanel").innerHTML=`<div class="resultMark">${cfg[0]}</div>${result.officialFinishOrder?.length?`<p>確定 <strong>${result.officialFinishOrder.join("-")}</strong></p>`:""}${result.matchedSelection?`<p>的中買い目 <strong>${result.matchedSelection.join("-")}</strong> / ${esc(result.betCategory||"")}</p>`:""}${result.officialPayout?`<p>公式配当 <strong>${Number(result.officialPayout).toLocaleString()}円</strong></p>`:""}${verifyHtml}<p class="muted">確認 ${formatTime(result.checkedAt)}</p>`;
  bindResultEvidenceButtons(result);
  bindPromotionReviewButtons(result);
  bindFinalApprovalButtons();
  bindCanaryButtons();
  maybeAttachShadowComparisonResult(result);
  refreshCanaryRuns(localStorage,summarizeShadowComparisons(localStorage));
}
function renderOfficialEvidenceSummary(evidence){
  if(!evidence)return `<p class="muted">公式の途中経過証拠: 今回は着順・配当以外の構造化データなし。</p>`;
  const items=[];
  if(evidence.winningMethod)items.push(`決まり手 ${evidence.winningMethod}`);
  if(Number.isFinite(Number(evidence.markers?.startNumber)))items.push(`S ${Number(evidence.markers.startNumber)}番`);
  if(Number.isFinite(Number(evidence.markers?.backNumber)))items.push(`B ${Number(evidence.markers.backNumber)}番`);
  if(Array.isArray(evidence.incidents)&&evidence.incidents.length)items.push(`事故・違反情報 ${evidence.incidents.length}件`);
  return `<div class="notice"><strong>公式証拠</strong><br>${items.length?items.map(esc).join(" / "):"構造化された追加証拠なし"}</div>`;
}
function renderResultEvidenceReview(result){
  const id=result?.predictionSnapshotId;if(!id)return"";
  const rows=researchEvidenceQueue(localStorage,{onlyPending:false}).filter(x=>x.predictionSnapshotId===id);
  if(!rows.length)return `<details class="supportBranchAudit"><summary>成立条件の証拠検証</summary><p class="muted">この保存形式には条件別の証拠待ち項目がありません。</p></details>`;
  const labels={EVIDENCE_PENDING:"保留",CONFIRMED:"成立確認",REFUTED:"不成立確認",UNKNOWN:"判定不能"};
  const researchRecord=loadResearchLearningRecords(localStorage).find(r=>r.predictionSnapshotId===id);
  const reviewState=researchRecord?.evidenceSummary||{};
  const reviewBadge=reviewState.reviewComplete
    ?(reviewState.decisiveEvidenceComplete?(researchRecord?.nodeCauseLearningEligible?"証拠レビュー完了・因果学習可能":"証拠レビュー完了・通常学習対象外"):"証拠レビュー完了・因果学習不可")
    :"証拠レビュー未完了";
  return `<details class="supportBranchAudit" open><summary>成立条件の証拠検証（保留${rows.filter(x=>x.status==="EVIDENCE_PENDING").length}件）</summary><p><strong>${esc(reviewBadge)}</strong></p><p class="muted">着順事象は公式結果で確定しますが、途中の成立条件は証拠なしで推測しません。UNKNOWNはレビュー完了にはできますが、因果学習には使いません。</p><div class="detailGroup">${rows.map(e=>`<div class="detailBet evidenceReviewRow"><strong>${esc(e.stage)} / ${esc(e.label||e.conditionId||e.evidenceKey)}</strong><p>現在: ${esc(labels[e.status]||e.status)}${e.autoResolved?"（公式証拠で自動判定）":""}${Number.isFinite(Number(e.predictedProbability))?` / 予測 ${(Number(e.predictedProbability)*100).toFixed(1)}%`:""}</p>${e.note?`<p class="muted">${esc(e.note)}</p>`:""}<div class="evidenceButtons"><button type="button" data-evidence-key="${esc(e.evidenceKey)}" data-evidence-status="CONFIRMED">成立</button><button type="button" data-evidence-key="${esc(e.evidenceKey)}" data-evidence-status="REFUTED">不成立</button><button type="button" data-evidence-key="${esc(e.evidenceKey)}" data-evidence-status="UNKNOWN">わからない</button><button type="button" data-evidence-key="${esc(e.evidenceKey)}" data-evidence-status="EVIDENCE_PENDING">保留に戻す</button></div></div>`).join("")}</div></details>`;
}
function bindResultEvidenceButtons(result){
  const root=$("resultPanel");if(!root||!result?.predictionSnapshotId)return;
  root.querySelectorAll("[data-evidence-key][data-evidence-status]").forEach(button=>button.onclick=()=>{try{updateResearchConditionEvidence(localStorage,{snapshotId:result.predictionSnapshotId,evidenceKey:button.dataset.evidenceKey,status:button.dataset.evidenceStatus,source:"manual_review"});renderResult(result)}catch(error){fail("成立条件の証拠判定を保存できません",error,()=>renderResult(result))}});
}
function maybeCreateShadowComparison(snapshot){
  try{
    if(!snapshot)return null;
    const research=summarizeResearchLearning(localStorage);
    const record=buildShadowComparisonRecord({snapshot,conditionCalibration:research.conditionCalibration,storage:localStorage});
    return record?saveShadowComparison(localStorage,record):null;
  }catch{return null}
}
function maybeAttachShadowComparisonResult(result){
  try{
    const id=result?.predictionSnapshotId;
    if(!id||!Array.isArray(result?.officialFinishOrder)||result.officialFinishOrder.length<3)return 0;
    const rows=loadShadowComparisons(localStorage).filter(r=>r.snapshotId===id&&r.status==="PENDING_RESULT");
    for(const row of rows)attachShadowComparisonResult(localStorage,row.comparisonId,result.officialFinishOrder);
    return rows.length;
  }catch{return 0}
}

function bindPromotionReviewButtons(result){
  const root=$("resultPanel");if(!root)return;
  root.querySelectorAll("[data-promotion-package][data-promotion-decision]").forEach(button=>{
    button.onclick=()=>{
      try{
        const decision=button.dataset.promotionDecision;
        const note=decision==="APPROVE_SHADOW"?"シャドー比較へ進める":decision==="HOLD"?"追加データ待ち":"現時点では採用しない";
        savePromotionReview(localStorage,{packageKey:button.dataset.promotionPackage,packageFingerprint:button.dataset.promotionFingerprint||null,decision,note,reviewer:"manual"});
        if(decision==="APPROVE_SHADOW"){
          for(const snapshot of loadSnapshots(localStorage).slice(0,20))maybeCreateShadowComparison(snapshot);
        }
        renderResult(result);
      }catch(error){fail("昇格候補の審査を保存できません",error,()=>renderResult(result))}
    };
  });
}

function renderShadowQualification(q){
  if(!q||!Array.isArray(q.packages)||!q.packages.length)return "";
  const label={SAMPLE_BUILDING:"標本蓄積中",SHADOW_CONTINUE:"シャドー継続",SHADOW_VALIDATED:"シャドー検証済み",ROLLBACK_RECOMMENDED:"ロールバック推奨"};
  const pct=v=>Number.isFinite(Number(v))?`${(Number(v)*100).toFixed(1)}%`:"-";
  return `<details class="supportBranchAudit"><summary>シャドー運用判定</summary>
    <div class="detailGroup">${q.packages.slice(0,20).map(p=>`<div class="detailBet">
      <strong>${esc(label[p.status]||p.status)}</strong>
      <p>N=${Number(p.n)||0} / シャドー勝率 ${pct(p.winShare)}</p>
      <p>平均LogLoss改善 ${Number.isFinite(Number(p.avgLogLossImprovement))?Number(p.avgLogLossImprovement).toFixed(4):"-"} / 直近${Number(p.recentCount)||0}件 ${Number.isFinite(Number(p.recentAvgLogLossImprovement))?Number(p.recentAvgLogLossImprovement).toFixed(4):"-"}</p>
      <p class="muted">前半 ${Number.isFinite(Number(p.firstHalfAvgImprovement))?Number(p.firstHalfAvgImprovement).toFixed(4):"-"} / 後半 ${Number.isFinite(Number(p.secondHalfAvgImprovement))?Number(p.secondHalfAvgImprovement).toFixed(4):"-"} / ${esc(p.reason||"")}</p>
    </div>`).join("")}</div>
    <p class="muted">パッケージ判定は、現行とシャドーを同じ確率質量へ正規化し、1パッケージだけ変えた孤立効果で比較します。旧combined比較 ${Number(q.excludedLegacy)||0}件・旧方法論比較 ${Number(q.excludedOldMethodology)||0}件は判定母数から除外します。</p>
    <p class="muted">「シャドー検証済み」でも本番昇格はしません。ロールバック推奨ならシャドー承認を解除して追加監査へ戻します。</p>
  </details>`;
}

function renderFinalPromotionReview(review){
  if(!review||!Array.isArray(review.candidates)||!review.candidates.length)return "";
  const label={FINAL_REVIEW_READY:"最終審査へ進行可",FINAL_REVIEW_BLOCKED:"最終審査は保留"};
  const approvalLabel={APPROVE_CANARY:"カナリア承認",HOLD:"保留",REJECT:"却下",ROLLBACK_LOCKED:"ロールバック確定・承認失効"};
  const pct=v=>Number.isFinite(Number(v))?`${(Number(v)*100).toFixed(1)}%`:"-";
  return `<details class="supportBranchAudit" open><summary>最終昇格審査ゲート</summary>
    <div class="detailGroup">${review.candidates.slice(0,20).map(c=>{
      const approval=finalApprovalFor(localStorage,c.packageKey);
      const plan=buildCanaryActivationPlan(c,approval);
      return `<div class="detailBet">
        <strong>${esc(label[c.status]||c.status)}</strong>
        <p>${Number(c.passedCount)||0}/${Number(c.totalChecks)||0}条件通過 / N=${Number(c.comparisonCount)||0} / ${Number(c.venueCount)||0}会場</p>
        <p>シャドー勝率 ${pct(c.shadowWinShare)} / 平均LogLoss改善 ${Number.isFinite(Number(c.avgLogLossImprovement))?Number(c.avgLogLossImprovement).toFixed(4):"-"} / 直近 ${Number.isFinite(Number(c.recentAvgLogLossImprovement))?Number(c.recentAvgLogLossImprovement).toFixed(4):"-"}</p>
        <p class="muted">監査指紋 ${esc(c.fingerprint||"-")} / 方法論 ${esc(c.methodologyEpoch||"-")} / ${esc(c.reason||"")}</p>
        <p><strong>最終承認:</strong> ${approval?esc(approvalLabel[approval.decision]||approval.decision):"未審査"} / <strong>カナリア:</strong> ${esc(plan.status||"BLOCKED")}</p>
        ${approval?.note?`<p class="muted">承認メモ: ${esc(approval.note)}</p>`:""}
        <details><summary>チェック内容</summary>
          <div class="abilityList auditKeyValueList">${(c.checks||[]).map(x=>`<div class="abilityRow auditKeyValueRow"><strong>${esc(x.label)}</strong><span>${x.passed?"○":"×"}</span></div>`).join("")}</div>
        </details>
        ${c.status==="FINAL_REVIEW_READY"?`<div class="evidenceButtons finalApprovalButtons">
          <button type="button" data-final-package="${esc(c.packageKey)}" data-final-fingerprint="${esc(c.fingerprint||"")}" data-final-decision="APPROVE_CANARY">カナリア承認</button>
          <button type="button" data-final-package="${esc(c.packageKey)}" data-final-fingerprint="${esc(c.fingerprint||"")}" data-final-decision="HOLD">保留</button>
          <button type="button" data-final-package="${esc(c.packageKey)}" data-final-fingerprint="${esc(c.fingerprint||"")}" data-final-decision="REJECT">却下</button>
        </div>`:""}
        ${plan.status==="CANARY_PLAN_READY"?`<div class="abilityList auditKeyValueList">
          <div class="abilityRow auditKeyValueRow"><strong>カナリアモード</strong><span>CANARY_SHADOW</span></div>
          <div class="abilityRow auditKeyValueRow"><strong>本番影響</strong><span>0%</span></div>
          <div class="abilityRow auditKeyValueRow"><strong>表示予想変更</strong><span>なし</span></div>
          <div class="abilityRow auditKeyValueRow"><strong>購入プラン変更</strong><span>なし</span></div>
          <div class="abilityRow auditKeyValueRow"><strong>本番パラメータ変更</strong><span>なし</span></div>
        </div>
        <div class="evidenceButtons"><button type="button" data-canary-start="${esc(c.packageKey)}">0%カナリア開始</button></div>`:""}
      </div>`;
    }).join("")}</div>
    <p class="muted">カナリア承認しても本番値は変更しません。本番影響0%の監視プランだけを許可します。監査指紋が変われば承認は無効です。</p>
  </details>`;
}
function bindFinalApprovalButtons(){
  document.querySelectorAll("[data-final-package][data-final-decision]").forEach(button=>{
    button.onclick=()=>{
      try{
        const research=summarizeShadowComparisons(localStorage);
        const candidate=research.finalReview?.candidates?.find(c=>c.packageKey===button.dataset.finalPackage);
        if(!candidate)throw new Error("最終審査候補が見つかりません");
        const decision=button.dataset.finalDecision;
        const note=decision==="APPROVE_CANARY"?"本番影響0%のカナリア監視へ進める":decision==="HOLD"?"追加比較を継続":"最終承認しない";
        saveFinalPromotionApproval(localStorage,{candidate,decision,note,reviewer:"manual"});
        if(currentResult)renderResult(currentResult);
      }catch(error){fail("最終承認を保存できません",error,()=>currentResult&&renderResult(currentResult))}
    };
  });
}


function renderCanaryOperations(summary){
  if(!summary||!Array.isArray(summary.rows)||!summary.rows.length)return "";
  const label={CANARY_ACTIVE:"カナリア稼働中",CANARY_VALIDATED:"カナリア検証済み",CANARY_ROLLBACK_RECOMMENDED:"ロールバック推奨",CANARY_ROLLED_BACK:"ロールバック確定",CANARY_STALE:"承認失効",CANARY_STOPPED:"停止済み"};
  const pct=v=>Number.isFinite(Number(v))?`${(Number(v)*100).toFixed(1)}%`:"-";
  return `<details class="supportBranchAudit"><summary>0%カナリア監視</summary>
    <div class="detailGroup">${summary.rows.slice(0,20).map(r=>`<div class="detailBet">
      <strong>${esc(label[r.status]||r.status)}</strong>
      <p>新規比較 ${Number(r.currentNewResults)||0}/${Number(r.minimumNewResults)||0}件 / シャドー勝率 ${pct(r.currentWinShare)}</p>
      <p>平均LogLoss改善 ${Number.isFinite(Number(r.currentAvgLogLossImprovement))?Number(r.currentAvgLogLossImprovement).toFixed(4):"-"} / 直近 ${Number.isFinite(Number(r.currentRecentAvgLogLossImprovement))?Number(r.currentRecentAvgLogLossImprovement).toFixed(4):"-"}</p>
      <p>証拠確定率 ${Number.isFinite(Number(r.evidenceQualityCurrent?.decisiveRate))?`${(Number(r.evidenceQualityCurrent.decisiveRate)*100).toFixed(1)}%`:"-"} / カナリア開始後 ${Number.isFinite(Number(r.evidenceQualityRecent?.decisiveRate))?`${(Number(r.evidenceQualityRecent.decisiveRate)*100).toFixed(1)}%`:"-"} / 開始後確定 ${Number(r.postStartDecisiveCount)||0}件</p>
      <p>比較コホート ${Number(r.eligibleComparisonCount)||0}件 / 旧epoch・非孤立除外 ${Number(r.excludedComparisonCount)||0}件 / 証拠ゲート ${r.postStartEvidenceGatePassed?"○":"待ち"}</p>
      ${r.rollbackSignal?`<p class="muted">信号: ${esc(r.rollbackSignal)}${r.rollbackReason?` / ${esc(r.rollbackReason)}`:""}</p>`:""}
      ${r.status==="CANARY_ROLLBACK_RECOMMENDED"?`<button type="button" data-canary-rollback="${esc(r.packageKey)}">ロールバック確定</button>`:""}
      ${["CANARY_ACTIVE","CANARY_ROLLBACK_RECOMMENDED","CANARY_VALIDATED"].includes(r.status)?`<button type="button" data-canary-stop="${esc(r.packageKey)}">カナリア停止</button>`:""}
      ${r.status==="CANARY_ROLLED_BACK"?`<p class="muted">同じ監査指紋 ${esc(r.restartBlockedFingerprint||r.fingerprint||"-")} では再開不可。最終カナリア承認も失効済みです。新しい監査指紋で再審査・再承認が必要です。</p>`:""}
    </div>`).join("")}</div>
    <p class="muted">この監視は本番影響0%です。比較母数は現行方法論epoch・孤立正規化済みだけに限定します。直近証拠の確定率も監視し、LogLoss・勝率が基準を満たしても、開始後の確定証拠5件以上かつ確定率60%以上を満たすまでCANARY_VALIDATEDにはしません。</p>
  </details>`;
}
function bindCanaryButtons(){
  document.querySelectorAll("[data-canary-start]").forEach(button=>{
    button.onclick=()=>{
      try{
        const shadow=summarizeShadowComparisons(localStorage);
        const candidate=shadow.finalReview?.candidates?.find(c=>c.packageKey===button.dataset.canaryStart);
        const approval=finalApprovalFor(localStorage,button.dataset.canaryStart);
        if(!candidate)throw new Error("カナリア候補が見つかりません");
        activateCanaryRun(localStorage,{candidate,approval});
        if(currentResult)renderResult(currentResult);
      }catch(error){fail("カナリアを開始できません",error,()=>currentResult&&renderResult(currentResult))}
    };
  });
  document.querySelectorAll("[data-canary-rollback]").forEach(button=>{
    button.onclick=()=>{
      try{
        acknowledgeCanaryRollback(localStorage,button.dataset.canaryRollback,{reason:"manual_rollback_ack"});
        if(currentResult)renderResult(currentResult);
      }catch(error){fail("ロールバック確定に失敗しました",error,()=>currentResult&&renderResult(currentResult))}
    };
  });
  document.querySelectorAll("[data-canary-stop]").forEach(button=>{
    button.onclick=()=>{
      stopCanaryRun(localStorage,button.dataset.canaryStop,{reason:"manual_stop"});
      if(currentResult)renderResult(currentResult);
    };
  });
}

function renderResearchLearningSummary(summary,promotionReviewSummary={},shadowComparisonSummary={},finalApprovalSummary={},canarySummary={},backfillSummary={},operationalLearning={},resultOnlySummary={}){
  if(!summary||!summary.totalRecords){const ro=Number(resultOnlySummary?.objectiveRaces)||0,nodes=Number(resultOnlySummary?.objectiveNodes)||0;return `<details class="supportBranchAudit"><summary>研究学習集計</summary><p class="muted">予想ありの結果検証データはまだありません。</p>${ro?`<p>予想なし結果研究 <strong>${ro}R / ${nodes}客観ノード</strong></p><p>集約選手 ${Number(resultOnlySummary.aggregateRiderCount)||0}人 / 研究候補 ${Number(resultOnlySummary.researchCandidateCount)||0}件 / 検証候補 ${Number(resultOnlySummary.researchValidationCandidateCount)||0}件</p><p class="muted">予想精度・回収率・確率校正の母数には入れません。時系列再現と会場分散を通っても研究検証候補までです。</p>`:""}</details>`;}
  const pct=v=>Number.isFinite(Number(v))?`${(Number(v)*100).toFixed(1)}%`:"-",num=v=>Number.isFinite(Number(v))?Number(v).toFixed(3):"-",cal=summary.stageCalibration||{};
  const calRows=["FIRST","SECOND","THIRD"].map(k=>{const x=cal[k]||{},label={FIRST:"1着",SECOND:"2着｜1着",THIRD:"3着｜1-2着"}[k];return `<div class="abilityRow auditKeyValueRow"><strong>${label}確率校正</strong><span>N=${Number(x.sampleCount)||0} / Brier ${num(x.brier)} / LogLoss ${num(x.logLoss)}</span></div>`}).join("");
  return `<details class="supportBranchAudit"><summary>研究学習集計（通常${Number(summary.normalCount)||0}R / 例外${Number(summary.exceptionalCount)||0}R）</summary><div class="abilityList auditKeyValueList">
  <div class="abilityRow auditKeyValueRow"><strong>正解1着ファミリー生成率</strong><span>${pct(summary.firstFamilyGeneratedRate)}</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>正解1-2枝生成率</strong><span>${pct(summary.pairGeneratedRate)}</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>正解終端生成率</strong><span>${pct(summary.exactTerminalGeneratedRate)}</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>購入的中率</strong><span>${pct(summary.purchaseHitRate)}</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>1着候補の生成漏れ</strong><span>${Number(summary.firstFamilyGenerationMissCount)||0}R</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>2着枝の生成漏れ</strong><span>${Number(summary.secondBranchGenerationMissCount)||0}R</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>3着終端の生成漏れ</strong><span>${Number(summary.thirdTerminalGenerationMissCount)||0}R</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>生成済み・購入不採用</strong><span>${Number(summary.purchaseSelectionMissCount)||0}R</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>正解終端の平均順位</strong><span>${num(summary.avgTerminalRank)}</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>正解終端TOP10率</strong><span>${pct(summary.top10TerminalRate)}</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>終端Log Loss</strong><span>${num(summary.terminalLogLoss)}</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>条件証拠 保留</strong><span>${Number(summary.evidenceReview?.pending)||0}件</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>条件証拠 成立確認</strong><span>${Number(summary.evidenceReview?.confirmed)||0}件</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>条件証拠 不成立確認</strong><span>${Number(summary.evidenceReview?.refuted)||0}件</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>条件証拠 判定不能</strong><span>${Number(summary.evidenceReview?.unknown)||0}件</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>過去結果バックフィル</strong><span>${Number(backfillSummary.added)||0}件追加</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>既存研究レコード保護</strong><span>${Number(backfillSummary.skippedExisting)||0}件維持</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>縮約形式バックフィル</strong><span>${Number(backfillSummary.degradedCount)||0}件</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>確率質量 正常</strong><span>${Number(summary.probabilityMass?.verifiedCount)||0}R</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>確率質量 異常</strong><span>${Number(summary.probabilityMass?.invalidCount)||0}R</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>確率質量 未監査</strong><span>${Number(summary.probabilityMass?.unverifiedCount)||0}R</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>平均終端確率質量</strong><span>${Number.isFinite(Number(summary.probabilityMass?.avgTerminalMass))?Number(summary.probabilityMass.avgTerminalMass).toFixed(4):"-"}</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>公式証拠で自動判定</strong><span>${Number(summary.evidenceReview?.autoResolved)||0}件</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>証拠レビュー完了</strong><span>${Number(summary.evidenceReview?.reviewCompleteRaceCount)||0}R</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>証拠全件確定</strong><span>${Number(summary.evidenceReview?.decisiveEvidenceCompleteRaceCount)||0}R</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>因果学習可能</strong><span>${Number(summary.evidenceReview?.nodeCauseLearningEligibleRaceCount)||0}R</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>昇格審査 承認(シャドー)</strong><span>${Number(promotionReviewSummary.approvedShadow)||0}件</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>昇格審査 保留</strong><span>${Number(promotionReviewSummary.hold)||0}件</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>昇格審査 却下</strong><span>${Number(promotionReviewSummary.rejected)||0}件</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>シャドー比較 待ち</strong><span>${Number(shadowComparisonSummary.pending)||0}件</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>シャドー比較 完了</strong><span>${Number(shadowComparisonSummary.completed)||0}件</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>評価整合性あり</strong><span>${Number(shadowComparisonSummary.integrityCompleted)||0}件</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>旧combined除外</strong><span>${Number(shadowComparisonSummary.legacyExcluded)||0}件</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>シャドー優位</strong><span>${Number(shadowComparisonSummary.shadowBetter)||0}件</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>現行優位</strong><span>${Number(shadowComparisonSummary.currentBetter)||0}件</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>シャドー検証済み</strong><span>${Number(shadowComparisonSummary.qualification?.validatedCount)||0}件</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>ロールバック推奨</strong><span>${Number(shadowComparisonSummary.qualification?.rollbackRecommendedCount)||0}件</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>最終審査へ進行可</strong><span>${Number(shadowComparisonSummary.finalReview?.readyCount)||0}件</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>最終承認 カナリア</strong><span>${Number(finalApprovalSummary.canaryApproved)||0}件</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>最終承認 保留</strong><span>${Number(finalApprovalSummary.hold)||0}件</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>最終承認 却下</strong><span>${Number(finalApprovalSummary.rejected)||0}件</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>カナリア 稼働中</strong><span>${Number(canarySummary.active)||0}件</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>カナリア 検証済み</strong><span>${Number(canarySummary.validated)||0}件</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>カナリア ロールバック推奨</strong><span>${Number(canarySummary.rollbackRecommended)||0}件</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>カナリア ロールバック確定</strong><span>${Number(canarySummary.rolledBack)||0}件</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>実運用自動集計</strong><span>${esc(operationalLearning.status||"未開始")}</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>直近監視サンプル</strong><span>${Number(operationalLearning.currentWindowRaces)||0} / ${Number(operationalLearning.minimumRaces)||100}R</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>比較基準サンプル</strong><span>${Number(operationalLearning.baselineWindowRaces)||0}R</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>v182レビュー自動ドラフト</strong><span>${operationalLearning.status==="OPERATIONAL_V182_REVIEW_DRAFT_READY"?"生成済み":operationalLearning.status==="OPERATIONAL_ROLLBACK_REVIEW_REQUIRED"?"異常あり・要確認":"未到達"}</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>予想なし結果研究</strong><span>${Number(resultOnlySummary.objectiveRaces)||0}R / ${Number(resultOnlySummary.objectiveNodes)||0}客観ノード</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>結果のみ研究の集約選手</strong><span>${Number(resultOnlySummary.aggregateRiderCount)||0}人</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>結果のみ研究候補</strong><span>${Number(resultOnlySummary.researchCandidateCount)||0}件（仮説のみ）</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>時系列・会場ゲート通過</strong><span>${Number(resultOnlySummary.researchValidationCandidateCount)||0}件 / 保留${Number(resultOnlySummary.researchValidationPendingCount)||0} / 再現失敗${Number(resultOnlySummary.researchValidationFailedCount)||0}</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>予想あり独立照合</strong><span>${Number(resultOnlySummary.predictionCrosscheckObservedCount)||0}件 / 待ち${Number(resultOnlySummary.predictionCrosscheckPendingCount)||0} / 非対象${Number(resultOnlySummary.predictionCrosscheckNotApplicableCount)||0}</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>事前方向支持</strong><span>${Number(resultOnlySummary.predictionDirectionalSupportCount)||0}件（研究レビュー用のみ）</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>結果のみ研究レビュー</strong><span>候補${Number(resultOnlySummary.researchReviewCandidateCount)||0}件 / 証拠待ち${Number(resultOnlySummary.researchReviewPendingCount)||0}件 / 試験候補${Number(resultOnlySummary.researchTrialCandidateCount)||0}件</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>SHADOW試験後レビュー</strong><span>${resultOnlySummary.postResearchTrialReviewStatus||"未作成"}</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>SHADOW試験後判定</strong><span>${resultOnlySummary.postResearchTrialDecisionStatus||"未判定"} / 限定適用候補${Number(resultOnlySummary.limitedResearchApplicationCandidateCount)||0}件</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>限定研究適用計画</strong><span>${resultOnlySummary.limitedResearchApplicationPlanStatus||"未作成"} / 開始レビュー待ち${Number(resultOnlySummary.limitedResearchApplicationPlanReadyCount)||0}件</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>限定研究適用開始レビュー</strong><span>${resultOnlySummary.limitedResearchApplicationActivationReviewStatus||"未実施"} / 開始許可${Number(resultOnlySummary.limitedResearchApplicationStartAuthorizedCount)||0}件</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>限定研究適用モニター</strong><span>${resultOnlySummary.limitedResearchApplicationMonitorStatus||"未開始"} / ${Number(resultOnlySummary.limitedResearchApplicationMonitorObservedRaces)||0}R / ロールバック${Number(resultOnlySummary.limitedResearchApplicationRollbackCount)||0}件 / 後レビュー待ち${Number(resultOnlySummary.limitedResearchApplicationPostReviewRequiredCount)||0}件</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>限定研究適用後レビュー</strong><span>${resultOnlySummary.postLimitedResearchApplicationReviewStatus||"未作成"} / 手動判定待ち${Number(resultOnlySummary.postLimitedResearchApplicationReviewReadyCount)||0}件</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>限定研究適用後判定</strong><span>${resultOnlySummary.postLimitedResearchApplicationDecisionStatus||"未判定"} / 次研究評価候補${Number(resultOnlySummary.independentResearchEvaluationCandidateCount)||0}件</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>独立研究評価計画</strong><span>${resultOnlySummary.independentResearchEvaluationPlanStatus||"未作成"} / 開始レビュー待ち${Number(resultOnlySummary.independentResearchEvaluationPlanReadyCount)||0}件</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>独立研究評価開始レビュー</strong><span>${resultOnlySummary.independentResearchEvaluationActivationReviewStatus||"未実施"} / 開始許可${Number(resultOnlySummary.independentResearchEvaluationStartAuthorizedCount)||0}件</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>独立研究評価ラン</strong><span>${resultOnlySummary.independentResearchEvaluationRunStatus||"未開始"} / 稼働${Number(resultOnlySummary.independentResearchEvaluationRunActiveCount)||0}件</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>独立研究評価モニター</strong><span>${resultOnlySummary.independentResearchEvaluationMonitorStatus||"未監視"} / ${Number(resultOnlySummary.independentResearchEvaluationMonitorObservedRaces)||0}R / 失敗条件${Number(resultOnlySummary.independentResearchEvaluationFailureCount)||0}件 / 後レビュー待ち${Number(resultOnlySummary.independentResearchEvaluationReviewRequiredCount)||0}件</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>独立研究評価後レビュー</strong><span>${resultOnlySummary.postIndependentResearchEvaluationReviewStatus||"未作成"} / READY ${Number(resultOnlySummary.postIndependentResearchEvaluationReviewReadyCount)||0}件</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>結果のみ研究の予想精度母数</strong><span>0R（別枠）</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>カナリア 証拠待ち</strong><span>${Number(canarySummary.evidenceWaiting)||0}件</span></div>
  <div class="abilityRow auditKeyValueRow"><strong>カナリア 承認失効</strong><span>${Number(canarySummary.stale)||0}件</span></div>
  ${renderShadowQualification(shadowComparisonSummary.qualification)}
  ${renderFinalPromotionReview(shadowComparisonSummary.finalReview)}
  ${renderCanaryOperations(canarySummary)}
  ${calRows}</div>${renderCalibrationBins(cal)}
  ${renderConditionCalibration(summary.conditionCalibration)}
  <p class="muted">1着・2着・3着を別々に校正します。2着は実際の1着を親状態、3着は実際の1-2着を親状態として候補全員を比較します。</p>
  <p class="muted">研究版の校正・生成漏れ・購入採否監査用です。本番ロジックへは自動反映しません。</p></details>`;
}
function renderConditionCalibration(cal){
  if(!cal||!Number(cal.decisiveSampleCount))return `<details class="supportBranchAudit"><summary>成立条件の確率校正</summary><p class="muted">成立/不成立が証拠で確定した条件がまだありません。</p></details>`;
  const label={RECALIBRATION_CANDIDATE:"再校正候補",WATCH:"要監視",STABLE_OR_UNCLEAR:"現状維持/判定保留",INSUFFICIENT:"標本不足"};
  const proposalLabel={READY_FOR_RESEARCH_REVIEW:"研究レビュー候補",SHADOW_WATCH:"シャドー監視",NO_CHANGE_PROPOSED:"変更提案なし"};
  const holdoutLabel={HOLDOUT_PASS:"ホールドアウト合格",HOLDOUT_FAIL:"ホールドアウト不合格",TRAIN_NOT_READY:"訓練側未達",INSUFFICIENT_HOLDOUT:"ホールドアウト不足",NOT_APPLICABLE:"対象外"};
  const contextLabel={CONTEXT_PASS:"会場横断合格",CONTEXT_FAIL:"会場横断不合格",INSUFFICIENT_CONTEXT:"会場標本不足",WAIT_HOLDOUT:"ホールドアウト待ち",NOT_APPLICABLE:"対象外"};
  const independentLabel={INDEPENDENT_AUDIT_PASS:"独立監査合格",INDEPENDENT_AUDIT_FAIL:"独立監査不合格",INSUFFICIENT_INDEPENDENT_CONTEXT:"独立監査標本不足",NOT_APPLICABLE:"対象外"};
  const pct=v=>Number.isFinite(Number(v))?`${(Number(v)*100).toFixed(1)}%`:"-";
  return `<details class="supportBranchAudit"><summary>成立条件の確率校正（証拠確定 ${Number(cal.decisiveSampleCount)||0}件 / 研究提案 ${Number(cal.shadowProposalCount)||0}件 / ホールドアウト合格 ${Number(cal.holdoutPassedCount)||0}件 / 会場横断合格 ${Number(cal.contextPassedCount)||0}件 / 独立監査合格 ${Number(cal.independentAuditPassedCount)||0}件 / 昇格パッケージ ${Number(cal.promotionPackageReadyCount)||0}件）</summary><p class="muted">Brier / LogLossは診断値です。終端確率質量が1.0付近に正規化されていることを別監査し、異常があれば校正済み確率とは扱いません。</p><p class="muted">研究提案候補は訓練側だけで判定し、ホールドアウトは候補生成後まで未使用にします。</p><p class="muted">着順再評価監査: 1着成立後は残り全員を2着へ、1-2着成立後は残り全員を3着へ再投入。別線番手・後位の混合終端も候補生成段階では削除しません。</p><p class="muted">買い目0件防止: 終端生成に成功している限り、通常購入条件が0件でも自然度上位の参考買い目を最低1件表示します。見送り理由は別に保持します。</p><p class="muted">並び未取得時の全員MAIN化も防止: 選手間の1・2・3着評価や先行/まくり評価に十分な差がない場合は通常購入を止め、参考買い目だけを残します。完全横並び時は同じ1-2着へ4点固定せず、各1着候補から自然度最上位を1本ずつ残します。終端は削除しません。</p><p class="muted">3着専用工程: 1-2着成立後は残り全員について3着条件を先に独立生成し、その後にだけ3着score・確率を付与。低確率を理由に終端生成段階では削除しません。</p><p class="muted">3着→買い目ブリッジ: 選ばれた1-2着枝では、生成済みの3着終端を全件購入評価へ渡してから、本線・押さえ・高配当・不採用を決めます。3着評価が低いだけで購入評価前に消しません。</p><p class="muted">購入評価前の入口も1-2着専用化: 3着を含む自然収束度ではなく、FIRST+SECONDだけの収束度で1-2着枝を選びます。3着が弱いことでブリッジ到達前に落ちる経路を禁止しました。</p><p class="muted">選手能力評価v3: 素の能力評価とライン役割・位置文脈を分離。先に能力だけを評価し、その後に役割文脈を小さく補正します。並び不明時は役割補正を弱め、番手・三番手というだけで能力を過大評価しません。</p><p class="muted">以後の会場横断・独立監査・昇格パッケージも、訓練側で固定した同じ提案値を使います。全データで提案値を作り直しません。</p>
    <p class="muted">予想条件の事前確率と、証拠で確認した実現率を比較します。UNKNOWN・保留・例外レースは母数に入れません。</p>
    <div class="detailGroup">${(cal.groups||[]).slice(0,20).map(g=>{const p=g.shadowProposal||{},s=g.temporalStability||{};return `<div class="detailBet"><strong>${esc(g.stage||"?")} / ${esc(g.family||"UNKNOWN")}</strong><p>${esc(label[g.reviewStatus]||g.reviewStatus)} / ${esc(proposalLabel[p.status]||p.status||"")} / N=${Number(g.sampleCount)||0}</p><p>現行 ${pct(g.predictedAvg)} → 実現 ${pct(g.observedRate)}${Number.isFinite(Number(p.suggestedProbability))?` → <strong>研究提案 ${pct(p.suggestedProbability)}</strong>`:""}</p><p class="muted">差 ${Number.isFinite(Number(g.gap))?`${(Number(g.gap)*100).toFixed(1)}pt`:"-"} / 95%区間 ${pct(g.observedWilsonLow)}〜${pct(g.observedWilsonHigh)} / Brier ${Number.isFinite(Number(g.brier))?Number(g.brier).toFixed(3):"-"}</p><p class="muted">時系列 ${esc(s.status||"-")}${Number.isFinite(Number(s.earlierRate))?` / 前半${pct(s.earlierRate)}・後半${pct(s.recentRate)}`:""}${p.reason?` / ${esc(p.reason)}`:""}</p>${g.trainCandidate?`<p class="muted"><strong>訓練側候補判定</strong> N=${Number(g.trainCandidate.sampleCount)||0} / 現行 ${(Number(g.trainCandidate.predictedAvg)*100).toFixed(1)}% → 観測 ${(Number(g.trainCandidate.observedRate)*100).toFixed(1)}% / ${esc(g.trainCandidate.proposal?.status||"-")}</p>`:""}
        ${g.holdoutValidation?`<p class="muted"><strong>${esc(holdoutLabel[g.holdoutValidation.status]||g.holdoutValidation.status)}</strong>${Number.isFinite(Number(g.holdoutValidation.brierImprovement))?` / Brier改善 ${(Number(g.holdoutValidation.brierImprovement)*1000).toFixed(2)}×10⁻³`:""}${Number.isFinite(Number(g.holdoutValidation.logLossImprovement))?` / LogLoss改善 ${Number(g.holdoutValidation.logLossImprovement).toFixed(3)}`:""} / ${esc(g.holdoutValidation.reason||"")}</p>`:""}
        ${g.contextRobustness?`<p class="muted"><strong>${esc(contextLabel[g.contextRobustness.status]||g.contextRobustness.status)}</strong>${Number.isFinite(Number(g.contextRobustness.directionShare))?` / 方向一致 ${(Number(g.contextRobustness.directionShare)*100).toFixed(0)}%`:""}${Number.isFinite(Number(g.contextRobustness.improvementShare))?` / 改善会場 ${(Number(g.contextRobustness.improvementShare)*100).toFixed(0)}%`:""} / ${esc(g.contextRobustness.reason||"")}</p>`:""}
        ${g.promotionAudit?`<p class="muted"><strong>${g.promotionAudit.status==="PROMOTION_AUDIT_READY"?"独立昇格監査へ進行可":"独立昇格監査は保留"}</strong> / ${Number(g.promotionAudit.passedCount)||0}/${Number(g.promotionAudit.totalChecks)||0}条件通過</p>`:""}
        ${g.independentAudit?`<p class="muted"><strong>${esc(independentLabel[g.independentAudit.status]||g.independentAudit.status)}</strong>${Number.isFinite(Number(g.independentAudit.passShare))?` / 会場除外fold合格 ${(Number(g.independentAudit.passShare)*100).toFixed(0)}%`:""}${Number.isFinite(Number(g.independentAudit.proposalSpread))?` / 提案幅 ${(Number(g.independentAudit.proposalSpread)*100).toFixed(1)}pt`:""}${g.independentAudit.sensitivity?.status?` / 感度 ${esc(g.independentAudit.sensitivity.status)}`:""} / ${esc(g.independentAudit.reason||"")}</p>`:""}
        ${renderPromotionPackage(g.promotionPackage)}
      </div>`}).join("")}</div>
    ${renderShadowProposalSummary(cal)}
    <p class="muted">研究提案は観測率をそのまま採用せず、現行値へ縮約したシャドー値です。本番値は変更しません。</p>
  </details>`;
}
function renderPromotionPackage(pkg){
  if(!pkg||pkg.status!=="PROMOTION_PACKAGE_READY")return "";
  const pct=v=>Number.isFinite(Number(v))?`${(Number(v)*100).toFixed(1)}%`:"-";
  const review=promotionReviewFor(localStorage,pkg.packageKey);
  const reviewLabel={APPROVE_SHADOW:"シャドー承認",HOLD:"保留",REJECT:"却下"};
  const reviewCurrent=Boolean(review&&review.packageFingerprint===pkg.approvalFingerprint&&review.methodologyEpoch===pkg.methodologyEpoch);
  return `<details class="supportBranchAudit" open><summary>昇格候補パッケージ</summary>
    <div class="abilityList auditKeyValueList">
      <div class="abilityRow auditKeyValueRow"><strong>現行確率</strong><span>${pct(pkg.currentProbability)}</span></div>
      <div class="abilityRow auditKeyValueRow"><strong>研究提案値</strong><span>${pct(pkg.suggestedProbability)}</span></div>
      <div class="abilityRow auditKeyValueRow"><strong>変更幅</strong><span>${Number.isFinite(Number(pkg.delta))?`${(Number(pkg.delta)*100).toFixed(1)}pt`:"-"}</span></div>
      <div class="abilityRow auditKeyValueRow"><strong>運用モード</strong><span>SHADOW_ONLY</span></div>
      <div class="abilityRow auditKeyValueRow"><strong>手動承認</strong><span>必須</span></div>
      <div class="abilityRow auditKeyValueRow"><strong>現在の審査</strong><span>${review?(reviewCurrent?esc(reviewLabel[review.decision]||review.decision):"旧方法論の審査・再承認必要"):"未審査"}</span></div>
      <div class="abilityRow auditKeyValueRow"><strong>方法論epoch</strong><span>${esc(pkg.methodologyEpoch||"-")}</span></div>
      <div class="abilityRow auditKeyValueRow"><strong>承認指紋</strong><span>${esc(pkg.approvalFingerprint||"-")}</span></div>
      <div class="abilityRow auditKeyValueRow"><strong>再監査まで</strong><span>${Number(pkg.rollbackPolicy?.reviewAfterSamples)||0}件</span></div>
      <div class="abilityRow auditKeyValueRow"><strong>ロールバック</strong><span>Brier悪化 / 方向反転 / 証拠品質低下</span></div>
    </div>
    ${review?.note?`<p class="muted">審査メモ: ${esc(review.note)}</p>`:""}
    <div class="evidenceButtons promotionReviewButtons">
      <button type="button" data-promotion-package="${esc(pkg.packageKey)}" data-promotion-fingerprint="${esc(pkg.approvalFingerprint||"")}" data-promotion-decision="APPROVE_SHADOW">シャドー承認</button>
      <button type="button" data-promotion-package="${esc(pkg.packageKey)}" data-promotion-fingerprint="${esc(pkg.approvalFingerprint||"")}" data-promotion-decision="HOLD">保留</button>
      <button type="button" data-promotion-package="${esc(pkg.packageKey)}" data-promotion-fingerprint="${esc(pkg.approvalFingerprint||"")}" data-promotion-decision="REJECT">却下</button>
    </div>
    <p class="muted">このパッケージは本番変更命令ではありません。シャドー承認しても本番値は変更しません。承認後は保存済み予想について現行確率と研究提案値を並行計算するシャドー比較レコードを作ります。買い目・本番値は変えません。自動昇格しません。</p>
  </details>`;
}

function renderShadowProposalSummary(cal){
  const rows=Array.isArray(cal?.shadowProposals)?cal.shadowProposals:[];if(!rows.length)return `<p class="muted">現在、本番反映を検討できる研究提案はありません。</p>`;
  const pct=v=>Number.isFinite(Number(v))?`${(Number(v)*100).toFixed(1)}%`:"-";
  return `<details class="supportBranchAudit"><summary>研究レビュー候補 ${rows.length}件</summary><div class="abilityList auditKeyValueList">${rows.map(r=>`<div class="abilityRow auditKeyValueRow"><strong>${esc(r.stage||"?")} / ${esc(r.family||"UNKNOWN")}</strong><span>${pct(r.currentProbability)} → ${pct(r.suggestedProbability)} / N=${Number(r.sampleCount)||0} / ${r.holdoutValidation?.status==="HOLDOUT_PASS"?"検証○":"検証未通過"}</span></div>`).join("")}</div><p class="muted">研究提案値は、時系列ホールドアウト・会場横断監査・独立監査を通過しても直接本番へ入れず、まず昇格候補パッケージとして固定します。それでも自動昇格しません。手動承認なしでは本番値を変更しません。</p></details>`;
}

function renderCalibrationBins(cal){
  return ["FIRST","SECOND","THIRD"].map(k=>{const bins=Array.isArray(cal?.[k]?.bins)?cal[k].bins:[];if(!bins.length)return"";const label={FIRST:"1着",SECOND:"2着｜1着",THIRD:"3着｜1-2着"}[k];return `<details class="supportBranchAudit"><summary>${label}の確率帯を見る</summary><div class="abilityList auditKeyValueList">${bins.map(b=>`<div class="abilityRow auditKeyValueRow"><strong>${Math.round(Number(b.low)*100)}〜${Math.round(Number(b.high)*100)}%</strong><span>N=${Number(b.count)||0} / 予測${(Number(b.avgPredicted)*100).toFixed(1)}% / 実現${(Number(b.observedRate)*100).toFixed(1)}%</span></div>`).join("")}</div></details>`}).join("");
}

function resultVerificationLabel(v){
  return({PURCHASE_HIT:"購入的中",PURCHASE_SELECTION_MISS:"正解終端は生成済み・購入不採用",FIRST_FAMILY_GENERATION_MISS:"1着候補の生成漏れ",SECOND_BRANCH_GENERATION_MISS:"2着枝の生成漏れ",THIRD_TERMINAL_GENERATION_MISS:"3着終端の生成漏れ",TERMINAL_GENERATION_MISS:"正解終端の生成漏れ（旧形式）",NOT_APPLICABLE:"通常検証対象外",NONE:"検証済み"})[v]||v||"不明";
}
function renderSaved(){const all=loadSnapshots(localStorage);$("savedCount").textContent=`${all.length}件`;$("savedList").innerHTML=all.length?all.slice(0,8).map((s,i)=>`<article class="savedItem"><h3>${esc(s.targetRace.venueName)} ${s.targetRace.raceNo}R</h3><p>${formatDate(s.targetRace.date)} / ${formatTime(s.createdAt)} ${s.result?`/ ${resultLabel(s.result.resultStatus)}`:""}</p><button data-saved="${i}">詳細を見る</button></article>`).join(""):'<p class="empty">保存した予想はまだありません。</p>';$("savedList").querySelectorAll("[data-saved]").forEach(b=>b.onclick=()=>{const s=all[Number(b.dataset.saved)];openSavedDetail(s)})}
function deadlineOf(r){return String(r?.deadline||r?.scheduledStart||"")}
function raceStatus(r){const t=parseTime(r.date,deadlineOf(r));if(!t)return{label:"未発走",className:""};const diff=t-Date.now();if(diff<=0)return{label:"終了",className:"danger"};if(diff<=15*60000)return{label:"締切間近",className:"warning"};return{label:"未発走",className:""}}
function meetingNextDeadline(m){const nums=raceNumbersOf(m),races=(nums.length?nums:Array.from({length:12},(_,i)=>i+1)).map(n=>raceFrom(m,n)),timed=races.map(r=>({r,t:parseTime(r.date,deadlineOf(r))})).filter(x=>x.t).sort((a,b)=>a.t-b.t),next=timed.find(x=>x.t>Date.now());if(next)return`次締切 ${next.r.raceNo}R ${deadlineOf(next.r)}`;return timed.length?"本日終了":"締切確認中"}
function meetingTimeBand(m){const nums=raceNumbersOf(m),races=(nums.length?nums:Array.from({length:12},(_,i)=>i+1)).map(n=>raceFrom(m,n)),minutes=races.map(r=>timeMinutes(deadlineOf(r))).filter(Number.isFinite);if(!minutes.length)return{key:"day",label:"デイ"};const first=Math.min(...minutes),last=Math.max(...minutes);if(last>=21*60)return{key:"midnight",label:"ミッド"};if(last>=18*60)return{key:"night",label:"ナイター"};if(first<10*60)return{key:"morning",label:"モーニング"};return{key:"day",label:"デイ"}}
function timeMinutes(value){const m=String(value||"").match(/(\d{1,2}):(\d{2})/);return m?Number(m[1])*60+Number(m[2]):NaN}
function parseTime(date,time){const m=String(time||"").match(/(\d{1,2}):(\d{2})/);if(!m)return null;const d=String(date).replace(/\D/g,"");return new Date(`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T${m[1].padStart(2,"0")}:${m[2]}:00+09:00`).getTime()}
function venueCode(m){return String(m.venueCode||m.code||VENUE_CODES[m.venueName]||"").padStart(2,"0")}function getCard(m){return m.discovery?.links?.raceCards?.[0]||m.discovery?.links?.other?.[0]}function getOdds(m){return m.discovery?.links?.odds?.[0]}
function displayParticipantRole(p){const order=Number(p?.lineOrder);if(!Number.isFinite(order))return p?.role||"";return order===1?"先頭":order===2?"番手":`${order}番手`}
function lineText(ps,raceCategory="standard",abilities=[]){if(raceCategory==="girls"){const ranked=[...(abilities||[])].filter(hasUsableGirlsStartPower).sort((a,b)=>Number(b.startPower)-Number(a.startPower)||Number(a.number)-Number(b.number)).slice(0,3);return ranked.length>=2?`固定ラインなし / 主導権候補 ${ranked.map(x=>`${x.number}番`).join(" ＞ ")}`:"固定ラインなし / 主導権候補 判定保留"}const groups=new Map();for(const p of ps||[]){const key=p.lineId||p.line||`solo-${p.number}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p)}const rows=[...groups.values()].map(members=>members.sort((a,b)=>(Number(a.lineOrder)||99)-(Number(b.lineOrder)||99)||Number(a.number)-Number(b.number)).map((p,index)=>{const order=Number(p.lineOrder)||index+1,role=order===1?"先頭":order===2?"番手":`${order}番手`;return `${p.number}(${role})`}).join("－"));return rows.join("　/　")||"公式ライン未取得"}
function metas(rows){return rows.map(([a,b])=>`<div class="meta"><span>${esc(a)}</span><strong>${esc(b)}</strong></div>`).join("")}function formatDate(v){const d=String(v||"").replace(/\D/g,"");return d.length===8?`${d.slice(0,4)}/${d.slice(4,6)}/${d.slice(6,8)}`:v||"-"}function formatTime(v){try{return new Intl.DateTimeFormat("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(v))}catch{return"-"}}function resultLabel(v){return({hit:"的中",miss:"不的中",refund:"返還",cancelled:"中止"})[v]||v}function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
