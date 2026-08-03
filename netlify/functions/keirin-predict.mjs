export default async req => {
  const u = new URL(req.url);
  const serviceBase = String(process.env.KEIRIN_BROWSER_SERVICE_URL || "")
    .replace(/\/+$/, "");

  if (!serviceBase) {
    return json(500, {
      ok: false,
      error: "KEIRIN_BROWSER_SERVICE_URLが設定されていません"
    });
  }

  const query = new URLSearchParams({
    date: u.searchParams.get("date") || "",
    venueCode: u.searchParams.get("venueCode") || "",
    venueName: u.searchParams.get("venueName") || "",
    raceNo: u.searchParams.get("raceNo") || ""
  });

  try {
    const response = await fetch(`${serviceBase}/keirin/race?${query}`, {
      headers: {
        accept: "application/json",
        "user-agent": "ChariNekoNetlifyProxy/0.3.0"
      }
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = {
        ok: false,
        error: "外部取得サービスの応答がJSONではありません",
        preview: text.slice(0, 300)
      };
    }

    return json(response.status, data);
  } catch (error) {
    return json(502, {
      ok: false,
      error:
        error instanceof Error
          ? `外部取得サービス接続失敗: ${error.message}`
          : "外部取得サービス接続失敗"
    });
  }
};

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
