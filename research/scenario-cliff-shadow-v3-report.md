# Scenario / Cliff CANDIDATE_V3 上流構造監査

実施日: 2026-09-12  
verdict: `UPSTREAM_STRUCTURE_IMPROVED`

## 結論

V2のrelative score、boundaryScore、scenario allocation、購入上限20点を凍結し、その入力前だけをResearch-onlyで変更した。全210 generated terminalをsemantic scenarioで整理し、1着→各1着の2着→各pairの3着を独立再評価した後にnatural boundaryを適用する。現行natural survivorは必ず保持し、追加後20点を超える場合は現行naturalへ戻すため、正解survivor喪失と30〜60点への無差別爆発はない。

同一114RでV2の1〜3点raceは54→35（19R改善）、cap不可は29→29（悪化なし）、generated correctは114/114、natural correctは47/114を維持した。exact hitも17→17。ROIは構造評価の判定材料にしておらず、追加ticketにより194.97%→139.73%となったためproduction昇格は禁止する。

## 1. 上流flow監査

各raceの `races[].v3Upstream` に raw branch/provenance、technical/semantic family、first/pair/third候補、raw/current/proposed/final natural terminal、scenario別terminal、diversity、duplication ratio、third dispersion、selector入力を保存した。正解terminalはgenerated / V2 natural / V3 natural / finalで追跡する。

- raw terminal: 全114Rで210
- raw first candidates: 全対象で7
- raw pair candidates: 全対象で42
- raw third candidates: 全対象で7
- V3 natural: mean 51.81、median 9.5、p90 180、max 180
- final: mean 4.80、median 3、p90 12.7、max 20
- independent hierarchical path採用: 26R
- explosion guard適用: 88R

rawでは1st/2nd/3rd候補が生成されているため、狭さの主因はterminal生成そのものではなく、現行natural lifecycleへの早期投影だった。

## 2. V2少点数54Rの原因（bucket重複可）

| 原因 | R |
|---|---:|
| raw branchが1つ | 16 |
| raw semantic familyが1つ | 16 |
| technical→semantic統合対象あり | 38 |
| rawは複数semanticだが現行naturalは1つ | 33 |
| 現行natural semanticが1つ | 49 |
| raw first候補が1つ | 0 |
| raw pair候補が2以下 | 0 |
| raw third候補が3以下 | 0 |
| V3で4点以上へ健全化 | 19 |

54Rすべてがscenario cliff後1scenarioであり、上流raw候補不足ではない。主因はnatural lifecycle投影が3点以下へ狭まり、複数の意味展開・pair/third再評価をselector前へ渡していなかったこと。16Rはraw段階でも単一familyで、無理に複数scenario化していない。

## 3. V2 cap不可29Rの原因（bucket重複可）

| 原因 | R |
|---|---:|
| first候補5以上 | 29 |
| pair候補20以上 | 29 |
| third候補5以上 | 29 |
| technical→semantic統合対象あり | 29 |
| 現行natural 180 terminal | 20 |
| semantic family 5以上 | 0 |

cap群はscenario family過多ではなく、少数family内でfirst/pair/thirdが平坦なまま組合せ爆発する問題だった。少点数群と同じnatural投影工程が、raceによって過剰縮小または180件保持の両極端を作っている。V3は結果非依存scoreだけで20点以下へ自然停止できない29Rを恣意的に切らず、従来どおりineligibleにした。

## 4. semantic / technical scenario監査

`scenarioTechnicalKey` はbranch/provenance IDを保持し、`scenarioSemanticKey` は initiative structure、attack family、bante response、line tracking/collapse、other-line survivalを保持する。未観測値は `UNKNOWN` のままである。

- technical scenario→semantic scenario統合: 274 race-local identities
- V2で観測されたnatural側technical/near-duplicate: 4,347
- V3がraw 210 terminalで検出した同一evidence fingerprint反復: 19,152
- exact ticket merge: 0
- V2 near-overlap merge: 0

