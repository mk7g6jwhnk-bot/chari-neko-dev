# 100R prediction distance 診断

実行日: 2026-09-18 JST  
Verdict: **PREDICTION_DISTANCE_DIAGNOSIS_COMPLETE_WITH_LIMITS**

## cohort / integrity

commit `21249dc`の固定cohort 100Rとrace key一覧・順序が完全一致した。cohort key hashは`eae2637c34416d9ebab9a7dfdcebdb92a85b85e7f97d106b54bab85dd56d667b`。duplicate 0、result available 100、prediction mismatch 0、purchase mismatch 0、sealed result mismatch 0、temporal violation 0、result-aware leakage 0、post-hoc modification 0、historical mutation 0である。

診断は結果確定前に保存されたterminal probability/rank、representative flag、natural candidate reject code、purchase planだけを使用した。結果から候補・順位・scenarioを再生成していない。

## 固定分類ルール

- meaningful terminal: 保存済み`representativeTerminal=true`、または既存natural candidate code（`ADOPTED` / `THIRD_VARIANT_AMBIGUITY` / `THIRD_VARIANT_BOUNDARY`）
- P3/P2/P1/P0: 実着1～3着のうち、meaningful terminal集合に登場する人数
- winner/pair/third rank: 保存済みterminal probabilityを、結果を参照せずhead、正順pair、pair条件下thirdごとに集約した順位
- ordering good: winner Top3、正順pair Top5、条件付きthird Top3をすべて満たす
- purchase candidate: 上記natural candidate codeを持つexact terminal
- scenario closeは保存済みexact terminalのscenario family rankを使うproxy。実際のレース展開映像を示す指標ではない

全terminalは全順列型のため、broadなP3、winner生成、pair生成、third生成、exact terminal生成はすべて100%。したがって、実質的な診断にはmeaningful/purchase段階を使用する。

## 全100R

| 指標 | 結果 |
|---|---:|
| 保存purchase plan exact hit | 7R（MAIN 5 / COVER 2） |
| meaningful rider P3 / P2 / P1 / P0 | 55 / 33 / 11 / 1 |
| rider selection success（P2以上） | **88.0%** |
| winner generated / meaningful | 100 / 84 |
| winner Top1 / Top3 | 31 / 61 |
| exact pair generated / meaningful | 100 / 54 |
| exact pair Top1 / Top3 / Top5 | 17 / 30 / 38 |
| reverse pair meaningful | 51 |
| reverse 1-2 + same third購入 | 7 |
| reverse 1-2 + different third購入 | 13 |
| reverse candidate present but not purchased | 44 |
| conditional third Top1 / Top3 / outside Top3 | 23 / 73 / 27 |
| exact terminal generated / meaningful | 100 / 42 |
| correct internal but not purchased | **35** |
| purchase candidate survival | 42 |
| ordering good | 27 |

raw planではCOVER的中が2R存在する。100R recommendation評価の`COVER=0`は、同評価sourceがMAIN ticketsだけを抽出していたためで、保存predictionの分類変更ではない。ROI評価との比較では従来どおりMAIN 5的中を基準とする。

## prediction distance

| score | R | 意味 |
|---:|---:|---|
| 0 | 7 | exact purchase |
| 1 | 47 | exact internal、裏目、または条件付き3着が近い |
| 2 | 34 | 2～3選手を拾ったが順位・条件が弱い |
| 3 | 11 | meaningful候補は1人 |
| 4 | 1 | meaningful候補に結果3人がいない |

平均1.52、median 1、p90 3。排他的分類はexact 7、near miss order 12、correct internal not purchased 35、riders right/ranking wrong 34、upstream miss 12、unclassifiable 0。

## 主原因

| primary cause | R |
|---|---:|
| PURCHASE_INELIGIBLE | 19 |
| PAIR_ORDER_MISS | 17 |
| PURCHASE_SELECTION_MISS | 16 |
| REVERSE_12 | 13 |
| UPSTREAM_RIDER_MISS | 9 |
| THIRD_CONDITIONAL_MISS | 7 |
| WINNER_SELECTION_MISS | 7 |
| SCENARIO_RANKING_MISS | 5 |

最大のボトルネックは、購入不可19R、pair方向・順位17R、meaningful exact terminalを購入へ残せない16R。選手選びはP2以上88Rまで到達している一方、ordering goodは27R、purchase candidate survivalは42Rであり、主な損失は選手集合の生成後に発生している。

scenario proxyはclose 14、partially close 14、miss 2、insufficient evidence 70。映像ベースの確定scenarioが不足するため、scenario固有の結論は制限付きとする。

## 1～3点・購入可 56R

| 指標 | 結果 |
|---|---:|
| exact hit | 3 |
| P3 / P2 / P1 / P0 | 19 / 26 / 10 / 1 |
| rider selection success | **80.36%** |
| winner meaningful / Top3 | 41 / 36 |
| exact pair meaningful / Top5 | 20 / 23 |
| reverse same-third purchase | 3 |
| exact terminal meaningful | 13 |
| internal correct but not purchased | 10 |
| distance 0 / 1 / 2 / 3 / 4 | 3 / 18 / 24 / 10 / 1 |

低点数groupは全体よりrider selection（80.36%対88.0%）とmeaningful exact terminal率（23.21%対42.0%）が低い。したがって100Rでの相対ROI優位は「予想内部の候補精度が全体より高い」ためとは確認できず、少ない購入点数による投資圧縮の寄与が大きい。

## THICK 61 tickets

| 分類 | tickets |
|---|---:|
| exact | 1 |
| 1-2裏 + 3着一致 | 0 |
| 1-2正順 + 3着違い | 5 |
| 同じ3選手・着順違い | 5 |
| 結果選手2人一致 | 25 |
| それ未満 | 25 |

THICKの弱さは単純な裏目ではない。61点中50点が「結果選手2人以下」で、exact pair + third違いも5点に留まる。THICK定義・閾値は変更していない。

## 結論と次手

予想は結果3人のうち2人以上を88%でmeaningful候補へ含めているが、正順pair Top5は38%、ordering goodは27%、exact terminalの購入候補生存は42%だった。次の診断優先順位は、(1) purchase ineligibleの内訳、(2) pair方向・順位、(3) meaningful exact terminalが購入から落ちる保存済みreject reasonの集計である。200Rまでは定義を固定し、本結果をproduction rankingやtuningへ接続しない。
