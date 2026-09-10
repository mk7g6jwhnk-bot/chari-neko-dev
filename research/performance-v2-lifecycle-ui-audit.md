# PURCHASE_PERFORMANCE_V2 / lifecycle UI監査

完了日: 2026-09-11。productionは修正・push・deploy済み。集計と表示のみ修正。

## 実態と0件表示

9/10 17:29 JSTの旧APIでは全4期間0件だった。修正後17:40 JSTは保存V2 282R、結果確定141R、explicit canPurchase=true 223R / false 59R、保存planあり282R、確定払戻valid 141R。集計対象141R、購入対象111R。したがって全期間0件はバグ。

| 時点 | 今日 対象/購入 | 7日 | 30日 | 累積 |
|---|---:|---:|---:|---:|
| 9/10 17:40 JST | 27 / 18 | 141 / 111 | 141 / 111 | 141 / 111 |
| 9/11 07:41:46 JST | 0 / 0 | 161 / 130 | 161 / 130 | 161 / 130 |

9/11時点: 保存V2 365R、result-complete（confirmedかつ着順あり）161R、explicit true 285R / false 80R、unknown 0R、canonical/保存standard planあり365R、確定払戻valid 161R。集計161R、購入130R。残り204Rは未確定・中止等の非confirmed結果で除外。今日0件だけは発走前で正しい。各段階の件数は独立集計で、購入対象130Rはすべての適格条件の積集合。対象161Rには購入不可31Rを含むが、その投資・購入分母は0。

plan presenceは canonicalPurchasePlan.standardTickets または保存済み standardPurchasePlan の配列の有無。空配列の購入不可記録もpresenceには含む。legacyを推測でV2化・購入可化しない。

## 根本原因と修正

1. Railway purchase-performanceが sealed.researchPrediction.prediction を無条件優先。実保存では外側にV2 schema・purchaseEligibility・canonicalPurchasePlanがあり、内側にはモデル予想だけがあるためschemaが消え全件除外された。外側のversioned envelopeを優先、旧wrapperはfallback。保存済みexplicit canPurchaseを使用し、払戻・結果・temporal/verification有効性も確認。読み取り集計にcohortAuditを追加。
2. Railway compact statusとNetlify snapshot変換でrace lifecycleが落ち、browserの古いmeeting cacheが結果未確認のまま残った。保存lifecycleの最小項目を通し、表示はcanonical結果状態・発走日時を優先。
3. UIは締切を過ぎるだけで結果確認中にし、未終了をすべて「これから」に分類していた。締切と発走を分離し、発走前 / 発走後・結果待ち / 終了の3区分へ。締切のみ判明して発走不明なら状態未確認。
4. discover失敗時のfallback到達を遅らせるactive-races待ちを18秒から5秒へ短縮。background更新のrejectを捕捉。保存時刻のUTCはJST表示へ変換し、締切がない場合は発走時刻と明示。

武雄1R/2Rは9/10監査当時すでに保存VERIFIEDで、08:30/08:50発走。古いbrowser表示だけが08:27/08:47締切から結果待ちと推測していた。修正後は終了側。9/11同名レースは発走前のため未発走。

読み取り経路: Volume merged records → Railway streaming aggregation / lifecycle status → compact snapshot → Netlify Function → browser last-known + current status → UI。購入・予想の再計算は行わない。

## E2E・回帰

- Production PC（1280×720）と390×844で4期間表示をAPI件数と照合。9/10の非ゼロ・9/11の今日ゼロ/累積非ゼロを確認。
- Production: 発走前（武雄1R/2R等）未発走、確定/中止は終了側。9/10の古いcacheの結果待ち31Rは再取得後すべて終了に更新。最終保存83Rはconfirmed47R / cancelled36R、未確定0R。
- 現在のlive未確定raceがないため、その状態のproduction実データE2Eは非該当。実deployと同じrenderFlatRaceList / raceLifecycleViewで固定時刻fixtureを用意し、PC・390×844で未発走/結果確認中/終了の3区分をブラウザ確認。live実データ確認とは区別する。
- JavaScript error: production 0、fixture 0。mobile実寸390×844、横overflowなし。
- fixture再現: repo rootで node tests/race-lifecycle-browser-fixture.mjs、http://127.0.0.1:8766/ を開く（syntheticのみ）。
- PASS: purchase-performance-v2-envelope、purchase-performance、purchase-metadata-persistence、meeting-status-snapshot、500/1000R各20回streaming memory、race-lifecycle-view、keirin-discover-last-known、keirin-collector-status-v254、collector-status-view-v253、app-version-consistency、package check相当の全syntax checks。
- 既存失敗: auto-race-lifecycleのschemaなしnested fixture、sealed-result-readのsummaryキー固定assert。どちらも変更前HEADで同一失敗を再現し、今回のregressionではない。全テストgreenとは報告しない。

## Deploy / safety

- UI commit: 1c2af456978ec30a688ad1c7aaed3ec8c45c98e7
- Netlify production deploy: 6aa26cbeed9fbc00073d5487（branch deployを明示Publish）。v256 / KEIRIN-0.5.23-performance-lifecycle-displayをproduction APIと画面で確認。
- Railway deployが必要: YES。集計とcompact snapshotの変更。
- Backend commit: 3fda678
- Railway active deploy: 22f5e98b-f444-4bb3-9e1d-bcf6fe068c1d
- prediction logic / ranking changed: NO
- purchase logic / eligibility changed: NO（保存判定の読み取り修正のみ）
- Research baseline / weights changed: NO
- historical raw / seal / result / audit history mutation: 0
- 403〜502 tuning use: NO（運用集計のみ、tuningなし）
- 比較可能な保存予想hash83R: 83R一致。監査用のVolume書込み・backfill・修復操作なし。通常collectorの新規収集は稼働継続。
- SSH鍵・secret/tokenの操作なし。

数値根拠は performance-v2-lifecycle-ui-audit.json。一時取得ファイルは集計根拠を最小化してこのJSONへ保存後、削除。
