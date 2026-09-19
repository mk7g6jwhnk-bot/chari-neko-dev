# Validation Status live sync 実装報告

## 判定

`VALIDATION_STATUS_LIVE_SYNC_READY_WITH_LIMITS`

ローカルの日次検証成功後に公開用compact artifactを生成し、認証付きでRailwayへ保存する経路と、Netlify UIがruntime取得する経路を実装した。productionへの反映と定期実行環境への接続先・secret設定は別途必要である。

## 構成

1. 日次検証がreportとcheckpointを正常保存する。
2. `VALIDATION_STATUS_PUBLIC_V1`のwhitelistだけで`daily-validation/public/latest.json`を原子的に生成する。
3. `PUT /keirin/internal/validation-status`へ認証付きで送信する。同一`statusVersion`は冪等、古いstatusは拒否する。
4. Railwayは`/data/validation-status/latest.json`へ原子的に保存し、`GET /keirin/validation-status`で要約だけを返す。
5. Netlify FunctionがRailwayのread-only endpointをproxyし、UIがruntime fetchする。取得失敗時はブラウザに保存した直前値を「最終取得値」として表示する。

毎朝のNetlify deployは不要である。書き込みsecretはfrontendおよび公開artifactに含めない。

## 公開範囲

公開するのは日時、累積/追加R数、日次/integrity状態、checkpoint、milestone、scheduler要約、日次指標要約、構造別要約だけである。race-level data、prediction/purchase内部score、rider DB、action-tag/manual review、seal、hash、filesystem path、環境変数、秘密値は含めない。Railway側もtop-level whitelist、schema、サイズ、禁止語を検証する。

## エラー処理

- validation失敗時はcheckpointも公開statusも更新しない。
- push失敗は`SYNC_WARNING`と`sync-warning.json`へ記録し、日次検証の成功結果とcheckpointを保持する。
- 403、422、5xx/timeoutを区別し、5xx/timeoutだけを再試行する。
- UIはfresh（24時間以内）、warning（24〜48時間）、stale（48時間超）、未知schema、取得不能を区別する。

## 検証

- 174R / 今回24R / 次200R / 調整判断300Rのsample artifactでcompact生成を確認。
- 一時Railway相当serverへの認証PUT、同一version再送、GET read-back、未認証403、不正schema 422を確認。
- 公開artifactに禁止フィールドがないことを確認。
- push失敗後もcheckpointが進み、公開artifactとwarning記録が残ることを確認。
- frontend full suite、日次検証、live sync、schema/freshness/cache、backend store testをPASS。

## 制限

実運用には日次実行ユーザーへ`KEIRIN_BROWSER_SERVICE_URL`と書き込みsecretを安全に設定し、Railway/Netlifyへ各変更を一度ずつdeployする必要がある。未deploy状態ではUIは従来配信のままで、自動同期は開始しない。

production prediction、production purchase、recommendation、THICK、構造score接続は変更していない。historical mutationは0件。
