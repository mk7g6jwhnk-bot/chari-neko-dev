# 300R判定会・正解までの距離研究

- verdict: 300R_REVIEW_COMPLETE_NO_CLEAR_CLIFF
- cohort: 300R / 51c386191aaac9a554a0d910df0a6e8fa4a4f7c64105850e791e677592f11ee6
- available confirmed: 321R
- protected final excluded / used: 20 / 0
- fully / partially / UNKNOWN: 300 / 0 / 0

## 既存300R評価
- purchaseable / ineligible: 214 / 86
- P3 / P2 / P1 / P0: P3 171 / P2 89 / P1 37 / P0 3 / successRate 0.8666666666666667 / broadGeneratedP3 300
- terminal GENERATED / MEANINGFUL / PURCHASE_CANDIDATE / FINAL_PURCHASE / EXACT: 300 / 127 / 127 / 18 / 18
- drop: PAIR_DIRECTION_OR_RANK 130 / THIRD_CONDITIONAL 28 / TERMINAL_RELATIVE_RANK 0 / CLIFF_BOUNDARY 0 / PURCHASE_COMPRESSION 38 / PURCHASE_INELIGIBLE 86 / CLASSIFICATION_ONLY 0 / UNKNOWN 0
- final coverage: P3 79 / P2 93 / P1 39 / P0 89 / UNKNOWN 0
- marks winner Top1 / Top2 / Top3 / Top5: 113 / 168 / 218 / 278
- trio meaningful / purchase-derived / trifecta miss-trio hit: 155 / 49 / 31

## 正解terminal距離
- exact rank: mean 74.113 / median 47 / p90 171
- meaningful境界距離: INSIDE 130 / +1 3 / +2 3 / +3 1 / +4_TO_5 6 / +6_TO_10 16 / +11_TO_20 20 / +21_PLUS 121 / UNKNOWN 0
- score距離: count 300 / mean 0.061 / normalized mean 0.097
- 追加点数: +0 34 / +1 5 / +2 4 / +3 7 / +4_TO_5 8 / +6_TO_10 28 / +11_PLUS 214 / UNKNOWN 0

## 的中の崖
- Top1/2/3/5/8/10/15/20: 1:3.7% / 2:5.7% / 3:10.3% / 5:13.3% / 8:19.3% / 10:23.0% / 15:29.0% / 20:34.3%
- 境界+0/+1/+2/+3/+5/+10: +0:43.3% / +1:44.3% / +2:45.3% / +3:45.7% / +5:47.7% / +10:53.0%
- natural cliff: NO_CLEAR_NATURAL_CLIFF 
- +5 tradeoff: rescue 13R / additional 1496 tickets / wasted 1483
- +10 tradeoff: rescue 29R / additional 2986 tickets / wasted 2957

## 原因別
- NONE_EXACT_HIT: 18R / rank 16.444 / boundary -25.833 / add 0.000
- PAIR_ORDER_MISS: 68R / rank 82.882 / boundary 75.294 / add 80.044
- PURCHASE_INELIGIBLE: 71R / rank 75.352 / boundary -147.113 / add 75.352
- PURCHASE_SELECTION_MISS: 38R / rank 42.053 / boundary -84.237 / add 33.263
- REVERSE_12: 35R / rank 125.143 / boundary 95.000 / add 121.914
- SCENARIO_RANKING_MISS: 15R / rank 25.867 / boundary -30.467 / add 22.067
- THIRD_CONDITIONAL_MISS: 17R / rank 39.824 / boundary 31.706 / add 35.412
- UPSTREAM_RIDER_MISS: 22R / rank 115.500 / boundary 113.364 / add 114.000
- WINNER_SELECTION_MISS: 16R / rank 85.500 / boundary 81.313 / add 83.063

