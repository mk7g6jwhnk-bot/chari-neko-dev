export default async () => {
  const startedAt = new Date().toISOString();

  try {
    const siteUrl = String(
      process.env.URL ||
      process.env.DEPLOY_PRIME_URL ||
      ""
    ).replace(/\/$/, "");

    if (!siteUrl) {
      throw new Error(
        "NetlifyサイトURLが取得できません"
      );
    }

    const now = new Date();

    const jst = new Date(
      now.toLocaleString("en-US", {
        timeZone: "Asia/Tokyo"
      })
    );

    const yyyy = jst.getFullYear();
    const mm = String(
      jst.getMonth() + 1
    ).padStart(2, "0");
    const dd = String(
      jst.getDate()
    ).padStart(2, "0");

    const date =
      `${yyyy}${mm}${dd}`;

    console.log(
      `[keirin-result-scheduler] start ${date} ${startedAt}`
    );

    // 今日の開催を取得
    const discoverUrl =
      `${siteUrl}/.netlify/functions/keirin-discover?` +
      new URLSearchParams({
        date
      });

    const discoverResponse =
      await fetch(
        discoverUrl,
        {
          headers: {
            accept:
              "application/json"
          },
          signal:
            AbortSignal.timeout(
              120000
            )
        }
      );

    let discoverData = null;

    try {
      discoverData =
        await discoverResponse.json();
    } catch {}

    if (
      !discoverResponse.ok ||
      discoverData?.ok !== true
    ) {
      throw new Error(
        discoverData?.error ||
        `開催取得失敗 HTTP ${discoverResponse.status}`
      );
    }

    const meetings =
      Array.isArray(
        discoverData?.meetings
      )
        ? discoverData.meetings
        : [];

    const jobs = [];

    /*
     * keirin-discover の正本は
     * meeting.raceNumbers。
     *
     * races は詳細情報として扱い、
     * raceNumbersを対象レースの基準にする。
     */
    for (const meeting of meetings) {
      const venueCode =
        String(
          meeting?.venueCode ||
          ""
        ).padStart(2, "0");

      const venueName =
        String(
          meeting?.venueName ||
          ""
        ).trim();

      if (
        !/^\d{2}$/.test(
          venueCode
        ) ||
        !venueName
      ) {
        continue;
      }

      const raceNumbers =
        Array.isArray(
          meeting?.raceNumbers
        )
          ? meeting.raceNumbers
              .map(Number)
              .filter(
                (n) =>
                  Number.isInteger(n) &&
                  n >= 1 &&
                  n <= 12
              )
          : [];

      const races =
        Array.isArray(
          meeting?.races
        )
          ? meeting.races
          : [];

      const raceMap =
        new Map();

      for (const race of races) {
        const raceNo =
          Number(
            race?.raceNo ||
            race?.number ||
            0
          );

        if (
          Number.isInteger(
            raceNo
          ) &&
          raceNo >= 1 &&
          raceNo <= 12
        ) {
          raceMap.set(
            raceNo,
            race
          );
        }
      }

      const uniqueRaceNumbers =
        [
          ...new Set(
            raceNumbers
          )
        ].sort(
          (a, b) => a - b
        );

      for (
        const raceNo
        of uniqueRaceNumbers
      ) {
        const race =
          raceMap.get(
            raceNo
          );

        /*
         * race詳細が存在する場合だけ
         * 発走時刻を確認。
         *
         * 詳細が無い場合でも
         * raceNumbersが正本なので
         * Workerへ渡す。
         */
        if (
          race &&
          !hasStarted(
            race.startTime,
            jst
          )
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

    console.log(
      `[keirin-result-scheduler] ` +
      `meetings=${meetings.length} ` +
      `jobs=${jobs.length}`
    );

    if (
      jobs.length === 0
    ) {
      console.error(
        "[keirin-result-scheduler] " +
        "結果取得対象レースが0件です"
      );

      return new Response(
        null,
        {
          status: 204
        }
      );
    }

    /*
     * Workerは1回だけ起動する。
     *
     * background functionへ
     * 全jobを渡し、
     * 実際の結果取得はWorker内部で
     * 完全逐次処理する。
     */
    const workerUrl =
      `${siteUrl}/.netlify/functions/` +
      `keirin-result-worker-background`;

    const workerResponse =
      await fetch(
        workerUrl,
        {
          method: "POST",

          headers: {
            "content-type":
              "application/json",
            accept:
              "application/json"
          },

          body:
            JSON.stringify({
              date,
              jobs
            }),

          /*
           * Background Functionは
           * 受付時点で202を返すため、
           * schedulerは実処理完了を待たない。
           */
          signal:
            AbortSignal.timeout(
              10000
            )
        }
      );

    if (
      !workerResponse.ok
    ) {
      throw new Error(
        `結果Worker起動失敗 ` +
        `HTTP ${workerResponse.status}`
      );
    }

    console.log(
      `[WORKER DISPATCHED] ` +
      `date=${date} ` +
      `jobs=${jobs.length} ` +
      `HTTP ${workerResponse.status}`
    );

    const finishedAt =
      new Date().toISOString();

    console.log(
      JSON.stringify({
        ok: true,
        date,
        meetings:
          meetings.length,
        jobs:
          jobs.length,
        dispatched:
          true,
        startedAt,
        finishedAt
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
      "[keirin-result-scheduler] fatal",
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
  schedule: "@hourly"
};

function hasStarted(
  value,
  jstNow
) {
  const text =
    String(
      value || ""
    ).trim();

  if (!text) {
    return true;
  }

  const match =
    text.match(
      /(\d{1,2}):(\d{2})(?::(\d{2}))?/
    );

  if (!match) {
    return true;
  }

  const hour =
    Number(match[1]);

  const minute =
    Number(match[2]);

  const second =
    Number(match[3] || 0);

  if (
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return true;
  }

  const raceTime =
    new Date(jstNow);

  raceTime.setHours(
    hour,
    minute,
    second,
    0
  );

  return (
    jstNow >= raceTime
  );
}
