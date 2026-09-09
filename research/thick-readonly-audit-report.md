# 厚め判定 production read-only監査（2026-09-10）

## 最終判定

【厚めは多すぎるか】 **YES**。「増額する価値のある強い買い目」という意味に対して過剰。統計的な最適頻度を求めた判定ではない。

【LOW予想でも厚めが付いているか】 **YES：直近100Rで保存flag基準42R／UI再現43R**。

【注意＋厚めは何Rか】 **保存flag基準42R／UI再現43R**。

【厚めの実績】 保存flag基準：58R・60点、的中6R／6点、ticket的中率10.00%、100円flat ROI **230.83%**。

【MAIN non-thickとの比較】 93R・203点、的中8R／8点、ticket的中率3.94%、ROI **309.46%**。

【厚め判定の根本】 **RELATIVE_ONLY**。構造的な入力証拠は使用するが、採否はMAIN内の相対差であり、絶対信頼の最低条件ではない。

【結論】 **REWORK**。RELATIVE_ONLYを「強い増額推奨」として使い続ける設計は適切でない。絶対信頼の裏付けを追加する設計が必要。ただしT1/T2の一律フィルターは今回の実績で支持されず、productionへ適用しない。

## 対象と方法

- 抽出時刻：2026-09-10 07:52:53 JST。
- Volumeのlifecycle baseとrace-scoped overlayを読み取り、overlay優先でraceKeyを解決。
- 走査1139レコード、V2全282R。直近100Rと確定V2全114Rの和集合202Rについて必要項目のみ抽出。
- 直近100Rのseal時刻：2026-09-09 04:51:27〜2026-09-10 04:47:19 JST。結果日付ではなくseal時刻降順。
- 実績対象は2026-09-08〜09の114R。購入可93R、購入不可21R。
- 確定114RすべてtemporalAudit通過、verificationあり・mutationDetectedなし、sealは開始前、確定着順・払戻あり。除外0R。
- 既存の保存verificationを利用。今回、予想hashを生成元全フィールドから再計算したという主張はしない。
- 同時読取中の対象ファイルmtime変化0。補助metadataの保存predictionHash照合202/202一致。
- 抽出の後にcollectorが自然生成したレコードはこの固定コホートへ追加しない。
- production公開のpurchase-funding / prediction-ratings / prediction-storeを取得し、改行差を正規化してローカル実装との一致を確認。
- 品質ラベルは保存されていないため、保存されたbranch・terminal mass・line confidence・evidence等をproduction表示コードへ渡して復元。実際のcreateSnapshot経路でも202R全件一致。結果は品質計算に渡さない。
- raceCategory/lineModeは保存basicに202Rすべて欠落しており、productionのsealed-readと同じstandard/official_line既定値を使用。ここでの品質は「保存レースを現在の画面で開いたときの品質」。当時の別ローカルキャッシュ画面の品質を証明するものではない。
- 展開集中度は既存scenario shadow定義。HIGH：top1 mass>=0.60または1位2位差>=0.30、MEDIUM：top2>=0.70または正規化entropy<=0.72、それ以外LOW。表示星数のconcentrationとは別の指標。

## 1. distribution

主集計は保存済みthickQualified/qualificationを正とし、UI再計算で上書きしない。

| 指標 | 値 |
|---|---:|
| 対象 | 100R |
| 購入可 | 83R |
| 厚めあり | 44R |
| 厚めなし | 56R |
| 購入可・厚めなし | 39R |
| 厚めticket総数 | 53 |
| 購入可Rに対する厚め率 | 53.01% |

| 厚めticket数の分母 | mean | median | p75 | p90 | max |
|---|---:|---:|---:|---:|---:|
| 全100R（0含む） | 0.530 | 0 | 1 | 1 | 5 |
| 購入可83R（0含む） | 0.639 | 1 | 1 | 1 | 5 |
| 厚めあり44Rのみ | 1.205 | 1 | 1 | 1 | 5 |

## 2. quality cross-tab

| 予想品質 | 全R | 購入可R | 厚めありR | 厚め点数 | 購入可内厚め率 |
|---|---:|---:|---:|---:|---:|
| HIGH（高） | 7 | 7 | 2 | 2 | 28.57% |
| MEDIUM（中） | 0 | 0 | 0 | 0 | — |
| LOW（低） | 93 | 76 | 42 | 51 | 55.26% |

厚め44Rの95.45%がLOW。高品質の方が厚めになりやすい設計にはなっていない。
LOW厚め42Rの内訳はconfidence/concentration星数で2/4が20R、2/1が21R、3/2が1R。

