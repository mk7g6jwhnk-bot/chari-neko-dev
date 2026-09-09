import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createSnapshot,compactStoredSnapshots,STORAGE_KEY} from '../public/prediction-store.mjs';
import {deriveThickBets,qualifyThickPredictionBets,allocatePreviewStakes} from '../public/purchase-funding.mjs';

// UI regression only. No outcomes, scores, quality or research ranks are read.
const source=JSON.parse(fs.readFileSync(new URL('../research/thick-readonly-audit-results.json',import.meta.url)));
const flags=source.ticketDiagnostics.map(r=>({raceKey:r.raceKey,latest:r.inLatest100,canPurchase:r.canPurchase,
  tickets:r.mainTickets.map(t=>({order:t.order.split('-').map(Number),betClass:'MAIN',thickQualified:t.thick}))}));
let savedRaces=0,uiRaces=0,total=0;
for(const r of flags){
  const p={standardPurchasePlan:r.tickets,purchaseEligibility:{canPurchase:r.canPurchase}},before=JSON.stringify(p);
  const s=createSnapshot({prediction:p});
  const actual=deriveThickBets(s).map(x=>x.order.join('-')).sort();
  const expected=r.canPurchase?r.tickets.filter(t=>t.thickQualified).map(t=>t.order.join('-')).sort():[];
  assert.deepEqual(actual,expected,r.raceKey);assert.equal(JSON.stringify(p),before);
  assert.deepEqual(s.betSelections.map(t=>t.order),r.tickets.map(t=>t.order));
  if(r.latest){savedRaces+=+(expected.length>0);uiRaces+=+(actual.length>0);}total++;
}
assert.equal(savedRaces,44);assert.equal(uiRaces,44);
for(const id of ['20260909-61-6','20260909-44-8','20260909-21-7','20260908-13-9']){
  const r=flags.find(x=>x.raceKey===id);assert.ok(r);assert.equal(r.tickets.filter(x=>x.thickQualified).length,0);
}
const plan=[{order:[1,2,3],betClass:'MAIN',probability:.8,naturalConvergenceScore:.9,thickQualified:false},{order:[1,2,4],betClass:'MAIN',probability:.01,naturalConvergenceScore:.1,thickQualified:false}];
assert.equal(qualifyThickPredictionBets({betSelections:plan.map(t=>({...t,category:'MAIN'}))}).length,1,'prediction qualifier remains unchanged');
assert.equal(deriveThickBets(createSnapshot({prediction:{standardPurchasePlan:plan,purchaseEligibility:{canPurchase:true}}})).length,0);
const yes=plan.map((t,i)=>({...t,thickQualified:i===0}));
const snap=createSnapshot({prediction:{standardPurchasePlan:yes,purchaseEligibility:{canPurchase:true}}});
assert.equal(deriveThickBets({...snap,betSelections:snap.betSelections.map(t=>({...t,probability:0,naturalConvergenceScore:null}))}).length,1);
assert.equal(deriveThickBets({...snap,purchaseEligibility:{canPurchase:false}}).length,0);
assert.equal(deriveThickBets(createSnapshot({prediction:{standardPurchasePlan:yes,canonicalPurchasePlan:{standardTickets:plan},purchaseEligibility:{canPurchase:true}}})).length,0,'canonical saved decision overrides stale duplicate flag');
assert.equal(deriveThickBets({betSelections:plan.map(({thickQualified,...t})=>({...t,category:'MAIN'}))}).length,0,'legacy absence never triggers recomputation');
assert.deepEqual(allocatePreviewStakes(plan.map(t=>({...t,category:'MAIN'})),1000,'thick'),allocatePreviewStakes(plan.map(t=>({...t,category:'MAIN'})),1000,'standard'));
let stored=JSON.stringify(Array.from({length:12},(_,i)=>({...snap,predictionSnapshotId:String(i),createdAt:new Date(i*1000).toISOString()}))),attempt=0;
const storage={getItem:k=>k===STORAGE_KEY?stored:null,setItem(k,v){if(++attempt===1){const e=new Error('quota');e.name='QuotaExceededError';throw e;}stored=v;}};
const compacted=compactStoredSnapshots(storage);assert.ok(compacted.some(s=>s.storageCompacted));
for(const s of compacted)assert.equal(deriveThickBets(s).length,1,'quota compaction preserves flags');
console.log(`PASS: ${total} saved-decision UI regressions; latest ${savedRaces}=${uiRaces}; four mismatches removed; canonical/legacy/gate/compaction invariant.`);
