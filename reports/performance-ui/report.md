# 成績ページ・旧操作UI整理

日付: 2026-09-12 JST
Verdict: **PERFORMANCE_UI_READY_WITH_LIMITS**
Frontend base: `828af84` / branch: `codex/performance-page-ui`

## 1. 新成績ページ構成

- ホーム「成績を見る」、競輪一覧「成績・収集状況」から遷移。
- 今日 / 7日 / 30日 / 累積を切替。対象R、購入対象R、的中R、的中率、100円平買い投資、購入払戻、ROIをカード表示。
- MAIN / COVER・押さえ / THICK・厚めは開閉式。ticket数、的中R、的中率、投資、払戻、ROIを表示。的中率の分母は既存canonicalの購入対象R。THICKは重複属性であり、排他的合計にはしない。
- 購入的中履歴は選択期間内の日付を1日ずつ表示。購入点数は保存済みMAIN/COVER内訳、THICKは保存済み有無、購入払戻、race ROI、保存済みレース詳細への導線を表示。
- 日付ごとの結果ライフサイクルを開閉式で表示。RESULT_CONFIRMED / RESULT_PENDING / RESULT_RETRYING / RESULT_FETCH_FAILEDを区別。未提供はUNKNOWN。
- 下部にproductionの収集・研究状況、さらに開閉式の稼働・保存状態。

## 2. 移動した情報

競輪一覧の `predictionPerformance` と `collectorProgress`、ホームの研究・システム状態を成績ページへ移した。旧ホームの予想KPI、最近の結果、注目分類を除去し、発走前の直近レース、開催会場、保存予想、成績と履歴への導線を中心にした。暫定おすすめパネルは除去し、推薦順位や購入分類は新設していない。

収集欄は既存 `keirin-collector-status` のproduction payloadだけを利用。今日の予想取得R、prefetch、pre-race seal、seal失敗、failures、compared、result pending、retrying、cumulative comparable、50R/100R audit、cohort、report stateを表示する。別作業のResearch action-tagは接続も変更もしていない。

## 3. 削除した旧UIと同等機能監査

削除: 一括更新、次の6Rを一次選別、上位3Rを深掘り、5R直接深掘り、一次選別タブとその表示領域。独立した「一括取得」ボタンは対象版のHTMLに存在しない。

削除前にbrowser-serviceの次の呼出経路を確認した。

| 旧機能 | production collectorで確認した経路 |
|---|---|
| 会場/レース・公式入力取得 | `auto-race-lifecycle-collector.mjs` の `runPredictions` が開催を探索し、発走前・seal未保存を締切順に処理。既定12R/batch、継続実行あり |
| 一次選別相当のprefetch | `server.mjs` の `prefetchAutoRaces` が会場単位preview batchを取得し、欠落Rは個別公式取得で補完。保存metadataとfreshnessを記録 |
| 完全な深掘り予想 | 旧 `deepDiveRace → fetchAndSavePredictionForRace` とautoの `requestAutomaticPrediction` はproductionの完全予想endpointを利用。autoは同じbudget=3000、全対象Rを順次処理 |
| 保存・結果比較 | preSeal、正式予想、参加選手、公式基本情報/ライン、診断、hash、時点監査をseal保存。`runResults` が結果取得、verify、再試行状態を管理 |

したがって旧3〜6Rの比較順位を経由せず、対象Rの完全予想・保存まで取得する経路が存在する。今回collector、prediction endpoint、購入選択の処理は変更していない。

## 4. 残した機能と理由

- **開催情報を再取得**: 明示要求どおり残置。
- **チャット比較**: 外部チャットの取込みと工程差分比較をauto collectorは代替しない。機能を消さず詳細画面の「チャット比較（手動検証）」へ折り畳み。保存済み比較データにも触れていない。
- 単一レース予想/再試行、公式結果確認、個別オッズ更新、勝負レースの手動登録、予想履歴、保存予想: auto取得失敗時や個別確認の導線として維持。
- 既存 `collectFinishedResultOnlyResearch` 等のResearch処理は変更せず維持。会場一覧表示による既存hookと、成績ページのread-only取得は別々に検証した。

## 5. Canonical KPI一致とデータ読取り

成績ページは `collector-status.purchasePerformance.periods.today/recent7/recent30/cumulative` とその `categories.main/cover/thick` を直接描画する。UIに購入判定、ticket選択、金額合計、ROI計算、独自group集計を追加していない。数字の桁区切り・百分率表示だけを整形する。

的中履歴は既存read summaryの `canonicalEligibility.isPurchaseTarget === true`、`purchaseEligibility === PURCHASE_ALLOWED`、`standardHit === true`、`resultAttached === true` の明示値を使用する。reference hitや旧保存評価へfallbackしない。

既存Priority 1 backendの **変更していない実関数** `buildPurchasePerformanceReport` / streaming版 / `buildPredictionSummaryList` / sealed readからテストfixtureを生成した。使用ソースのSHA-256は `tests/fixtures/performance-canonical.json` と `e2e.json` に記録。fixtureには購入不可的中、referenceだけの的中、legacy不明、MAIN/COVER/THICK、4期間境界、結果の4状態を含む。次表はproduction実数ではなく、この本番と同じschema・aggregationで生成した検証用データの値。

