# Scenario / Cliff CANDIDATE_V2 構造再監査

実施日: 2026-09-12  
verdict: `STRUCTURE_IMPROVED_MORE_TUNING_NEEDED`

## 結論

V1のrelative score / boundaryScore思想を維持し、cap判定前にscenario support floor、pair単位の自然停止、exact duplicate統合、near-duplicate scenario統合、scenario strengthによる弱tail整理を追加した。singleton scenario cliffは十分強い場合だけ単独採用し、それ以外は支持floor内の独立scenarioを保持する。

構造面では購入可能80→85R、cap不可34→29R、exact hit 14→17R、COVER 25→51点、THICK 0→11点へ改善した。しかしmedianは2点のまま、1〜3点raceは53→54R、COVER hitは0、PARTIAL_DATA_MISSINGは85/85である。production昇格条件は満たさない。

## 1. V1で34Rが20点超になった原因

bucketは重複可。

| 原因 | race数 |
|---|---:|
| scenario数が多い（5以上） | 30 |
| scenario内terminalが多い（12以上） | 34 |
| technical/near-duplicate観測が多い | 34 |
| exact merge前だけ超過 | 0 |
| scenario cliff不明瞭 | 6 |
| terminal cliff不明瞭 | 34 |
| scenario allocation工程なし | 34 |
| その他 | 0 |

直接原因は、terminal cliffが成立しない横並び群を全scenario分単純合算し、scenario strengthによる整理前にcap判定していたこと。V1の全体4,347 technical/near-duplicate観測は独立支持へ二重加点していないが、同一scenario内の多数third/pair variationとしてticket数膨張には残った。

## 2. V1でmedian 2点になった原因

V1のfinal 1〜3点raceは53R。全53Rでselected scenarioは1つ、COVERなし、V1 natural ticket自体が3点以下だった。強いcliff、MAIN分類、merge、capによる後段脱落は0Rだった。

したがってmedian 2は「no-cliffを1点化した」結果ではなく、上流の現行natural lifecycleが小さいraceと、scenario identityが実質1familyしかないraceが多数であることが主因。V2で弱scenarioを枠埋めすることはせず、median改善を捏造しなかった。

## 3. V2の工程修正

実装順:

1. raw scenario grouping
2. scenario relative score
3. result非依存scenario support floor
4. scenario cliff（弱いsingleton cliffは緩和）
5. scenarioごとのpair support grouping
6. pair内terminal cliff。no-cliffなら複数を保持
7. exact duplicate ticket統合
8. near-duplicate scenario consolidation
9. scenario strengthによる弱tail整理
10. 最終20点判定
11. scenario family基準のMAIN/COVER分類
12. MAIN/COVER各群のTHICK cliff

固定quota、枠埋め、arbitrary top20 slicingはない。最終整理後も20点超ならのみ `NATURAL_SELECTION_EXCEEDS_CAP` とする。

追加configは結果に合わせて反復調整していない。

- scenarioSupportFloor: 0.58
- pairSupportFloor: 0.55
- strongSingletonBoundaryScore: 0.72
- strongSingletonRelativeGap: 0.20
- nearDuplicateOverlap: 0.75
- weakScenarioTailFloor: 0.64

## 4. V2段階別flow

| 段階 | mean | median | p90 | max | >20R |
|---|---:|---:|---:|---:|---:|
| raw scenarios | 2.39 | 1 | 6 | 6 | 0 |
| supported scenarios | 1.66 | 1 | 3 | 4 | 0 |
| scenario cliff後 | 1.47 | 1 | 3 | 4 | 0 |
| raw terminals | 210 | 210 | 210 | 210 | 114 |
| 現行natural terminals | 49.69 | 4.5 | 180 | 180 | 35 |
| scenario/pair/terminal cliff後 | 13.84 | 4 | 36 | 77 | 29 |
| merge前tickets | 13.84 | 4 | 36 | 77 | 29 |
| exact merge後 | 13.84 | 4 | 36 | 77 | 29 |
| near scenario統合後 | 13.84 | 4 | 36 | 77 | 29 |
| strength allocation後 | 13.74 | 4 | 36 | 77 | 29 |
| final purchase | 3.44 | 2 | 8.7 | 20 | 0 |

29Rはfinal planを0としてpurchase-ineligibleにしたため、final分布上は20点超0。cap前の膨張はterminal cliffが不明瞭な29Rで残る。

各raceのstage count、eligibility、正解terminal survivalはresults JSONの `races[].v2Flow` と `correctSurvivalV2` に保存した。

## 5. 3-way比較

同じ保存済みclean confirmed 114R。read failure 0、protected cohort使用0。

