# 500R SHADOW decision report

- verdict: MILESTONE_500_DECISION_READY
- current cumulative: 510
- historical: safe cohort <=466（confirmationとは分離）
- confirmation: checkpoint ordinal 467〜500
- confirmation collected: 34/34
- remaining: 0
- freeze intact: YES
- protected final used: 0
- production auto-adoption: NO（human approval required）

## Confirmation variants
| candidate | N | avg / median / p90 | Top5/10/15/20 | target Δ | winner Δ | reverse Δ | trio Δ | low-payout Δ | verdict |
|---|---:|---|---|---:|---:|---:|---:|---:|---|
| PAIR_DIRECTION_ORDER_V1/WEAK | 34 | 71.15 / 35 / 192 | 5/8/13/15 | 0 | 0 | 2 | 2 | 0 | REJECT |
| PAIR_DIRECTION_ORDER_V1/BASELINE | 34 | 70.59 / 41 / 192 | 3/8/13/15 | 0 | 0 | 0 | 0 | 0 | BASELINE |
| PAIR_DIRECTION_ORDER_V1/STRONG | 34 | 71.21 / 24 / 192 | 8/8/13/15 | 0 | 1 | 3 | 2 | 0 | REJECT |
| RIDER_SELECTION_SENSITIVITY_V1/WEAK | 34 | 72.00 / 40 / 192 | 3/8/13/15 | -1 | 1 | 0 | 0 | 0 | PRODUCTION_CANDIDATE |
| RIDER_SELECTION_SENSITIVITY_V1/BASELINE | 34 | 70.59 / 41 / 192 | 3/8/13/15 | 0 | 0 | 0 | 0 | 0 | BASELINE |
| RIDER_SELECTION_SENSITIVITY_V1/STRONG | 34 | 72.26 / 35 / 192 | 3/8/13/15 | -1 | 1 | 0 | 0 | 0 | HOLD_MORE_DATA |

## Race-level mechanism evidence

### PAIR_DIRECTION_ORDER_V1/WEAK

| raceKey | baseline→variant rank | target before→after | rider | pair | winner | mechanism | direction |
|---|---|---|---|---|---|---|---|
| 20260926-87-1 | 6→4 | false→false | false->false | false->false | true->true | NOT_TARGET_ALIGNED | IMPROVED |
| 20260926-87-2 | 41→35 | false→false | false->true | false->false | true->false | NOT_TARGET_ALIGNED | IMPROVED |
| 20260926-56-9 | 112→117 | true→true | true->true | true->true | false->false | NOT_TARGET_ALIGNED | WORSENED |
| 20260926-86-1 | 51→52 | true→true | false->false | true->true | true->true | NOT_TARGET_ALIGNED | WORSENED |
| 20260926-43-2 | 208→236 | true→true | false->false | true->true | true->true | NOT_TARGET_ALIGNED | WORSENED |
| 20260926-56-12 | 10→7 | false→false | true->true | false->false | false->false | NOT_TARGET_ALIGNED | IMPROVED |
| 20260926-86-6 | 7→5 | false→false | false->false | false->false | true->true | NOT_TARGET_ALIGNED | IMPROVED |
| 20260926-43-9 | 8→6 | false→false | true->false | false->false | false->true | NOT_TARGET_ALIGNED | IMPROVED |
| 20260926-86-9 | 2→1 | false→false | false->false | false->false | true->true | NOT_TARGET_ALIGNED | IMPROVED |
| 20260926-86-11 | 91→92 | true→true | false->false | true->true | true->true | NOT_TARGET_ALIGNED | WORSENED |

### RIDER_SELECTION_SENSITIVITY_V1/WEAK

| raceKey | baseline→variant rank | target before→after | rider | pair | winner | mechanism | direction |
|---|---|---|---|---|---|---|---|
| 20260926-87-2 | 41→40 | false→false | false->false | false->false | true->true | NOT_TARGET_ALIGNED | IMPROVED |
| 20260926-56-9 | 112→120 | true→true | true->true | true->true | false->false | NOT_TARGET_ALIGNED | WORSENED |
| 20260926-86-1 | 51→52 | false→false | false->false | true->true | true->true | NOT_TARGET_ALIGNED | WORSENED |
| 20260926-43-2 | 208→248 | false→false | false->false | true->true | true->true | NOT_TARGET_ALIGNED | WORSENED |
| 20260926-43-9 | 8→7 | true→false | true->false | false->false | false->true | CONSISTENT | IMPROVED |
| 20260926-86-11 | 91→92 | false→false | false->false | true->true | true->true | NOT_TARGET_ALIGNED | WORSENED |

## Cohort quality
- result complete: 34/34
- trace available: 34/34
- invalid trace: 0
- integrity failures: 0

## Integrity
- missing confirmation races: 0
- duplicates: 0
- parameter drift: 0
- result leakage: 0
- prediction/purchase production changed: NO

