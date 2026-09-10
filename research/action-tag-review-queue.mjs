import fs from "node:fs";
import readline from "node:readline";
import { createActionTag, transitionActionTag } from "./action-tag-schema.mjs";

export class MemoryActionTagStore {
  #tags = new Map();
  append(tag) { const normalized = createActionTag(tag); if (this.#tags.has(normalized.tagId)) return this.#tags.get(normalized.tagId); this.#tags.set(normalized.tagId, normalized); return normalized; }
  replace(tag) { const normalized = createActionTag(tag); if (!this.#tags.has(normalized.tagId)) throw new Error("ACTION_TAG_NOT_FOUND"); this.#tags.set(normalized.tagId, normalized); return normalized; }
  get(tagId) { return this.#tags.get(tagId) || null; }
  list() { return [...this.#tags.values()]; }
}

export class JsonlActionTagStore {
  constructor(filePath) { this.filePath = filePath; }
  append(tag) { const normalized = createActionTag(tag); fs.appendFileSync(this.filePath, `${JSON.stringify(normalized)}\n`, { encoding: "utf8", flag: "a" }); return normalized; }
  async *stream() { if (!fs.existsSync(this.filePath)) return; const lines = readline.createInterface({ input: fs.createReadStream(this.filePath, "utf8"), crlfDelay: Infinity }); for await (const line of lines) if (line.trim()) yield Object.freeze(JSON.parse(line)); }
}

export class ActionTagReviewQueue {
  #items = new Map();
  constructor({ maxSize = 500 } = {}) { this.maxSize = Math.max(1, Number(maxSize) || 500); }
  enqueue(tag) {
    const normalized = createActionTag(tag);
    if (this.#items.has(normalized.tagId)) return this.#items.get(normalized.tagId);
    if (this.#items.size >= this.maxSize) throw new Error("ACTION_TAG_QUEUE_BOUNDED_CAPACITY");
    const item = Object.freeze({ queueId: `Q-${normalized.tagId}`, tagId: normalized.tagId, raceKey: normalized.raceKey, riderId: normalized.riderId, stateType: normalized.stateType, candidateStateValue: normalized.stateValue, evidenceType: normalized.evidenceType, evidenceSource: normalized.evidenceSource, observationTime: normalized.observationTime, verificationStatus: normalized.verificationStatus, reviewerNote: normalized.reviewerNote });
    this.#items.set(normalized.tagId, item); return item;
  }
  pending({ raceKey = null } = {}) { return [...this.#items.values()].filter(item => (!raceKey || item.raceKey === raceKey) && ["PENDING", "POSSIBLE", "UNKNOWN"].includes(item.verificationStatus)); }
  groupedPending(options = {}) { const groups = new Map(); for (const item of this.pending(options)) { const key = `${item.raceKey}|${item.stateType}`; if (!groups.has(key)) groups.set(key, { raceKey: item.raceKey, stateType: item.stateType, evidence: [], items: [] }); const group = groups.get(key); group.items.push(item); group.evidence.push({ source: item.evidenceSource, observationTime: item.observationTime, evidenceType: item.evidenceType }); } return [...groups.values()]; }
  review(tagId, decision, store) {
    const current = store.get(tagId); if (!current) throw new Error("ACTION_TAG_NOT_FOUND");
    const next = transitionActionTag(current, { ...decision, independentReview: true });
    store.replace(next); this.#items.delete(tagId); return next;
  }
  get size() { return this.#items.size; }
}
