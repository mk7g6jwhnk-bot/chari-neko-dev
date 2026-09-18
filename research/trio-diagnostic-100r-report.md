# 100R固定cohort 三連複仮想診断

実行日: 2026-09-18 JST  
Verdict: **TRIO_SIGNAL_STRONG_ENOUGH_TO_STUDY**

## 結論

三連単の実購入的中は7Rだった。購入済みMAIN/COVER券を順不同の三連複へ変換すると16Rで結果3人と一致し、うち9Rは **TRIFECTA_MISS_TRIO_HIT** だった。予測内の既存meaningful terminalまで広げるとactual trioは51Rに存在した。着順より3人選択に強い余地は記述的に確認できるが、三連複払戻が保存されていないためROIや導入価値は判定していない。

## integrity

- 6a8abd0 / 8beb84b固定cohort: 100R、race key・順序完全一致
- duplicate: 0
- result available: 100
- protected final: 0
- prediction hash mismatch: 0
- purchase mismatch: 0
- sealed result mismatch: 0
- historical mutation: 0
- result-aware score作成: 0
- production prediction/purchase変更: なし
- tuning: なし

trio rankには、結果確定前に保存されたterminal probabilityのうち各順不同3人組で最大の値だけを使用した。permutationは1組へ統合し、同一branch supportは一度だけ数えた。結果からthresholdやscoreは作成していない。

## 全100R

| 指標 | 結果 |
|---|---:|
| 三連単的中 | 7R |
| exact trio generated | 100R / 100.0% |
| meaningful exact trio | 51R / 51.0% |
| trio Top1 / Top3 / Top5 / Top10 | 13 / 31 / 44 / 63R |
| purchase-derived trio hit | 16R |
| TRIFECTA_MISS_TRIO_HIT | 9R |
| internal meaningful trio only | 35R |
| 2-of-3 only | 36R |
| upstream trio miss | 13R |
| meaningful trio候補数 avg / median / p90 | 15.71 / 3 / 35 |

排他的分類は、A=三連単購入的中、B=三連単不的中かつ購入派生trio的中、C=購入外だがmeaningful内にactual trio、D=meaningful候補で最大2人一致、E=それ未満、F=結果不備の順で適用した。結果はA/B/C/D/E/F = **7/9/35/36/13/0R**。

prediction distanceのP3は55Rで、そのうちactual trio自体がmeaningfulだったのは51R。P3は3人が別々のmeaningful terminalに現れるだけでも成立するため、4Rはexact meaningful trioではなかった。

## 同じ3人・着順違い

- 購入派生trio一致かつ三連単不的中: 9R
- 1-2着逆転・3着同一: 4R
- その他permutation: 5R
- actual trio meaningfulだが購入外: 35R
- P3だが三連単不的中: 48R
- actual trioを複数meaningful permutationが支持: 46R

## 低点数56R

| 指標 | 結果 |
|---|---:|
| exact trio generated / meaningful | 56 / 17R（meaningful 30.36%） |
| trio Top1 / Top3 / Top5 | 8 / 18 / 27R |
| purchase-derived trio hit | 8R |
| TRIFECTA_MISS_TRIO_HIT | 5R |
| purchase-derived unique trio | 125点 |
| meaningful候補数 avg / median / p90 | 5.48 / 1 / 26 |

低点数群は候補圧縮が強い一方、meaningful exact trio率は全体51%より低い。現段階では「3人選びが特に強い」とは言えず、点数圧縮効果を含む結果として扱う。

## actual final purchase分類

| 区分 | race単位unique trio tickets | trio hit races |
|---|---:|---:|
| MAIN | 178 | 13 |
| COVER | 146 | 6 |
| MAIN+COVER | 275 | 16 |
| THICK | 60 | 6 |

MAINとCOVER間で同じtrioがあるため単純合計とcombinedは一致しない。分類には6a8abd0で修正したactual final purchased ticketを使用し、internal candidateは含めていない。

THICKはtrio一致6Rで、うち5Rは三連単着順違い。THICK unique trio 60点のうち、結果3人中2人一致は29点、2人未満は25点だった。増額判断や閾値調整には使用していない。

## 候補セットと払戻

- A 全meaningful trio: 1,571 race-ticket、51R的中
- B natural boundary/cliff: 保存情報から固定済みtrio境界を特定できず `DATA_NOT_AVAILABLE`
- C actual purchase-derived: 275 race-ticket、16R的中
- D 低点数購入派生: 125 race-ticket、8R的中

固定cohortのsealed resultには三連単払戻だけがあり、公式三連複払戻はない。三連単払戻からの推測は禁止したため、仮想investment・return・ROIはすべて **DATA_NOT_AVAILABLE**。

## 次の推奨

同じ定義のまま150R/200Rへ継続し、公式三連複払戻をresult-aware leakageなしで取得できる別sourceが整った時点で、初めて仮想ROIを評価する。現時点ではResearch継続候補であり、production導入判断ではない。