| 表示判定 | 厚めありR |
|---|---:|
| 通常（実UIラベルは「購入可」） | 2 |
| 注意 | 42 |
| 見送り | 0 |

| canPurchase | 厚めありR |
|---|---:|
| true | 44 |
| false | 0 |

購入不可＋保存厚めflagは抽出202R全体でも0。gateで0へ丸める前のflag自体を確認。

## 3. concentration cross-tab

| 展開集中度 | 全R | 購入可R | 厚めありR | 厚め点数 | 購入可内厚め率 |
|---|---:|---:|---:|---:|---:|
| HIGH | 72 | 68 | 36 | 42 | 52.94% |
| MEDIUM | 8 | 6 | 2 | 2 | 33.33% |
| LOW | 20 | 9 | 6 | 9 | 66.67% |

LOW concentrationでも購入可9R中6Rに厚め。ただし後述の実績ではLOW concentration厚めのROIは弱くない。

## 4. current thick logic

`public/purchase-funding.mjs` のqualifyThickPredictionBets:

1. noBet、allowThick=false、canPurchase=falseなら空。
2. MAINのみ。MAIN2点以上、正スコア2点以上が必要。
3. probabilityとnaturalConvergenceScoreが正であることを要求。
4. これらにglobal/family/pair rankの逆数、存在する正のnodeConditionalProbability・scenarioCoherence・branchFit・naturalSeparation（上限1）を加え、幾何平均を取る。
5. スコア降順の隣接差からmedian・MADを計算し、相対的な段差より上を厚めsubsetとする。
6. 4点以下では最大段差>次点段差×1.8。それ以外では段差>median+2.5×1.4826×MAD。
7. 絶対スコア下限、校正済み的中確率下限、品質・集中度の最低条件はない。oddsは厚め採否後の資金配分優先度にのみ使う。

**根本原因：MAIN2点なら次点段差が0のため、正スコアに差があるだけで上位1点が厚めになる。** 合成スコア約1e-12対1e-14でも再現。
直近の厚め44R中30R（68.18%）がMAIN2点、36R（81.82%）がsmall-sample規則。弱いレースの「相対的に一番マシ」を通す構造である。

保存flagと保存planの全証拠による再計算は202R全件一致。前回懸念した保存圧縮によるbranchFit欠落は、このVolumeの抽出対象には当てはまらない。

### UIだけ厚めが増える別の原因

`public/prediction-store.mjs` のselectionRowsはbranchFit/naturalSeparationをsnapshotへ渡さない。UIは保存flagを表示するのではなくderiveThickBetsで再計算するため、幾何平均の要素が減り、境界が変わる。
実createSnapshot経路で次の4Rに保存上はない厚めが追加された（結果はすべて外れ）。

| raceKey | 保存厚め | UI追加厚め |
|---|---|---|
| 20260909-61-6 | なし | 4-1-2 |
| 20260909-44-8 | なし | 1-5-3 |
| 20260909-21-7 | なし | 1-5-3 |
| 20260908-13-9 | なし | 5-1-4 |

直近100Rに含まれる追加は1R。UI再現は厚め45R・54点、LOW＋厚め43R・注意＋厚め43R。確定114RのUI再現は62R・64点・6的中、投資6400円・払戻13850円・ROI216.41%。保存flag実績とは区別する。
この不一致もREWORK理由。修正は今回行っていない。

### MAIN内相対順位の比較

直近の厚めあり44Rに限定し、同じレースのMAIN同士で比較したticket加重平均。

| 指標 | THICK 53点 | MAIN non-thick 102点 |
|---|---:|---:|
| MAIN内qualification score順位 | 1.34 | 5.27 |
| terminal global rank | 2.64 | 6.92 |
| 保存pairRank | 1.04 | 1.58 |
| 派生first mass順位 | 1.13 | 1.40 |
| 派生pair mass順位 | 2.23 | 3.34 |
| terminal model weight | 0.010675 | 0.009679 |
| naturalConvergenceScore | 0.36814 | 0.36685 |
| qualification score | 0.37177 | 0.26521 |
| scenarioFamilySupport | 0.54305 | 0.70139 |
| branchFit | 0.97648 | 0.92660 |
| natural survivor内順位 | 2.64 | 6.92 |

