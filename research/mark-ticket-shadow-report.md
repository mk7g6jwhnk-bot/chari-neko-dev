# 評価印×買い目 read-only SHADOW比較

- verdict: TRUE_HYBRID_GAIN
- cohort: 300R / 51c386191aaac9a554a0d910df0a6e8fa4a4f7c64105850e791e677592f11ee6
- production接続: なし

## DATASET
- race: 300 / purchaseable 214 / ineligible 86
- mark complete / missing: 300 / 0
- candidate missing: 2（いずれもcanonical cap 0の購入不可race）
- result payout 1万+/2万+/3万+: 65/33/20

## MARK FEATURES
- 保存済みprediction時点riderScores（総合/1着）とscoreTrace（2着/3着）だけを使用。
- ◎○▲△☆×を順位に固定対応。結果はscore・係数・配分に入力していない。
- primary: MARK_SCORE_C = 1着position 45% + 2着25% + 3着15% + overall合計15%。canonical normalized score 80%との固定blend。
- A（1着overall）、B（3車overall平均）、C（着順別）、D（上位印人数）の4粗固定式を事前固定し、細かな探索は実施していない。

## SHADOW METHODS
- BASELINE: CURRENT_CANONICAL（保存済みcanonical tickets）。
- MARK_ADJUSTED: 同じ保存済みcandidateの順位だけをmark scoreで再評価。
- HYBRID_A/B/C: canonicalを2/3、4/5、cap-1点保護し、残りをMARK_ADJUSTEDで補完。全raceでcanonical ticket countと同数。

## MARK FORMULA COMPARISON
| formula | hit | hit rate | 万車 | return | exact rank avg | validation hit | validation rank avg |
|---|---:|---:|---:|---:|---:|---:|
| MARK_SCORE_A | 30 | 10.0% | 1 | 87350 | 53.181 | 12 | 52.046 |
| MARK_SCORE_B | 31 | 10.3% | 1 | 86640 | 51.795 | 13 | 46.800 |
| MARK_SCORE_C | 31 | 10.3% | 1 | 93810 | 52.457 | 13 | 48.877 |
| MARK_SCORE_D | 31 | 10.3% | 1 | 86640 | 51.575 | 13 | 46.692 |

## OVERALL COMPARISON
| method | hit | miss | hit rate | 万車 | 2万+ | 3万+ | avg payout | median payout | exact rank avg | exact rank median | ROI |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| CURRENT_CANONICAL | 18 | 282 | 6.0% | 2 | 0 | 0 | 3041.111 | 2680.000 | 56.669 | 21.000 | 0.468 |
| MARK_ADJUSTED_SHADOW | 31 | 269 | 10.3% | 1 | 0 | 0 | 3026.129 | 2010.000 | 52.457 | 20.000 | 0.802 |
| HYBRID_A | 28 | 272 | 9.3% | 2 | 0 | 0 | 3069.643 | 2340.000 | 52.283 | 20.000 | 0.735 |
| HYBRID_B | 28 | 272 | 9.3% | 2 | 0 | 0 | 2965.357 | 2340.000 | 52.551 | 20.000 | 0.710 |
| HYBRID_C | 23 | 277 | 7.7% | 2 | 0 | 0 | 2780.435 | 2010.000 | 53.031 | 21.000 | 0.547 |

### DISCOVERY (temporal first 150R)
| method | hit | miss | hit rate | 万車 | 2万+ | 3万+ | avg payout | median payout | exact rank avg | exact rank median | ROI |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| CURRENT_CANONICAL | 9 | 141 | 6.0% | 1 | 0 | 0 | 3072.222 | 2690.000 | 61.419 | 26.500 | 0.419 |
| MARK_ADJUSTED_SHADOW | 18 | 132 | 12.0% | 1 | 0 | 0 | 3723.333 | 2500.000 | 56.210 | 25.500 | 1.015 |
| HYBRID_A | 17 | 133 | 11.3% | 1 | 0 | 0 | 3413.529 | 2690.000 | 57.500 | 26.000 | 0.879 |
| HYBRID_B | 17 | 133 | 11.3% | 1 | 0 | 0 | 3241.765 | 2690.000 | 57.806 | 27.500 | 0.835 |
| HYBRID_C | 12 | 138 | 8.0% | 1 | 0 | 0 | 3002.500 | 2230.000 | 58.484 | 27.500 | 0.546 |

