import { getStore } from "@netlify/blobs";

const SCHEMA_VERSION = 1;
const STORE_PREFIX = "keirin-official-lines-v1";
export const STORAGE_WARNING = "公式ライン保存領域を利用できませんでした";

export function getOfficialLineStoreName(env = process.env) {
  const context = String(env.CONTEXT || "").trim().toLowerCase();
  if (context === "production") return `${STORE_PREFIX}-production`;
  if (context === "deploy-preview") {
    return `${STORE_PREFIX}-preview-${sanitizeBranch(env.BRANCH)}`;
  }
  if (context === "branch-deploy") {
    return `${STORE_PREFIX}-branch-${sanitizeBranch(env.BRANCH)}`;
  }
  return `${STORE_PREFIX}-dev`;
}

export function createNetlifyOfficialLineStore({
  env = process.env,
  getStoreImpl = getStore
} = {}) {
  const name = getOfficialLineStoreName(env);
  let store;
  const open = () => {
    store ||= getStoreImpl({ name, consistency: "strong" });
    return store;
  };
  return {
    name,
    async get(key) {
      return open().get(key, { type: "json", consistency: "strong" });
    },
    async set(key, value) {
      return open().setJSON(key, value);
    }
  };
}

export function createMemoryOfficialLineStore(initial = new Map()) {
  const values = initial;
  return {
    values,
    async get(key) { return values.get(key) ?? null; },
    async set(key, value) { values.set(key, structuredClone(value)); }
  };
}

export function officialLineKey({ date, venueCode, raceNo }) {
  const normalizedDate = String(date || "").replace(/\D/g, "");
  const normalizedVenue = String(venueCode || "").padStart(2, "0");
  const normalizedRace = Number(raceNo);
  if (!/^\d{8}$/.test(normalizedDate) || !/^\d{2}$/.test(normalizedVenue) || normalizedRace < 1 || normalizedRace > 12) {
    throw new Error("Invalid official line cache key");
  }
  return `${normalizedDate}/${normalizedVenue}/${normalizedRace}`;
}

export async function resolveOfficialLines({
  request,
  identity,
  currentLines,
  venueName,
  buildLineText,
  store,
  now = () => new Date().toISOString()
}) {
  const key = officialLineKey(request);
  const verifiedCurrent = validateCurrentOfficialLines({
    request,
    identity,
    currentLines,
    venueName,
    buildLineText,
    fetchedAt: now()
  });

  if (verifiedCurrent) {
    let storageWarning = null;
    try {
      await store.set(key, verifiedCurrent);
    } catch {
      storageWarning = STORAGE_WARNING;
    }
    return {
      lines: verifiedCurrent.lines,
      lineText: verifiedCurrent.lineText,
      lineSource: "official",
      fetchedAt: verifiedCurrent.fetchedAt,
      storageWarning
    };
  }

  if (Array.isArray(currentLines) && currentLines.length > 0) {
    return unavailable();
  }

  let cached = null;
  try {
    cached = await store.get(key);
  } catch {
    return unavailable(STORAGE_WARNING);
  }
  const verifiedCached = validateCachedOfficialLines(cached, request, buildLineText);
  if (!verifiedCached) return unavailable();
  return {
    lines: verifiedCached.lines,
    lineText: verifiedCached.lineText,
    lineSource: "cached-official",
    fetchedAt: verifiedCached.fetchedAt,
    storageWarning: null
  };
}

export function validateCachedOfficialLines(value, request, buildLineText) {
  if (!value || value.schemaVersion !== SCHEMA_VERSION || value.source !== "railway-official" || value.identityPassed !== true) return null;
  if (!identityMatchesRequest(value, request)) return null;
  const lines = sanitizeOfficialLines(value.lines);
  const lineText = buildLineText(lines);
  if (!lines.length || value.lineCount !== lines.length || !lineText || value.lineText !== lineText || !isIsoDate(value.fetchedAt)) return null;
  return { ...value, lines, lineText };
}

function validateCurrentOfficialLines({ request, identity, currentLines, venueName, buildLineText, fetchedAt }) {
  if (!identity || identity.identityPassed !== true || !identityMatchesRequest(identity, request)) return null;
  const lines = sanitizeOfficialLines(currentLines);
  const lineText = buildLineText(lines);
  if (!lines.length || !lineText) return null;
  return {
    schemaVersion: SCHEMA_VERSION,
    date: request.date,
    venueCode: String(request.venueCode).padStart(2, "0"),
    venueName: String(venueName || ""),
    raceNo: Number(request.raceNo),
    fetchedAt,
    source: "railway-official",
    identityPassed: true,
    lineCount: lines.length,
    lineText,
    lines
  };
}

function sanitizeOfficialLines(lines) {
  if (!Array.isArray(lines) || !lines.length) return [];
  const sanitized = [];
  for (const item of lines) {
    const number = Number(item?.number);
    const position = Number(item?.position);
    const order = Number(item?.order);
    const sourceType = String(item?.sourceType || "").trim();
    const sourcePath = String(item?.sourcePath || "").trim();
    const lineId = String(item?.lineId || "");
    const lineStatus = String(item?.lineStatus || "");
    if (number < 1 || number > 9 || position < 1 || order < 1 || !sourceType || !sourcePath) return [];
    if (/unknown|estimated|inferred/i.test(sourceType)) return [];
    if (lineId.startsWith("unknown-") || /推定|判定保留|単騎/.test(lineStatus)) return [];
    sanitized.push({ number, position, order, sourceType, sourcePath });
  }
  return sanitized;
}

function identityMatchesRequest(identity, request) {
  return String(identity.date || "").replace(/\D/g, "") === String(request.date || "").replace(/\D/g, "") &&
    String(identity.venueCode || "").padStart(2, "0") === String(request.venueCode || "").padStart(2, "0") &&
    Number(identity.raceNo) === Number(request.raceNo);
}

function sanitizeBranch(value) {
  const sanitized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return sanitized || "unknown";
}

function isIsoDate(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function unavailable(storageWarning = null) {
  return { lines: [], lineText: null, lineSource: "unavailable", fetchedAt: null, storageWarning };
}