| 指標 | CONTROL | V1 | V2 |
|---|---:|---:|---:|
| purchaseable | 93 | 80 | 85 |
| ineligible | 0 | 34 | 29 |
| cap ineligible | ― | 34 | 29 |
| avg tickets | 4.54 | 2.67 | 3.44 |
| median | 2 | 2 | 2 |
| p90 | 12.7 | 6 | 8.7 |
| max | 27 | 18 | 20 |
| 1〜3点race | 60 | 53 | 54 |
| 4〜6点race | 11 | 18 | 17 |
| 7〜10点race | 7 | 5 | 5 |
| 11〜15点race | 5 | 2 | 3 |
| 16〜20点race | 3 | 2 | 6 |
| exact hits | 15 | 14 | 17 |
| correct terminal generated | 114 | 114 | 114 |
| natural correct survived | 47 | 47 | 47 |
| final correct survived | 15 | 14 | 17 |
| investment | 51,800円 | 30,400円 | 39,200円 |
| return | 79,250円 | 69,650円 | 76,430円 |
| ROI | 152.99% | 229.11% | 194.97% |
| 1万円以上的中 | 1 | 1 | 1 |
| largest payout | 40,920円 | 40,920円 | 40,920円 |

ROI最大化は目的にせず、configはこの結果を見て変更していない。

## 6. COVER audit

| | V1 | V2 |
|---|---:|---:|
| MAIN tickets / hits | 279 / 14 | 341 / 17 |
| COVER tickets / hits | 25 / 0 | 51 / 0 |

V2 COVERはMAINと異なるscenario identityからのみ生成し、同一scenario内の2着・3着違いをCOVERにしていない。独立scenario保持量は増えたが、このcohortでは正解を追加捕捉しなかった。弱scenarioをCOVER数確保のため強制採用していない。

## 7. THICK audit

V1は0。V2はMAIN/COVER分類後の各カテゴリ内cliffにより11点、hit 1R。MAIN自動THICKや固定点数はない。V1の0は主に少点数群とカテゴリ内cliff不成立による。V2でTHICKが出たのはsingleton/multi-ticket cliffを構造上判定可能にした結果であり、増加目的の閾値調整ではない。

## 8. Warning audit

| warning | V1 | V2 |
|---|---:|---:|
| PARTIAL_DATA_MISSING | 80 | 85 |
| MANY_TICKETS | 2 | 6 |
| LOW_ODDS_VALUE | 0 | 0 |

V2はAUXILIARYなodds欠損だけではwarningを出さず、数値文字列を欠損扱いする型判定とnullを0扱いするUNKNOWN違反を修正した。それでも85/85に残ったのは、sealed lifecycle projectionが独立model supportとrole execution supportを共に保持せず、natural scoreだけが残るため。実際に相対score構成へ影響するIMPORTANT欠損なので、表示数を減らすために隠していない。解消にはproduction logic変更ではなく、将来のResearch seal projectionでpre-result evidenceを保持する必要がある。

## 9. Duplicate / consolidation audit

- V1 technical/near-duplicate observations: 4,347
- exact duplicate ticket merges: V1 0 / V2 0
- V2 near-duplicate scenario consolidations: 0
- duplicate support double-count: 0

V2はexact merge→near-scenario consolidationの順を保証したが、114Rのlegacy scenario identitiesには75%以上のticket overlapかつ同一base familyという安全条件を満たす別identityがなかった。無理な統合はしていない。

## 10. Failure cases

- cap不可は5R減っただけで29R残存。主因は29Rすべてでscenario内terminal過多・terminal cliff不明瞭。
- median 2と1〜3点raceは改善しなかった。小点数54Rは全て自然候補自体が3点以下かつ単一scenario。
- COVERは増えたがhit 0。
- missing warning常時化は実データprojection不足により未解消。
- V2 exact hitはCONTROLより2R多いが、同一cohort一回の結果であり一般化を主張しない。

## 11. Verdict

`STRUCTURE_IMPROVED_MORE_TUNING_NEEDED`

工程順、cap位置、scenario分離、THICK、正解survivalは改善した。一方、成功条件A/B/C/G/Iの一部を満たさない。次はweight/threshold tuningではなく、natural lifecycle前段が180件の平坦群または3件以下へ二極化する原因と、Research projectionのpre-result evidence欠落を直す必要がある。production採用・baseline昇格は禁止のまま。

## 安全確認

- production prediction changed: NO
- production purchase changed: NO
- production UI changed: NO
- Research baseline promoted: NO
- historical mutation count: 0
- protected cohort usage: NO
- production write: 0
- result-aware threshold/weight tuning: NO
- UNKNOWN imputation: NO（V2でnull/空文字を数値0にしない）
