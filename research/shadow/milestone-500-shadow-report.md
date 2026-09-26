# 400R通過後・500R向けSHADOW固定レポート

## 判定
- SHADOW_ONLY_UNTIL_500R
- production接続: NO
- confirmation: checkpoint ordinal 467〜500（固定、再調整禁止）
- 466R checkpoint中のprotected除外: 20R

## 300 / 400 / 466時点
| checkpoint | evaluable | rank avg/median/p90/max | Top5/10/15/20 | pair/rider/third fail | hits / ROI | trace complete/unknown |
|---:|---:|---|---|---|---|---|
| 300 | 300 | 72.76 / 45 / 178 / 436 | 39/66/85/100 | 123/90/30 | 18 / 46.8% | 0/300 |
| 400 | 400 | 68.43 / 45 / 163 / 436 | 54/89/111/137 | 163/117/36 | 26 / 45.0% | 0/400 |
| 466 | 446 | 67.00 / 44 / 162 / 436 | 63/101/127/155 | 177/134/39 | 30 / 54.1% | 0/446 |

## 固定single-factor SHADOW
| Candidate | Variant | rank median | Top20 | target failure | reverse-only | winner | low payout deep | 判定 |
|---|---|---:|---:|---:|---:|---:|---:|---|
| PAIR_DIRECTION_ORDER_V1 | WEAK | 43 | 157 | 175 | 56 | 307 | 126 | WEAK_SIGNAL |
| PAIR_DIRECTION_ORDER_V1 | BASELINE | 44 | 155 | 177 | 50 | 312 | 128 | BASELINE |
| PAIR_DIRECTION_ORDER_V1 | STRONG | 44 | 155 | 175 | 57 | 303 | 126 | WEAK_SIGNAL |
| RIDER_SELECTION_SENSITIVITY_V1 | WEAK | 43 | 156 | 133 | 50 | 313 | 127 | PROMISING |
| RIDER_SELECTION_SENSITIVITY_V1 | BASELINE | 44 | 155 | 134 | 50 | 312 | 128 | BASELINE |
| RIDER_SELECTION_SENSITIVITY_V1 | STRONG | 44 | 151 | 132 | 50 | 314 | 129 | WEAK_SIGNAL |

## Safety
- prediction/purchase/recommendation/THICK/SHADOW production changed: NO
- result leakage: 0
- historical mutation: 0
- protected final used: 0
- auto tuning / promotion: false
