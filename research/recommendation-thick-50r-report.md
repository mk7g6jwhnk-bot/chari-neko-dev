# Recommendation / THICK 50R Research-only再評価

## Verdict

**NO_USEFUL_SIGNAL_YET**。固定済み`RECOMMENDATION_THICK_EVAL_V1`、group、cliff、flat 100円集計を変更せず、action-tag forward cohortの到達順先頭50Rを再評価した。50Rは全件formal eligibleだが、購入可35Rの的中は1Rだけである。記述上のbest groupは維持されたものの単一的中依存で、おすすめ選別の有用性は **NO**。THICKは30ticketで的中0のため、増額価値の兆候も **NO** と判定する。

## Cohort

- requested / fetched / evaluated: **50 / 50 / 50R**
- 購入可 / 購入不可: **35 / 15R**
- formal除外: **0R**
- protected final使用: **0R**
- prediction / purchase / sealed-result mismatch: **0 / 0 / 0**
- odds既知 / UNKNOWN: **0 / 119ticket**。穴・高配当datasetは利用不可。結果払戻からodds帯を逆算していない。

## Recommendation groups

すべて前回定義のまま。投資は保存済みcanonical MAIN ticketを1枚100円で集計し、購入不可・reference hitは含めない。

| group | 対象R | 購入可R | 的中R | 的中率 | 投資 | 払戻 | ROI |
|---|---:|---:|---:|---:|---:|---:|---:|
| HIGH_CONFIDENCE_PURCHASEABLE | 6 | 6 | 0 | 0.0% | 3,300 | 0 | 0.0% |
| MEDIUM_CONFIDENCE_PURCHASEABLE | 2 | 2 | 0 | 0.0% | 900 | 0 | 0.0% |
| HIGH_CONCENTRATION_PURCHASEABLE | 24 | 24 | 0 | 0.0% | 7,000 | 0 | 0.0% |
| LOW_TICKET_COUNT_PURCHASEABLE | 26 | 26 | 1 | 3.85% | 5,200 | 5,850 | 112.5% |
| WARNING | 44 | 29 | 1 | 3.45% | 8,600 | 5,850 | 68.02% |
| PARTIAL_DATA | 0 | 0 | 0 | — | 0 | 0 | — |

descriptive bestは **LOW_TICKET_COUNT_PURCHASEABLE**。22R時点から名称は維持されたが、26R中1的中だけで、non-selected 9購入Rは0的中。selection appears usefulはformalには **NO** とする。

## Trust / concentration / warning

| 軸 | band | R | 購入可R | 的中率 | ROI |
|---|---|---:|---:|---:|---:|
| 信頼度 | HIGH | 6 | 6 | 0.0% | 0.0% |
| 信頼度 | MEDIUM | 2 | 2 | 0.0% | 0.0% |
| 信頼度 | LOW | 42 | 27 | 3.70% | 75.97% |
| 集中度 | HIGH | 25 | 24 | 0.0% | 0.0% |
| 集中度 | MEDIUM | 2 | 2 | 50.0% | 1,462.5% |
| 集中度 | LOW | 23 | 9 | 0.0% | 0.0% |
| warningなし購入可 | — | 6 | 6 | 0.0% | 0.0% |
| warningあり購入可 | — | 29 | 29 | 3.45% | 68.02% |

MEDIUM concentrationは2R・1的中だけでありsignal扱いしない。HIGH trust / HIGH concentrationの単調な優位はなく、現時点では信頼度・集中度・warningを選別指標として支持できない。

## Ticket count bands

| 点数帯 | 購入R | 的中R | 的中率 | 投資 | 払戻 | ROI |
|---|---:|---:|---:|---:|---:|---:|
| 1–3 | 26 | 1 | 3.85% | 5,200 | 5,850 | 112.5% |
| 4–6 | 5 | 0 | 0.0% | 2,300 | 0 | 0.0% |
| 7–10 | 2 | 0 | 0.0% | 1,700 | 0 | 0.0% |
| 11+ | 2 | 0 | 0.0% | 2,700 | 0 | 0.0% |

1–3点帯のみプラスだが1的中依存。点数帯signalは未確立。

## THICK / MAIN / COVER

| 区分 | 対象R | ticket | hit | hit率 | 投資 | 払戻 | ROI |
|---|---:|---:|---:|---:|---:|---:|---:|
| MAIN全体 | 35 | 119 | 1 | 0.84% | 11,900 | 5,850 | 49.16% |
| THICKあり | 27 | 30 | 0 | 0.0% | 3,000 | 0 | 0.0% |
| THICKなしticket | 35 | 89 | 1 | 1.12% | 8,900 | 5,850 | 65.73% |
| COVER | 0 | 0 | 0 | — | 0 | 0 | — |

- clear cliff: **27R**
- THICKあり no-cliff: **0R**
- THICKなし clear-cliff候補: **0R**

THICKとclear-cliffの対応関係は維持されたが、THICK側の的中は0。cliffが増額価値を示す証拠はない。固定dataset schemaはMAINを評価対象とするため、COVERは0件で評価不能。

## 22R比較

- evaluated: **22 → 50R**、購入可: **18 → 35R**。
- descriptive best: `LOW_TICKET_COUNT_PURCHASEABLE`を維持。
- THICK: **13R / 13ticket / 1hit / ROI 364.62% → 27R / 30ticket / 0hit / ROI 0%**。前回の見かけ上の優位は維持されなかった。
- clear cliff: **13 → 27R**。no-cliff THICKとTHICKなしclear-cliffは引き続き0。
- 前回も今回も少数的中依存。50Rでsignalは強まらず、THICKについては反証方向へ動いた。

## Safety

- prediction hash mismatch: **0**
- purchase hash mismatch: **0**
- sealed result mismatch: **0**
- production prediction / purchase / UI changed: **NO / NO / NO**
- Research meaning changed: **NO**
- historical mutation: **0**
- protected final used: **0**
- threshold search / result-aware tuning / pair-support tuning: **0**

## Next

定義を維持して100R checkpointまでforward collectionを継続する。次回も同じgroupを再集計し、的中数が複数に増えるまでselectionやTHICKを採用しない。oddsを事前sealへ保存できる将来cohortが得られるまで、穴・高配当datasetはUNKNOWNのまま保留する。
