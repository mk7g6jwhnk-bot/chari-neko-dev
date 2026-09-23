# 300R 正解terminal低順位・寄与分解診断

- verdict: CONTRIBUTION_DIAGNOSIS_PARTIAL_TRACE_LIMITED
- cohort: 300R / 51c386191aaac9a554a0d910df0a6e8fa4a4f7c64105850e791e677592f11ee6
- score/rank available: 300R
- detailed fully evaluable / UNKNOWN: 85 / 215
- exact trace available: 87R
- exact rank: mean 74.113 / median 47 / min 1 / max 434

## Trace制約
- 古いsnapshotは低順位terminalのscore/rankとbranch IDだけを保持し、position/conditional/scenario/counter-evidence traceを保持していない。
- 結果からの再生成・補完を行わず215RをUNKNOWNとした。詳細85Rは保存traceが上位候補に偏るため、300R全体の因果比率として外挿しない。

## 詳細85Rの原因カテゴリ
- D_THIRD_DOMINANT: 33R / mean rank impact 6.394 / mean score impact 0.063
- G_MULTI_FACTOR: 24R / mean rank impact 49.583 / mean score impact 0.168
- C_PAIR_COMPATIBILITY_DOMINANT: 11R / mean rank impact 3.000 / mean score impact 0.048
- I_UNKNOWN: 11R / mean rank impact 0.000 / mean score impact UNKNOWN
- B_PAIR_DIRECTION_DOMINANT: 2R / mean rank impact 175.500 / mean score impact 0.323
- E_SCENARIO_DOMINANT: 2R / mean rank impact 5.000 / mean score impact 0.031
- A_FIRST_SCORE_DOMINANT: 2R / mean rank impact 4.000 / mean score impact 0.038

## 詳細要素ランキング
- 1. SCENARIO_SCORE: 25R / mean rank impact 6.120 / mean score impact 0.019 / normalized deficit 0.363
- 2. SCENARIO_SUPPORT: 25R / mean rank impact 6.120 / mean score impact 0.018 / normalized deficit 0.358
- 3. THIRD_CONDITIONAL: 66R / mean rank impact 4.894 / mean score impact 0.018 / normalized deficit 0.340
- 4. PAIR_DIRECTION: 48R / mean rank impact 5.854 / mean score impact 0.017 / normalized deficit 0.187
- 5. FIRST_RIDER_SCORE: 30R / mean rank impact 5.967 / mean score impact 0.017 / normalized deficit 0.367
- 6. SECOND_CONDITIONAL: 46R / mean rank impact 4.674 / mean score impact 0.016 / normalized deficit 0.305
- 7. POSITION_FOURTH_CORNER: 71R / mean rank impact 5.549 / mean score impact 0.014 / normalized deficit 0.267
- 8. TERMINAL_RELATIVE_SCORE: 74R / mean rank impact 5.851 / mean score impact 0.013 / normalized deficit 0.148
- 9. LINE_ROLE: 72R / mean rank impact 5.167 / mean score impact 0.012 / normalized deficit 0.234
- 10. WINNER_SELECTION: 2R / mean rank impact 6.000 / mean score impact 0.009 / normalized deficit 0.458
- 11. PAIR_COMPATIBILITY: 45R / mean rank impact 3.644 / mean score impact 0.008 / normalized deficit 0.276
- 12. COUNTER_EVIDENCE: 0R / mean rank impact UNKNOWN / mean score impact UNKNOWN / normalized deficit UNKNOWN

## 距離帯
- TOP_1_TO_5: 40R / detailed 40R / A_FIRST_SCORE_DOMINANT 1 / C_PAIR_COMPATIBILITY_DOMINANT 9 / D_THIRD_DOMINANT 16 / E_SCENARIO_DOMINANT 1 / G_MULTI_FACTOR 2 / I_UNKNOWN 11
- RANK_6_TO_10: 29R / detailed 26R / A_FIRST_SCORE_DOMINANT 1 / C_PAIR_COMPATIBILITY_DOMINANT 2 / D_THIRD_DOMINANT 14 / E_SCENARIO_DOMINANT 1 / G_MULTI_FACTOR 8 / I_UNKNOWN 3
- RANK_11_TO_20: 34R / detailed 2R / G_MULTI_FACTOR 2 / I_UNKNOWN 32
- RANK_21_TO_50: 51R / detailed 8R / B_PAIR_DIRECTION_DOMINANT 1 / D_THIRD_DOMINANT 3 / G_MULTI_FACTOR 4 / I_UNKNOWN 43
- RANK_51_TO_100: 67R / detailed 2R / G_MULTI_FACTOR 2 / I_UNKNOWN 65
- RANK_101_TO_200: 60R / detailed 5R / G_MULTI_FACTOR 5 / I_UNKNOWN 55
- RANK_201_PLUS: 19R / detailed 2R / B_PAIR_DIRECTION_DOMINANT 1 / G_MULTI_FACTOR 1 / I_UNKNOWN 17

## 既存drop reason照合
- NONE_EXACT_HIT: 18R / detailed 17 / UNKNOWN 1
- PAIR_ORDER_MISS: 68R / detailed 4 / UNKNOWN 64 / aligned 3 / mismatch 1
- PURCHASE_INELIGIBLE: 71R / detailed 35 / UNKNOWN 36
- PURCHASE_SELECTION_MISS: 38R / detailed 18 / UNKNOWN 20
- REVERSE_12: 35R / detailed 2 / UNKNOWN 33 / aligned 0 / mismatch 2
- SCENARIO_RANKING_MISS: 15R / detailed 5 / UNKNOWN 10
- THIRD_CONDITIONAL_MISS: 17R / detailed 3 / UNKNOWN 14 / aligned 3 / mismatch 0
- UPSTREAM_RIDER_MISS: 22R / detailed 0 / UNKNOWN 22 / aligned 0 / mismatch 0
- WINNER_SELECTION_MISS: 16R / detailed 1 / UNKNOWN 15 / aligned 1 / mismatch 0

## 印良好・terminal 50位以上
- races: 36 / detailed 1 / UNKNOWN 35
- mean rank: 99.194
- detailed causes: G_MULTI_FACTOR 1

## 再設計候補（Researchのみ）
- P1 THIRD_DEDICATED_DIAGNOSTIC: research-only structural comparison
- P2 SCENARIO_SCORE_SUPPORT_SEPARATION: research-only structural comparison
- P3 PAIR_DIRECTION_COMPATIBILITY_SEPARATION: research-only structural comparison

## 次期SHADOW候補
- THIRD_MODEL_V1: compare third conditional ordering after the exact first-second pair is fixed
- SCENARIO_SUPPORT_SEPARATION_V1: compare scenario score and independent support as separate structural layers
- NEW_PAIR_MODEL_V1: compare direction and compatibility as separate saved-trace layers

## 判断
- 詳細trace内ではTHIRD_CONDITIONALが最頻の単独主因だが、主に近距離群で観測された。
- 遠距離の詳細例はMULTI_FACTORが中心で、PAIR_DIRECTIONの2例はimpactが大きいが件数不足。
- scenario score/supportは要素別score impactが最大級で、分離比較する価値がある。
- 215RがUNKNOWNのため、本診断だけでproduction変更・weight変更・threshold変更を支持しない。

## Integrity
- prediction/purchase/result hash mismatch: 0/0/0
- production prediction changed: NO
- production purchase changed: NO
- historical mutation: 0
- protected final used: 0
- result leakage: 0
- tuning / weight / threshold / SHADOW variant change: 0
