import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { LiveActionStore, eligibleMetadata, officialReplayLinks } from '../research/action-tag-live-store.mjs';
import { LiveCollectorAdapter } from '../research/action-tag-live-adapter.mjs';
import { startReviewServer } from '../research/action-tag-live-server.mjs';
import { isFinalTest } from '../research/action-tag-schema.mjs';
import { generateObservationCandidates } from '../research/action-tag-collector.mjs';
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'action-live-test-'));
const data = path.join(directory, 'research'), source = path.join(directory, 'source');
await fs.mkdir(source);
const store = await new LiveActionStore(data).init();
const now = new Date().toISOString();
const record = n => ({ raceKey:`20260912-28-${n}`, venueName:'TEST ONLY',raceNo:n,scheduledStartAt:now,predictionSealedAt:now,resultObservedAt:now,
  participants:[{number:1,registration:'T1',name:'Fixture A',officialTotalStarts:30,backCount:12},{number:2,registration:'T2',name:'Fixture B',officialTotalStarts:30,markCount:12}],
  lines:[{number:1,lineId:'A',position:1},{number:2,lineId:'A',position:2}],
  result:{status:'confirmed',finishOrder:[1,2]}, officialEvidence:{source:'synthetic-test-only',winningMethod:'逃げ',finishOrder:[1,2],markers:{backNumber:1},observedAt:now} });
