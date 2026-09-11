# 2車単購入性能 read-only監査

実施日: 2026-09-11  
判定: `MORE_DATA_REQUIRED`  
参考副判定: `THIRD_SELECTION_IS_MAIN_BOTTLENECK`（status-clean参考cohort内に限定）

## 結論

厳格な正式cohortは **0R**。既存sealed-result projectionは3連単払戻だけを保持し、2車単canonical払戻は93/93Rで欠落していた。また `confirmed` とは別の事故・失格・返還監査metadataも公開read projectionに保持されておらず、「異常レース完全除外」を証明できない。したがって2車単ROI、高配当pair、production採用可否を正式KPIとして算出しない。

一方、result complete・purchase eligibility known・3連単払戻あり・status上cancel/refundでない93Rを、結論を調整しない **status-clean参考cohort** として集計した。2車単候補は保存済みstandard 3連単の1-2着を重複排除して復元した。

- 2車単参考的中率: **30/93 = 32.26%**
- 3連単参考的中率: **15/93 = 16.13%**
- 2車単は3連単のちょうど2.0倍。ただし異常監査と2車単払戻がないため「正式に明確」とは判定しない。
- 3連単外れ・2車単的中: **15R (16.13%)**
- 3連単的中・2車単外れ: **0R**（同一standard terminalからpair化する定義上、3連単hitは必ずpair hitを含む）
- pairだけ合った15Rは全て正解terminal自体は生成済み。13Rがstandard purchase圧縮、2Rがthird-variant段階で落ちた。

## Cohortとデータ完全性

| 項目 | 件数 |
|---|---:|
| 既存confirmed cohort読取 | 114R |
| read failure | 0R |
| purchase不可 | 21R |
| status-clean参考cohort | 93R |
| 事故・失格の独立監査metadataあり | 0R |
| canonical 2車単払戻あり | 0R |
| 正式cohort | **0R** |

対象は2026-09-08〜2026-09-10のため、直近7日・30日・累積は同じ93Rになる。403〜502 final testの内容によるrule選択・threshold tuningは行っていない。

## 参考基本成績

| 指標 | 2車単（参考） | 3連単（参考） |
|---|---:|---:|
| 対象race | 93 | 93 |
| 購入候補race | 93 | 93 |
| tickets | 325 | 518 |
| 平均tickets/R | 3.49 | 5.57 |
| 的中race | 30 | 15 |
| 的中率 | 32.26% | 16.13% |
| ticket hit rate | 9.23% | 2.90% |
| 投資 | 算出禁止 | 51,800円 |
| 払戻 | 保存なし | 79,250円 |
| ROI | **算出不能** | 152.99% |

3連単の数値も正式KPIではなく、同じstatus-clean参考cohort上の比較値である。

## Head-to-head

| 分類 | R | 割合 |
|---|---:|---:|
| 3連単hit・2車単hit | 15 | 16.13% |
| 3連単miss・2車単hit | 15 | 16.13% |
| 3連単hit・2車単miss | 0 | 0.00% |
| 両方miss | 63 | 67.74% |

3連単miss・2車単hitの15Rは、そのまま「pairは合っていたが3着で落ちたrace」である。

## Pair lifecycle

| 段階 | 正解pairが存在したR | 93R比 |
|---|---:|---:|
| generated terminal群 | 93 | 100.00% |
| natural boundary後 | 45 | 48.39% |
| MAIN | 26 | 27.96% |
| COVER | 4 | 4.30% |
| 復元2車単購入候補 | 30 | 32.26% |

generated 100%は成立可能terminalの全保持によるもので、pair modelの強さを単独では示さない。保存read projectionにはpair mass rankがなく、rankingの平均順位は算出不能。観測できる範囲では、生成不足ではなくnatural/purchase圧縮が主要な減少点である。

## Pair → third

pair-only 15Rで正解pairを固定し、保存済み同pair terminal順位に対して全race共通の固定third幅を適用した参考coverage：

| third幅 | 回収R | 15R中 | tickets |
|---|---:|---:|---:|
| Top1 | 0 | 0.00% | 15 |
| Top2 | 3 | 20.00% | 30 |
| Top3 | 7 | 46.67% | 45 |
| Top4 | 10 | 66.67% | 60 |
| Top5 | 15 | 100.00% | 75 |

正解terminalは15/15Rで生成済み。drop分類はstandard purchase 13R、third variant 2R、未生成0R。よってpair-hit subsetでは3着選定・購入圧縮が主ボトルネック。ただし各3連単払戻を固定third戦略へ割り当てる正式設計と2車単払戻がないため、shadow ROIは算出しない。

## 区分・会場

正解pair 30Rの内訳はMAIN 26R、COVER 4R。THICK相当・HIGH_PAYOUT pairは、2車単用canonical分類・pre-result 2車単oddsがないため集計不能。race classもread projectionに保持されず、ガールズ/予選/特選/準決/決勝別は算出不能。

西武園（venueCode 26）は参考cohort **2/7 = 28.57%**。手動例の7/7は再現せず、かつn=7の小標本である。全会場がn<20なので会場差は結論に使わない。

## 高配当pair

50倍/100倍/300倍/500倍以上の生成数・hit数は **NOT EVALUABLE**。保存済みterminal oddsは3連単用で、2車単pre-result oddsとして転用できない。540倍例についてもcanonical 2車単払戻、異常race判定、事前2車単候補snapshotの三点が同時に確認できないためcase studyへ採用しなかった。

## Shadow候補

- P1 2車単単独: hit-rate監査のみ有望。ROI不明のためshadow liveへ進めない。
- P2 Hybrid: calibrated pair confidenceとthird confidenceが保存されていないため未評価。
- P3 Pair + fixed third spread: Top3で7/15、Top5で15/15をcoverageできるが、点数増とROIを正式評価できない。

次に必要なのはrule tuningではなく、自然生成される新規recordへ次を保存すること：canonical 2車単候補、pre-result 2車単odds、公式2車単払戻、独立incident/返還/失格flag、pair mass rank、pair confidence、third confidence、race class。少なくとも異常監査済み・払戻完備100R、できれば300Rで再評価する。

## 必須8問への回答

1. 的中率は参考値で32.26%対16.13%と高いが、正式cohort 0Rなので確定不可。
2. 2車単ROIはcanonical払戻欠落により不明。3連単参考ROIは152.99%。
3. 3連単外れ・2車単的中は15R。
4. 15Rすべて正解terminal生成済みで、13R standard圧縮、2R third variant。3着側に集中。
5. 全生成は強いが全terminal保持の効果。natural残存45/93、購入pair hit30/93、rank欠落のためpair ranking自体の強さは未確定。
6. 主力候補への昇格価値はまだ判定不可。shadow liveも払戻・異常flag完備後。
7. pair confidenceとthird confidenceは分離すべき。pair-only 15Rが直接の根拠。
8. Top3〜5 third拡張にcoverage余地はあるが、万車・高配当ROIは保存odds不足で未確認。

## 安全確認

- prediction ranking changed: NO
- production purchase changed: NO
- Research baseline changed: NO
- historical mutation: 0
- abnormal race included in formal KPI: NO
- 403〜502 tuning use: NO
- production write: 0