相対順位とqualification scoreは明確に上だが、terminal weight差は平均で約10%、自然収束スコア差は約0.00129。scenario supportはむしろ厚め側が低い。これを独立した絶対信頼の証明とは扱えない。
保存firstRankは欠落しているため推測で補わず、既存lifecycle terminal massをfirst/pair単位に合計した派生順位を別列で示した。保存pairRankはpair内順位であり、派生pair mass順位と同義ではない。
natural survivorは既存ADOPTED/THIRD_VARIANT_AMBIGUITY/THIRD_VARIANT_BOUNDARY集合。内部でweight降順に並べた位置を報告し、natural boundary自体は変更していない。
各race・MAIN ticketのscore要素、境界gap・threshold・subset位置・branch supportはJSONのticketDiagnosticsに保存。

## 5. thick performance

| 指標 | THICK |
|---|---:|
| 結果・時系列要件を満たすV2 | 114R |
| eligible races（購入可） | 93R |
| thick races | 58R |
| thick tickets | 60 |
| hit races | 6 |
| ticket hits | 6 |
| race hit rate（6/58） | 10.34% |
| ticket hit rate（6/60） | 10.00% |
| investment | 6000円 |
| return | 13850円 |
| ROI | 230.83% |

### quality別

| quality | thick R | 点数 | hit R/点 | race hit rate | ticket hit rate | 投資 | 払戻 | ROI |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| HIGH | 6 | 6 | 2/2 | 33.33% | 33.33% | 600円 | 1250円 | 208.33% |
| MEDIUM | 0 | 0 | 0/0 | — | — | 0円 | 0円 | — |
| LOW | 52 | 54 | 4/4 | 7.69% | 7.41% | 5400円 | 12600円 | 233.33% |

LOWは的中率が低いが、ROIではHIGHを下回っていない。HIGHは6点しかなく、LOWが統計的に明確に劣るとは断定できない。

### concentration別

| concentration | thick R | 点数 | hit R/点 | race hit rate | ticket hit rate | 投資 | 払戻 | ROI |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| HIGH | 45 | 46 | 4/4 | 8.89% | 8.70% | 4600円 | 8490円 | 184.57% |
| MEDIUM | 2 | 2 | 0/0 | 0% | 0% | 200円 | 0円 | 0% |
| LOW | 11 | 12 | 2/2 | 18.18% | 16.67% | 1200円 | 5360円 | 446.67% |

「LOW concentration厚めは成績も弱い」という仮説は今回支持されない。低集中を除く固定ゲートを推奨する根拠にしない。

## 6. non-thick MAIN performance

| 指標 | MAIN non-thick |
|---|---:|
| eligible races | 93R |
| bet races | 93R |
| tickets | 203 |
| hit races / ticket hits | 8 / 8 |
| race hit rate | 8.60% |
| ticket hit rate | 3.94% |
| investment | 20300円 |
| return | 62820円 |
| ROI | 309.46% |

厚めあり58Rに揃えた比較でもMAIN non-thickは113点・6的中、投資11300円・払戻55070円・ROI487.35%。この比較でのTHICKは60点・6的中・ROI230.83%。
ただしMAIN non-thickの最大払戻1件が40920円で、全体払戻62820円の65.14%を占める。2日分の標本で将来優位を断定しない。
100円flat比較は「厚めの実際の増額倍率」の検証ではない。固定予算での増額便益には、校正済み確率・購入時odds・配分変更による損益とリスクの検証が別途必要。

## 7. shadow candidates

結果を見る前から固定したT0/T1/T2だけを評価。閾値探索、weights変更、T3の後付けは行わない。

- T0 CONTROL：保存厚め集合。
- T1：購入可＋予想品質HIGH/MEDIUMだけ厚め。
- T2：T1＋展開集中度HIGH/MEDIUM。

| 案 | 直近100の厚めR/点 | 確定の厚めR | 確定点数 | hit R/点 | 投資 | 払戻 | ROI |
|---|---:|---:|---:|---:|---:|---:|---:|
| T0 | 44/53 | 58 | 60 | 6/6 | 6000円 | 13850円 | 230.83% |
| T1 | 2/2 | 6 | 6 | 2/2 | 600円 | 1250円 | 208.33% |
| T2 | 2/2 | 6 | 6 | 2/2 | 600円 | 1250円 | 208.33% |

T1/T2は同じ結果。54点を外し、厚め対象の的中4件・100円flat払戻12600円を失う。削減点のROI自体は233.33%。ROI差はT0比-22.50ポイント。

| 外すと厚め対象から失う的中 | order | 100円払戻 |
|---|---|---:|
| 20260909-13-12 | 5-1-4 | 4030円 |
| 20260909-21-9 | 3-7-2 | 620円 |
| 20260908-13-8 | 2-1-4 | 3210円 |
| 20260908-37-4 | 4-5-3 | 4740円 |

