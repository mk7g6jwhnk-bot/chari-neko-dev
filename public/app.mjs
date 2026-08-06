
const $=id=>document.getElementById(id);
let state={sport:null,meeting:null,date:null,raceNo:null};

const SPORT={
 boat:{title:"ボート",code:"BOAT",valueTitle:"買える万舟"},
 keirin:{title:"競輪",code:"KEIRIN",valueTitle:"買える万車"},
 auto:{title:"オート",code:"AUTO",valueTitle:"買える万車"}
};

function show(id){document.querySelectorAll(".screen").forEach(x=>x.classList.toggle("active",x.id===id));window.scrollTo(0,0)}
function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
function compact(d){return d.replaceAll("-","")}
function setBadge(text,cls=""){ $("sportBadge").textContent=text;$("sportBadge").className=`badge ${cls}`}

document.querySelectorAll("[data-sport]").forEach(b=>b.onclick=()=>openSport(b.dataset.sport));
$("homeBtn").onclick=() => show("home");
$("backHome").onclick=() => show("home");
$("backSport").onclick=() => show("sport");
$("cancelLoading").onclick=() => show("races");
$("backRaces").onclick=() => show("races");

async function openSport(sport){
  state={sport,meeting:null,date:today(),raceNo:null};
  const cfg=SPORT[sport];
  $("sportCode").textContent=cfg.code;$("sportTitle").textContent=cfg.title;
  $("list").innerHTML='<div class="empty">取得中...</div>';$("listCount").textContent="0件";
  setupControls();show("sport");
  await loadMeetings();
}

function setupControls(){
  if(state.sport==="auto"){
    $("sportControls").innerHTML='<p>公式開催情報から開催場を取得します。</p>';
  }else{
    $("sportControls").innerHTML=`<label>開催日<input id="sportDate" type="date" value="${state.date}"></label><button id="reload" class="item">開催情報を更新</button>`;
    $("sportDate").onchange=e=>state.date=e.target.value;
    $("reload").onclick=loadMeetings;
  }
}

async function loadMeetings(){
  setBadge("取得中","warn");
  try{
    if(state.sport==="boat"){
      const r=await fetch(`/.netlify/functions/boat-schedule?date=${compact(state.date)}`,{cache:"no-store"}),p=await r.json();
      if(!r.ok||!p.ok)throw new Error(p.error||"開催取得失敗");
      renderItems(p.venues.map(v=>({name:v.name,sub:`場コード ${v.code}`,raw:v})),openBoatVenue);
    }else if(state.sport==="keirin"){
      const r=await fetch(`/.netlify/functions/keirin-discover?date=${compact(state.date)}`,{cache:"no-store"}),p=await r.json();
      if(!r.ok||!p.ok)throw new Error(p.error||"開催取得失敗");
      const meetings=Array.isArray(p.meetings)?p.meetings:[];
      const items=meetings.map((m,index)=>{
        const venueName=String(m?.venueName||m?.trackName||m?.name||`開催${index+1}`).trim();
        const venueCode=String(m?.venueCode||m?.code||"").padStart(2,"0");
        const normalized={...m,venueName,venueCode,date:m?.date||compact(state.date)};
        return {
          name:venueName,
          sub:`場コード ${venueCode||"--"} / 公式開催確認済み / 出走表 ${getKeirinCard(normalized)?"発見":"解析時取得"} / オッズ ${getKeirinOdds(normalized)?"発見":"解析時取得"}`,
          raw:normalized
        };
      }).filter(x=>x.name);
      renderItems(items,openKeirinVenue);
      if(!items.length){
        $("list").innerHTML=`<div class="empty">開催情報は取得できましたが表示対象が0件です。取得件数: ${meetings.length}</div>`;
      }
    }else{
      const r=await fetch('/.netlify/functions/auto-discover',{cache:"no-store"}),p=await r.json();
      if(!r.ok||!p.ok)throw new Error(p.error||"開催取得失敗");
      const items=p.meetings.map(m=>({name:m.trackName,sub:`出走表 ${getAutoProgram(m)?"発見":"未発見"} / オッズ ${getAutoOdds(m)?"発見":"未発見"}`,raw:m})).filter(x=>getAutoProgram(x.raw));
      renderItems(items,openAutoVenue);
    }
    setBadge("実データ","ok");
  }catch(e){
    $("list").innerHTML=`<div class="empty">${e.message}</div>`;setBadge("失敗","error");
  }
}

