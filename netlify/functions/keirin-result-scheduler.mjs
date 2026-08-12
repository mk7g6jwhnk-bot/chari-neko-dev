const RETRY_DELAYS = [0, 3000, 8000];

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

    // 日本時間の今日
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

    let attempted = 0;
    let saved = 0;
    let unavailable = 0;
    let failed = 0;

    // ② 開催場ごとに確認
    for (const meeting of meetings) {
      const venueCode = String(
        meeting?.venueCode || ""
      ).padStart(2, "0");

      const venueName = String(
        meeting?.venueName || ""
      );

      const races = Array.isArray(meeting?.races)
        ? meeting.races
        : [];

      if (!/^\d{2}$/.test(venueCode) || !venueName) {
        continue;
      }

      // ③ レースごとに確認
      for (const race of races) {
        const raceNo = Number(race?.raceNo || 0);

        if (
          !Number.isInteger(raceNo) ||
          raceNo < 1 ||
          raceNo > 12
        ) {
          continue;
        }

        // 発走時刻が取得できる場合、
        // まだ発走していないレースは結果取得しない
        if (!hasStarted(race?.startTime, jst)) {
          continue;
        }

        attempted++;

        let completed = false;

        // ④ 結果取得
        for (let i = 0; i < RETRY_DELAYS.length; i++) {
          if (RETRY_DELAYS[i]) {
            await sleep(RETRY_DELAYS[i]);
          }

          try {
            const params = new URLSearchParams({
              date,
              venueCode,
              venueName,
              raceNo: String(raceNo)
            });

            const headers = {
              accept: "application/json"
            };

            const secret = String(
              process.env.RESULT_STORE_SECRET || ""
            ).trim();

            if (secret) {
              headers["x-result-store-secret"] = secret;
            }

            const resultUrl =
              `${siteUrl}/.netlify/functions/keirin-result-store?${params}`;

            const response = await fetch(resultUrl, {
              headers,
              signal: AbortSignal.timeout(22000)
            });

            let data = null;

            try {
              data = await response.json();
            } catch {}

            // 結果取得成功
            if (response.ok && data?.ok === true) {
              saved++;
              completed = true;

              console.log(
                `[RESULT SAVED] ${date} ${venueName} ${raceNo}R`
              );

              break;
            }

            // まだ結果が確定していない
            if (
              response.status === 409 ||
              /未確定|未取得|not.*available/i.test(
                String(data?.error || "")
              )
            ) {
              unavailable++;

              console.log(
                `[RESULT NOT READY] ${date} ${venueName} ${raceNo}R`
              );

              completed = true;
              break;
            }

            // その他のエラー
            console.log(
              `[RESULT RETRY] ${date} ${venueName} ${raceNo}R`,
              data?.error || response.status
            );
          } catch (error) {
            console.log(
              `[RESULT ERROR] ${date} ${venueName} ${raceNo}R`,
              error instanceof Error
                ? error.message
                : String(error)
            );
          }
        }

        if (!completed) {
          failed++;
        }
      }
    }

    const finishedAt = new Date().toISOString();

    console.log(
      JSON.stringify({
        ok: true,
        date,
        meetings: meetings.length,
        attempted,
        saved,
        unavailable,
        failed,
        startedAt,
        finishedAt
      })
    );

    return new Response(null, { status: 204 });

  } catch (error) {
    console.error(
      "[keirin-result-scheduler] fatal",
      error instanceof Error
        ? error.message
        : String(error)
    );

    // Scheduled Functionなのでレスポンス本文は不要。
    // ログに残して次回実行で再試行する。
    return new Response(null, { status: 204 });
  }
};


export const config = {
  schedule: "@hourly"
};


function hasStarted(value, jstNow) {
  const text = String(value || "").trim();

  if (!text) {
    // 発走時刻が取れない場合は結果取得を試みる。
    // 結果未確定ならresult-store側で409になる。
    return true;
  }

  // 例:
  // "09:06"
  // "9:06"
  // "09:06:00"
  const match = text.match(
    /(\d{1,2}):(\d{2})(?::(\d{2}))?/
  );

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
    minute > 59
  ) {
    return true;
  }

  const raceTime = new Date(jstNow);
  raceTime.setHours(hour, minute, second, 0);

  return jstNow >= raceTime;
}


function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