| 期間 | 対象R | 購入R | 的中R | 投資 | 購入払戻 | ROI |
|---|---:|---:|---:|---:|---:|---:|
| 今日 | 4 | 3 | 2 | 900円 | 90,740円 | 10082.2% |
| 7日 | 6 | 5 | 3 | 1,500円 | 91,990円 | 6132.7% |
| 30日 | 7 | 6 | 4 | 1,800円 | 93,240円 | 5180.0% |
| 累積 | 8 | 7 | 5 | 2,100円 | 94,490円 | 4499.5% |

4期間×主要7項目、4期間×3区分×6項目のブラウザ表示がAPI値と一致。トップの重複KPIは撤去済みで、成績の数値はこの一つのsourceに集約した。

集計snapshotを端末に保持し、取得失敗、server stale、10分経過、日付変更を明示する。履歴は日付単位のmemory/localStorage cacheと5分の再利用期限を持ち、期間切替で大量再取得しない。部分失敗・503でも同日のlast-knownを維持。履歴取得対象日は画面に明記し、累積カードと1日分履歴のscopeを混同させない。

## 6. Mobile / Desktop

390×844、1440×1000で期間切替、区分の開閉、日付選択、履歴→詳細→戻る、stale fallbackを確認。320px・保存データなし・通信失敗も確認。横overflowはすべて0。実機iPhone/Safariは未検証で、Chromiumでのviewport検証。

証跡: `390-performance.png`, `390-categories.png`, `390-stale.png`, `1440-performance.png`, `1440-categories.png`, `1440-stale.png`。ライフサイクル欄は状態確認のため展開して撮影。

## 7. Tests

- frontend package full suite: **PASS / 0 FAIL**。新しい `tests/performance-page.mjs` をfull suiteへ追加。
- package `check`: **PASS**。
- Priority 1 UI、race lifecycle、collector status view/proxy、null/zero表示、sealed result、sealed prediction reuse、performance page: **8/8 PASS**。
- Backend Priority 1 canonical eligibility、purchase performance、V2 envelope、performance audit、auto race lifecycle: **5/5 PASS**。
- fixture生成時のarray/streaming aggregation一致: **PASS**。
- 既存null表示テストは旧レンダラの文字列検査から、新成績レンダラの0円/未知値表示の確認へ更新。

ログ: `full-suite.log`, `syntax-check.log`, `regression.log`, `backend-regression.log`。

## 8. E2E

**PASS（production-equivalent fixture、未deploy）**。

- canonical主要KPI・MAIN/COVER/THICK一致。
- 購入不可混入0、reference hit混入0、ended raceの発走前混入0。
- JS errors 0、検証した導線のbroken navigation 0。
- 成績表示/期間切替/日付履歴/的中詳細の通信は保存済みread APIのGETのみ。prediction、odds、公式resultの再取得なし。
- 故意に503/partialを返してlast-knownとstaleを確認。空cacheでは「0件」と断定せず取得不能を表示。
- E2Eで見つかった既存のlocal race key (`:`) とcanonical read key (`-`) の不一致をread境界で修正。保存済み結果状態を詳細へ渡し、終了レースを再び発走前にしない。
- UI releaseと既存snapshot互換versionを分離。hashが一致した結果確定済み履歴だけは保存された版でread-only表示可能にした。発走前の互換判定は従来値を維持。

詳細なrequest履歴と結果は `e2e.json`。本番サービス・Volumeへの接続、deploy、historical writeは今回実施していない。本番実数のdeploy後照合は未実施であり、fixtureのPASSと区別する。

再現:

```text
node tests/build-performance-fixture.mjs <Priority-1-browser-service-directory>
node tests/performance-page.mjs
node tests/performance-page-e2e.mjs <playwright-package-directory> <chrome-executable>
```

## 9. Remaining UI debt / limits

1. 日別推移・レースクラス別は現APIにcanonical集計がないため未提供。保存metadataからUIで独自集計・UNKNOWN分類しない。
2. 既存history summaryはTHICK点数と購入合計点数を返さない。MAIN/COVERの保存点数内訳とTHICK有無で表示し、合計や厚め点数を推測しない。
3. 累積的中履歴は日付移動で閲覧可能だが、全期間の一括一覧や「次の的中日」検索は未実装。重い全期間取得を避ける。
4. HIGH_PAYOUT独立区分、2車単、3連複は未提供。
5. 削除した手動UIの未使用内部関数は既存の予想/Researchコードとの境界を保つため残っている。UI導線・bindingは除去済み。
6. 会場一覧の既存result-only Research hook、発走前保存予想の既存version互換方針は別監査対象。今回はResearchや予想挙動を変えない。
7. 本番deploy後の実数確認、実機Safari確認は残る。

## 10. Verdict / safety

**PERFORMANCE_UI_READY_WITH_LIMITS**。必須の成績ページ、4期間KPI、区分別成績、canonical的中履歴、収集状態移動、旧UI整理、fallback、回帰/E2Eを実装・検証済み。上記のAPI制限は画面と本レポートに明記。

- 成績ページ追加: YES
- today/7d/30d/cumulative: PASS
- MAIN/COVER/THICK: PASS（既存canonical値）
- hit history: PASS（1日単位、THICK有無）
- collection/research status移動: YES（productionのみ）
- full suite: PASS / 0 FAIL
- E2E: PASS（production-equivalent）
- JS errors: 0
- prediction changed: NO
- purchase changed: NO
- Research changed: NO
- historical mutation count: 0
- commit対象は専用worktreeのUI・テスト・検証資料のみ。