function renderItems(items,handler){
  const safeItems=Array.isArray(items)?items:[];
  $("list").innerHTML="";
  safeItems.forEach(x=>{
    const d=document.createElement("div");
    d.className="item";
    const strong=document.createElement("strong");
    strong.textContent=String(x?.name||"名称未取得");
    const br=document.createElement("br");
    const small=document.createElement("small");
    small.textContent=String(x?.sub||"");
    const button=document.createElement("button");
    button.type="button";
    button.textContent="レース一覧";
    button.disabled=false;
    button.onclick=()=>handler(x.raw);
    d.append(strong,br,small,button);
    $("list").appendChild(d);
  });
  if(!safeItems.length) $("list").innerHTML='<div class="empty">該当する開催がありません。</div>';
  $("listCount").textContent=`${safeItems.length}件`;
}

async function openBoatVenue(v){
  state.meeting=v;$("raceSportCode").textContent="BOAT";$("raceTitle").textContent=v.name;$("raceList").innerHTML='<div class="empty">レース一覧取得中...</div>';show("races");
  $("raceControls").innerHTML='<label>購入締切<select id="lead"><option value="10">公式10分前</option><option value="7">公式7分前</option><option value="5" selected>公式5分前</option><option value="3">公式3分前</option></select></label>';
  const load=async()=>{const lead=$("lead").value,r=await fetch(`/.netlify/functions/boat-races?date=${compact(state.date)}&jcd=${v.code}&lead=${lead}`,{cache:"no-store"}),p=await r.json();if(!r.ok||!p.ok)throw new Error(p.error||"レース一覧取得失敗");renderRaces(p.races.map(x=>({raceNo:x.raceNo,sub:`購入 ${x.purchaseDeadline||"-"} / 公式 ${x.officialDeadline||"-"}`,raw:x})),analyzeBoat);};
  $("lead").onchange=()=>load().catch(showRaceError);try{await load()}catch(e){showRaceError(e)}
}

function openKeirinVenue(m){
  state.meeting=m;$("raceSportCode").textContent="KEIRIN";$("raceTitle").textContent=m.venueName;$("raceControls").innerHTML="<p>公式内部リンクから対象レースを取得します。</p>";show("races");
  renderRaces(Array.from({length:12},(_,i)=>({raceNo:i+1,sub:"ライン・オッズを取得して解析",raw:{raceNo:i+1}})),analyzeKeirin);
}

function openAutoVenue(m){
  state.meeting=m;$("raceSportCode").textContent="AUTO";$("raceTitle").textContent=m.trackName;$("raceControls").innerHTML="<p>試走・走路・オッズを取得して解析します。</p>";show("races");
  renderRaces(Array.from({length:12},(_,i)=>({raceNo:i+1,sub:"試走・走路を取得して解析",raw:{raceNo:i+1}})),analyzeAuto);
}

function renderRaces(items,handler){
  $("raceList").innerHTML='<div class="grid3"></div>';const g=$("raceList").firstElementChild;
  items.forEach(x=>{const d=document.createElement("div");d.className="raceItem";d.innerHTML=`<strong>${x.raceNo}R</strong><br><small>${x.sub}</small><button>自動解析</button>`;d.querySelector("button").onclick=()=>handler(x.raw);g.appendChild(d)});
  $("raceCount").textContent=`${items.length}R`;
}
function showRaceError(e){$("raceList").innerHTML=`<div class="empty">${e.message}</div>`}

async function analyzeBoat(r){
  state.raceNo=r.raceNo;startLoading(`${state.meeting.name} ${r.raceNo}R`);
  try{
    const q=new URLSearchParams({date:compact(state.date),jcd:state.meeting.code,rno:String(r.raceNo),budget:"3000",lead:$("lead")?.value||"5"});
    const res=await fetch(`/.netlify/functions/boat-predict?${q}`,{cache:"no-store"}),p=await res.json();if(!res.ok||!p.ok)throw new Error(p.error||"解析失敗");renderBoatResult(p);show("result");
  }catch(e){loadingError(e)}
}

async function analyzeKeirin(r){
  state.raceNo=r.raceNo;startLoading(`${state.meeting.venueName} ${r.raceNo}R`);
  try{
    const card=getKeirinCard(state.meeting),odds=getKeirinOdds(state.meeting);
    const q=new URLSearchParams({date:compact(state.date),venueName:state.meeting.venueName,venueCode:String(state.meeting.venueCode||""),raceNo:String(r.raceNo),budget:"3000"});if(card?.url)q.set("raceCardUrl",card.url);if(odds?.url)q.set("oddsUrl",odds.url);
    const res=await fetch(`/.netlify/functions/keirin-predict?${q}`,{cache:"no-store"}),p=await res.json();if(!res.ok||!p.ok)throw new Error(p.error||"解析失敗");renderKeirinResult(p);show("result");
  }catch(e){loadingError(e)}
}

