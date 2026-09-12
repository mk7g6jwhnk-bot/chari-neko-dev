# Scenario / Cliff CANDIDATE_V5 pair構造監査

実施日: 2026-09-12  
verdict: `NO_IMPROVEMENT`

## 結論

不採用V4をrevertし、V3を基準にpair層だけをResearch-onlyで再設計した。sealed pre-result `lines` のfirst/second role score、line relation、line order、race内relative official score、scenario consistency、counter evidenceをpair固有scoreへ接続し、既存boundaryScoreで自然境界を探索した。third生成・third圧縮はV3のまま変更していない。

結果はcap不可29→28R、cap群pair20超28→27Rだけだった。解消した1Rでは正解pairと正解terminalを失い、全体natural correctも47→45、exact hitも17→16。pair plateauの根本原因はboundaryではなく、26/29 cap raceでpair固有のinitiative/attack/line-tracking/other-line evidenceがprojectionされず、多数pairが同等になることだった。V5はproduction/baselineへ昇格しない。

## 1. pair20超28Rの原因

bucketは重複可。

| 原因 | cap 29R |
|---|---:|
| V3 pair 20超 | 28 |
| V5 pair 20超 | 27 |
| pair cliff不成立 | 26 |
| 各firstに多数secondが残る | 28 |
| pair score差が境界を作れない | 26 |
| scenario差がpairへ十分伝播しない | 26 |
| pair counter evidence不足 | 26 |
| technical support重複が原因 | 0 |

raw firstは7、raw pairは最大42。V3 cap群では12〜36 natural pairで、28Rが20超。V5でpair scoreを作り直しても大半はno-cliffで全pairを保持した。固定Nへ切らなかったため、これは意図した安全停止である。

## 2. pairRelativeScore分解

V5の構成要素:

- firstCandidateSupport: rider roleScores.first
- secondCandidateSupport: rider roleScores.second
- lineRoleCompatibility: same-lineとcross-lineを別評価
- relativeAbility: officialScoreをrace内min/maxで相対化
- scenarioConsistency: semantic scenarioとの共存性
- pairCounterEvidence: same-line逆順、cross-line scenario矛盾、line不明

保存するがscoreへ未接続またはUNKNOWNの項目:

- initiative relationの独立値
- attack outcome compatibilityの独立値
- line tracking / switch compatibility
- other-line survivalの独立値
- position conflictの直接証拠
- first成立とsecond成立の同時成立確率

現状lifecycle rowはorder、probability、purchase status、branch ID中心で、pair固有evidenceを保持しない。lines側のrole/abilityを接続してもscenario内攻防の識別力が足りず、plateau 62R、cap群では26/29Rとなった。

## 3. same-line / cross-line

- same-line pairs: 322（23.17%）
- cross-line pairs: 1,068（76.83%）
- solo/unknown pairs: 0

same-lineはline順とrole compatibility、cross-lineはMAKURI/OTHER_LINE/SEPARATION familyとの整合性を別式で評価した。しかしcross-line側のswitch、makuri residual、other-line survivalがsealed pair evidenceとして存在せず、固定的なscenario compatibilityに留まった。このためcross-line 1,068 pairの細かな差が不足した。

## 4. CONTROL / V3 / V4参考 / V5

| 指標 | CONTROL | V3 | V4参考（不採用） | V5 |
|---|---:|---:|---:|---:|
| purchaseable | 93 | 85 | 90 | 86 |
| cap不可 | ― | 29 | 24 | 28 |
| avg tickets | 4.54 | 4.80 | 5.41 | 4.74 |
| median | 2 | 3 | 3 | 3 |
| p90 | 12.7 | 12.7 | 14.7 | 12 |
| max | 27 | 20 | 20 | 20 |
| 1〜3点 | 60 | 35 | 35 | 35 |
| exact hits | 15 | 17 | 19 | 16 |
| generated correct | 114 | 114 | 114 | 114 |
| natural correct | 47 | 47 | 34 | 45 |
| investment | 51,800円 | 54,700円 | 61,700円 | 54,000円 |
| return | 79,250円 | 76,430円 | 81,730円 | 75,310円 |
| ROI | 152.99% | 139.73% | 132.46% | 139.46% |
| MAIN tickets/hits | ― | 473/17 | 498/18 | 470/16 |
| COVER tickets/hits | ― | 74/0 | 119/1 | 70/0 |
| THICK tickets/hits | ― | 15/3 | 41/5 | 12/3 |

V4はthird圧縮を含む参考値で、V5の実装基準には使用していない。ROI・hitを見た調整はしていない。

## 5. pair diagnostics

- V5 selected pair count: median 3、p90 36、max 36
- pair20超race（全114R）: 31
- pair plateau race: 62
- UNKNOWN-heavy race: 0
- technical pair support duplicate suppression: 0
- correct pair survival: V3 62/114 → V5 54/114

UNKNOWN-heavyが0でもplateauが残るため、単純欠損率より「利用可能fieldがgeneric role/abilityに偏り、pair条件付き情報がない」ことが問題である。

## 6. cap不可29R個別

