# 展開相対スコア + 境界スコア shadow監査

実施日: 2026-09-12  
verdict: `REWORK_REQUIRED`

## 結論

scenarioを維持した相対スコア、再利用可能なcliff detector、scenario内terminal停止、独立scenario provenance付きexact-ticket統合、可変点数、20点超の購入不可、MAIN/COVER後分類、カテゴリ内THICK判定をResearch-onlyで実装した。構造はproductionから完全に分離できたが、暫定configの実測は購入不可34/114R（29.82%）、中央値2点、COVER的中0、THICK 0である。現行の過少点数問題を解消せず、別scenarioの実効coverageも不足するため採用候補ではない。

CONTROL比で投資は51,800円から30,400円へ減り、ROIは152.99%から229.11%へ上がったが、的中は15Rから14Rへ減った。このROI改善は点数圧縮と少数高払戻の影響を受け、構造採用の根拠にはしない。結果を見た閾値再調整は実施していない。

## 1. 現行方式監査

`runKeirinEngine` はpredictionとpurchaseを分離し、prediction terminal fingerprintの前後一致も監査する。production prediction自体はpurchaseで変更されない。

一方、現行purchaseは次の順で処理する。

1. 全terminalを確率順に一度sortする
2. terminalごとに確率65%・evidence35%のglobal `terminalScore` を作る
3. global positive terminal群へ自然cluster境界を適用する
4. 同一pair内third-variant gateを適用する
5. dominant branchからscenario familyを作りMAIN/COVER分類する
6. Chat Specのfamily/pair回復、MAIN invariant、budget gateを適用する
7. 採用後に資金配分し、THICK等を保存する

したがってscenario情報は消えてはいないが、最初の購入候補選別は全terminalのglobal順位が中心である。MAIN/COVERは主に選別後のscenario-originラベルであり、scenarioごとの独立quotaではない。1着・pair・third指標は監査値として分離されているが、最終購入ではterminalScore、family/pair回復、third gateへ再結合される。

主な圧縮箇所はglobal natural cluster、third variant、Chat Spec family/pair boundary、MAIN invariant、budget不足である。購入可否はstandard planが1点以上、noBetでないこと、100円×点数のbudgetがあること。現行UI信頼度・集中度・注意表示は保存済みprediction ratingを参照し、購入不可なら見送り、購入可でも品質が高以外なら注意となる。THICKは保存済みqualificationを優先する。

同一ticketの複数branch contributionは `uniqueSupportBranchCount` を持つが、現行 `weightedBranchSupport` はcontributionを合算する。近似branchが別IDなら独立性を意味的に判定せず支持が増える余地がある。

## 2. 新方式

処理順は以下に固定した。

scenario identity grouping → scenario relative score → scenario cliff → scenario内terminal relative score → terminal cliff → exact-ticket merge → 20点cap判定 → MAIN/COVER/high-payout属性 → category内THICK cliff

絶対確率は生成しない。結果・払戻はshadow plan完成後の評価関数だけで参照する。

各scenarioには `scenarioId`, `scenarioRelativeScore`, `supportEvidence[]`, `counterEvidence[]`, `independentSupportCount`, `unknownEvidenceCount`, `scenarioScoreBreakdown`, `scenarioRank` を保存する。各terminalにはfirst/pair/third/terminalの相対scoreを分離する。

exact ticket統合前にscenario independence keyを保持する。同一identity・同一relation・同一pairの近似支持はtechnical/near duplicateとして数えるが、独立scenario数へ重複加点しない。

## 3. Boundary score

各隣接順位について、局所gap、全rangeに対する分離、周辺gapに対する密度差、上位群・下位群の一貫性を0〜1へ合成する。明確なcliffが閾値を満たさなければ全候補を保持し、固定Nへ切らない。同一関数をscenario、terminal、MAIN/COVER内THICKへ使用する。

## 4. 暫定config

| 項目 | 暫定値 |
|---|---:|
| scenario boundary score | 0.56 |
| scenario relative gap | 0.12 |
| terminal boundary score | 0.52 |
| terminal relative gap | 0.10 |
| thick boundary score | 0.60 |
| thick relative gap | 0.14 |
| maximum tickets | 20 |
| MANY_TICKETS | 15 |
| LOW_ODDS_VALUE composite | 8 |
| terminal score weights | model .42 / natural .23 / branch fit .20 / pair .09 / third .06 |

