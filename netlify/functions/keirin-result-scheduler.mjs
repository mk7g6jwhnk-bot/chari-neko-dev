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

    const meetings = Array.isArray(discoverData?.meetings)
      ? discoverData.meetings
      : [];

    // ② Workerへ渡す対象レースを作成
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

      /*
       * raceNumbersを正規のレース番号一覧として使用する。
       *
       * discover側が
       *   raceNumbers: [1,2,3,...]
       *   races: [...]
       * のどちらか／両方を返しても動くようにする。
       */

      const raceNumbers = Array.isArray(meeting?.raceNumbers)
        ? meeting.raceNumbers
            .map((value) => Number(value))
            .filter(
              (value) =>
                Number.isInteger(value) &&
                value >= 1 &&
                value <= 12
            )
        : [];

      const races = Array.isArray(meeting?.races)
        ? meeting.races
        : [];

      // raceNo → race情報
      const raceMap = new Map();

      for (const race of races) {
        const raceNo = Number(race?.raceNo || 0);

        if (
          Number.isInteger(raceNo) &&
          raceNo >= 1 &&
          raceNo <= 12
        ) {
          raceMap.set(raceNo, race);
        }
      }

      /*
       * raceNumbersが空でもracesが存在する場合は、
       * races側からレース番号を補完する。
       */
      const targetRaceNumbers = [
        ...new Set([
          ...raceNumbers,
          ...Array.from(raceMap.keys())
        ])
      ].sort((a, b) => a - b);

      for (const raceNo of targetRaceNumbers) {
        const race = raceMap.get(raceNo);

        /*
         * 発走時刻が取得できる場合だけ発走前を除外。
         * 時刻が無い場合はWorkerへ渡す。
         * 未確定ならresult-store側で処理する。
         */
        if (!hasStarted(race?.startTime, jst)) {
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

    // ③ Background Workerへ投入
    const workerUrl =
      `${siteUrl}/.netlify/functions/keirin-result-worker-background`;

    const dispatchResults = await Promise.all(
      jobs.map(async (job) => {
        try {
          const response = await fetch(workerUrl, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              accept: "application/json"
            },
            body: JSON.stringify(job),
            signal: AbortSignal.timeout(8000)
          });

          if (response.ok) {
            console.log(
              `[WORKER DISPATCHED] ${job.date} ${job.venueName} ${job.raceNo}R HTTP ${response.status}`
            );

            return {
              ok: true,
              job
            };
          }

          console.error(
            `[WORKER DISPATCH FAILED] ${job.date} ${job.venueName} ${job.raceNo}R HTTP ${response.status}`
          );

          return {
            ok: false,
            job
          };
        } catch (error) {
          console.error(
            `[WORKER DISPATCH ERROR] ${job.date} ${job.venueName} ${job.raceNo}R`,
            error instanceof Error
              ? error.message
              : String(error)
          );

          return {
            ok: false,
            job
          };
        }
      })
    );

    const dispatched = dispatchResults.filter(
      (result) => result.ok
    ).length;

    const dispatchFailed =
      dispatchResults.length - dispatched;

    const finishedAt = new Date().toISOString();

    console.log(
      JSON.stringify({
        ok: true,
        date,
        meetings: meetings.length,
        jobs: jobs.length,
        dispatched,
        dispatchFailed,
        startedAt,
        finishedAt
      })
    );

    return new Response(null, {
      status: 204
    });

  } catch (error) {
    console.error(
      "[keirin-result-scheduler] fatal",
      error instanceof Error
        ? error.message
        : String(error)
    );

    // 次回の毎時実行で再試行
    return new Response(null, {
      status: 204
    });
  }
};

export const config = {
  schedule: "@hourly"
};

function hasStarted(value, jstNow) {
  const text = String(value || "").trim();

  // 発走時刻が無い場合はWorkerへ渡す
  if (!text) {
    return true;
  }

  const match = text.match(
    /(\d{1,2}):(\d{2})(?::(\d{2}))?/
  );

  // 時刻形式を認識できない場合もWorkerへ渡す
  if (!match) {
    return true;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] || 0);

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

  const raceTime = new Date(jstNow);

  raceTime.setHours(
    hour,
    minute,
    second,
    0
  );

  return jstNow >= raceTime;
}
