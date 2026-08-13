const DISPATCH_TIMEOUT_MS = 5_000;
const DISPATCH_CONCURRENCY = 20;

export default async () => {
  try {
    const siteUrl = String(
      process.env.URL ||
      process.env.DEPLOY_PRIME_URL ||
      ""
    ).replace(/\/$/, "");

    if (!siteUrl) {
      throw new Error("NetlifyサイトURLが取得できません");
    }

    const now = new Date();
    const jst = new Date(
      now.toLocaleString("en-US", {
        timeZone: "Asia/Tokyo"
      })
    );

    const date =
      `${jst.getFullYear()}` +
      `${String(jst.getMonth() + 1).padStart(2, "0")}` +
      `${String(jst.getDate()).padStart(2, "0")}`;

    const coordinatorUrl =
      `${siteUrl}/.netlify/functions/` +
      `keirin-result-coordinator-background`;

    const headers = {
      "content-type": "application/json",
      accept: "application/json"
    };

    const secret = String(
      process.env.RESULT_STORE_SECRET || ""
    ).trim();

    if (secret) {
      headers["x-result-store-secret"] = secret;
    }

    const response = await fetch(coordinatorUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ date }),
      signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS)
    });

    if (!response.ok) {
      console.error(
        `[COORDINATOR DISPATCH FAILED] HTTP ${response.status}`
      );
    } else {
      console.log(
        `[COORDINATOR DISPATCHED] ${date} HTTP ${response.status}`
      );
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error(
      "[keirin-result-scheduler] fatal",
      error instanceof Error ? error.message : String(error)
    );
    return new Response(null, { status: 204 });
  }
};