const meta = n => ({raceKey:record(n).raceKey,sequence:502+n,collectedAt:now,recordPath:`${n}.json`});
for (let index=403;index<=502;index++) { assert.equal(eligibleMetadata({...meta(1),sequence:index}),false); assert.equal(isFinalTest({sealed:{sequence:index}}),true); }
for (const sequence of [undefined,null,'503',0,402]) assert.equal(eligibleMetadata({...meta(1),sequence}),false);
assert.equal(eligibleMetadata({...meta(1),sealed:{sequence:450}}),false);
assert.deepEqual(generateObservationCandidates({...record(1),sequence:450}),[]);
assert.deepEqual(officialReplayLinks({replayUrl:'javascript:alert(1)'}),[]);
assert.deepEqual(officialReplayLinks({replayUrl:'https://keirin.jp.evil.test/a'}),[]);
const metadataFile = path.join(directory,'metadata.jsonl');
// Excluded entries point to nonexistent content: the adapter must never read it.
let text = JSON.stringify({...meta(1),sequence:450,recordPath:'PROTECTED-DO-NOT-READ.json'})+'\n';
for(let n=1;n<=5;n++) { await fs.writeFile(path.join(source,`${n}.json`),JSON.stringify(record(n))); text+=JSON.stringify(meta(n))+'\n'; }
await fs.writeFile(metadataFile,text);
const adapter = new LiveCollectorAdapter({store,metadataFile,recordsDirectory:source,maxQueue:2});
await adapter.scan(); assert.equal(adapter.metrics.accepted,5); assert.equal(adapter.metrics.failures,0); assert.equal(adapter.metrics.excluded,1); assert.equal(adapter.metrics.peakQueueDepth,2);
await adapter.scan(); assert.equal(adapter.metrics.accepted,5); assert.equal(adapter.metrics.duplicates,5);
const tags=(await store.getRace(meta(1).raceKey)).tags;
assert.ok(tags.some(t=>t.collectionLane==='AUTO_DIRECT')); assert.ok(tags.some(t=>t.evidenceType==='MULTI_SOURCE_STRONG_PROXY')); assert.ok(tags.some(t=>t.collectionLane==='MANUAL_REVIEW'));
assert.ok(tags.filter(t=>t.collectionLane==='AUTO_CANDIDATE').every(t=>t.verificationStatus==='POSSIBLE'));
await assert.rejects(()=>store.ingest(meta(6),{...record(6),sealed:{sequence:450}}),/MEMBERSHIP/);
await assert.rejects(()=>store.ingest(meta(6),{...record(6),resultObservedAt:'2000-01-01T00:00:00Z'}),/PRE_ENROLLMENT/);
await assert.rejects(()=>store.ingest(meta(6),{...record(6),participants:Array(10).fill(record(6).participants[0])}),/STRUCTURE_TOO_LARGE/);
const guard = new LiveCollectorAdapter({store,metadataFile,recordsDirectory:source,heapUsed:()=>1e10}); await guard.scan(); assert.equal(guard.metrics.heapGuards,1);
// Failure is retried after source repair, not marked seen in advance.
await fs.appendFile(metadataFile,JSON.stringify(meta(6))+'\n'); await adapter.scan(); assert.equal(adapter.metrics.failures,1);
await fs.writeFile(path.join(source,'6.json'),JSON.stringify(record(6))); await adapter.scan(); assert.equal(adapter.metrics.accepted,6);
let app = await startReviewServer({directory:data,port:0});
const address = app.url.replace('localhost','127.0.0.1');
const answer={leadPressure:'UNKNOWN',energyState:'UNKNOWN',banteResponse:'UNKNOWN',lineState:'UNKNOWN'};
const post = (input,headers={}) => fetch(address+'/api/review',{method:'POST',headers:{'content-type':'application/json','x-research-review':'1',...headers},body:JSON.stringify(input)});
const input={raceKey:meta(1).raceKey,reviewerId:'test-only',answers:answer};
assert.equal((await post(input,{origin:'https://evil.test'})).status,403);
assert.equal((await post({...input,answers:{...answer,energyState:'DEPLETED'}})).status,422);
const concurrent = await Promise.all([post(input),post(input)]); assert.deepEqual(concurrent.map(x=>x.status).sort(),[201,409]);
const review = await app.store.reviewed(input.raceKey,input.reviewerId); assert.equal(review.tags.length,4); assert.ok(review.tags.every(t=>t.verificationStatus==='UNKNOWN'));
assert.ok(review.evidenceHash); assert.ok(review.humanJudgment); assert.equal(review.disagreement,false);
const before=await fs.readFile(app.store.file('reviews',`${input.raceKey}|${input.reviewerId}`),'utf8');
assert.equal((await post(input)).status,409); assert.equal(await fs.readFile(app.store.file('reviews',`${input.raceKey}|${input.reviewerId}`),'utf8'),before);
assert.equal((await post({...input,reviewerId:'second-test-only'})).status,201);
const confirmedInput={...input,raceKey:meta(2).raceKey,reviewerId:'independent-fixture-review',initiativeRiderId:'T1',banteRiderId:'T2',evidenceSource:'synthetic independent observation, not a real review',independentEvidence:true,answers:{...answer,leadPressure:'CONTESTED',banteResponse:{value:'SUPPORT_FRONT',status:'STRONGLY_SUPPORTED'}}};
assert.equal((await post({...confirmedInput,banteRiderId:'missing'})).status,422);
assert.equal((await post(confirmedInput)).status,201);
const confirmed=await app.store.reviewed(confirmedInput.raceKey,confirmedInput.reviewerId);
assert.ok(confirmed.disagreement);assert.ok(confirmed.tags.some(t=>t.stateType==='BANTE_RESPONSE'&&t.context.conditionalCells.includes('BANTE')));
const coverage=(await (await fetch(address+'/api/status')).json()).coverage; assert.equal(coverage.taggedRaces,6); assert.equal(coverage.reviewedRaces,2); assert.equal(coverage.pendingRaces,4); assert.equal(coverage.unknownRate,10/12);
const pending=(await (await fetch(address+'/api/races?reviewer=test-only')).json()).rows; assert.equal(pending.length,5);
await app.close(); app = await startReviewServer({directory:data,port:0});
assert.equal((await app.store.reviewed(input.raceKey,input.reviewerId)).reviewId,review.reviewId);
assert.equal((await app.store.getRace(input.raceKey)).tags.length,tags.length);
await app.close();
console.log(JSON.stringify({status:'PASS',fixtureOnly:true,realRaceE2E:false,cases:6,adapter:adapter.snapshot(),coverage},null,2));
// Test directory is retained for inspection; never mixed into the operational store.
console.log(`Test artifact directory: ${directory}`);
