import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runScheduledActionTagCollection } from '../research/action-tag-scheduled-run.mjs';

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'action-tag-scheduler-'));
const scan = { accepted: 0, duplicates: 0, failures: 0, productionWrite: 0 };
const factory = async () => ({ scan: async () => scan });
const first = await runScheduledActionTagCollection({ directory: dir, collectorFactory: factory });
assert.equal(first.status, 'COMPLETED');
assert.equal((await fs.readdir(path.join(dir, 'continuous', 'scheduler-runs'))).length, 1);

const lockFile = path.join(dir, 'continuous', 'scheduler.lock');
await fs.writeFile(lockFile, JSON.stringify({ runId: 'active', pid: 123, startedAt: new Date().toISOString() }));
const overlap = await runScheduledActionTagCollection({ directory: dir, collectorFactory: factory, pidAlive: () => true });
assert.equal(overlap.status, 'SKIPPED_OVERLAP');

await fs.writeFile(lockFile, JSON.stringify({ runId: 'stale', pid: 456, startedAt: '2020-01-01T00:00:00.000Z' }));
const recovered = await runScheduledActionTagCollection({ directory: dir, collectorFactory: factory, pidAlive: () => false });
assert.equal(recovered.status, 'COMPLETED');
assert.equal(recovered.staleLockRecovered, true);

await fs.writeFile(lockFile, JSON.stringify({ runId: 'dead', pid: 789, startedAt: new Date().toISOString() }));
const deadRecovered = await runScheduledActionTagCollection({ directory: dir, collectorFactory: factory, pidAlive: () => false });
assert.equal(deadRecovered.status, 'COMPLETED');
assert.equal(deadRecovered.staleLockRecovered, true);
console.log('PASS action-tag scheduler lease, overlap skip, stale-lock recovery, run history');
