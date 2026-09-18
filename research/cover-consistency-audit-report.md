# 100R COVER整合性監査

実行日: 2026-09-18 JST  
Verdict: **EVALUATION_CLASSIFICATION_FIXED**

## 判定

分類は **A: commit 21249dc側のCOVER集計バグ**。`recommendation-thick-100r-fetch.mjs`が監査済み最終ticket集合からMAINだけを`mainTickets`へ残し、共通評価側も残ったticketをすべて`class: MAIN`としていた。そのためMAIN 284点・5的中は正しかったが、COVER 220点・2的中が評価sourceから脱落し、reportでCOVER 0点と誤記された。

commit 8beb84b側は内部候補ではなく、保存済み`predictionPayload.prediction.canonicalPurchasePlan.standardTickets[].betClass`を読んでいた。COVER 2件はいずれもfinal purchase planに存在するactual purchased ticketである。

## cohort / snapshot

- race keys: 完全一致（100R、順序一致）
- excluded: 0 / 0
- protected final: 0
- duplicate: 0
- result available: 100
- prediction seal mismatch: 0
- purchase plan payload mismatch: 0
- prediction hash mismatch: 0
- purchase evaluation hash mismatch: 0
- sealed result mismatch: 0

両sourceのrace単位prediction hashと、最終ticket集合から作ったpurchase plan hashを比較し、100Rすべて一致した。異なるpurchase snapshot参照ではない。

## 訂正値

| classification | tickets | hits | investment | return | ROI |
|---|---:|---:|---:|---:|---:|
| MAIN | 284 | 5 | 28,400円 | 8,300円 | 29.23% |
| COVER | 220 | 2 | 22,000円 | 3,680円 | 16.73% |
| actual purchase合計 | 504 | 7 | 50,400円 | 11,980円 | 23.77% |
| THICK（MAIN内） | 61 | 1 | 6,100円 | 160円 | 2.62% |

recommendation候補group、1～3点分類、THICK比較は従来のMAIN scopeを維持した。actual purchased categoryを別フィールドとして追加し、内部candidate categoryと混同しないようにした。

## COVER的中2R

| race key | 結果 / 的中ticket | terminal | final classification | THICK | actual purchased | prediction seal hash |
|---|---|---|---|---|---|---|
| 20260917-84-1 | 5-4-1 | generated・ADOPTED・global rank 31 | COVER | NO | YES | `62b4fd29…9b86` |
| 20260917-63-2 | 1-7-4 | generated・ADOPTED・global rank 20 | COVER | NO | YES | `74db9197…ee9` |

保存箇所はいずれも`research/prediction-distance-100r-source.json`の`rows[].purchase.tickets[].class`。purchase evaluation payload hashはそれぞれ`13af90f6…7506`、`887e023a…52d9`である。

## MAIN的中spot check

| race key | ticket | THICK | classification |
|---|---|---|---|
| 20260912-53-12 | 9-1-7 | NO | MAIN |
| 20260917-84-6 | 5-1-4 | NO | MAIN |
| 20260917-73-6 | 2-4-7 | YES | MAIN |
| 20260917-13-6 | 4-7-2 | NO | MAIN |
| 20260917-83-1 | 1-2-4 | NO | MAIN |

5Rはcommit 21249dcのMAIN的中一覧と完全一致した。

## 修正

- 100R fetch sourceに最終MAIN/COVER ticket全件とrace単位seal hashを保存
- 100R evaluationにCOVERとactual purchase合計を独立追加
- MAIN scopeのrecommendation/THICK定義は維持
- actual purchased categoryとinternal candidate categoryを別フィールドとして検証する回帰testを追加

production prediction/purchase変更なし、historical mutation 0、tuningなし。
