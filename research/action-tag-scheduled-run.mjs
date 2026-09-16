import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ContinuousActionTagCollector } from './action-tag-continuous-collector.mjs';
import { appendEvent } from './action-tag-live-store.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const defaultDirectory = path.join(root, 'action-tag-live-data');

export async function runScheduledActionTagCollection({
  directory = defaultDirectory,
  leaseTimeoutMs = null,
  now = () => new Date().toISOString(),
  pidAlive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } },
  collectorFactory = async () => new ContinuousActionTagCollector({ directory }).init()
} = {}) {
  directory = path.resolve(directory);
  if (leaseTimeoutMs == null) {
    const config = JSON.parse(await fs.readFile(path.join(root, 'action-tag-scheduler.config.json'), 'utf8'));
    leaseTimeoutMs = Math.max(5, Number(config.leaseTimeoutMinutes) || 45) * 60 * 1000;
  }
  const lockFile = path.join(directory, 'continuous', 'scheduler.lock');
  await fs.mkdir(path.dirname(lockFile), { recursive: true });
  const runId = randomUUID(), startedAt = now();
  let staleLockRecovered = false;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await fs.open(lockFile, 'wx');
      await handle.writeFile(JSON.stringify({ runId, pid: process.pid, startedAt, leaseTimeoutMs }));
      await handle.sync(); await handle.close();
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let lock = null;
      try { lock = JSON.parse(await fs.readFile(lockFile, 'utf8')); } catch {}
      const age = Date.parse(startedAt) - Date.parse(lock?.startedAt);
      if (lock && Number.isFinite(age) && age <= leaseTimeoutMs && pidAlive(Number(lock.pid)))
        return { status: 'SKIPPED_OVERLAP', runId, activeRunId: lock.runId, startedAt, productionWrite: 0 };
      if (attempt) return { status: 'LOCK_CONTENTION', runId, startedAt, productionWrite: 0 };
      await fs.unlink(lockFile).catch(error => { if (error.code !== 'ENOENT') throw error; });
      staleLockRecovered = true;
    }
  }

  let result;
  try {
    const collector = await collectorFactory();
    const scan = await collector.scan();
    result = { status: scan.status || 'COMPLETED', runId, startedAt, completedAt: now(), staleLockRecovered, scan, productionWrite: 0 };
    return result;
  } catch (error) {
    result = { status: 'FAILED_OPEN', runId, startedAt, completedAt: now(), staleLockRecovered, error: String(error?.message || error), productionWrite: 0 };
    return result;
  } finally {
    if (result) await appendEvent(path.join(directory, 'continuous', 'scheduler-runs', `${runId}.json`), result).catch(() => {});
    try {
      const lock = JSON.parse(await fs.readFile(lockFile, 'utf8'));
      if (lock.runId === runId) await fs.unlink(lockFile);
    } catch {}
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  console.log(JSON.stringify(await runScheduledActionTagCollection(), null, 2));