## SHADOW距離比較
- PAIR_DIRECTION/BASELINE: 67R / rank 54.388 (0.000) / boundary 53.388 (0.000) / add 50.716 (0.000) / score 0.443 (0.000) / BASELINE
- PAIR_DIRECTION/PAIR_WEAK: 67R / rank 54.164 (-0.224) / boundary 53.164 (-0.224) / add 50.896 (0.179) / score 0.463 (0.020) / NEUTRAL
- PAIR_DIRECTION/PAIR_MEDIUM: 67R / rank 54.030 (-0.358) / boundary 53.030 (-0.358) / add 50.746 (0.030) / score 0.488 (0.045) / PROMISING
- PAIR_DIRECTION/PAIR_STRONG: 67R / rank 53.910 (-0.478) / boundary 52.910 (-0.478) / add 50.761 (0.045) / score 0.517 (0.074) / PROMISING
- ELIGIBILITY/BASELINE: 67R / rank 54.388 (0.000) / boundary 53.388 (0.000) / add 50.716 (0.000) / score 0.443 (0.000) / BASELINE
- ELIGIBILITY/ELIGIBILITY_RELAX_WEAK: 67R / rank 54.388 (0.000) / boundary 53.388 (0.000) / add 50.716 (0.000) / score 0.443 (0.000) / NEUTRAL
- ELIGIBILITY/ELIGIBILITY_RELAX_MEDIUM: 67R / rank 54.388 (0.000) / boundary 53.388 (0.000) / add 50.612 (-0.104) / score 0.443 (0.000) / WEAK
- CLIFF/BASELINE: 67R / rank 54.388 (0.000) / boundary 53.388 (0.000) / add 50.716 (0.000) / score 0.443 (0.000) / BASELINE
- CLIFF/CLIFF_MAX_GAP: 67R / rank 54.388 (0.000) / boundary 53.388 (0.000) / add 51.418 (0.701) / score 0.443 (0.000) / NEUTRAL
- CLIFF/CLIFF_GAP_SEPARATION: 67R / rank 54.388 (0.000) / boundary 53.388 (0.000) / add 51.343 (0.627) / score 0.443 (0.000) / NEUTRAL
- CLIFF/CLIFF_PLATEAU_SLOPE: 67R / rank 54.388 (0.000) / boundary 53.388 (0.000) / add 52.612 (1.896) / score 0.443 (0.000) / NEUTRAL
- THIRD_CONDITIONAL/BASELINE: 67R / rank 54.388 (0.000) / boundary 53.388 (0.000) / add 50.716 (0.000) / score 0.443 (0.000) / BASELINE
- THIRD_CONDITIONAL/THIRD_WEAK: 67R / rank 54.343 (-0.045) / boundary 53.343 (-0.045) / add 51.090 (0.373) / score 0.455 (0.013) / NEUTRAL
- THIRD_CONDITIONAL/THIRD_MEDIUM: 67R / rank 54.284 (-0.104) / boundary 53.284 (-0.104) / add 51.015 (0.299) / score 0.470 (0.027) / NEUTRAL
- THIRD_CONDITIONAL/THIRD_STRONG: 67R / rank 54.269 (-0.119) / boundary 53.269 (-0.119) / add 50.985 (0.269) / score 0.487 (0.044) / NEUTRAL
- PROMISING（記述的候補）: PAIR_DIRECTION/PAIR_MEDIUM, PAIR_DIRECTION/PAIR_STRONG

## 研究判断
- 正解terminalは少数の境界直外より遠方に多く、購入点数の一律拡張を支持しない。
- PAIR_MEDIUM / PAIR_STRONGは順位距離をわずかに短縮したが、confirmation 67Rの記述評価に留まり採用判断には不足する。
- CLIFF 3 variantsは順位距離を改善せず、追加必要点数を悪化させた。自然な崖候補は確認できない。
- production採用・baseline昇格・variant淘汰・閾値調整は行わず、固定定義のまま日次観測を継続する。

## Safety
- production prediction/purchase/recommendation/THICK changed: NO
- cliff production implemented: NO
- historical mutation: 0
- protected final used: 0
- result leakage: 0
- prediction/purchase/result hash mismatch: 0/0/0
- automatic tuning: 0
