# action-tag / recommendation / THICK 100R 再評価

実行日: 2026-09-18 JST  
定義: `RECOMMENDATION_THICK_EVAL_V1`（50R版から変更なし）  
Verdict: **USEFUL_SIGNAL_EMERGING**  
Tuning decision: **B_MORE_DATA_BEFORE_TUNING**

## cohortと完全性

action-tag forward-only append順の先頭100Rを固定した。収集100R、unique raceKey 100、formal evaluated 100、除外0、protected final 0、重複0、result confirmed 100/100である。全Rで保存予想とsealed resultを二重readbackし、prediction mismatch 0、purchase mismatch 0、sealed result mismatch 0を確認した。

結果は的中・払戻判定にだけ使用した。group membership、信頼度、展開集中度、warning、点数帯、THICK、cliffはすべて結果確定前の保存済みpredictionから取得した。odds不明は100Rを通じて`UNKNOWN`のまま扱った。

## 全体

| 指標 | 100R |
|---|---:|
| evaluated | 100 |
| 購入可 / 購入不可 | 78 / 22 |
| MAIN点数 / 的中 | 284 / 5 |
| MAIN投資 / 払戻 | 28,400円 / 8,300円 |
| MAIN ROI | 29.23% |
| COVER点数 / 的中 | 220 / 2 |
| COVER投資 / 払戻 / ROI | 22,000円 / 3,680円 / 16.73% |
| actual purchase合計 | 504点 / 7的中 / ROI 23.77% |
| 高配当的中（1万円以上） | 0 |

2026-09-18のCOVER整合性監査で、初版sourceが`r.tickets`からMAINだけを抽出していたことを確認した。recommendation group・点数帯・THICKの固定評価は従来どおりMAIN scopeを維持し、actual purchase分類を別集計として追加した。

## recommendation候補group

| group | 対象R | 的中R | 的中率 | 投資 | 払戻 | ROI | 非選択ROI |
|---|---:|---:|---:|---:|---:|---:|---:|
| HIGH confidence・購入可 | 12 | 1 | 8.33% | 9,200円 | 680円 | 7.39% | 39.69% |
| MEDIUM confidence・購入可 | 6 | 0 | 0% | 1,800円 | 0円 | 0% | 31.20% |
| HIGH concentration・購入可 | 52 | 3 | 5.77% | 18,200円 | 1,390円 | 7.64% | 67.75% |
| 低点数（1–3点）・購入可 | 56 | 3 | 5.36% | 11,200円 | 7,070円 | **63.13%** | **7.15%** |
| warningあり | 66 | 4 | 6.06% | 19,200円 | 7,620円 | 39.69% | 7.39% |

記述上のbest groupは50Rと同じ **LOW_TICKET_COUNT_PURCHASEABLE**。選択群は非選択群よりROIが高く、的中も1Rから3Rへ増えたため、recommendation selection appears usefulは **YES（emerging）** とする。ただしROIは100%未満で、的中3Rに依存する。閾値変更やproduction採用を支える強度には達していない。

## 信頼度・展開集中度・warning

| 軸 | 区分 | R | 的中率 | ROI |
|---|---|---:|---:|---:|
| 信頼度 | HIGH | 12 | 8.33% | 7.39% |
| 信頼度 | MEDIUM | 6 | 0% | 0% |
| 信頼度 | LOW | 60購入可（82総数） | 6.67% | 43.79% |
| 展開集中度 | HIGH | 52購入可（54総数） | 5.77% | 7.64% |
| 展開集中度 | MEDIUM | 10 | 20.00% | 246.79% |
| 展開集中度 | LOW | 16購入可（36総数） | 0% | 0% |
| warning | なし・購入可 | 12 | 8.33% | 7.39% |
| warning | あり・購入可 | 66 | 6.06% | 39.69% |

MEDIUM concentrationは2的中で高ROIだが10Rだけであり、独立した採用信号とは判定しない。信頼度HIGH、warningなし、concentration HIGHは優位性を示していない。

## 点数帯

| 点数帯 | 購入可R | 的中R | 的中率 | 投資 | 払戻 | ROI |
|---|---:|---:|---:|---:|---:|---:|
| 1–3 | 56 | 3 | 5.36% | 11,200円 | 7,070円 | 63.13% |
| 4–6 | 15 | 1 | 6.67% | 7,200円 | 550円 | 7.64% |
| 7–10 | 3 | 0 | 0% | 2,600円 | 0円 | 0% |
| 11+ | 4 | 1 | 25.00% | 7,400円 | 680円 | 9.19% |

自然候補数を後付けで制限していない。固定済み点数帯のまま、1–3点帯の相対優位だけが継続した。

## THICK / cliff

| 区分 | 対象R | 点数 | 的中 | 的中率 | 投資 | 払戻 | ROI |
|---|---:|---:|---:|---:|---:|---:|---:|
| THICKあり | 56 | 61 | 1 | 1.64% | 6,100円 | 160円 | **2.62%** |
| THICKなし | 78 | 223 | 4 | 1.79% | 22,300円 | 8,140円 | **36.50%** |

clear cliff 56R、no-cliff THICK 0R、THICKなしclear-cliff候補0R。cliffとTHICK付与の整合は保たれたが、増額価値の兆候は **NO**。50Rの0/30から100Rでは1/61になったものの、非THICKを大きく下回る。

## 50Rとの比較

| 指標 | 50R | 100R | 判定 |
|---|---:|---:|---|
| 購入可R | 35 | 78 | 増加 |
| MAIN的中 / 点数 | 1 / 119 | 5 / 284 | 的中増、ROI低下 |
| MAIN ROI | 49.16% | 29.23% | 低下 |
| best group | 低点数 | 低点数 | 維持 |
| 低点数group ROI | 112.50% | 63.13% | 低下したが非選択7.15%を上回る |
| THICK的中 / 点数 | 0 / 30 | 1 / 61 | 微増 |
| THICK ROI | 0% | 2.62% | 実用信号なし |
| 非THICK ROI | 65.73% | 36.50% | THICKより高い状態を維持 |

50R時点の単一的中依存から、低点数groupは3的中へ増え、相対差が維持されたためsignalは「未確認」から「emerging」へ進んだ。一方、絶対ROIは低下し、THICK、信頼度HIGH、concentration HIGH、warningなしには有用性が見られない。

## 判断

- recommendation selection appears useful: **YES（emerging、production採用不可）**
- THICK増額価値の兆候: **NO**
- 穴 / 高配当dataset: **利用不可**（oddsはUNKNOWN、1万円以上の的中0）
- tuning: **B_MORE_DATA_BEFORE_TUNING**。固定定義で150R/200Rまで継続し、低点数groupの的中数と相対ROIを再確認する。THICKの増額・閾値最適化・pair-support tuningは行わない。
- production prediction changed: NO
- production purchase changed: NO
- Research meaning changed: NO
- historical mutation count: 0
