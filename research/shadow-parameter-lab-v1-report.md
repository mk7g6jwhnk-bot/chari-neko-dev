# SHADOW PARAMETER LAB V1 初回評価

## Cohort

- 印評価: 100R / UNKNOWN 0R
- SHADOW: EXPLORATION 60R / CONFIRMATION 20R / FINAL_HOLDOUT 20R
- SHADOW評価済み: 80R
- protected final使用: 0R
- FINAL_HOLDOUT評価: 未実施

## 印の上位N

| 累積印 | winner capture | actual top3 coverage 3/2/1/0 | top3全員coverage |
|---|---:|---:|---:|
| ◎ | 36/100 (36.0%) | 0/0/71/29 | 0/100 (0.0%) |
| ◎○ | 53/100 (53.0%) | 0/44/44/12 | 0/100 (0.0%) |
| ◎○▲ | 71/100 (71.0%) | 12/51/30/7 | 12/100 (12.0%) |
| ◎○▲△ | 88/100 (88.0%) | 33/49/16/2 | 33/100 (33.0%) |
| ◎○▲△☆ | 91/100 (91.0%) | 54/40/6/0 | 54/100 (54.0%) |

着順別印分布:

- 1着: ◎36 / ○17 / ▲18 / △17 / ☆3 / 圏外9
- 2着: ◎21 / ○23 / ▲22 / △18 / ☆6 / 圏外10
- 3着: ◎14 / ○14 / ▲11 / △10 / ☆20 / 圏外31
- ◎の1着率 36.0% / 3着内率 71.0%

## 補正監査

- SHADOW_READY: `RIDER_FIRST_RECENT_WEIGHT`, `TERMINAL_EVIDENCE_WEIGHT`
- NEEDS_TRACE: pair direction, second-place compatibility, third conditional, terminal relative condition
- NOT_INDEPENDENT: scenario support
- NOT_IMPLEMENTED: rider relative score correction, racePointDiff, sameLineRole correction, scenario counter-evidence
- UNSAFE_TO_REPLAY: recommendation score, THICK score

順位や結果から不足traceを推測していない。pair/third/recommendation/THICKは今回実験対象外。

## 初回比較

### RIDER_FIRST_RECENT_WEIGHT

| weight | Top1 | Top3 | exploration Top3 | confirmation Top3 | 状態 |
|---:|---:|---:|---:|---:|---|
| 0.20 | 26/80 | 57/80 | 45/60 | 12/20 | DATA_NOT_ENOUGH |
| 0.24 | 27/80 | 55/80 | 42/60 | 13/20 | DATA_NOT_ENOUGH |
| 0.28 baseline | 26/80 | 55/80 | 42/60 | 13/20 | ACTIVE |
| 0.32 | 26/80 | 58/80 | 45/60 | 13/20 | DATA_NOT_ENOUGH |
| 0.36 | 25/80 | 58/80 | 45/60 | 13/20 | DATA_NOT_ENOUGH |

+0.04/+0.08のTop3差はexplorationだけで、confirmationではbaselineと同じ。暫定PROMISINGなし。

### TERMINAL_EVIDENCE_WEIGHT

| weight | exact final survival | hit rate | ROI | avg tickets | 状態 |
|---:|---:|---:|---:|---:|---|
| 0.25 | 12/80 | 15.0% | 82.8% | 5.06 | DATA_NOT_ENOUGH |
| 0.30 | 12/80 | 15.0% | 82.8% | 5.06 | DATA_NOT_ENOUGH |
| 0.35 baseline | 12/80 | 15.0% | 82.8% | 5.06 | ACTIVE |
| 0.40 | 12/80 | 15.0% | 82.8% | 5.06 | DATA_NOT_ENOUGH |
| 0.45 | 12/80 | 15.0% | 82.8% | 5.06 | DATA_NOT_ENOUGH |

全variantで固定件数rank selectionを共通適用した研究上のsimulated candidate値。production購入結果ではない。粗い範囲で順位・成績が変化せず、暫定WEAK候補。高配当1本による採用判断はしていない。

## score shape

rider / scenario / pair / terminalについて、adjacent gap、Top1→2〜Top4→5 gap、local density、plateau length、lower-group separation、slopeをrace・variant別gzip artifactへ保存した。cliff thresholdとcliff方式は実装していない。

## Integrity

- production prediction / purchase / recommendation / THICK changed: NO
- historical mutation: 0
- protected final used: 0
- result leakage: 0（resultは評価時のみ）
- production hash mismatch: 0
- auto tuning / auto rejection: 0
- cliff method implemented: NO