これは「厚め対象から外れる的中」であり、MAINの買い目を削除する案ではない。実際の購入的中自体は維持される。これらが本来増額すべき買い目だったかは、結果だけでは判定しない。

## 8. candidate decision

| 判定軸 | 結論 | 根拠 |
|---|---|---|
| A. 頻度 | TOO_HIGH | 購入可の53%、厚めの68%が2点MAINでほぼ自動選出 |
| B. 品質整合 | BAD | 厚め44R中42RがLOW。絶対信頼ラベルとしての整合性 |
| C. LOW品質厚め | TOO_MANY | 低品質購入可の55%。成績不良の断定ではなく意味上の判定 |
| D. 注意＋厚め | 誤解を招く | LOW・注意でも強い増額推奨に見え、UI独自追加もある |
| E. qualification | RELATIVE_ONLY | 入力には証拠があるが採否の最低絶対信頼条件がない |

**結論：REWORK。** 相対順位による資金配分優先という狭い意味なら現ロジックを説明できるが、ユーザーの求める「資金を増やす価値のある強い買い目」と同じ意味にはできない。

絶対信頼条件の追加は必要。ただし現行の幾何平均scoreへ適当な固定値を追加することは推奨しない。まず保存された厚め判定とUI表示の一致を設計要件とし、次に事前情報だけで校正したterminal/first/pair confidenceや増額時の期待損益を、新しいholdoutで検証する。今回の114Rへ閾値を合わせない。

T1：REJECT（的中対象減、ROI悪化）。T2：REJECT（T1と同じで追加利益なし）。良い案は確認できず、SHADOW_THICK_CANDIDATE_ONLYとして採用候補は登録しない。shadow比較結果のみ保存。

productionWriteAllowed: false

autoPromotion: false

## 9. safety / cleanup

- prediction changed: NO
- purchase gate changed: NO
- Research changed: NO（weights・実行系未変更。researchフォルダ内の独立監査成果物のみ追加）
- natural boundary / third variant / AMBIGUITY_ONE / DB relative candidate / scenario provenance changed: NO
- raw mutation: 0
- seal mutation: 0
- result mutation: 0
- audit history mutation: 0
- production data writes: 0
- result leakage into qualification/shadow rules: 0
- production deploy / push: NO

抽出202Rすべてで結果着順・払戻を差し替えても、品質・集中度・ticket・資格境界が不変。100円flat値を別集計で照合。単体テスト、構文検査、diff検査を実施。

Volume上のプログラムはPythonをstdinで実行し、ファイル作成・store更新API・予想再実行は使用していない。JSONの構造を読むためlifecycleファイルのバイト列は走査するが、利用・ローカル出力は厚め監査用の限定項目のみ。Research shadow storeやraw取得記録、audit historyは参照しない。

Railway制御面の一時公開鍵登録・削除はユーザーの明示許可範囲。productionデータ書込み0と、この認証操作は区別する。
前回は承認レビューの利用上限で中断し、登録鍵が再開まで残った。再開後に抽出を完了し、Railway画面の「You have no SSH keys yet」で登録鍵残存0を確認。秘密鍵・tokenの表示はしていない。

- Railway登録一時SSH鍵：削除済み、0
- ローカル秘密鍵・公開鍵・known_hosts：削除済み、0
- リモート監査一時ファイル：作成なし、該当prefix残存0を読み取り確認
- ローカル一時抽出JSON・コードコピー・実行補助：専用一時ディレクトリごと削除済み、残存0。作業ディレクトリ内の一時パス記録も削除済み
- 恒久成果物：このレポート、集計・ticket診断JSON、read-only exporter、監査コード、テスト

## 10. report / commit

- `research/thick-readonly-audit-report.md`：本報告
- `research/thick-readonly-audit-results.json`：全集計、失う的中、各MAIN ticketの診断
- `research/thick-readonly-volume-export.py`：Volumeを更新しない限定項目exporter（stdout）
- `research/thick-readonly-audit.mjs`：保存flag基準の集計とUI経路再現
- `tests/thick-readonly-audit.mjs`：合成再現・gate・非破壊・結果非依存の検証

実行例：`python3 -B - < research/thick-readonly-volume-export.py`（SSH先でstdin実行）、`node research/thick-readonly-audit.mjs <export.json>`（ローカル）。抽出ファイルは検証後削除し、出力を入力自身へリダイレクトしない。
この5ファイルだけをcommitし、他の作業中変更は含めない。commit IDは最終応答に記載。
