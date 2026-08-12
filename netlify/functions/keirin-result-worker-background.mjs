export default async (req) => {
  try {
    const p =
      await req.json();

    const date =
      String(
        p?.date || ""
      );

    const jobs =
      Array.isArray(
        p?.jobs
      )
        ? p.jobs
        : [];

    if (
      !/^\d{8}$/.test(
        date
      ) ||
      jobs.length === 0
    ) {
      throw new Error(
        "結果Workerの入力が不正です"
      );
    }

    console.log(
      `[keirin-result-worker-background] ` +
      `start date=${date} ` +
      `jobs=${jobs.length}`
    );

    let saved = 0;
    let unavailable = 0;
    let failed = 0;

    /*
     * 重要:
     *
     * Promise.allは禁止。
     * 複数Worker起動も禁止。
     *
     * 1R完了
     * ↓
     * 次の1R
     *
     * の完全逐次処理。
     */
    for (
      let index = 0;
      index < jobs.length;
      index++
    ) {
      const job =
        jobs[index];

      const venueCode =
        String(
          job?.venueCode ||
          ""
        ).padStart(2, "0");

      const venueName =
        String(
          job?.venueName ||
          ""
        ).trim();

      const raceNo =
        Number(
          job?.raceNo ||
          0
        );

      if (
        !/^\d{2}$/.test(
          venueCode
        ) ||
        !venueName ||
        !Number.isInteger(
          raceNo
        ) ||
        raceNo < 1 ||
        raceNo > 12
      ) {
        failed++;

        console.error(
          `[RESULT INVALID] ` +
          `${date} ${venueName} ` +
          `${raceNo}R`
        );

        continue;
      }

      const siteUrl =
        String(
          process.env.URL ||
          process.env.DEPLOY_PRIME_URL ||
          ""
        ).replace(
          /\/$/,
          ""
        );

      if (!siteUrl) {
        throw new Error(
          "NetlifyサイトURLが取得できません"
        );
      }

      const params =
        new URLSearchParams({
          date,
          venueCode,
          venueName,
          raceNo:
            String(raceNo)
        });

      const resultUrl =
        `${siteUrl}/.netlify/functions/` +
        `keirin-result-store?${params}`;

      const headers = {
        accept:
          "application/json"
      };

      const secret =
        String(
          process.env.RESULT_STORE_SECRET ||
          ""
        ).trim();

      if (secret) {
        headers[
          "x-result-store-secret"
        ] = secret;
      }

      let completed =
        false;

      try {
        const response =
          await fetch(
            resultUrl,
            {
              method: "GET",
              headers,

              /*
               * result-store側の
               * ブラウザ取得時間を考慮。
               */
              signal:
                AbortSignal.timeout(
                  30000
                )
            }
          );

        let data = null;

        try {
          data =
            await response.json();
        } catch {}

        if (
          response.ok &&
          data?.ok === true
        ) {
          saved++;
          completed =
            true;

          console.log(
            `[RESULT SAVED] ` +
            `${index + 1}/${jobs.length} ` +
            `${date} ` +
            `${venueName} ` +
            `${raceNo}R`
          );
        } else {
          const errorText =
            String(
              data?.error ||
              ""
            );

          if (
            response.status === 409 ||
            /未確定|未取得|not.*available/i.test(
              errorText
            )
          ) {
            unavailable++;
            completed =
              true;

            console.log(
              `[RESULT NOT READY] ` +
              `${index + 1}/${jobs.length} ` +
              `${date} ` +
              `${venueName} ` +
              `${raceNo}R`
            );
          } else {
            failed++;

            console.error(
              `[RESULT FAILED RESPONSE] ` +
              `${date} ` +
              `${venueName} ` +
              `${raceNo}R ` +
              `HTTP ${response.status}`,
              errorText
            );
          }
        }

      } catch (error) {
        failed++;

        console.error(
          `[RESULT ERROR] ` +
          `${index + 1}/${jobs.length} ` +
          `${date} ` +
          `${venueName} ` +
          `${raceNo}R`,
          error instanceof Error
            ? error.message
            : String(error)
        );
      }

      if (!completed) {
        console.error(
          `[RESULT FAILED] ` +
          `${index + 1}/${jobs.length} ` +
          `${date} ` +
          `${venueName} ` +
          `${raceNo}R`
        );
      }

      /*
       * ブラウザサービスへの連続アクセスを
       * 少しだけ間隔を空ける。
       */
      await sleep(1000);
    }

    console.log(
      JSON.stringify({
        ok: true,
        date,
        jobs:
          jobs.length,
        saved,
        unavailable,
        failed
      })
    );

    return new Response(
      null,
      {
        status: 204
      }
    );

  } catch (error) {
    console.error(
      "[keirin-result-worker-background] fatal",
      error instanceof Error
        ? error.message
        : String(error)
    );

    return new Response(
      null,
      {
        status: 204
      }
    );
  }
};

export const config = {
  background: true
};

function sleep(ms) {
  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        ms
      )
  );
}
