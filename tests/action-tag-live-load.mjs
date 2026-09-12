// Synthetic capacity audit. This does not constitute the real-race acceptance test.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { LiveActionStore } from '../research/action-tag-live-store.mjs';
import { LiveCollectorAdapter } from '../research/action-tag-live-adapter.mjs';
import { liveCoverage } from '../research/action-tag-live-coverage.mjs';
const root = await fs.mkdtemp(path.join(os.tmpdir(),'action-load-'));
const recordsDirectory = path.join(root,'source'); await fs.mkdir(recordsDirectory);
const store = await new LiveActionStore(path.join(root,'research')).init(), now=new Date().toISOString();
const metadataFile=path.join(root,'metadata.jsonl');
for(let i=0;i<300;i++) {
  const raceKey=`202610${String(1+Math.floor(i/12)).padStart(2,'0')}-28-${i%12+1}`;
  const record={raceKey,predictionSealedAt:now,resultObservedAt:now,participants:[{number:1,registration:'LOAD-A',officialTotalStarts:20,backCount:10},{number:2,registration:'LOAD-B'}],lines:[{number:1,lineId:'A',position:1},{number:2,lineId:'A',position:2}],result:{status:'confirmed',finishOrder:[1,2]},officialEvidence:{source:'SYNTHETIC_LOAD_ONLY',winningMethod:'逃げ',finishOrder:[1,2],markers:{backNumber:1},observedAt:now}};
  await fs.writeFile(path.join(recordsDirectory,`${raceKey}.json`),JSON.stringify(record));
  await fs.appendFile(metadataFile,JSON.stringify({raceKey,sequence:503+i,collectedAt:now})+'\n');
}
const adapter=new LiveCollectorAdapter({store,metadataFile,recordsDirectory});
const started=performance.now();await adapter.scan();const durationMs=performance.now()-started;
assert.equal(adapter.metrics.accepted,300);assert.equal(adapter.metrics.failures,0);assert.ok(adapter.metrics.peakQueueDepth<=20);
const c=await liveCoverage(store);assert.equal(c.taggedRaces,300);assert.equal(c.pendingRaces,300);
const resumed=new LiveCollectorAdapter({store:await new LiveActionStore(store.directory).init(),metadataFile,recordsDirectory});await resumed.scan();assert.equal(resumed.metrics.accepted,0);assert.equal(resumed.metrics.duplicates,300);
console.log(JSON.stringify({status:'PASS',syntheticOnly:true,realRaceE2E:false,races:c.taggedRaces,durationMs,adapter:adapter.snapshot(),resumeDuplicates:resumed.metrics.duplicates},null,2));
