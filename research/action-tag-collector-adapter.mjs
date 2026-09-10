export function createFailOpenCollectorAdapter({ collector, maxHeapBytes = 64 * 1024 * 1024, heapUsed = () => process.memoryUsage().heapUsed } = {}) {
  if (!collector) throw new Error("ACTION_TAG_COLLECTOR_REQUIRED");
  let accepted = 0, rejected = 0, failures = 0, highWaterHeapBytes = 0;
  return {
    afterRaceSaved(record) {
      try {
        const used = heapUsed(); highWaterHeapBytes = Math.max(highWaterHeapBytes, used);
        if (used > maxHeapBytes) { rejected += 1; return { accepted: false, reason: "MEMORY_GUARD", productionContinues: true }; }
        const result = collector.offer(record); result.accepted ? accepted++ : rejected++; return { ...result, productionContinues: true };
      } catch (error) { failures += 1; return { accepted: false, reason: "RESEARCH_COLLECTOR_FAILURE", error: String(error?.message || error), productionContinues: true }; }
    },
    async runBatch(limit = 5) { try { return await collector.drain({ limit }); } catch { failures += 1; return []; } },
    snapshot() { return { accepted, rejected, failures, highWaterHeapBytes, maxHeapBytes, collectorStatus: collector.status, productionBlocking: false, productionWriteAllowed: false }; }
  };
}
