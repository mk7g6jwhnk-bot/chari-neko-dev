# 全terminal詳細trace 保存基盤

Verdict: **TERMINAL_DETAIL_TRACE_READY_WITH_LIMITS**

## 実装範囲

- 適用対象は実装後に自動収集される新規raceのみ。過去300Rは更新・再生成しない。
- production prediction / purchaseの計算完了後、その出力をResearch観測用traceへコピーする。traceは計算経路へ戻さない。
- 公開prediction payloadからtraceを分離し、gzip transportでbrowser serviceへ渡す。
- prediction seal確定後、prediction hashをキーにgzip sidecarへ保存する。sidecar失敗は `TRACE_SAVE_FAILED` として記録し、sealと予想本体は成功させる。
- Research専用・認証必須read endpointから日次検証だけが取得する。production予想UIへ詳細は出さない。

保存する主な情報は、全terminalの順位・score・scenario/branch、first/second/third conditional、pair directionとcompatibilityの分離値、scenario score/support/counter、score構成と累積値、evidence ID、branch contribution table、当時の印、Top10比較用indexである。`PRODUCTION_BASELINE` と `SHADOW_VARIANT_ID` は別フィールドで管理する。

## 容量・性能

syntheticの7車210 terminalと9車504 terminalで測定した。

| 条件 | raw | gzip | 圧縮後/raw |
|---|---:|---:|---:|
| 7車 / 210 terminal | 1,509,267 bytes | 42,747 bytes | 2.83% |
| 9車 / 504 terminal | 3,428,401 bytes | 86,273 bytes | 2.52% |

9車の保守的上限で、100Rは約8.63MB、1000Rは約86.27MB。80R/日を30日保存する場合は約207MB/月。実運用は7車raceを含むため、この上限より小さくなる見込み。

9車fixtureの10回中央値はbaseline 129.27ms、trace ON 144.68msで、trace構築差は15.41ms。別測定ではJSON serialization 59.68ms、gzip 26.23ms、ローカルatomic write相当 1.99ms。browser/公式取得時間を含まないsynthetic測定で、予想応答前のgzip transport生成までを含む追加CPU時間は概ね100msである。

## 日次診断

結果確定後、保存済みtrace内のexact terminalとTop10を直接比較し、要素別score gap、dominant cause、rank impact、score impact、far missを生成する。結果からpredictionを再生成せず、traceが無い既存raceは `UNKNOWN` のまま扱う。

Validation Statusには次だけを表示する。

- 詳細trace 保存数 / 対象数
- 寄与診断可能数
- UNKNOWN数
- 遠距離miss診断数
- coverage率

## Integrity

- production prediction changed: NO
- production purchase changed: NO
- recommendation changed: NO
- THICK changed: NO
- historical mutation: 0
- protected final used: 0
- result leakage: 0
- prediction hash mismatch: 0
- purchase hash mismatch: 0

## 検証

- 全terminal rank/score、first/pair/third/scenario/counter/evidence/composition: PASS
- exact terminal vs Top10: PASS
- gzip round-trip / idempotent sidecar: PASS
- trace保存失敗時のprediction seal fail-open: PASS
- PRODUCTION/SHADOW分離: PASS
- daily dry-run checkpoint不変: PASS
- browser service check: PASS
- frontend/research full suite: 38 PASS / 0 FAIL

## 制限

- 実装前の300R、とくにtrace不足215Rは補完しない。
- pair compatibilityは現行engineが保持するfactor/classificationを保存する。未校正・UNKNOWNの項目を新しい評価値で補わない。
- 保存後の実raceでのcoverageはdeploy後に増え始めるため、このcommit時点の実race coverageは0R。
