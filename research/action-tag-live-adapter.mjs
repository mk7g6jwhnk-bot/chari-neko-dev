import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { setImmediate as yieldTurn } from 'node:timers/promises';
import { eligibleMetadata, MAX_RECORD_BYTES } from './action-tag-live-store.mjs';

// Read-only sidecar. The producer never waits for this process. The metadata feed
// must be an authoritative export of cohort membership, not locally assigned IDs.
export class LiveCollectorAdapter {
  constructor({ store, metadataFile, recordsDirectory, maxQueue = 20, maxHeapBytes = 128 * 1024 * 1024, heapUsed = () => process.memoryUsage().heapUsed }) {
    Object.assign(this, { store, metadataFile, recordsDirectory: recordsDirectory && path.resolve(recordsDirectory), maxQueue, maxHeapBytes, heapUsed });
    this.metrics = { mode: metadataFile && recordsDirectory ? 'STANDALONE_READ_ONLY' : 'SOURCE_NOT_CONFIGURED', scans: 0, accepted: 0, duplicates: 0, excluded: 0, failures: 0, heapGuards: 0, queueDepth: 0, peakQueueDepth: 0, processingMs: 0, maxProcessingMs: 0, lastError: null, lastScanAt: null };
  }
  async scan() {
    if (this.running || !this.metadataFile || !this.recordsDirectory) return;
    this.running = true;
    this.metrics.lastError = null;
    try {
      this.metrics.scans++;
      const queue = [];
      for await (const meta of streamMetadata(this.metadataFile)) {
        if (this.heapUsed() > this.maxHeapBytes) { this.metrics.heapGuards++; break; }
        // This check precedes any record file access, including stat/read.
        if (!eligibleMetadata(meta) || !(Date.parse(meta.collectedAt) >= Date.parse(this.store.enrollment.startedAt))) { this.metrics.excluded++; continue; }
        if (await this.store.getRace(meta.raceKey)) { this.metrics.duplicates++; continue; }
        queue.push(meta); this.metrics.queueDepth = queue.length;
        this.metrics.peakQueueDepth = Math.max(this.metrics.peakQueueDepth, queue.length);
        if (queue.length >= this.maxQueue) await this.drain(queue);
      }
      await this.drain(queue);
      this.metrics.lastScanAt = new Date().toISOString();
    } catch (error) { this.metrics.failures++; this.metrics.lastError = String(error.message); }
    finally { this.running = false; this.metrics.queueDepth = 0; }
  }
  async drain(queue) {
    while (queue.length) {
      if (this.heapUsed() > this.maxHeapBytes) { this.metrics.heapGuards++; queue.length = 0; return; }
      const meta = queue.shift(), started = performance.now();
      this.metrics.queueDepth = queue.length;
      try {
        const root = await fs.realpath(this.recordsDirectory);
        const file = await fs.realpath(path.resolve(root, meta.recordPath || `${meta.raceKey}.json`));
        const relative = path.relative(root, file);
        if (relative.startsWith('..') || path.isAbsolute(relative)) throw Error('SOURCE_PATH_ESCAPE');
        const stat = await fs.stat(file);
        if (stat.size > MAX_RECORD_BYTES) throw Error('RECORD_TOO_LARGE');
        const envelope = JSON.parse(await fs.readFile(file, 'utf8'));
        if (await this.store.ingest(meta, envelope.record || envelope)) this.metrics.accepted++;
      } catch (error) { this.metrics.failures++; this.metrics.lastError = String(error.message); }
      const elapsed = performance.now() - started;
      this.metrics.processingMs += elapsed; this.metrics.maxProcessingMs = Math.max(this.metrics.maxProcessingMs, elapsed);
      await yieldTurn();
    }
  }
  start(intervalMs = 30000) { this.scan(); this.timer = setInterval(() => this.scan(), Math.max(1000, intervalMs)); this.timer.unref(); }
  async stop() { clearInterval(this.timer); while (this.running) await yieldTurn(); }
  snapshot() { return { ...this.metrics, memory: process.memoryUsage(), productionBlocking: false, productionWriteAllowed: false }; }
}
export async function* streamMetadata(file) {
  let carry = '';
  for await (const chunk of createReadStream(file, { encoding: 'utf8', highWaterMark: 16384 })) {
    carry += chunk;
    let end;
    while ((end = carry.indexOf('\n')) >= 0) {
      const line = carry.slice(0, end); carry = carry.slice(end + 1);
      if (line.length > 16384) throw Error('METADATA_LINE_TOO_LARGE');
      if (line.trim()) yield JSON.parse(line);
    }
    if (carry.length > 16384) throw Error('METADATA_LINE_TOO_LARGE');
  }
  // A producer's incomplete trailing line is retried on the next scan.
}
