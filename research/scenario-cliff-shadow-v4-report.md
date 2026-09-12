# Scenario / Cliff CANDIDATE_V4 pair/third構造監査

実施日: 2026-09-12  
verdict: `REWORK_REQUIRED`

## 結論

V3の少点数改善を保持し、20点超のnatural群だけに `scenario → first → pair → third → terminal` の明示階層を追加した。V3/V2の既存boundaryScoreをpairとpair内thirdに適用し、固定topNやtop20 slicingは使っていない。

cap不可は29→24Rへ減ったが、natural correctが47→34Rへ13R低下した。これは「correct terminalを大きく落としてcapを減らさない」という成功条件に反する。したがってV4は診断実装として保存するが、candidateとして採用せず `REWORK_REQUIRED` とする。production/baselineへの接続は0。

## 1. 29R膨張原因

bucketは重複可。

| 原因 | R |
|---|---:|
| pair数20超 | 28 |
| third diffuse pairあり | 19 |
| same-pair third整理が発生 | 29 |
| 同一trioの順番違いあり | 29 |
| scenario間同一pair重複 | 0 |

主因はscenario family数ではなく、1scenario内を含む24〜36 pairと、各pair最大5件のthird variationである。scenario間pair重複統合は0で、technical scenarioの二重加点を消すだけではcap問題を解けなかった。

## 2. pair / third構造

- pair count/race: mean 12.19、median 4、p90 36、max 36
- pairs/scenario: mean 6.30、median 4、p90 12、max 18
- third candidates/pair: mean 2.68、median 2、p90 5、max 5
- third diffuse pairs: 248
- same-pair variation reduction: 2,500 terminals
- scenario間pair support統合: 0
- trio order diagnostics: 3,090 order variants

各pairにpairRelativeScore、pair boundary、support source、scenario independence、third count/distribution、top/second score、third cliffを保存した。崖なし複数thirdはdiffuseと明示し、固定3点/5点へ切っていない。同一trioの順番違いは意味が異なるため統合せず、order dispersion diagnosticだけを保存した。

## 3. CONTROL / V2 / V3 / V4

| 指標 | CONTROL | V2 | V3 | V4 |
|---|---:|---:|---:|---:|
| purchaseable | 93 | 85 | 85 | 90 |
| cap不可 | ― | 29 | 29 | 24 |
| avg tickets | 4.54 | 3.44 | 4.80 | 5.41 |
| median | 2 | 2 | 3 | 3 |
| p90 | 12.7 | 8.7 | 12.7 | 14.7 |
| max | 27 | 20 | 20 | 20 |
| 1〜3点race | 60 | 54 | 35 | 35 |
| 4〜6点race | 11 | 17 | 22 | 22 |
| 7〜10点race | 7 | 5 | 10 | 11 |
| 11〜15点race | 5 | 3 | 11 | 12 |
| 16〜20点race | 3 | 6 | 7 | 10 |
| exact hits | 15 | 17 | 17 | 19 |
| generated correct | 114 | 114 | 114 | 114 |
| natural correct | 47 | 47 | 47 | 34 |
| investment | 51,800円 | 39,200円 | 54,700円 | 61,700円 |
| return | 79,250円 | 76,430円 | 76,430円 | 81,730円 |
| ROI | 152.99% | 194.97% | 139.73% | 132.46% |
| MAIN tickets/hits | ― | 341/17 | 473/17 | 498/18 |
| COVER tickets/hits | ― | 51/0 | 74/0 | 119/1 |
| THICK tickets/hits | ― | 11/1 | 15/3 | 41/5 |

exact 19は事後評価値であり、natural coverage悪化を正当化しない。結果を使ったrule/threshold調整はしていない。

## 4. V3 cap不可29R個別

`correct` はV3 natural→V4 natural。

