import { normalizeResult } from "./keirin-result.mjs";

const env = (name) => String(process.env[name] || "").trim();

const BROWSER_TIMEOUT_MS = 60_000;
const SUPABASE_TIMEOUT_MS = 15_000;

const raceId = (p) =>
  `keirin:${p.date}:${p.venueCode}:${p.raceNo}`;

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

async function supabaseFetch(path, options = {}) {
  const url = env("SUPABASE_URL").replace(/\/$/, "");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が未設定です"
    );
  }

  return fetchWithTimeout(
    `${url}/rest/v1/${path}`,
    {
      ...options,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    },
    SUPABASE_TIMEOUT_MS
  );
}

async function logFetch(row) {
  try {
    await supabaseFetch("result_fetch_logs", {
      method: "POST",
      headers: {
        Prefer: "return=minimal"
      },
      body: JSON.stringify(row)
    });
  } catch (error) {
    console.error(
      "[RESULT LOG ERROR]",
      error instanceof Error ? error.message : String(error)
    );
  }
}

function normalizeRacePayload(body) {
  const date = String(body?.date || "").trim();
  const venueCode = String(
    body?.venueCode || ""
  ).padStart(2, "0");
  const venueName = String(
    body?.venueName || ""
  ).trim();
  const raceNo = Number(body?.raceNo || 0);

  if (
    !/^\d{8}$/.test(date) ||
    !/^\d{2}$/.test(venueCode) ||
    !venueName ||
    !Number.isInteger(raceNo) ||
    raceNo < 1 ||
    raceNo > 12
  ) {
    throw new Error(
      "結果ワーカーのレース情報が不正です"
    );
  }

  return {
    date,
    venueCode,
    venueName,
    raceNo
  };
}

async function fetchOfficialResult(p) {
  const base = env(
    "KEIRIN_BROWSER_SERVICE_URL"
  ).replace(/\/$/, "");

  if (!base) {
    throw new Error(
      "KEIRIN_BROWSER_SERVICE_URLが未設定です"
    );
  }

  const q = new URLSearchParams({
    date: p.date,
    venueCode: p.venueCode,
    venueName: p.venueName,
    raceNo: String(p.raceNo)
  });

  const response = await fetchWithTimeout(
    `${base}/keirin/result?${q}`,
    {
      headers: {
        accept: "application/json"
      }
    },
    BROWSER_TIMEOUT_MS
  );

  let data = null;

  try {
    data = await response.json();
  } catch {}

  return { response, data };
}

async function saveResult(p, result) {
  const now = new Date().toISOString();

  const saved = await supabaseFetch(
    "race_results?on_conflict=race_id",
    {
      method: "POST",
      headers: {
        Prefer:
          "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify({
        race_id: raceId(p),
        competition: "keirin",
        venue: p.venueName,
        race_date:
          `${p.date.slice(0, 4)}-` +
          `${p.date.slice(4, 6)}-` +
          `${p.date.slice(6, 8)}`,
        race_number: p.raceNo,
        result_status: result.status || "confirmed",
        finishing_order: result.finishOrder || [],
        official_decision:
          result.winningMethod || null,
        payout:
          result.payout == null
            ? null
            : { trifecta: result.payout },
        raw_result: result,
        source: result.source || "official",
        fetched_at: now,
        updated_at: now
      })
    }
  );

  if (!saved.ok) {
    throw new Error(
      `Supabase保存失敗: HTTP ${saved.status} ${await saved.text()}`
    );
  }

  let rows = [];
  try {
    rows = await saved.json();
  } catch {}

  return rows?.[0] || null;
}

export default async function handler(req) {
  let p = null;

  try {
    const secret = env("RESULT_STORE_SECRET");

    if (
      secret &&
      req.headers.get("x-result-store-secret") !== secret
    ) {
      return new Response(null, { status: 401 });
    }

    let body;

    try {
      body = await req.json();
    } catch {
      throw new Error(
        "結果ワーカーのJSONを読み取れません"
      );
    }

    p = normalizeRacePayload(body);

    const id = raceId(p);
    const startedAt = Date.now();

    console.log(
      `[RESULT START] ${p.date} ${p.venueName} ${p.raceNo}R`
    );

    let official;

    try {
      official = await fetchOfficialResult(p);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      const timeout =
        error?.name === "AbortError" ||
        /timeout|aborted/i.test(message);

      await logFetch({
        race_id: id,
        status: "failed",
        http_status: null,
        retry_count: 0,
        error_code: timeout
          ? "BROWSER_TIMEOUT"
          : "BROWSER_FETCH_ERROR",
        error_message: message,
        source: "keirin-browser"
      });

      console.error(
        `[RESULT FAILED] ${p.date} ${p.venueName} ${p.raceNo}R ${message}`
      );

      return new Response(null, { status: 204 });
    }

    const { response, data } = official;

    const result = normalizeResult(
      data?.result ||
      data?.officialData?.result ||
      data?.officialResult
    );

    if (!response.ok || !result) {
      const message =
        data?.error ||
        "公式結果が未確定です";

      await logFetch({
        race_id: id,
        status: "not_ready",
        http_status: response.status,
        retry_count: 0,
        error_code: "RESULT_UNAVAILABLE",
        error_message: message,
        source: "keirin-browser"
      });

      console.log(
        `[RESULT NOT READY] ${p.date} ${p.venueName} ${p.raceNo}R`
      );

      return new Response(null, { status: 204 });
    }

    try {
      await saveResult(p, result);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      await logFetch({
        race_id: id,
        status: "error",
        http_status: response.status,
        retry_count: 0,
        error_code: "STORE_ERROR",
        error_message: message,
        source: "keirin-result-worker-background"
      });

      console.error(
        `[RESULT SAVE FAILED] ${p.date} ${p.venueName} ${p.raceNo}R ${message}`
      );

      return new Response(null, { status: 204 });
    }

    await logFetch({
      race_id: id,
      status: "success",
      http_status: response.status,
      retry_count: 0,
      error_code: null,
      error_message: null,
      source: "keirin-browser"
    });

    console.log(
      `[RESULT SAVED] ${p.date} ${p.venueName} ${p.raceNo}R ` +
      `duration=${Date.now() - startedAt}ms`
    );

    return new Response(null, { status: 204 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    if (p) {
      await logFetch({
        race_id: raceId(p),
        status: "error",
        http_status: null,
        retry_count: 0,
        error_code: "WORKER_ERROR",
        error_message: message,
        source: "keirin-result-worker-background"
      });
    }

    console.error(
      "[keirin-result-worker-background] fatal",
      message
    );

    return new Response(null, { status: 204 });
  }
}

export const config = {
  background: true
};
