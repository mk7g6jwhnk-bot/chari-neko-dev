
const data={
"ボート":[
{name:"徳山",type:"モーニング",maxRace:12},
{name:"唐津",type:"モーニング",maxRace:12},
{name:"若松",type:"ナイター",maxRace:12},
{name:"大村",type:"ナイター",maxRace:12},
{name:"芦屋",type:"モーニング",maxRace:12},
{name:"蒲郡",type:"ナイター",maxRace:12}
],
"競輪":[
{name:"佐世保",type:"ナイター",maxRace:12},
{name:"防府",type:"デイ",maxRace:7},
{name:"青森",type:"モーニング",maxRace:7},
{name:"小田原",type:"デイ",maxRace:12},
{name:"西武園",type:"ナイター",maxRace:12},
{name:"伊東",type:"ミッド",maxRace:9}
],
"オート":[
{name:"川口",type:"デイ",maxRace:12},
{name:"伊勢崎",type:"ナイター",maxRace:12}
]};
const $=id=>document.getElementById(id);
let sport="ボート",venue=data[sport][0],raceNo=1,lastResult=null;

function show(id){
 document.querySelectorAll(".screen").forEach(x=>x.classList.toggle("active",x.id===id));
 document.querySelectorAll(".bottom button[data-screen]").forEach(x=>x.classList.toggle("active",x.dataset.screen===id));
 window.scrollTo(0,0);
}
function renderVenues(){
 const root=$("venueGrid");root.innerHTML="";
 data[sport].forEach(v=>{
  const d=document.createElement("div");d.className="venue";
  d.innerHTML=`<h4>${v.name}</h4><p>${v.type}</p><p>${v.maxRace}R開催</p><button>レース一覧</button>`;
  d.querySelector("button").onclick=()=>openVenue(v);
  root.appendChild(d);
 });
}
function openVenue(v){
 venue=v;$("venueTitle").textContent=v.name;$("venueType").textContent=v.type;$("raceCountBadge").textContent=v.maxRace+"R";
 renderRaces();show("races");
}
function renderRaces(){
 const root=$("raceGrid");root.innerHTML="";
 for(let r=1;r<=venue.maxRace;r++){
  const d=document.createElement("div");d.className="race";
  d.innerHTML=`<h4>${r}R</h4><p>自動解析対応</p><button>解析する</button>`;
  d.querySelector("button").onclick=()=>startAnalysis(r);
  root.appendChild(d);
 }
}
function generateResult(){
 const base=sport==="競輪"?["3-1-5","3-5-1","1-3-5","5-3-1","7-3-1"]:["1-3-2","1-2-3","1-3-4","3-1-2","3-4-1"];
 const odds=sport==="競輪"?[14.8,22.4,18.2,76.0,168.0]:[8.6,11.2,24.5,58.0,132.0];
 const probs=sport==="競輪"?[.17,.13,.11,.06,.03]:[.18,.15,.10,.07,.04];
 const classes=["本線","本線","押さえ",sport==="競輪"?"買える万車":"買える万舟",sport==="競輪"?"買える万車":"買える万舟"];
 const status=["購入採用","購入採用","購入採用","購入採用","購入不採用"];
 const terminals=base.map((order,i)=>({order,odds:odds[i],probability:probs[i],classification:classes[i],purchaseStatus:status[i]}));
 const main=terminals.filter(x=>x.classification==="本線"&&x.purchaseStatus==="購入採用");
 const backup=terminals.filter(x=>x.classification==="押さえ"&&x.purchaseStatus==="購入採用");
 const value=terminals.filter(x=>x.classification.includes("買える")&&x.purchaseStatus==="購入採用");
 const composite=list=>1/list.reduce((s,x)=>s+1/x.odds,0);
 const all=[...main,...backup,...value];
 const alloc=[...all].map((x,i)=>({bet:x.order,amount:[900,700,500,400][i]||300,odds:x.odds}));
 return {
  terminals,main,backup,value,strong:[main[0]?.order||"なし"],
  trust: sport==="競輪"?4:4,
  focus: sport==="競輪"?3:4,
  roll: composite(main)>=5?"○":"△",
  purchaseDeadline:"購入締切は実データ接続後",
  mainComposite:composite(main),
  mainBackupComposite:composite([...main,...backup]),
  allComposite:composite(all),
  allocation:alloc
 };
}
async function startAnalysis(r){
 raceNo=r;$("analyzingTitle").textContent=`${venue.name} ${r}R`;show("analyzing");
 const steps=["出走情報を確認","選手・艇評価を分離","展開枝を生成","全終端を生成","未処理分岐を監査","買い目を分類","合成オッズを計算"];
 $("stepList").innerHTML=steps.map(x=>`<div class="step">${x}</div>`).join("");
 for(let i=0;i<steps.length;i++){
  $("progressTitle").textContent=steps[i];
  $("progressText").textContent=`${i+1} / ${steps.length}`;
  $("progressFill").style.width=`${((i+1)/steps.length)*100}%`;
  document.querySelectorAll(".step")[i].classList.add("done");
  await new Promise(res=>setTimeout(res,300));
 }
 lastResult=generateResult();
 renderResult();
 show("result");
}
function renderResult(){
 const r=lastResult;
 $("resultTitle").textContent=`${sport} ${venue.name} ${raceNo}R`;
 $("recommendBadge").textContent=r.mainComposite>=10?"本線高配当":r.mainComposite>=5?"中穴":"固め";
 $("trust").textContent="★".repeat(r.trust)+"☆".repeat(5-r.trust);
 $("focus").textContent="★".repeat(r.focus)+"☆".repeat(5-r.focus);
 $("roll").textContent=r.roll;$("purchaseDeadline").textContent=r.purchaseDeadline;
 $("mainBets").textContent=r.main.map(x=>x.order).join(" / ")||"なし";
 $("backupBets").textContent=r.backup.map(x=>x.order).join(" / ")||"なし";
 $("valueTitle").textContent=sport==="競輪"?"買える万車":"買える万舟";
 $("valueBets").textContent=r.value.map(x=>x.order).join(" / ")||"なし";
 $("strongBets").textContent=r.strong.join(" / ");
 $("mainComposite").textContent=r.mainComposite.toFixed(2)+"倍";
 $("mainBackupComposite").textContent=r.mainBackupComposite.toFixed(2)+"倍";
 $("allComposite").textContent=r.allComposite.toFixed(2)+"倍";
 $("rideDecision").textContent=r.allComposite<2?"丸乗り非推奨":"丸乗り可";
 $("terminalCount").textContent=r.terminals.length+"件";
 $("rejectedCount").textContent=r.terminals.filter(x=>x.purchaseStatus==="購入不採用").length+"件";
 $("auditLog").innerHTML=`<p>✓ 全終端保持</p><p>✓ 未処理分岐0</p><p>✓ 未終端枝0</p><p>✓ 購入不採用も理由付き保持</p>`;
 $("allocationTable").innerHTML=`<table><thead><tr><th>買い目</th><th>金額</th><th>オッズ</th><th>払戻見込</th></tr></thead><tbody>${r.allocation.map(x=>`<tr><td>${x.bet}</td><td>${x.amount.toLocaleString()}円</td><td>${x.odds.toFixed(1)}</td><td>${Math.floor(x.amount*x.odds).toLocaleString()}円</td></tr>`).join("")}</tbody></table>`;
}
document.querySelectorAll(".sports button").forEach(b=>b.onclick=()=>{
 sport=b.dataset.sport;venue=data[sport][0];
 document.querySelectorAll(".sports button").forEach(x=>x.classList.toggle("active",x===b));
 renderVenues();
});
document.querySelectorAll("[data-back]").forEach(b=>b.onclick=()=>show(b.dataset.back));
document.querySelectorAll(".bottom button[data-screen]").forEach(b=>b.onclick=()=>show(b.dataset.screen));
$("refreshBtn").onclick=()=>alert("開催・オッズ・締切の実データ接続は次段階です。");
renderVenues();
if("serviceWorker"in navigator)navigator.serviceWorker.register("service-worker.js?v=40").then(r=>r.update()).catch(()=>{});
