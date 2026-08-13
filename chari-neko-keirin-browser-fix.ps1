$ErrorActionPreference = "Stop"

# チャリ猫のローカルGitリポジトリを自動検出
$repo = Get-Location
while ($repo -and -not (Test-Path (Join-Path $repo ".git"))) {
    $repo = $repo.Parent
}
if (-not $repo) {
    throw "Gitリポジトリのフォルダで実行してください。"
}

$file = Join-Path $repo "netlify\functions\keirin-predict.mjs"
if (-not (Test-Path $file)) {
    throw "netlify\functions\keirin-predict.mjs が見つかりません。"
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = "$file.before-browser-fix-$stamp.bak"
Copy-Item $file $backup -Force

$text = Get-Content $file -Raw -Encoding UTF8

$start = $text.IndexOf("async function requestBrowserService(base, params) {")
if ($start -lt 0) {
    throw "requestBrowserService の開始位置が見つかりません。"
}

$endMarker = "`nfunction sleep(ms)"
$end = $text.IndexOf($endMarker, $start)
if ($end -lt 0) {
    throw "requestBrowserService の終了位置が見つかりません。"
}

$newFunction = @'
async function requestBrowserService(base, params) {
  const query = new URLSearchParams({
    date: params.date,
    venueCode: params.venueCode,
    venueName: params.venueName,
    raceNo: String(params.raceNo)
  });

  // 現行版でpreviewだけに依存すると、ブラウザサービス側の実装差で
  // 予想取得が502/timeoutになって画面まで戻れない。
  // 既存サービスで実績のある候補を順番に試す。
  const candidates = [
    `${base}/keirin/race?${query}`,
    `${base}/keirin/preview?${query}`,
    `${base}/keirin?${query}`,
    `${base}/api/keirin?${query}`,
    `${base}/race?${query}`,
    `${base}/fetch?${query}`
  ];

  const attempts = [];
  const startedAt = Date.now();
  const totalBudgetMs = 24000;

  for (const endpoint of candidates) {
    const elapsed = Date.now() - startedAt;
    const remaining = totalBudgetMs - elapsed;
    if (remaining < 3000) break;

    const timeoutMs = Math.min(6000, remaining - 800);

    try {
      const response = await fetch(endpoint, {
        headers: {
          accept: "application/json",
          "cache-control": "no-cache"
        },
        signal: AbortSignal.timeout(Math.max(2500, timeoutMs))
      });

      const text = await response.text();
      let data = null;
      try {
        data = JSON.parse(text);
      } catch {}

      const officialData = data?.officialData || {};
      const participantCount = Array.isArray(officialData.participants)
        ? officialData.participants.length
        : 0;
      const usable = Boolean(
        officialData.basic &&
        participantCount >= 5
      );

      attempts.push({
        endpoint: endpoint.replace(base, ""),
        status: response.status,
        parsed: data !== null,
        participantCount,
        usable,
        error: data?.error || null,
        elapsedMs: Date.now() - startedAt
      });

      if (response.ok && data?.ok !== false && usable) {
        return {
          ok: true,
          status: response.status,
          data: {
            ...data,
            endpointAudit: attempts
          }
        };
      }
    } catch (error) {
      attempts.push({
        endpoint: endpoint.replace(base, ""),
        error: error instanceof Error ? error.message : String(error),
        elapsedMs: Date.now() - startedAt
      });
    }
  }

  const timedOut = attempts.some((item) =>
    /timeout|timed out|abort/i.test(String(item.error || ""))
  );

  return {
    ok: false,
    status: 502,
    data: {
      ok: false,
      error: timedOut
        ? "公式データ取得が時間内に完了しませんでした。複数の競輪ブラウザ取得エンドポイントを試しましたが、出走表を取得できませんでした。"
        : "競輪ブラウザサービスから出走表を取得できませんでした。",
      endpointAudit: attempts
    }
  };
}
'@

$text = $text.Substring(0, $start) + $newFunction + $text.Substring($end)

# raceCardUrlをブラウザサービス側にも渡す
$text = $text.Replace(
'      raceNo
    });',
'      raceNo,
      raceCardUrl
    });',
1
)

# queryへraceCardUrlを追加
$text = $text.Replace(
'    raceNo: String(params.raceNo)
  });',
'    raceNo: String(params.raceNo),
    ...(params.raceCardUrl ? { raceCardUrl: params.raceCardUrl } : {})
  });',
1
)

Set-Content $file -Value $text -Encoding UTF8

# 構文チェック
node --check $file
if ($LASTEXITCODE -ne 0) {
    Copy-Item $backup $file -Force
    throw "Node構文チェック失敗。元ファイルへ自動復元しました。"
}

Write-Host ""
Write-Host "========================================"
Write-Host "競輪ブラウザ取得修正を適用しました"
Write-Host "========================================"
Write-Host "対象: $file"
Write-Host "バックアップ: $backup"
Write-Host ""
Write-Host "修正内容:"
Write-Host "  1. /keirin/race を最優先"
Write-Host "  2. /keirin/preview を次に試行"
Write-Host "  3. /keirin /api/keirin /race /fetch をフォールバック"
Write-Host "  4. 取得結果をofficialData + 5人以上で検証"
Write-Host "  5. raceCardUrlもブラウザサービスへ渡す"
Write-Host "  6. Node構文チェック済み"
Write-Host ""
Write-Host "GitHub Desktopで変更を確認してCommit → Pushしてください。"