これは構造確認用の一案で、結果を見た反復調整はしていない。

## 5. Shadow比較

既存監査がclean confirmedと判定済みの保存済み114Rをread-only endpointから再読込した。read failure 0。403〜502のsequence識別子に該当するrecordは評価関数で除外し、利用0。

| 指標 | CONTROL | CANDIDATE |
|---|---:|---:|
| cohort | 114R | 114R |
| purchaseable | 93R | 80R |
| ineligible | 0R | 34R |
| avg tickets/R | 4.54 | 2.67 |
| median | 2 | 2 |
| p90 | 12.7 | 6 |
| max | 27 | 18 |
| 6点以下 | 92R | 105R |
| 7〜10点 | 7R | 5R |
| 11〜15点 | 5R | 2R |
| 16〜20点 | 3R | 2R |
| 保存planで20点超 | 7R | 0R |
| natural >20で購入不可 | ― | 34R |
| exact hit | 15R | 14R |
| correct terminal generated | 114R | 114R |
| 現行natural段階に存在 | 47R | 47R |
| purchase-selected correct | 15R | 14R |
| flat100投資 | 51,800円 | 30,400円 |
| 払戻 | 79,250円 | 69,650円 |
| ROI | 152.99% | 229.11% |
| 1万円以上的中 | 1R / 40,920円 | 1R / 40,920円 |
| 最大的中払戻 | 40,920円 | 40,920円 |

## 6. Ticket / scenario coherence

- candidate scenario数: mean 2.39 / median 1 / p90 6 / max 6
- MAIN tickets: 279
- COVER tickets: 25
- exact hit内訳: MAIN 14 / COVER 0
- THICK tickets: 0 / THICK hit 0
- race confidence: level 5 = 76R、level 2 = 14R、level 1 = 24R
- technical/near-duplicate support検出: 4,347行
- exact duplicateはticket keyで1件へ統合し、同じindependence keyを二重支持にしていない

scenario median 1とCOVER hit 0は、別scenario diversityを十分保持したとは言えない。THICK 0はカテゴリ内に暫定cliffが成立しなかったためで、MAINからの自動THICKは発生していない。

## 7. Missingness / warnings

- `NATURAL_SELECTION_EXCEEDS_CAP`: 34R
- `CRITICAL_DATA_MISSING`: 0R
- `PARTIAL_DATA_MISSING`: 80R
- `MANY_TICKETS`: 2R
- `LOW_ODDS_VALUE`: 0R（保存pre-result oddsが揃わず評価不能）

missingnessはCRITICAL / IMPORTANT / AUXILIARYで保存する。UNKNOWNを中立値へ置換しない。critical欠損時もprediction/scenario/terminal出力は維持し、購入だけを止める。

## 8. Failure cases

1. 34Rでnatural selectionが20点以内へ収束せず購入不可となり、見送り過多の懸念が強い。
2. 2〜3点問題は改善せず、medianはCONTROLと同じ2点。
3. 別scenario由来COVERは25点残ったが的中0。
4. thick cliffは一度も成立せず、厚め属性の有用性を検証できない。
5. ROIは上昇したがexact hitが1R減っており、coverage改善という目的とは逆方向。
6. 最大40,920円の高払戻的中は両方式とも保持した。ただしpre-result odds欠損のため、市場価格とのズレに基づく高配当属性とLOW_ODDS_VALUEは正式比較不能。
7. 2車単はhookのみ。canonical payout欠落のためformal ROI評価から分離した。3連複もhookのみでproduction非接続。

## 9. Verdict

`REWORK_REQUIRED`

scenario-first/cliffのソフトウェア構造、結果分離、重複防止、可変点数とcap semanticsは成立した。しかし今回の暫定score/boundaryは、購入不可過多、中央値2点、別scenario/thickの実効性不足によりshadow purchase候補として不適格である。次回は結果を使わず、pre-result分布だけでscenario identityの独立性とcliffのno-cliff挙動を再設計してから、別development cohortで一案のみ評価する。

## 安全確認

- production prediction changed: NO
- production purchase changed: NO
- production UI changed: NO
- Research baseline promoted: NO
- historical mutation count: 0
- production write: 0
- protected cohort usage: NO
- result-aware/post-hoc tuning: NO
- UNKNOWN imputation: NO