| raceKey | V3 pair | V5 pair | V3 terminal | V5 terminal | V5可 | pair | terminal | reason |
|---|---:|---:|---:|---:|:---:|:---:|:---:|---|
| 20260909-13-11 | 36 | 36 | 180 | 180 | NO | Y→Y | Y→Y | NO_PAIR_CLIFF |
| 20260909-13-9 | 36 | 36 | 180 | 180 | NO | Y→Y | Y→Y | NO_PAIR_CLIFF |
| 20260909-13-7 | 30 | 30 | 150 | 150 | NO | Y→Y | Y→Y | NO_PAIR_CLIFF |
| 20260909-48-5 | 36 | 33 | 160 | 145 | NO | Y→Y | Y→Y | PAIR_RELATIVE_CLIFF |
| 20260909-84-7 | 36 | 36 | 180 | 180 | NO | Y→Y | Y→Y | NO_PAIR_CLIFF |
| 20260909-21-11 | 36 | 36 | 180 | 180 | NO | Y→Y | Y→Y | NO_PAIR_CLIFF |
| 20260909-21-9 | 36 | 36 | 180 | 180 | NO | Y→Y | Y→Y | NO_PAIR_CLIFF |
| 20260909-74-5 | 36 | 36 | 180 | 180 | NO | Y→Y | Y→Y | NO_PAIR_CLIFF |
| 20260909-37-6 | 12 | 12 | 44 | 44 | NO | Y→Y | Y→Y | NO_PAIR_CLIFF |
| 20260909-84-6 | 36 | 36 | 180 | 180 | NO | Y→Y | Y→Y | NO_PAIR_CLIFF |
| 20260909-37-5 | 36 | 36 | 180 | 180 | NO | Y→Y | Y→Y | NO_PAIR_CLIFF |
| 20260909-84-3 | 36 | 36 | 180 | 180 | NO | Y→Y | Y→Y | NO_PAIR_CLIFF |
| 20260909-37-1 | 30 | 30 | 150 | 150 | NO | Y→Y | Y→Y | NO_PAIR_CLIFF |
| 20260908-61-9 | 36 | 36 | 180 | 180 | NO | Y→Y | Y→Y | NO_PAIR_CLIFF |
| 20260908-27-8 | 36 | 36 | 174 | 174 | NO | Y→Y | Y→Y | NO_PAIR_CLIFF |
| 20260908-27-2 | 24 | 21 | 120 | 105 | NO | Y→Y | Y→Y | PAIR_RELATIVE_CLIFF |
| 20260908-26-11 | 24 | 24 | 120 | 120 | NO | N→N | N→N | NO_PAIR_CLIFF |
| 20260908-13-11 | 36 | 6 | 180 | 30 | YES | Y→N | Y→N | PAIR_RELATIVE_CLIFF |
| 20260908-13-10 | 36 | 36 | 180 | 180 | NO | Y→Y | Y→Y | NO_PAIR_CLIFF |
| 20260908-26-7 | 36 | 36 | 180 | 180 | NO | Y→Y | Y→Y | NO_PAIR_CLIFF |
| 20260908-13-6 | 36 | 36 | 180 | 180 | NO | Y→Y | Y→Y | NO_PAIR_CLIFF |
| 20260908-13-5 | 30 | 30 | 142 | 142 | NO | Y→Y | Y→Y | NO_PAIR_CLIFF |
| 20260908-26-3 | 36 | 36 | 180 | 180 | NO | Y→Y | Y→Y | NO_PAIR_CLIFF |
| 20260908-13-3 | 36 | 36 | 180 | 180 | NO | Y→Y | Y→Y | NO_PAIR_CLIFF |
| 20260908-21-11 | 36 | 36 | 180 | 180 | NO | Y→Y | Y→Y | NO_PAIR_CLIFF |
| 20260908-44-4 | 36 | 36 | 180 | 180 | NO | Y→Y | Y→Y | NO_PAIR_CLIFF |
| 20260908-37-7 | 36 | 36 | 180 | 180 | NO | Y→Y | Y→Y | NO_PAIR_CLIFF |
| 20260908-37-3 | 36 | 36 | 180 | 180 | NO | Y→Y | Y→Y | NO_PAIR_CLIFF |
| 20260908-37-2 | 30 | 30 | 150 | 150 | NO | Y→Y | Y→Y | NO_PAIR_CLIFF |

唯一のcap解消raceはcorrect pair/terminalを落としており、成功と扱わない。

## 7. Failure cases / verdict

- pair20超は28→27のみ。
- cap不可は29→28のみ。
- correct pairは62→54、natural correctは47→45、exactは17→16。
- 少点数側はmedian 3、1〜3点35Rを維持し回帰なし。
- pair conditional evidenceが不足した状態でscore式をさらに複雑化しても、後付け自由度だけが増える。

verdict: `NO_IMPROVEMENT`

次に必要なのはthreshold tuningではなく、forward sealへfirst成立条件付きsecond support、same-line tracking/leader residual、cross-line switch/makuri residual/other-line survival、pair counter evidenceを保存すること。既存historical recordへのbackfillや推定補完は行わない。

## 安全確認

- production prediction changed: NO
- production purchase changed: NO
- production UI changed: NO
- Research baseline promoted: NO
- historical mutation count: 0
- protected cohort usage: NO
- production write: 0
- result-aware tuning: NO
- arbitrary topN: NO
- V4 third diffuse compression used: NO
