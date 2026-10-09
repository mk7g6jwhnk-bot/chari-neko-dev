import assert from"node:assert/strict";
import fs from"node:fs";
import{expectedPayout,oddsRefreshIdentity,overlayOddsForDisplay,validateOddsOnlyResponse}from"../public/odds-only-refresh.mjs";
import{normalizeOdds}from"../netlify/functions/keirin-odds.mjs";

let passed=0;const check=(name,fn)=>{fn();passed+=1;console.log(`PASS ${name}`)};
const bets=[
  {order:[1,2,3],odds:8.4,stake:1000,ticketClass:"MAIN",worldClass:"MAIN",thick:true},
  {order:[1,3,2],odds:12.2,stake:1200,ticketClass:"COVER",worldClass:"SECONDARY",thick:false},
  {order:[4,1,2],odds:45.6,stake:800,ticketClass:"SCENARIO_BREAK",worldClass:"SCENARIO_BREAK",thick:false}
];
const snapshot={targetRace:{date:"2026-10-10",venueCode:"34",venueName:"川崎",raceNo:9},sealedPrediction:{predictionHash:"a".repeat(64)},betSelections:bets};
const identity=oddsRefreshIdentity(snapshot),payload={ok:true,race:{date:"20261010",venueCode:"34",venueName:"川崎",raceNo:9},odds:{available:true,count:3,odds:{"1-2-3":9.1,"1-3-2":13.5,"4-1-2":51.2}},checkedAt:"2026-10-10T06:42:00.000Z"};
const before=structuredClone(snapshot),refresh=validateOddsOnlyResponse(payload,identity,bets),display=overlayOddsForDisplay(bets,refresh);
check("canonical identity",()=>assert.deepEqual(identity,{raceKey:"20261010-34-9",date:"20261010",venueCode:"34",raceNo:9,venueName:"川崎",predictionHash:"a".repeat(64)}));
check("prediction hash linkage",()=>assert.equal(refresh.predictionHash,identity.predictionHash));
check("fetchedAt update",()=>assert.equal(refresh.oddsFetchedAt,payload.checkedAt));
check("odds only update",()=>assert.deepEqual(display.map(x=>x.odds),[9.1,13.5,51.2]));
check("expected payout update",()=>assert.equal(expectedPayout(display[0].odds,bets[0].stake),9100));
check("prediction snapshot immutable",()=>assert.deepEqual(snapshot,before));
check("ticket set immutable",()=>assert.deepEqual(display.map(x=>x.order),bets.map(x=>x.order)));
check("ticket order immutable",()=>assert.deepEqual(display.map(x=>x.order.join("-")),["1-2-3","1-3-2","4-1-2"]));
check("ticket class immutable",()=>assert.deepEqual(display.map(x=>x.ticketClass),bets.map(x=>x.ticketClass)));
check("world class immutable",()=>assert.deepEqual(display.map(x=>x.worldClass),bets.map(x=>x.worldClass)));
check("THICK immutable",()=>assert.deepEqual(display.map(x=>x.thick),bets.map(x=>x.thick)));
check("canonical stake immutable",()=>assert.deepEqual(display.map(x=>x.stake),[1000,1200,800]));
check("total stake immutable",()=>assert.equal(display.reduce((sum,x)=>sum+x.stake,0),3000));
check("wrong race rejected",()=>assert.throws(()=>validateOddsOnlyResponse({...payload,race:{...payload.race,raceNo:8}},identity,bets),/identity/));
check("duplicate odds rejected",()=>assert.throws(()=>validateOddsOnlyResponse({...payload,odds:{odds:{"1-2-3":9.1,"123":9.2}}},identity,bets),/重複/));
check("upstream duplicate rejected before response",()=>{const rows=normalizeOdds({"OZZ123":9.1,"1-2-3":9.2});assert.equal(rows.duplicateCount,1);assert.deepEqual(rows.duplicateTickets,["1-2-3"])});
const partial=validateOddsOnlyResponse({...payload,odds:{odds:{"1-2-3":9.1}}},identity,bets),partialDisplay=overlayOddsForDisplay(bets,partial);
check("missing odds explicit",()=>{assert.deepEqual(partial.missingTickets,["1-3-2","4-1-2"]);assert.equal(partialDisplay[1].odds,null);assert.equal(partialDisplay[1].oddsRefreshStatus,"MISSING_LATEST")});
check("invalid identity rejected",()=>assert.throws(()=>oddsRefreshIdentity({...snapshot,targetRace:{...snapshot.targetRace,venueCode:""}}),/identity/));
check("baseline display clone",()=>{const rows=overlayOddsForDisplay(bets,null);assert.deepEqual(rows,bets);assert.notEqual(rows[0],bets[0])});

const html=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8"),app=fs.readFileSync(new URL("../public/app.mjs",import.meta.url),"utf8"),css=fs.readFileSync(new URL("../public/styles.css",import.meta.url),"utf8"),endpoint=fs.readFileSync(new URL("../netlify/functions/keirin-odds.mjs",import.meta.url),"utf8");
check("button on prediction detail",()=>assert.match(app,/id="refreshPredictionOdds"/));
check("exact placement",()=>assert.ok(html.indexOf('id="ticketOverview"')<html.indexOf('id="oddsOnlyRefresh"')&&html.indexOf('id="oddsOnlyRefresh"')<html.indexOf('id="purchaseControls"')&&html.indexOf('id="purchaseControls"')<html.indexOf('id="betDetails"')));
check("odds-only endpoint",()=>{assert.match(app,/\.netlify\/functions\/keirin-odds/);assert.doesNotMatch(endpoint,/keirin\/predict|keirin-predict|saveCanonical|reseal/i)});
check("dedicated upstream odds path",()=>assert.match(endpoint,/\/keirin\/odds\?/));
check("request guard",()=>{assert.match(app,/if\(state\.oddsRefreshBusyKey\)return/);assert.match(app,/disabled/)});
check("response identity validation",()=>assert.match(app,/validateOddsOnlyResponse\(payload,identity,standardSelections\(snapshot\)\)/));
check("funding uses canonical bets",()=>{assert.match(app,/stakes=allocatePreviewStakes\(bets,budget,mode\)/);assert.doesNotMatch(app,/allocatePreviewStakes\(display/)});
check("odds display uses overlay",()=>{assert.match(app,/displayBets=displayOddsSelections\(snapshot\)/);assert.match(app,/calcCompositeOdds\(displayBets\)/)});
check("expected payout uses sealed stake",()=>assert.match(app,/expectedPayout\(bet\.odds,bet\.stake\)/));
check("saved and direct detail reach same render",()=>{assert.match(app,/if\(valid\)renderPrediction\(state\.snapshot\)/);assert.match(app,/\$\("openSaved"\)\.onclick=\(\)=>renderPrediction\(state\.snapshot\)/)});
check("390px compact no horizontal scroll",()=>{assert.match(css,/@media\(max-width:390px\)\{\.oddsOnlyRow/);assert.match(css,/\.oddsOnlyMeta\{[^}]*overflow-wrap:anywhere/)});
check("no canonical persistence",()=>{const block=app.slice(app.indexOf("async function refreshPredictionOdds"),app.indexOf("function renderPurchaseControls"));assert.doesNotMatch(block,/saveSnapshot|saveCanonical|putSealed|localStorage|sessionStorage|keirin-predict/)});
console.log(JSON.stringify({passed:true,cases:passed,raceKey:identity.raceKey,totalStake:3000}));