19,152は主に同一scenario/pair配下のthird variationであり、ticket自体を消すduplicateではない。274件だけをsemantic support identityへ畳み、同じ意味のtechnical branchを独立支持として二重加点しない。意味差のあるinitiative/attack/bante/line/other-line fieldはkeyに残す。legacy projectionではそれらがUNKNOWNのため、統合結果はResearch diagnostic扱いでproduction昇格不可。

## 5. 1着→2着→3着再評価

V3は全generated terminalから、semantic scenario内のfirst group、firstごとのpair group、pairごとのthirdを順に評価する。third-variant purchase reject codeを生成入力の足切りに使わず、third boundaryはpair生成後だけに適用する。結果・払戻・着順fieldは入力禁止で、結果field混入時は例外にする。

現行natural survivorとのunionを作るため、V2 natural correct 47Rの喪失は0R。新規natural correct増加も0Rであり、このcohortでの改善は「既存正解を増やした」ものではなく、19Rの不自然な少点数化を解消した構造改善である。

## 6. CONTROL / V1 / V2 / V3

| 指標 | CONTROL | V1 | V2 | V3 |
|---|---:|---:|---:|---:|
| purchaseable | 93 | 80 | 85 | 85 |
| cap不可 | ― | 34 | 29 | 29 |
| avg tickets | 4.54 | 2.67 | 3.44 | 4.80 |
| median | 2 | 2 | 2 | 3 |
| p90 | 12.7 | 6 | 8.7 | 12.7 |
| max | 27 | 18 | 20 | 20 |
| 1〜3点race | 60 | 53 | 54 | 35 |
| 4〜6点race | 11 | 18 | 17 | 22 |
| 7〜10点race | 7 | 5 | 5 | 10 |
| 11〜15点race | 5 | 2 | 3 | 11 |
| 16〜20点race | 3 | 2 | 6 | 7 |
| exact hits | 15 | 14 | 17 | 17 |
| generated correct | 114 | 114 | 114 | 114 |
| natural correct | 47 | 47 | 47 | 47 |
| investment | 51,800円 | 30,400円 | 39,200円 | 54,700円 |
| return | 79,250円 | 69,650円 | 76,430円 | 76,430円 |
| ROI | 152.99% | 229.11% | 194.97% | 139.73% |
| MAIN tickets / hits | ― | 279 / 14 | 341 / 17 | 473 / 17 |
| COVER tickets / hits | ― | 25 / 0 | 51 / 0 | 74 / 0 |
| THICK tickets / hits | ― | 0 / 0 | 11 / 1 | 15 / 3 |

V2 single selected scenarioは78R。V3 natural single scenarioは74R、かつ「single scenario + 1〜3点」は54→33R。meaningful alternateを生成できても、20点超になる場合はguardで採用していない。

## 7. failure cases / PARTIAL_DATA_MISSING

- cap不可29Rは未解消。平坦なpair/third群を結果非依存で分ける独立supportがない。
- V3追加ticketはこのcohortでhitを増やさず、ROIを下げた。構造診断用であり購入優位性ではない。
- `PARTIAL_DATA_MISSING` はpurchaseable 85Rすべて。missing sourceはsealed lifecycle projectionの独立model support / role execution support。必要fieldはpre-result model weight、branch/role execution evidence、semantic provenance tuple。forward Research sealで保存可能だが、今回はfake supportもbackfillも行っていない。
- legacy provenanceのUNKNOWNが多く、274 semantic統合の意味確度を将来の自然生成sealで再確認する必要がある。

## 8. Verdict

`UPSTREAM_STRUCTURE_IMPROVED`

成功条件A（少点数54→35）、B（cap悪化なし）、D/E（semantic/technical分離）、F/G（generated 114・natural 47維持）、H（exact 17維持）、I（final max 20）、J（production delta 0）を満たした。cap解消と追加ticketの有効性は未達なので、production採用・baseline昇格はしない。

## 安全確認

- production prediction changed: NO
- production purchase changed: NO
- production UI changed: NO
- Research baseline promoted: NO
- historical mutation count: 0
- protected cohort usage: NO
- production write: 0
- result-aware tuning: NO
- UNKNOWN imputation: NO
