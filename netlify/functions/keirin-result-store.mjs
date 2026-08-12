import {
  jsonResponse
} from "../../keirin/parser/utils.mjs";

import {
  normalizeResult
} from "./keirin-result.mjs";

const env = (name) =>
  String(
    process.env[name] || ""
  ).trim();

const raceId = (p) =>
  `keirin:${p.date}:${p.venueCode}:${p.raceNo}`;

async function supabaseFetch(
  path,
  options = {}
) {
  const url =
    env(
      "SUPABASE_URL"
    ).replace(
      /\/$/,
      ""
    );

  const key =
    env(
      "SUPABASE_SERVICE_ROLE_KEY"
    );

  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が未設定です"
    );
  }

  return fetch(
    `${url}/rest/v1/${path}`,
    {
      ...options,

      headers: {
        apikey:
          key,

        Authorization:
          `Bearer ${key}`,

        "Content-Type":
          "application/json",

        ...(options.headers || {})
      }
    }
  );
}

async function logFetch(
  row
) {
  try {
    await supabaseFetch(
      "result_fetch_logs",
      {
        method: "POST",

        headers: {
          Prefer:
            "return=minimal"
        },

        body:
          JSON.stringify(row)
      }
    );
  } catch {}
}

export default async function handler(
  req
) {
  let p = null;

  try {
    const secret =
      env(
        "RESULT_STORE_SECRET"
      );

    if (
      secret &&
      req.headers.get(
        "x-result-store-secret"
      ) !== secret
    ) {
      return jsonResponse(
        401,
        {
          ok: false,
          error:
            "認証に失敗しました"
        }
      );
    }

    const u =
      new URL(req.url);

    p = {
      date:
        u.searchParams.get(
          "date"
        ) || "",

      venueCode:
        String(
          u.searchParams.get(
            "venueCode"
          ) || ""
        ).padStart(2, "0"),

      venueName:
        u.searchParams.get(
          "venueName"
        ) || "",

      raceNo:
        Number(
          u.searchParams.get(
            "raceNo"
          ) || 0
        )
    };

    if (
      !/^\d{8}$/.test(
        p.date
      ) ||
      !/^\d{2}$/.test(
        p.venueCode
      ) ||
      !p.venueName ||
      !Number.isInteger(
        p.raceNo
      ) ||
      p.raceNo < 1 ||
      p.raceNo > 12
    ) {
      throw new Error(
        "結果取得に必要なレースIDが不正です"
      );
    }

    const base =
      env(
        "KEIRIN_BROWSER_SERVICE_URL"
      ).replace(
        /\/$/,
        ""
      );

    if (!base) {
      throw new Error(
        "KEIRIN_BROWSER_SERVICE_URLが未設定です"
      );
    }

    const q =
      new URLSearchParams({
        date:
          p.date,

        venueCode:
          p.venueCode,

        venueName:
          p.venueName,

        raceNo:
          String(p.raceNo)
      });

    /*
     * 公式結果取得。
     *
     * ブラウザサービスが
     * 一時的に遅くても、
     * Worker側の30秒以内に収まるよう
     * 25秒を上限にする。
     */
    const response =
      await fetch(
        `${base}/keirin/result?${q}`,
        {
          headers: {
            accept:
              "application/json"
          },

          signal:
            AbortSignal.timeout(
              25000
            )
        }
      );

    let data = null;

    try {
      data =
        await response.json();
    } catch {}

    const result =
      normalizeResult(
        data?.result ||
        data?.officialData?.result ||
        data?.officialResult
      );

    const id =
      raceId(p);

    /*
     * HTTPエラーだけでなく、
     * 正規化結果が無い場合も
     * 未確定扱いにする。
     */
    if (
      !response.ok ||
      !result
    ) {
      await logFetch({
        race_id:
          id,

        status:
          "failed",

        http_status:
          response.status,

        retry_count:
          0,

        error_code:
          "RESULT_UNAVAILABLE",

        error_message:
          data?.error ||
          "公式結果が未確定です",

        source:
          "keirin-browser"
      });

      return jsonResponse(
        409,
        {
          ok: false,
          race: p,
          error:
            data?.error ||
            "公式結果が未確定です"
        }
      );
    }

    /*
     * Supabase保存。
     */
    const saved =
      await supabaseFetch(
        "race_results?on_conflict=race_id",
        {
          method:
            "POST",

          headers: {
            Prefer:
              "resolution=merge-duplicates,return=representation"
          },

          body:
            JSON.stringify({
              race_id:
                id,

              competition:
                "keirin",

              venue:
                p.venueName,

              race_date:
                `${p.date.slice(0, 4)}-` +
                `${p.date.slice(4, 6)}-` +
                `${p.date.slice(6, 8)}`,

              race_number:
                p.raceNo,

              result_status:
                result.status,

              finishing_order:
                result.finishOrder ||
                [],

              official_decision:
                result.winningMethod ||
                null,

              payout:
                result.payout == null
                  ? null
                  : {
                      trifecta:
                        result.payout
                    },

              raw_result:
                result,

              source:
                result.source ||
                "official",

              fetched_at:
                new Date().toISOString(),

              updated_at:
                new Date().toISOString()
            })
        }
      );

    if (
      !saved.ok
    ) {
      throw new Error(
        `Supabase保存失敗: ` +
        `HTTP ${saved.status} ` +
        `${await saved.text()}`
      );
    }

    const savedRows =
      await saved.json();

    await logFetch({
      race_id:
        id,

      status:
        "success",

      http_status:
        response.status,

      retry_count:
        0,

      source:
        "keirin-browser"
    });

    return jsonResponse(
      200,
      {
        ok: true,
        race: p,
        saved:
          savedRows?.[0] ||
          null
      }
    );

  } catch (error) {
    if (p) {
      await logFetch({
        race_id:
          raceId(p),

        status:
          "error",

        retry_count:
          0,

        error_code:
          "STORE_ERROR",

        error_message:
          error instanceof Error
            ? error.message
            : String(error),

        source:
          "keirin-result-store"
      });
    }

    return jsonResponse(
      500,
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : String(error)
      }
    );
  }
}
