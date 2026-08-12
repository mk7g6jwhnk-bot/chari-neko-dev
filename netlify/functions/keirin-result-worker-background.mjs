const RETRY_DELAYS = [0];

export default async (req) => {
  try {
    const p = await req.json();

    const date = String(p?.date || "");
    const venueCode = String(p?.venueCode || "").padStart(2, "0");
    const venueName = String(p?.venueName || "");
    const raceNo = Number(p?.raceNo || 0);

    if (
      !/^\d{8}$/.test(date) ||
      !/^\d{2}$/.test(venueCode) ||
      !venueName ||
      !Number.isInteger(raceNo) ||
      raceNo < 1 ||
      raceNo > 12
    ) {
      throw new Error("結果ワーカーのレース情報が不正です");
    }

    const siteUrl = String(
      process.env.URL ||
      process.env.DEPLOY_PRIME_URL ||
      ""
    ).replace(/\/$/, "");

    if (!siteUrl) {
      throw new Error("NetlifyサイトURLが取得できません");
    }

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

    for (let i = 0; i < RETRY_DELAYS.length; i++) {
      if (RETRY_DELAYS[i]) {
        await sleep(RETRY_DELAYS[i]);
      }

      try {
        const response = await fetch(resultUrl, {
          headers,
          signal: AbortSignal.timeout(22000)
        });

        let data = null;

        try {
          data = await response.json();
        } catch {}

        if (response.ok && data?.ok === true) {
          console.log(
            `[RESULT SAVED] ${date} ${venueName} ${raceNo}R`
          );
          return new Response(null, { status: 204 });
        }

        if (
          response.status === 409 ||
          /未確定|未取得|not.*available/i.test(
            String(data?.error || "")
          )
        ) {
          console.log(
            `[RESULT NOT READY] ${date} ${venueName} ${raceNo}R`
          );
          return new Response(null, { status: 204 });
        }

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

    console.error(
      `[RESULT FAILED] ${date} ${venueName} ${raceNo}R`
    );

    return new Response(null, { status: 204 });

  } catch (error) {
    console.error(
      "[keirin-result-worker-background] fatal",
      error instanceof Error
        ? error.message
        : String(error)
    );

    return new Response(null, { status: 204 });
  }
};

export const config = {
  background: true
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
