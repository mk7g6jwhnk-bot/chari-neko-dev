# Terminal detail trace 品質監査

## Verdict

`TERMINAL_TRACE_AUDIT_READY`

保存済みの production baseline trace を読み取り専用で検査する監査層を追加した。予想・購入・recommendation・THICK・SHADOW の計算値や判定には接続していない。既存215Rへのbackfillとhistorical mutationは行っていない。

## 監査範囲

- terminal数を出走人数の `nP3` と比較し、欠落、重複、同一選手重複、対象外選手を検出
- rankの重複、欠番、範囲外、score降順、同点時の probability / terminal ID 順、rank indexを検査
- 現行式 `relativeProbability * 0.65 + evidenceScore * 0.35` の2項をtraceへ保存し、許容誤差 `1e-9` でfinal scoreを再構成
- first / second / third、pair、third順位、branch、scenario、line、evidence参照を照合
- evidence ID再利用を legitimate reuse / suspected / confirmed missing に分類
- prediction hash、snapshot ID、trace content hash、race key、timestamp、schemaを照合
- production baselineへのSHADOW混入と結果・払戻・実着順・決まり手・post-race tag混入を重大異常として検出
- gzip round-trip、破損gzip、partial JSON、duplicate sidecar、wrong race、保存失敗を検査

## 日次検証とartifact

日次集計に以下を追加した。

- `TRACE_COMPLETE`
- `TRACE_PARTIAL`
- `TRACE_INVALID`
- `TRACE_SAVE_FAILED`
- score / rank / evidence / hash / leakage / SHADOW contamination件数
- `traceAuditStatus`
- `traceAuditSeverity`
- `traceAuditFailures`

重大異常は `TRACE_AUDIT_FAILED` としてdaily integrityをFAILEDにする。欠損などの非重大異常は `TRACE_AUDIT_WARNING` としてtrace欄に分離する。詳細は `terminal-trace-anomalies.json` に raceKey、timestamp、rule、severity、expected、actual、terminal IDs、evidence IDsを保存する。

## UI

Validation Statusの「詳細trace」に、監査状態、完全/部分、不正/保存失敗、score/rank不整合、evidence重複疑い、hash/結果/SHADOW混入を追加した。詳細traceや内部commandは表示しない。390px以下では1列表示になる。

## 検証結果

- 正常7車trace: 210 terminal、`TRACE_AUDIT_OK`、failure 0
- raw / gzip: 1,578,882 bytes / 44,144 bytes
- 監査時間: 3車6 terminal fixtureで約0.13ms/R
- 異常注入: 37ケース PASS
- browser storage: gzip、idempotency、atomic write failure fail-open PASS
- dry-run: artifact生成、checkpoint件数不変 PASS
- frontend check: 12 / 12 PASS、JavaScript syntax error 0
- full suite: 39 / 39 PASS
- prediction hash mismatch: 0
- purchase hash mismatch: 0
- result leakage: 0
- protected final使用: 0
- historical mutation: 0

## Safety

- production prediction changed: NO
- production purchase changed: NO
- recommendation / THICK changed: NO
- weight / threshold changed: NO
- SHADOW variant changed: NO
- tuning: NO
- protected final使用: 0
- historical mutation: 0

## 運用上の制限

監査はこの変更が生成するscore reconstruction付きの新規traceで完全判定する。既存traceは再生成・backfillせず、再構成項目がない場合は `TRACE_PARTIAL` とする。今回production deployは実施していないため、productionの最初の新規trace件数と実測監査結果は次回deploy後の日次実行で確定する。
