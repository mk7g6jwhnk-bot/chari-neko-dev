export default async (req) => {
  const startedAt = new Date().toISOString();

  try {
    const siteUrl = String(
      process.env.URL ||
      process.env.DEPLOY_PRIME_URL ||
      ""
    ).replace(/\/$/, "");

    if (!siteUrl) {
      throw new Error("NetlifyサイトURLが取得できません");
    }

    // 日本時間の現在時刻
    const now = new Date();

    const jst = new Date(
      now.toLocaleString("en-US", {
        timeZone: "Asia/Tokyo"
      })
    );

    const yyyy = jst.getFullYear();
    const mm = String(jst.getMonth() + 1).padStart(2, "0");
    const dd = String(jst.getDate()).padStart(2, "0");

    const date = `${yyyy}${mm}${dd}`;

    console.log(
      `[keirin-result-scheduler] start ${date} ${startedAt}`
    );

    // ① 今日の開催を取得
    const discoverUrl =
      `${siteUrl}/.netlify/functions/keirin-discover?` +
      new URLSearchParams({ date });

    const discoverResponse = await fetch(discoverUrl, {
      headers: {
        accept: "application/json"
      },
      signal: AbortSignal.timeout(12000)
    });

    let discoverData = null;

    try {
      discoverData = await discoverResponse.json();
    } catch {}

    if (!discoverResponse.ok || discoverData?.ok === false) {
      throw new Error(
        discoverData?.error ||
        `開催取得失敗 HTTP ${discoverResponse.status}`
      );
    }

    const meetings = Array.isArray(
      discoverData?.meetings
    )
      ? discoverData.meetings
      : [];

    // ② 結果取得対象レースを作成
    const jobs = [];

    for (const meeting of meetings) {
      const venueCode = String(
        meeting?.venueCode || ""
      ).padStart(2, "0");

      const venueName = String(
        meeting?.venueName || ""
      ).trim();

      if (
        !/^\d{2}$/.test(venueCode) ||
        !venueName
      ) {
        continue;
      }

      const races = Array.isArray(
        meeting?.races
      )
        ? meeting.races
        : [];

      const raceMap = new Map();

      for (const race of races) {
        const raceNo = Number(
          race?.raceNo || 0
        );

        if (
          Number.isInteger(raceNo) &&
          raceNo >= 1 &&
          raceNo <= 12
        ) {
          raceMap.set(raceNo, race);
        }
      }

      const raceNumbers = [
        ...raceMap.keys()
      ].sort((a, b) => a - b);

      for (const raceNo of raceNumbers) {
        const race = raceMap.get(raceNo);

        // 発走前は取得しない
        if (
          !hasStarted(
            race?.startTime,
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
      `[keirin-result-scheduler] worker jobs=${jobs.length}`
    );

    // ③ Worker URL
    const workerUrl =
      `${siteUrl}/.netlify/functions/keirin-result-worker-background`;

    let dispatched = 0;
    let dispatchFailed = 0;

    /*
     * 重要
     *
     * Workerは同時起動しない。
     *
     * 1件ずつ投入することで、
     *
     * scheduler
     *   ↓
     * worker 1件
     *   ↓
     * result-store
     *   ↓
     * browser service
     *
     * という形にして、
     * ブラウザサービスへの同時アクセス集中を防ぐ。
     */

    for (const job of jobs) {
      try {
        const response = await fetch(
          workerUrl,
          {
            method: "POST",

            headers: {
              "content-type":
                "application/json",
              accept:
                "application/json"
            },

            body: JSON.stringify(job),

            // Background Functionの受付確認だけ。
            // 結果取得そのものをここでは待たない。
            signal:
              AbortSignal.timeout(8000)
          }
        );

        if (response.ok) {
          dispatched++;

          console.log(
            `[WORKER DISPATCHED] ` +
            `${job.date} ` +
            `${job.venueName} ` +
            `${job.raceNo}R ` +
            `HTTP ${response.status}`
          );
        } else {
          dispatchFailed++;

          console.error(
            `[WORKER DISPATCH FAILED] ` +
            `${job.date} ` +
            `${job.venueName} ` +
            `${job.raceNo}R ` +
            `HTTP ${response.status}`
          );
        }

      } catch (error) {
        dispatchFailed++;

        console.error(
          `[WORKER DISPATCH ERROR] ` +
          `${job.date} ` +
          `${job.venueName} ` +
          `${job.raceNo}R`,
          error instanceof Error
            ? error.message
            : String(error)
        );
      }

      /*
       * 次のWorkerを投入する前に
       * 1秒間隔を入れる。
       */
      await sleep(1000);
    }

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
        dispatchMode:
          "sequential",
        dispatched,
        dispatchFailed,
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

    /*
     * Scheduled Functionなので
     * 本文は返さない。
     *
     * 次回の毎時実行で
     * 再度確認する。
     */
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
    String(value || "").trim();

  /*
   * 発走時刻が取得できない場合は
   * Worker側で結果未確定を判定させる。
   */
  if (!text) {
    return true;
  }

  const match = text.match(
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

function sleep(ms) {
  return new Promise(
    (resolve) =>
      setTimeout(resolve, ms)
  );
}