async function analyzeAuto(r){
  state.raceNo=r.raceNo;startLoading(`${state.meeting.trackName} ${r.raceNo}R`);
  try{
    const program=getAutoProgram(state.meeting),odds=getAutoOdds(state.meeting);
    const date=today().replaceAll("-",""),q=new URLSearchParams({date,trackName:state.meeting.trackName,programUrl:program.url,budget:"3000"});if(odds)q.set("oddsUrl",odds.url);
    const res=await fetch(`/.netlify/functions/auto-predict?${q}`,{cache:"no-store"}),p=await res.json();if(!res.ok||!p.ok)throw new Error(p.error||"解析失敗");renderAutoResult(p,r.raceNo);show("result");
  }catch(e){loadingError(e)}
}

function startLoading(title){$("loadingTitle").textContent=title;$("loadingStep").textContent="公式データを取得中";show("loading")}
function loadingError(e){$("loadingStep").textContent=`失敗: ${e.message}`}

function baseResult(cfg,title,x,warnings,summary,payload){
  $("resultSport").textContent=cfg.code;$("resultTitle").textContent=title;$("valueTitle").textContent=cfg.valueTitle;
  $("recommendation").textContent=x.recommendationLabel||"解析結果";$("warnings").textContent=warnings||"取得・解析完了";
  $("mainBets").textContent=join(x.recommendations.main);$("backupBets").textContent=join(x.recommendations.backup);$("valueBets").textContent=join(x.recommendations.value);$("strongBets").textContent=join(x.recommendations.strong);
  $("resultSummary").innerHTML=summary.map(([a,b])=>`<div><span>${a}</span><strong>${b}</strong></div>`).join("");
  $("plan").innerHTML=table(x.purchasePlan);$("debug").textContent=JSON.stringify(payload,null,2);
  $("resultBadge").textContent=x.audit.passed?"監査合格":"監査不合格";$("resultBadge").className=`badge ${x.audit.passed?"ok":"error"}`;
}

function renderBoatResult(p){const x=p.prediction,d=p.official.deadline||{};baseResult(SPORT.boat,`${state.meeting.name} ${p.rno}R`,x,p.warning.join(" / "),[["購入締切",d.purchaseDeadline||"未取得"],["公式締切",d.officialDeadline||"未取得"],["解析段階",x.analysisStage],["合成オッズ",x.compositeOdds?`${x.compositeOdds.toFixed(2)}倍`:"未計算"],["購入点数",`${x.purchasePlan.length}点`],["全終端",`${x.terminals.length}件`]],p)}
function renderKeirinResult(p){const x=p.prediction;baseResult(SPORT.keirin,`${p.race.venue} ${p.race.raceNo}R`,x,p.warnings.join(" / "),[["ライン信頼度",p.dataQuality.lineConfidence],["締切",p.race.deadline||"未取得"],["合成オッズ",x.compositeOdds?`${x.compositeOdds.toFixed(2)}倍`:"未計算"],["購入点数",`${x.purchasePlan.length}点`],["全終端",`${x.terminals.length}件`],["監査",x.audit.passed?"合格":"不合格"]],p)}
function renderAutoResult(p,requested){const x=p.prediction,r=p.adapted.race,s=r.surface==="wet"?"湿走路":r.surface==="dry"?"良走路":r.surface==="mixed"?"斑走路":"未確認";baseResult(SPORT.auto,`${r.venue} ${r.raceNo||requested}R`,x,p.warnings.join(" / "),[["走路",s],["締切",r.deadline||"未取得"],["試走",p.dataQuality.trialAvailable?"全車取得":"欠損あり"],["合成オッズ",x.compositeOdds?`${x.compositeOdds.toFixed(2)}倍`:"未計算"],["購入点数",`${x.purchasePlan.length}点`],["全終端",`${x.terminals.length}件`]],p)}

function join(items){return items.slice(0,12).map(x=>`${x.order.join("-")}（${x.odds??"-"}倍）`).join(" / ")||"なし"}
function table(rows){return rows?.length?`<table><thead><tr><th>買い目</th><th>分類</th><th>金額</th><th>オッズ</th><th>払戻見込</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${x.order.join("-")}</td><td>${x.betClass}</td><td>${x.stake.toLocaleString()}円</td><td>${x.odds}</td><td>${x.expectedPayout.toLocaleString()}円</td></tr>`).join("")}</tbody></table>`:"購入案なし"}
function getKeirinCard(m){return m.discovery?.links?.raceCards?.[0]||m.discovery?.links?.other?.[0]}
function getKeirinOdds(m){return m.discovery?.links?.odds?.[0]}
function getAutoProgram(m){return m.discovery?.links?.program?.[0]||m.discovery?.links?.racePages?.[0]}
function getAutoOdds(m){return m.discovery?.links?.odds?.[0]}

const raceSearchBtn=document.getElementById("raceSearchBtn");
if(raceSearchBtn) raceSearchBtn.onclick=()=>{ window.location.href="./tools/race-search/"; };
