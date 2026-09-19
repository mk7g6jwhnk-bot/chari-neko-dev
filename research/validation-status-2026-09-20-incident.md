# Validation Status 2026-09-20 incident

## 判定

`VALIDATION_STATUS_STALE_REFRESH_FIXED`

分類は **H. stale/cache問題**。06:30の日次検証からNetlify Functionまでは正常だったが、Validation画面を開いたままのブラウザは再取得せず、前日のin-memory stateを表示し続けた。

## 監査結果

- Task Scheduler: 2026-09-20 06:30:30 JST実行、exit code 0
- checkpoint: 2026-09-20、187R、SUCCESS
- daily artifact/report: 37R、`DAILY_VALIDATION_OK`
- compact status: 187R / 37R、status/integrity OK
- push: `SYNC_OK`
- Railway read-back: local statusVersionと一致
- Netlify Function: Railwayと同一statusVersion、`RAILWAY_LIVE`
- 修正前の開きっぱなしUI: 174R / 24R

## 修正

Validation画面表示中に、次の契機でruntime fetchを再実行する。

- タブがvisibleへ復帰
- networkがonlineへ復帰
- 5分間隔（画面表示中かつvisible時のみ）

prediction、purchase、recommendation、THICK、Research評価定義には触れていない。historical mutationは0件。