| raceKey | V3 natural | V4 natural | V4可 | pair | diffuse | third削減 | correct |
|---|---:|---:|:---:|---:|---:|---:|:---:|
| 20260909-13-11 | 180 | 155 | NO | 36 | 11 | 25 | Y→Y |
| 20260909-13-9 | 180 | 121 | NO | 36 | 0 | 59 | Y→Y |
| 20260909-13-7 | 150 | 65 | YES | 30 | 0 | 85 | Y→Y |
| 20260909-48-5 | 160 | 123 | NO | 36 | 15 | 37 | Y→Y |
| 20260909-84-7 | 180 | 66 | YES | 36 | 4 | 114 | Y→Y |
| 20260909-21-11 | 180 | 90 | NO | 36 | 0 | 90 | Y→N |
| 20260909-21-9 | 180 | 83 | NO | 36 | 5 | 97 | Y→Y |
| 20260909-74-5 | 180 | 75 | NO | 36 | 0 | 105 | Y→N |
| 20260909-37-6 | 44 | 28 | NO | 12 | 2 | 16 | Y→Y |
| 20260909-84-6 | 180 | 129 | NO | 36 | 2 | 51 | Y→Y |
| 20260909-37-5 | 180 | 52 | NO | 36 | 0 | 128 | Y→N |
| 20260909-84-3 | 180 | 112 | NO | 36 | 9 | 68 | Y→N |
| 20260909-37-1 | 150 | 65 | NO | 30 | 0 | 85 | Y→Y |
| 20260908-61-9 | 180 | 105 | NO | 36 | 8 | 75 | Y→Y |
| 20260908-27-8 | 174 | 103 | YES | 36 | 2 | 71 | Y→N |
| 20260908-27-2 | 120 | 55 | NO | 24 | 7 | 65 | Y→N |
| 20260908-26-11 | 120 | 80 | YES | 24 | 5 | 40 | N→N |
| 20260908-13-11 | 180 | 75 | NO | 36 | 0 | 105 | Y→Y |
| 20260908-13-10 | 180 | 101 | YES | 36 | 2 | 79 | Y→N |
| 20260908-26-7 | 180 | 136 | NO | 36 | 13 | 44 | Y→Y |
| 20260908-13-6 | 180 | 70 | NO | 36 | 7 | 110 | Y→Y |
| 20260908-13-5 | 142 | 115 | NO | 30 | 7 | 27 | Y→Y |
| 20260908-26-3 | 180 | 68 | NO | 36 | 0 | 112 | Y→N |
| 20260908-13-3 | 180 | 75 | NO | 36 | 3 | 105 | Y→N |
| 20260908-21-11 | 180 | 61 | NO | 36 | 0 | 119 | Y→N |
| 20260908-44-4 | 180 | 151 | NO | 36 | 8 | 29 | Y→N |
| 20260908-37-7 | 180 | 72 | NO | 36 | 3 | 108 | Y→N |
| 20260908-37-3 | 180 | 145 | NO | 36 | 13 | 35 | Y→Y |
| 20260908-37-2 | 150 | 65 | NO | 30 | 0 | 85 | Y→Y |

29R中5Rは最終selectorで20点以下になったが、cap cohortだけでもnatural correctを12R失った。改善として受け入れられない。

## 5. 少点数回帰

少点数側にはV4整理を適用していないため、median 3、1〜3点35Rを維持した。meaningful alternate pairの削除による少点数回帰はない。

## 6. Failure casesと次の必要データ

- third score cliffは2,500 variationを整理したが、正解thirdも落とした。general terminal supportとconditional third supportの分離精度が不足。
- 24〜36 pairの横並びを意味構造だけで20点以下へ落とせない。
- cross-scenario same-pair重複は0なので主要因ではない。
- 次へ進むにはsealed projectionに独立したpair support、conditional third evidence、role execution supportが必要。現在の複合relative scoreを再利用した追加圧縮は不可。
- 2車単/3連複flagはdiagnostic構造のみ。公式払戻不足のためformal ROI評価は行わず、2車単は `OFFICIAL_DATA_SOURCE_BLOCKED` のまま。

## 7. Verdict

`REWORK_REQUIRED`

pair/third構造の可視化とcap 5R減は得られたが、natural coverageの13R低下が重大。V4 ruleはproductionにもResearch baselineにも昇格しない。

## 安全確認

- production prediction changed: NO
- production purchase changed: NO
- production UI changed: NO
- Research baseline promoted: NO
- historical mutation count: 0
- protected cohort usage: NO
- production write: 0
- result-aware tuning: NO
- arbitrary top20 slicing: NO
- UNKNOWN imputation: NO
