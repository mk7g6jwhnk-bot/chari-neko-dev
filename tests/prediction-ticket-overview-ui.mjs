import assert from"node:assert/strict";
import fs from"node:fs";
import{buildCanonicalTicketOverview,canonicalTicketDisplayClass}from"../public/purchase-ticket-overview.mjs";
import{createSnapshot}from"../public/prediction-store.mjs";

let passed=0;const check=(name,fn)=>{fn();passed+=1;console.log(`PASS ${name}`)};
const ticket=(order,ticketClass,worldClass,extra={})=>({order,ticketClass,worldClass,ticketClassVersion:"MULTI_WORLD_TICKET_CLASS_V2",classificationSource:"CANONICAL_V2",...extra});
const rows=[
  ...Array.from({length:6},(_,i)=>ticket([4,[3,5,7,2,6,1][i],[5,3,5,5,3,7][i]],"MAIN","MAIN",i===0?{thick:true}:{})),
  ...Array.from({length:4},(_,i)=>ticket([3,[4,5,7,2][i],[5,4,5,5][i]],"COVER","SECONDARY")),
  ...Array.from({length:5},(_,i)=>ticket([[7,7,6,6,6][i],[3,3,3,3,4][i],[5,4,5,4,5][i]],"SCENARIO_BREAK","SCENARIO_BREAK"))
];
const before=structuredClone(rows),overview=buildCanonicalTicketOverview(rows);
check("canonical 15 tickets",()=>assert.equal(overview.total,15));
check("duplicate display zero",()=>assert.equal(overview.duplicateCount,0));
check("MAIN display",()=>assert.equal(overview.groups.find(x=>x.key==="MAIN").tickets.length,6));
check("COVER display",()=>assert.equal(overview.groups.find(x=>x.key==="COVER").tickets.length,4));
check("SCENARIO_BREAK display",()=>assert.equal(overview.groups.find(x=>x.key==="SCENARIO_BREAK").tickets.length,5));
check("SECONDARY provenance retained",()=>assert.ok(overview.groups.find(x=>x.key==="COVER").tickets.every(x=>x.worldClass==="SECONDARY")));
check("THICK retained",()=>assert.equal(overview.groups.find(x=>x.key==="MAIN").tickets[0].thick,true));
check("ticket order retained",()=>assert.deepEqual(overview.groups.flatMap(x=>x.tickets).map(x=>x.order),rows.map(x=>x.order.join("-"))));
check("input immutable",()=>assert.deepEqual(rows,before));
check("V2 ticketClass precedes worldClass",()=>assert.equal(canonicalTicketDisplayClass(ticket([1,2,3],"COVER","MAIN")),"COVER"));
check("legacy safe fallback",()=>assert.equal(canonicalTicketDisplayClass({order:[1,2,3],category:"MAIN"}),"MAIN"));
check("unknown legacy is not inferred",()=>assert.equal(canonicalTicketDisplayClass({order:[1,2,3],scenarioPurchaseClass:"SECONDARY"}),"UNKNOWN"));
const sourcePrediction={engineVersion:"TEST",standardPurchasePlan:rows.map((row,index)=>({...row,betClass:row.ticketClass,stake:100+index*100,scenarioExplanation:{flow:"unchanged"}})),purchaseEligibility:{canPurchase:true},sealedPrediction:{predictionHash:"hash-ui"}},sourceBefore=structuredClone(sourcePrediction),snapshot=createSnapshot({race:{date:"20261007",venueCode:"34",venue:"川崎",raceNo:5},prediction:sourcePrediction});
check("snapshot canonical tickets unchanged",()=>{assert.equal(snapshot.betSelections.length,15);assert.deepEqual(sourcePrediction,sourceBefore)});
check("V2 metadata preserved",()=>{assert.equal(snapshot.betSelections[6].ticketClass,"COVER");assert.equal(snapshot.betSelections[6].worldClass,"SECONDARY");assert.equal(snapshot.betSelections[6].ticketClassVersion,"MULTI_WORLD_TICKET_CLASS_V2")});
check("funding values preserved",()=>assert.deepEqual(snapshot.betSelections.map(x=>x.stake),sourcePrediction.standardPurchasePlan.map(x=>x.stake)));
const duplicate=buildCanonicalTicketOverview([...rows,structuredClone(rows[0])]);
check("duplicate suppressed",()=>{assert.equal(duplicate.total,15);assert.equal(duplicate.duplicateCount,1)});
const html=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8"),app=fs.readFileSync(new URL("../public/app.mjs",import.meta.url),"utf8"),css=fs.readFileSync(new URL("../public/styles.css",import.meta.url),"utf8");
check("display order",()=>assert.ok(html.indexOf('id="predictionRatings"')<html.indexOf('id="ticketOverview"')&&html.indexOf('id="ticketOverview"')<html.indexOf('id="purchaseControls"')&&html.indexOf('id="purchaseControls"')<html.indexOf('id="betDetails"')));
check("details folded",()=>assert.match(html,/<details id="betDetails"[^>]*><summary>個別買い目詳細を開く<\/summary>/));
check("compact inline markup",()=>{assert.match(app,/class="ticketInlineList"/);assert.match(app,/class="ticketInline"/);assert.doesNotMatch(app,/class="ticketChip"/)});
check("slash separators",()=>assert.match(css,/ticketInline\+\.ticketInline::before\{content:" \/ "/));
check("no per-ticket cards",()=>{assert.doesNotMatch(css,/\.ticketInline\{[^}]*border:/);assert.doesNotMatch(css,/\.ticketInline\{[^}]*background:/);assert.doesNotMatch(css,/\.ticketInline\{[^}]*padding:/)});
check("390px wrapping styles",()=>{assert.match(css,/@media\(max-width:390px\)/);assert.match(css,/ticketInlineList\{font-size:/);assert.match(css,/ticketInline\{display:inline;white-space:nowrap/)});
check("funding and detail render unchanged",()=>{assert.match(app,/allocatePreviewStakes\(bets,budget,mode\)/);assert.match(app,/betStoryHtml\(snapshot,b/);assert.match(app,/buildBetStory\(snapshot,bet\)/)});
console.log(JSON.stringify({passed:true,cases:passed,total:overview.total,groups:Object.fromEntries(overview.groups.map(x=>[x.key,x.tickets.length]))}));
