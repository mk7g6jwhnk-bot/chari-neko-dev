# Priority 1 production 購入KPI・結果ライフサイクル監査

監査日: 2026-09-12 JST
判定: **PASS（修正範囲の回帰確認済み、deploy前）**

## 1. Root cause

- Railway の期間集計は保存recordから都度再計算していたが、prediction history / sealed-result read は古い `purchaseEvaluation` をそのまま返していた。production Volumeの200確定R中111Rで、保存済み評価と現在のcanonical再計算値が不一致だった。
- frontend client は `verification.standardPurchaseHit` を購入的中へfallbackしていた。この値はreference terminalの検証結果を含み得るため、購入成績と参考予想成績の境界が壊れていた。
- 購入適格性・canonical plan・結果・払戻・integrityの判定が複数箇所に分散していた。
- 手動結果取得も `requestType=result_collector` を送り、手動要求をcollector用queue/cache優先度で処理していた。
- lifecycleは未確定と取得失敗を同じ待機状態として扱い、frontendも締切後を一律「結果待ち」にしていた。
- 本日の一覧は従来 `終了` だけを除外しており、`RESULT_PENDING / RESULT_RETRYING / RESULT_FETCH_FAILED` を「これからのレース」と分離できなかった。

## 2. Canonical cohort

共通selector `getCanonicalPurchaseEvaluationEligibility(record)` をsource of truthとした。購入対象は、明示的な購入可、`canonicalPurchasePlan.standardTickets` の保存、MAIN/COVER ticketの存在、確定結果、有効払戻、temporal/integrity正常をすべて満たすrecordだけである。legacy不明値は `LEGACY_UNKNOWN` として除外し、結果一致から購入可を逆算しない。

購入的中・投資・払戻・ROI・MAIN/COVER/THICKは、selectorが返した同じcanonical ticket setだけから計算する。reference terminal一致は `referencePredictionHit` に分離した。HIGH_PAYOUTは現行保存schemaで独立canonical購入区分が保証されないため、推測集計せず未提供のままとした。

## 3. Production Volume read-only再集計

Volumeはstreaming read-only走査のみ。original record、seal、result、audit historyへの書込みは0件。

| KPI | 保存済み旧評価（before） | canonical再計算（after） |
|---|---:|---:|
| 対象 | 200R | 200R |
| 購入対象 | 49R | 160R |
| 購入的中 | 3R | 21R |
| 的中率 | 6.1% | 13.1% |
| ticket | 262 | 888 |
| 投資 | 26,200円 | 88,800円 |
| 払戻 | 91,020円 | 173,290円 |
| ROI | 347.4% | 195.1% |

beforeはproduction historyが直接利用していた保存済み旧評価の合計、afterは同じ200Rを現在のV2 canonical snapshotから再計算した値。today / 7d / 30d / cumulativeはすべて同じselectorとcategory集計関数を共有する。

購入不可40Rのうち、保存済み購入評価が hit / investment / return > 0 だった件数は **0件**。修正後も **0件**。一方、保存済み旧評価とcanonical再計算の不一致は **111件**。したがって確認された画面矛盾の原因はoriginal recordの購入不可汚染ではなく、read API / client fallbackとstale derived evaluationの混在である。

## 4. MAIN / COVER / THICK

| 区分 | before: race / hit / ticket / 投資 / 払戻 / ROI | after: race / hit / ticket / 投資 / 払戻 / ROI |
|---|---|---|
| MAIN | 49 / 3 / 149 / 14,900円 / 1,530円 / 10.3% | 160 / 18 / 463 / 46,300円 / 80,550円 / 174.0% |
| COVER | 12 / 1 / 113 / 11,300円 / 89,490円 / 792.0% | 38 / 3 / 425 / 42,500円 / 92,740円 / 218.2% |
| THICK | 28 / 0 / 34 / 3,400円 / 0円 / 0.0% | 90 / 6 / 98 / 9,800円 / 13,850円 / 141.3% |

THICKはMAINとの重複flagであり排他的区分にしていない。富山2R相当の89,490円は旧評価上COVER側に存在したが、購入不可recordの払戻ではなかった。UIでは公式配当を「公式3連単配当」と明記し、購入払戻と分離する。

## 5. 修正内容

- Railway: canonical selectorを新設し、performance、history summary、race detail、collector statusを同じ再計算経路へ統一。
- 不適格record: `standardHit=false`, ticket/investment/return=0, ROI=null、ticket listも空。
- reference hit: `referencePredictionHit` としてのみ返却。
- lifecycle: `RESULT_PENDING`, `RESULT_RETRYING`, `RESULT_CONFIRMED`, `RESULT_FETCH_FAILED` を分離。初回pendingと再試行を区別し、非retryable errorをfailedにする。
- manual fetch: canonical result endpointは維持し、request typeだけ `manual_result` に修正。
- frontend: canonical reason codeを日本語表示。購入不可では緑の的中、購入投資、購入払戻、ROIを表示しない。
- frontend: result pending/retrying/failedは「これからのレース」から除外し、「終了・結果確認対象」へ移す。confirmedは通常一覧から除外され、履歴から参照可能。

## 6. Production status確認

2026-09-12のread-only確認時点で `ok=true`, `collectorOperational=true`, `browserConnected=true`, `storageWritable=true`, `lastError=null`。seal 71R、result loaded 8R、verified 8R。現deployは新しい `resultLifecycleState` fieldをまだ返さないため、状態別件数のproduction確認はdeploy後E2Eが必要。

## 7. Tests

PASS:

- canonical eligibility invariants A-F
- ineligible reference-hit / legacy unknown / missing plan regression
- KPI aggregation・streaming parity・numerator subset
- MAIN/COVER/THICK consistency
- lifecycle A-S（pending→retrying、confirmed、取消、購入停止を含む19/19）
- sealed-result / prediction-history summary
- manual fetch・ended list・UI source regression
- prediction save/reload/result matching
- syntax checks

既存frontend全体suiteには今回と無関係な既知failが残る（branch prior、adaptive main cluster export、buyable high odds、tier label、girls branch）。今回変更したprediction/purchase engine fileは0件で、対象回帰はすべてPASSした。

## 8. Safety / remaining risk

- production prediction logic変更: NO
- production purchase selection logic変更: NO
- Research baseline変更: NO
- prediction / purchase hash生成変更: NO
- historical mutation: 0
- production write: 0
- 結果を使った再予想: NO
- remaining risk: deploy後に新lifecycle field、manual result fetch、実ブラウザ表示をproduction E2Eで再確認する必要がある。