### VALIDATION (temporal last 150R; no refit)
| method | hit | miss | hit rate | 万車 | 2万+ | 3万+ | avg payout | median payout | exact rank avg | exact rank median | ROI |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| CURRENT_CANONICAL | 9 | 141 | 6.0% | 1 | 0 | 0 | 3010.000 | 2670.000 | 52.138 | 11.000 | 0.531 |
| MARK_ADJUSTED_SHADOW | 13 | 137 | 8.7% | 0 | 0 | 0 | 2060.769 | 2010.000 | 48.877 | 11.000 | 0.525 |
| HYBRID_A | 11 | 139 | 7.3% | 1 | 0 | 0 | 2538.182 | 2010.000 | 47.308 | 12.000 | 0.547 |
| HYBRID_B | 11 | 139 | 7.3% | 1 | 0 | 0 | 2538.182 | 2010.000 | 47.538 | 14.000 | 0.547 |
| HYBRID_C | 11 | 139 | 7.3% | 1 | 0 | 0 | 2538.182 | 2010.000 | 47.831 | 15.000 | 0.547 |

## GAIN / LOSS
- MARK_ADJUSTED_SHADOW: new hit 17 [20260912-46-2, 20260912-34-9, 20260916-13-7, 20260916-13-8, 20260917-84-3, 20260917-84-4, 20260917-63-1, 20260917-86-1, 20260918-84-6, 20260918-86-3, 20260918-86-7, 20260919-75-10, 20260919-34-7, 20260919-34-8, 20260920-75-11, 20260921-75-9, 20260922-44-3] / lost hit 4 [20260917-84-1, 20260919-73-7, 20260920-38-8, 20260922-62-1] / new-lost 万車 0-1 / 2万+ 0-0 / 3万+ 0-0
- HYBRID_A: new hit 11 [20260912-34-9, 20260916-13-7, 20260916-13-8, 20260917-84-3, 20260917-84-4, 20260917-63-1, 20260917-86-1, 20260918-86-3, 20260918-86-7, 20260919-34-7, 20260922-44-3] / lost hit 1 [20260919-73-7] / new-lost 万車 0-0 / 2万+ 0-0 / 3万+ 0-0
- HYBRID_B: new hit 10 [20260912-34-9, 20260916-13-7, 20260916-13-8, 20260917-84-3, 20260917-84-4, 20260917-86-1, 20260918-86-3, 20260918-86-7, 20260919-34-7, 20260922-44-3] / lost hit 0 [なし] / new-lost 万車 0-0 / 2万+ 0-0 / 3万+ 0-0
- HYBRID_C: new hit 5 [20260912-34-9, 20260916-13-7, 20260916-13-8, 20260919-34-7, 20260922-44-3] / lost hit 0 [なし] / new-lost 万車 0-0 / 2万+ 0-0 / 3万+ 0-0

## WORLD IMPACT
- MAIN: 0R / improved 0 / worsened 0 / mean rank Δ UNKNOWN
- SECONDARY: 0R / improved 0 / worsened 0 / mean rank Δ UNKNOWN
- BREAK_ALT: 0R / improved 0 / worsened 0 / mean rank Δ UNKNOWN
- UNKNOWN: 300R / improved 62 / worsened 24 / mean rank Δ 4.213
- 固定300R sourceにはexplicit worldClass/macroScenarioClassが未保存のため、MAIN/SECONDARY/BREAKをbranch名から推測せずUNKNOWNとした。

## WINNING TICKET RANK CHANGE
- evaluable 127 / improved 62 / worsened 24 / unchanged 41
- outside→inside15 1: 20260917-28-6
- inside→outside15 1: 20260920-46-7
- mean / median rank Δ: 4.213 / 0.000

## POSITION IMPACT
- firstPosition: upper-mark 94R mean rank Δ 4.883 / lower-mark 33R 2.303
- secondPosition: upper-mark 91R mean rank Δ 3.571 / lower-mark 36R 5.833
- thirdPosition: upper-mark 66R mean rank Δ 4.758 / lower-mark 61R 3.623

## HIGH-PAYOUT PRESERVATION
- MARK_ADJUSTED_SHADOW: 1/2 (50.0%) / lost 20260920-38-8
- HYBRID_A: 2/2 (100.0%) / lost なし
- HYBRID_B: 2/2 (100.0%) / lost なし
- HYBRID_C: 2/2 (100.0%) / lost なし

## TRADEOFF VERDICT
- MARK_ADJUSTED_SHADOW: HIGH_PAYOUT_DAMAGE
- HYBRID_A: TRUE_HYBRID_GAIN
- HYBRID_B: TRUE_HYBRID_GAIN
- HYBRID_C: TRUE_HYBRID_GAIN

## NEXT STEP
- production未接続。明確な候補があっても、BASELINE / MARK_ADJUSTED / HYBRIDをforward SHADOWで並走させる段階に留める。
- explicit world provenanceが保存されたforward cohortでMAIN/SECONDARY/BREAK別の再確認が必要。

## SAFETY
- prediction regeneration: 0
- purchase regeneration: 0
- canonical purchase changed: NO
- recommendation changed: NO
- historical mutation: 0
- result leakage: 0
- deploy: 0
- protected final used: 0
- prediction/purchase/result hash mismatch: 0/0/0
