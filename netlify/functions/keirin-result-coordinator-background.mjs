// Latest audited overwrite version.
// Changes: worker concurrency 20 -> 5; stale/unverified meetings never dispatched.

const DISCOVER_TIMEOUT_MS = 100_000;
const WORKER_DISPATCH_TIMEOUT_MS = 5_000;
const WORKER_CONCURRENCY = 5;

const env = (name) => String(process.env[name] || "").trim();

async function fetchWithTimeout(url, options = {}, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function getJstDate() {
  const now = new Date();
  const jst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  return {
    now: jst,
    date: `${jst.getFullYear()}${String(jst.getMonth() + 1).padStart(2, "0")}${String(jst.getDate()).padStart(2, "0")}`
  };
}

function hasStarted(value, jstNow) {
  const text = String(value || "").trim();
  if (!text) return true;
  const match = text.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return true;
  const h = Number(match[1]), m = Number(match[2]), s = Number(match[3] || 0);
  if (h > 23 || m > 59 || s > 59) return true;
  const t = new Date(jstNow);
  t.setHours(h, m, s, 0);
  return jstNow >= t;
}

function buildJobs(meetings, date, jst) {
  const jobs = [];
  for (const meeting of meetings) {
    if (meeting?.stale === true || meeting?.verifiedMeeting !== true || meeting?.identityPassed !== true) continue;

    const venueCode = String(meeting?.venueCode || "").padStart(2, "0");
    const venueName = String(meeting?.venueName || "").trim();
    if (!/^\d{2}$/.test(venueCode) || !venueName) continue;

    const raceNumbers = Array.isArray(meeting?.raceNumbers)
      ? [...new Set(meeting.raceNumbers.map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 12))].sort((a,b)=>a-b)
      : [];

    const races = Array.isArray(meeting?.races) ? meeting.races : [];
    const raceMap = new Map();
    for (const race of races) {
      const n = Number(race?.raceNo || race?.number || 0);
      if (Number.isInteger(n) && n >= 1 && n <= 12) raceMap.set(n, race);
    }

    for (const raceNo of raceNumbers) {
      const race = raceMap.get(raceNo);
      if (race && !hasStarted(race.startTime, jst)) continue;
      jobs.push({ date, venueCode, venueName, raceNo });
    }
  }
  return jobs;
}

async function dispatchBatch(batch, workerUrl, secret) {
  return Promise.all(batch.map(async job => {
    try {
      const headers = { "content-type": "application/json", accept: "application/json" };
      if (secret) headers["x-result-store-secret"] = secret;
      const response = await fetchWithTimeout(workerUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(job)
      }, WORKER_DISPATCH_TIMEOUT_MS);

      if (response.ok) return true;
      console.error(`[WORKER DISPATCH FAILED] ${job.date} ${job.venueName} ${job.raceNo}R HTTP ${response.status}`);
      return false;
    } catch (error) {
      console.error(`[WORKER DISPATCH ERROR] ${job.date} ${job.venueName} ${job.raceNo}R`,
        error instanceof Error ? error.message : String(error));
      return false;
    }
  }));
}

export default async function handler(req) {
  try {
    const secret = env("RESULT_STORE_SECRET");
    if (secret && req.headers.get("x-result-store-secret") !== secret) return new Response(null, { status: 401 });

    const siteUrl = String(process.env.URL || process.env.DEPLOY_PRIME_URL || "").replace(/\/$/, "");
    if (!siteUrl) throw new Error("NetlifyサイトURLが取得できません");

    const suppliedDate = new URL(req.url).searchParams.get("date") || "";
    const current = getJstDate();
    const date = /^\d{8}$/.test(suppliedDate) ? suppliedDate : current.date;

    const discoverUrl = `${siteUrl}/.netlify/functions/keirin-discover?${new URLSearchParams({ date })}`;
    const response = await fetchWithTimeout(discoverUrl, { headers: { accept: "application/json" } }, DISCOVER_TIMEOUT_MS);

    let data = null;
    try { data = await response.json(); } catch {}

    if (!response.ok || data?.ok !== true) throw new Error(data?.error || `開催取得失敗 HTTP ${response.status}`);
    if (data?.stale === true) return new Response(null, { status: 204 });

    const meetings = Array.isArray(data?.meetings) ? data.meetings : [];
    const jobs = buildJobs(meetings, date, current.now);
    if (!jobs.length) return new Response(null, { status: 204 });

    const workerUrl = `${siteUrl}/.netlify/functions/keirin-result-worker-background`;
    let dispatched = 0, failed = 0;

    for (let offset = 0; offset < jobs.length; offset += WORKER_CONCURRENCY) {
      const results = await dispatchBatch(jobs.slice(offset, offset + WORKER_CONCURRENCY), workerUrl, secret);
      for (const ok of results) ok ? dispatched++ : failed++;
    }

    console.log(JSON.stringify({ ok: failed === 0, date, meetings: meetings.length, jobs: jobs.length, dispatched, failed }));
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("[keirin-result-coordinator-background] fatal",
      error instanceof Error ? error.message : String(error));
    return new Response(null, { status: 204 });
  }
}

export const config = { background: true };
