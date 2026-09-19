# Validation Status live sync 実装報告

## 判定

`VALIDATION_STATUS_LIVE_SYNC_READY`

ローカルの日次検証成功後に公開用compact artifactを生成し、認証付きでRailwayへ保存する経路と、Netlify UIがruntime取得する経路を実装した。RailwayとNetlifyへ反映し、定期実行ユーザーの接続先とsecretも設定した。

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

## Production確認

- Railway commit: `820a051`
- Railway deploy ID: `af1952f6-65f5-47d2-b9c6-eb323983c9ec`
- Netlify production commit: `02156f3`
- Netlify deploy ID: `6aae5a626e558c0008e2fd90`
- Netlify production deploy count: 1
- read-back: 174R / 今回24R / 次200R / 調整判断300R / status OK / integrity OK
- 390px viewport: 横overflowなし、live表示正常、JavaScript error 0
- Windows task: 06:30 JST、StartWhenAvailable有効、IgnoreNew、接続先/secret設定済み

## 制限

初回の06:30実運転は次回trigger時に行われる。今回のsafe E2Eでは同じproduction endpointへ最新artifactを手動同期し、Railway read-backとNetlify UI表示まで確認した。

production prediction、production purchase、recommendation、THICK、構造score接続は変更していない。historical mutationは0件。
