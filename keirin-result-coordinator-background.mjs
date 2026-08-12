const DISCOVER_TIMEOUT_MS = 100_000;
const WORKER_DISPATCH_TIMEOUT_MS = 5_000;
const WORKER_CONCURRENCY = 20;

const env = (name) => String(process.env[name] || "").trim();

async function fetchWithTimeout(url, options = {}, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

function getJstDate() {
  const now = new Date();
  const jst = new Date(
    now.toLocaleString("en-US", {
      timeZone: "Asia/Tokyo"
    })
  );

  return {
    now: jst,
    date:
      `${jst.getFullYear()}` +
      `${String(jst.getMonth() + 1).padStart(2, "0")}` +
      `${String(jst.getDate()).padStart(2, "0")}`
  };
}

function buildJobs(meetings, date, jst) {
  const jobs = [];

  for (const meeting of meetings) {
    const venueCode = String(
      meeting?.venueCode || ""
    ).padStart(2, "0");

    const venueName = String(
      meeting?.venueName || ""
    ).trim();

    if (!/^\d{2}$/.test(venueCode) || !venueName) {
      continue;
    }

    const raceNumbers = Array.isArray(meeting?.raceNumbers)
      ? [...new Set(
          meeting.raceNumbers
            .map(Number)
            .filter(
              (n) =>
                Number.isInteger(n) &&
                n >= 1 &&
                n <= 12
            )
        )].sort((a, b) => a - b)
      : [];

    const races = Array.isArray(meeting?.races)
      ? meeting.races
      : [];

    const raceMap = new Map();

    for (const race of races) {
      const raceNo = Number(
        race?.raceNo ||
        race?.number ||
        0
      );

      if (
        Number.isInteger(raceNo) &&
        raceNo >= 1 &&
        raceNo <= 12
      ) {
        raceMap.set(raceNo, race);
      }
    }

    for (const raceNo of raceNumbers) {
      const race = raceMap.get(raceNo);

      if (
        race &&
        !hasStarted(race.startTime, jst)
      ) {
        continue;
      }

      jobs.push({
        date,
        venueCode,
        venueName,
        raceNo
      });
    }
  }

  return jobs;
}

async function dispatchBatch(batch, workerUrl, secret) {
  return Promise.all(
    batch.map(async (job) => {
      try {
        const headers = {
          "content-type": "application/json",
          accept: "application/json"
        };

        if (secret) {
          headers["x-result-store-secret"] = secret;
        }

        const response = await fetchWithTimeout(
          workerUrl,
          {
            method: "POST",
            headers,
            body: JSON.stringify(job)
          },
          WORKER_DISPATCH_TIMEOUT_MS
        );

        if (response.ok) {
          console.log(
            `[WORKER DISPATCHED] ${job.date} ${job.venueName} ${job.raceNo}R`
          );
          return true;
        }

        console.error(
          `[WORKER DISPATCH FAILED] ` +
          `${job.date} ${job.venueName} ${job.raceNo}R ` +
          `HTTP ${response.status}`
        );
        return false;
      } catch (error) {
        console.error(
          `[WORKER DISPATCH ERROR] ` +
          `${job.date} ${job.venueName} ${job.raceNo}R`,
          error instanceof Error ? error.message : String(error)
        );
        return false;
      }
    })
  );
}

export default async function handler(req) {
  try {
    const secret = env("RESULT_STORE_SECRET");

    if (
      secret &&
      req.headers.get("x-result-store-secret") !== secret
    ) {
      return new Response(null, { status: 401 });
    }

    const siteUrl = String(
      process.env.URL ||
      process.env.DEPLOY_PRIME_URL ||
      ""
    ).replace(/\/$/, "");

    if (!siteUrl) {
      throw new Error("NetlifyサイトURLが取得できません");
    }

    const suppliedDate =
      new URL(req.url).searchParams.get("date") || "";

    const current = getJstDate();
    const date = /^\d{8}$/.test(suppliedDate)
      ? suppliedDate
      : current.date;

    const discoverUrl =
      `${siteUrl}/.netlify/functions/keirin-discover?` +
      new URLSearchParams({ date });

    const response = await fetchWithTimeout(
      discoverUrl,
      {
        headers: {
          accept: "application/json"
        }
      },
      DISCOVER_TIMEOUT_MS
    );

    let data = null;
    try {
      data = await response.json();
    } catch {}

    if (!response.ok || data?.ok !== true) {
      throw new Error(
        data?.error ||
        `開催取得失敗 HTTP ${response.status}`
      );
    }

    const meetings = Array.isArray(data?.meetings)
      ? data.meetings
      : [];

    const jobs = buildJobs(
      meetings,
      date,
      current.now
    );

    console.log(
      `[RESULT COORDINATOR TARGET] ` +
      `date=${date} meetings=${meetings.length} jobs=${jobs.length}`
    );

    if (jobs.length === 0) {
      return new Response(null, { status: 204 });
    }

    const workerUrl =
      `${siteUrl}/.netlify/functions/` +
      `keirin-result-worker-background`;

    const secretValue = env("RESULT_STORE_SECRET");

    let dispatched = 0;
    let failed = 0;

    for (
      let offset = 0;
      offset < jobs.length;
      offset += WORKER_CONCURRENCY
    ) {
      const batch = jobs.slice(
        offset,
        offset + WORKER_CONCURRENCY
      );

      const results = await dispatchBatch(
        batch,
        workerUrl,
        secretValue
      );

      for (const ok of results) {
        if (ok) dispatched++;
        else failed++;
      }
    }

    console.log(
      JSON.stringify({
        ok: failed === 0,
        date,
        meetings: meetings.length,
        jobs: jobs.length,
        dispatched,
        failed
      })
    );

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error(
      "[keirin-result-coordinator-background] fatal",
      error instanceof Error ? error.message : String(error)
    );

    return new Response(null, { status: 204 });
  }
}

export const config = {
  background: true
};

function hasStarted(value, jstNow) {
  const text = String(value || "").trim();

  if (!text) return true;

  const match = text.match(
    /(\d{1,2}):(\d{2})(?::(\d{2}))?/
  );

  if (!match) return true;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] || 0);

  if (
    hour < 0 || hour > 23 ||
    minute < 0 || minute > 59 ||
    second < 0 || second > 59
  ) {
    return true;
  }

  const raceTime = new Date(jstNow);
  raceTime.setHours(hour, minute, second, 0);

  return jstNow >= raceTime;
}
