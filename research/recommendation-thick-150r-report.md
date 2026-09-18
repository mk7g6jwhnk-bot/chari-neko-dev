# recommendation / THICK 150R継続評価

実行日: 2026-09-19 JST  
Verdict: **SIGNAL_WEAKENING**

## cohort / integrity

- current collected / evaluable: 150R / 150R
- 先頭100R: 6a8abd0訂正版cohortとrace key・順序完全一致
- 新規cohort: temporal append順の101〜150R（2026-09-18、50R）
- duplicate / excluded / protected final: 0 / 0 / 0
- result available: 150
- prediction / purchase / sealed result mismatch: 0 / 0 / 0
- missing seal、temporal violation、post-hoc modification、result-aware leakage、historical mutation: 0
- unexpected category / ticket-count explosion: 0 / 0（100R max 30点、新規50R max 24点）

100Rのrecommendation、THICK、MAIN/COVER、confidence、concentration、warning、cliff、ticket band定義を変更していない。headlineとrecommendation比較は従来どおりMAIN scopeとし、COVERを含むactual purchase合計を別記した。

## 累積150Rと新規50R

| 指標 | 累積150R | 新規101〜150R |
|---|---:|---:|
| 購入可 / 不可 | 114 / 36R | 36 / 14R |
| MAIN的中率 | 7/114 = 6.14% | 2/36 = 5.56% |
| MAIN 投資 / 払戻 / ROI | 37,800円 / 11,960円 / 31.64% | 9,400円 / 3,660円 / 38.94% |
| actual MAIN+COVER ROI | 22.57% | 19.37% |
| MAIN tickets avg / median / p90 / max | 3.32 / 2 / 6 / 24 | 2.61 / 2 / 5 / 13 |

## low-ticket recommendation

固定定義は「MAIN 1〜3点・購入可」。

| group | races | hits | investment | return | ROI |
|---|---:|---:|---:|---:|---:|
| 累積 low-ticket | 84 | 4 | 15,800円 | 10,250円 | 64.87% |
| 累積 non-selected | 30 | 3 | 22,000円 | 1,710円 | 7.77% |
| 新規50R low-ticket | 28 | 1 | 4,600円 | 3,180円 | 69.13% |
| 新規50R non-selected | 8 | 1 | 4,800円 | 480円 | 10.00% |

ROI優位は維持したが、新規50Rのlow-ticket的中は1Rだけで払戻依存が強い。継続性判定は **DATA_NOT_ENOUGH**、recommendation全体も **DATA_NOT_ENOUGH** とし、100R時点より証拠が強まったとは扱わない。累積では選択群優位が残るため、signal消失とも判定しない。

## MAIN / COVER / THICK

| 区分 | 累積 tickets / hits / ROI | 新規50R tickets / hits / ROI |
|---|---:|---:|
| MAIN | 378 / 7 / 31.64% | 94 / 2 / 38.94% |
| COVER | 315 / 2 / 11.68% | 95 / 0 / 0% |
| THICK | 83 / 1 / 1.93% | 22 / 0 / 0% |
| non-THICK | 610 / 8 / 25.38% | 167 / 2 / 21.92% |

COVERは0点ではなく、6a8abd0のactual final purchase分類を使用した。新規50RのCOVERは95点・0的中。THICKも新規22点・0的中で、判定は **STILL_WEAK**。

## confidence / concentration / warning

新規50Rの購入可36Rではconfidence HIGH/MEDIUM/LOWが3/2/31R、的中は1/1/0R。MEDIUMの高ROIは2R・1的中だけのため `DATA_NOT_ENOUGH`。concentration HIGH/MEDIUM/LOWは24/7/5R、的中2/0/0Rで、HIGH以外はsample・的中とも不足。現時点でordinal signalの確立とは扱わない。

warning-freeは3R・1的中、warningありは33R・1的中。母数差が大きく、warning効果の確定判断はしない。オッズ妙味は全件UNKNOWN、partial-data warningは0R。

## 判断

新規50Rでもlow-ticket ROIの記述的優位は残ったが、的中1Rのみで再現性の証拠は弱い。THICKとCOVERは弱い状態が継続した。定義を固定したまま200Rまで収集を続け、次の50Rでlow-ticket的中数とROI優位が再現するか確認する。production変更・tuning・protected final利用は行っていない。
