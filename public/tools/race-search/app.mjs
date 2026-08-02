
import {filterAndRankRaces,groupByVenue} from "./filter-engine.mjs";
const $=id=>document.getElementById(id);let view="rank";
const races=[
{sport:"boat",venueId:"tokuyama",venueName:"徳山",raceNo:7,startTime:"11:15",payoutBand:"高配当",confidence:4,concentration:4,rolloverSuitable:true,mainHighPayout:true,favoriteEntry:false,distrustedEntry:false,compositeOdds:22.4,engineExpectedValue:1.18,dataQualityScore:.92},
{sport:"boat",venueId:"karatsu",venueName:"唐津",raceNo:10,startTime:"13:42",payoutBand:"中穴",confidence:4,concentration:3,rolloverSuitable:false,mainHighPayout:false,favoriteEntry:true,distrustedEntry:false,compositeOdds:14.2,engineExpectedValue:1.08,dataQualityScore:.90},
{sport:"keirin",venueId:"aomori",venueName:"青森",raceNo:7,startTime:"14:05",payoutBand:"固め",confidence:5,concentration:5,rolloverSuitable:true,mainHighPayout:false,favoriteEntry:false,distrustedEntry:true,compositeOdds:6.8,engineExpectedValue:1.04,dataQualityScore:.95},
{sport:"auto",venueId:"kawaguchi",venueName:"川口",raceNo:9,startTime:"18:25",payoutBand:"高配当",confidence:3,concentration:3,rolloverSuitable:false,mainHighPayout:false,favoriteEntry:false,distrustedEntry:false,compositeOdds:58.6,engineExpectedValue:1.12,dataQualityScore:.88}
];
const sports=[["boat","ボート"],["keirin","競輪"],["auto","オート"]];
const venues=[...new Map(races.map(r=>[r.venueId,[r.venueId,r.venueName]])).values()];
renderChecks("sports",sports,"sport");renderChecks("venues",venues,"venue");
$("search").onclick=render;$("rankTab").onclick=()=>{view="rank";render()};$("venueTab").onclick=()=>{view="venue";render()};render();
function renderChecks(id,items,cls){$(id).innerHTML=items.map(([v,l])=>`<label><input class="${cls}" type="checkbox" value="${v}">${l}</label>`).join("")}
function render(){const f={sports:checked(".sport"),venues:checked(".venue"),startTime:$("startTime").value||null,endTime:$("endTime").value||null,payoutBands:$("payout").value?[$("payout").value]:[],minConfidence:+$("confidence").value,featuredOnly:$("featured").checked,rolloverOnly:$("rollover").checked,favoriteEntryOnly:$("favorite").checked,distrustedEntryOnly:$("distrusted").checked};const result=filterAndRankRaces(races,f);$("count").textContent=`${result.length}件`;if(view==="venue"){const groups=Object.values(groupByVenue(result));$("results").innerHTML=groups.map(g=>`<h3>${g.venueName}</h3>${g.races.map(card).join("")}`).join("")||"<p>該当なし</p>"}else{$("results").innerHTML=result.map((r,i)=>card(r,i+1)).join("")||"<p>該当なし</p>"}}
function card(r,rank=null){return `<div class="result"><span class="score">${rank?rank+"位":""}</span><strong>${r.venueName} ${r.raceNo}R</strong> ${r.startTime}<br><span class="tag">${r.payoutBand}</span>${r.mainHighPayout?'<span class="tag hot">🔥本線高配当</span>':""}${r.rolloverSuitable?'<span class="tag">コロがし</span>':""}<p>信頼度★${r.confidence}／展開集中度★${r.concentration}／合成${r.compositeOdds}倍</p></div>`}
function checked(s){return [...document.querySelectorAll(`${s}:checked`)].map(x=>x.value)}
