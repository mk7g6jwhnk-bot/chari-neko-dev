
const $=id=>document.getElementById(id);
let currentVenue=null;

function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
function show(id){document.querySelectorAll(".screen").forEach(x=>x.classList.toggle("active",x.id===id));window.scrollTo(0,0)}
function compactDate(){return $("date").value.replaceAll("-","")}

async function loadSchedule(){
  $("scheduleBadge").textContent="取得中";$("headerStatus").textContent="公式開催情報を取得中";
  try{
    const r=await fetch(`/.netlify/functions/boat-schedule?date=${compactDate()}`,{cache:"no-store"}),p=await r.json();
    if(!r.ok||!p.ok)throw new Error(p.error||"開催情報取得失敗");
    renderVenues(p.venues);$("scheduleBadge").textContent="実データ";$("scheduleBadge").className="badge ok";$("headerStatus").textContent=`開催${p.venues.length}場`;
  }catch(e){
    $("venueGrid").innerHTML=`<div class="empty">${e.message}</div>`;$("scheduleBadge").textContent="失敗";$("scheduleBadge").className="badge error";$("headerStatus").textContent="開催情報取得失敗";
  }
}

function renderVenues(venues){
  const g=$("venueGrid");g.innerHTML="";
  venues.forEach(v=>{const d=document.createElement("div");d.className="venue";d.innerHTML=`<h3>${v.name}</h3><p>場コード ${v.code}</p><button>レース一覧</button>`;d.querySelector("button").onclick=()=>openVenue(v);g.appendChild(d)});
  $("venueCount").textContent=`${venues.length}場`;
}

async function openVenue(v){
  currentVenue=v;$("venueTitle").textContent=v.name;show("races");$("raceGrid").innerHTML='<div class="empty">レース一覧を取得中...</div>';
  try{
    const r=await fetch(`/.netlify/functions/boat-races?date=${compactDate()}&jcd=${v.code}&lead=${$("lead").value}`,{cache:"no-store"}),p=await r.json();
    if(!r.ok||!p.ok)throw new Error(p.error||"レース一覧取得失敗");
    renderRaces(p.races);$("raceBadge").textContent=`${p.races.length}R`;
  }catch(e){$("raceGrid").innerHTML=`<div class="empty">${e.message}</div>`}
}

function renderRaces(races){
  const g=$("raceGrid");g.innerHTML="";
  races.forEach(r=>{const d=document.createElement("div");d.className="race";d.innerHTML=`<h3>${r.raceNo}R</h3><p>購入 ${r.purchaseDeadline||"-"}</p><p>公式 ${r.officialDeadline||"-"}</p><button>自動解析</button>`;d.querySelector("button").onclick=()=>analyzeRace(r);g.appendChild(d)});
}

async function analyzeRace(race){
  show("loading");$("loadingTitle").textContent=`${currentVenue.name} ${race.raceNo}R`;$("loadingStep").textContent="公式出走表・直前情報・オッズを取得中";
  try{
    const q=new URLSearchParams({date:compactDate(),jcd:currentVenue.code,rno:String(race.raceNo),budget:"3000",lead:$("lead").value}),res=await fetch(`/.netlify/functions/boat-predict?${q}`,{cache:"no-store"}),p=await res.json();
    if(!res.ok||!p.ok)throw new Error(p.error||"解析失敗");
    renderResult(p);show("result");
  }catch(e){$("loadingStep").textContent=`失敗: ${e.message}`}
}

function renderResult(p){
  const x=p.prediction,d=p.official.deadline||{};
  $("resultTitle").textContent=`${currentVenue.name} ${p.rno}R`;$("recommendation").textContent=x.recommendationLabel;$("warnings").textContent=p.warning.join(" / ")||"取得・解析完了";$("purchaseDeadline").textContent=d.purchaseDeadline||"未取得";$("officialDeadline").textContent=d.officialDeadline||"未取得";$("stage").textContent=x.analysisStage;$("oddsQuality").textContent=p.dataQuality.oddsComplete?"120通り取得":"不完全";$("mainBets").textContent=join(x.recommendations.main);$("backupBets").textContent=join(x.recommendations.backup);$("valueBets").textContent=join(x.recommendations.value);$("strongBets").textContent=join(x.recommendations.strong);$("composite").textContent=x.compositeOdds?`${x.compositeOdds.toFixed(2)}倍`:"未計算";$("points").textContent=`${x.purchasePlan.length}点`;$("terminals").textContent=`${x.terminals.length}件`;$("audit").textContent=x.audit.passed?"合格":"不合格";$("plan").innerHTML=table(x.purchasePlan);$("debug").textContent=JSON.stringify(p,null,2);
}
function join(items){return items.slice(0,12).map(x=>`${x.order.join("-")}（${x.odds??"-"}倍）`).join(" / ")||"なし"}
function table(rows){return rows.length?`<table><thead><tr><th>買い目</th><th>分類</th><th>金額</th><th>オッズ</th><th>払戻見込</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${x.order.join("-")}</td><td>${x.betClass}</td><td>${x.stake.toLocaleString()}円</td><td>${x.odds}</td><td>${x.expectedPayout.toLocaleString()}円</td></tr>`).join("")}</tbody></table>`:"購入案なし"}

$("date").value=today();$("refresh").onclick=loadSchedule;$("date").onchange=loadSchedule;$("lead").onchange=()=>currentVenue&&openVenue(currentVenue);document.querySelectorAll("[data-back]").forEach(b=>b.onclick=()=>show(b.dataset.back));loadSchedule();
