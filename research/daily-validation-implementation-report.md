# 日次検証パイプライン実装報告

実装日: 2026-09-19 JST
Verdict: **DAILY_VALIDATION_PIPELINE_READY_WITH_LIMITS**

## 実装

- JST日次checkpointとrace key単位の冪等処理
- 結果確定済み・未処理raceだけをappend順で抽出
- 成功時だけcheckpointをatomic更新。失敗時は未処理のまま維持
- 同日再実行、race重複、多重processを抑止
- MAIN/COVER/THICK、low-ticket、warning、confidence、concentration集計
- prediction distance、trio、評価印◎○▲△☆を保存済みpre-result情報だけで評価
- integrity mismatch、temporal violation、category/ticket/rate急変を監視
- 300R/500R/1000R到達時はmilestone文字列だけを記録
- 日次処理からproduction write、tuning、deployを呼ぶ経路なし

出力は`research/daily-validation/YYYY-MM-DD/`へ、report、summary、race CSV、distance、trio、rider marks、integrity、execution logを保存する。

## checkpoint / dry run

初期checkpointは既存の`recommendation-thick-150r-cohort.json`と150R評価を自動検出して登録した。既存150Rは再処理対象にしていない。

safe dry runでは、その後collectorへ追加された未検証22Rだけを抽出した。

- status: DAILY_VALIDATION_OK
- new races: 22
- purchaseable: 13
- integrity issues: 0
- prediction / purchase / sealed result mismatch: 0 / 0 / 0
- P3 / P2: 12 / 9
- purchase-derived trio hit: 4R
- rider marks: winner Top1 / Top2 / Top3 / Top5 = 6 / 12 / 19 / 21R
- checkpoint advance: なし（dry run）

## Scheduler

Windows Task Schedulerへ`ChariNeko Daily Validation`を登録した。

- schedule: 毎日06:30 JST
- StartWhenAvailable: true
- MultipleInstances: IgnoreNew
- execution limit: 2時間
- next run: 2026-09-20 06:30 JST

既存`ChariNeko-ActionTag-Continuous`とは別task・別lock・別出力directoryを使用する。collectorが同時にraceを追加しても、日次run開始時に読み込んだ確定済み一覧だけを処理し、次回分を失わない。

## 制限

- 累積basicは150R評価から開始する。prediction distanceとtrioのhistorical baselineは既存100R reportを参照し、評価印の累積は本pipeline開始後から記録する。
- PCが停止している間のrunはTask SchedulerのStartWhenAvailableで次回起動時に1回実行される。PC自体を起動する設定ではない。
- 精度低下やmilestone到達による自動調整は行わない。
