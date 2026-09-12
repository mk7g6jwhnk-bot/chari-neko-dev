import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PERIODS,periodHtml,performanceSnapshot,canonicalPurchaseHit,historyHtml,lifecycleCode,shiftDay,japanDate} from '../public/performance-page.mjs';
import {raceLifecycleView} from '../public/race-lifecycle-view.mjs';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/performance-canonical.json',import.meta.url),'utf8')),status=fixture.status,now=Date.parse(fixture.now);
for(const period of Object.keys(PERIODS)){
  const p=status.purchasePerformance.periods[period],html=periodHtml(status.purchasePerformance,period);
  for(const key of ['evaluatedRaces','betRaces','hitRaces','investment','return'])assert.ok(html.includes(`data-kpi="${key}"`));
  for(const key of ['main','cover','thick']){assert.ok(html.includes(`data-category="${key}"`));assert.ok(html.includes(Number(p.categories[key].return).toLocaleString('ja-JP')))}
  assert.ok(html.includes(Number(p.return).toLocaleString('ja-JP')));
}
assert.deepEqual(Object.values(PERIODS),['今日','7日','30日','累積']);
const view=performanceSnapshot(status,null,now);assert.equal(view.stale,false);assert.equal(view.snapshot.report,status.purchasePerformance,'report object is projected unchanged');
for(const failed of [{ok:false}, {...status,purchasePerformance:null},{...status,statusReadFailed:true},{...status,autoCurrent:false},{...status,localCache:true}]){const fallback=performanceSnapshot(failed,view.snapshot,now);assert.equal(fallback.stale,true);assert.deepEqual(fallback.snapshot.report,status.purchasePerformance)}
assert.equal(performanceSnapshot(status,null,now+11*60*1000).stale,true);
assert.equal(performanceSnapshot(null,view.snapshot,now+86400000).stale,true,'previous-day cache is labelled stale');
assert.equal(performanceSnapshot(null,null,now).snapshot,null);
const rows=fixture.histories['20260912'].records;
assert.deepEqual(rows.filter(canonicalPurchaseHit).map(row=>row.raceKey),['20260912-12-1','20260912-12-2']);
assert.equal(canonicalPurchaseHit({...rows[0],canonicalEligibility:{isPurchaseTarget:false},referencePredictionHit:true}),false);
assert.equal(canonicalPurchaseHit({...rows[0],resultAttached:false}),false);
assert.equal(canonicalPurchaseHit({...rows[0],purchaseEvaluation:{purchaseEligibility:'PURCHASE_ALLOWED',standardHit:false},referencePredictionHit:true}),false);
const hits=historyHtml(rows);assert.equal((hits.match(/data-performance-hit/g)||[]).length,2);assert.ok(hits.includes('89,490円'));assert.ok(!historyHtml([{...rows[0],venue:'<script>'}]).includes('<script>'));
for(const code of ['RESULT_PENDING','RESULT_RETRYING','RESULT_FETCH_FAILED']){assert.equal(lifecycleCode({resultLifecycleState:code}),code);assert.equal(raceLifecycleView({date:'20260912',scheduledStart:'23:00'},{resultLifecycleState:code},now).phase,'result-pending','saved ended state outranks future metadata')}
assert.equal(lifecycleCode({resultAttached:true}),'RESULT_CONFIRMED');assert.equal(lifecycleCode({}),'UNKNOWN');
assert.equal(japanDate(Date.parse('2026-09-11T16:00:00Z')),'20260912');assert.equal(shiftDay('20260301',-1),'20260228');
const empty=periodHtml({periods:{today:{evaluatedRaces:0,betRaces:0,hitRaces:0,investment:0,return:0,roi:null,hitRate:null}}});assert.ok(empty.includes('まだ集計対象'));assert.ok(empty.includes('0円'));assert.ok(empty.includes('—'));assert.ok(!empty.includes('NaN'));
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');for(const id of ['bulkRefresh','runScreening','runDeepDiveTop','runDirectDeepDive','tabScreening'])assert.ok(!html.includes(`id="${id}"`));assert.ok(html.includes('id="reloadMeetings"'));assert.ok(html.includes('チャット比較（手動検証）'));assert.ok(html.indexOf('id="collectorProgress"')>html.indexOf('id="performance"'));
console.log('PASS performance periods, canonical projection/categories, hit exclusions, lifecycle, last-known/stale, null/zero, removed controls');
