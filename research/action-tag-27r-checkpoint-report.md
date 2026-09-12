# Action-tag staged live collection checkpoint

実施日: 2026-09-12  
Verdict: `PAIR_SUPPORT_DATA_NOT_READY`

## 結論

既存20Rから安全に追加できた正常確定raceは7Rで、累積27Rとなった。50R checkpointに必要な新規正常raceがproductionにまだ存在しないため、50Rおよび100Rへは進めていない。中止等を正常raceとして混入させたり、403〜502や過去raceをbackfillしたり、fake observationで不足分を埋めたりしていない。

段階収集は10R以下のbatchを返す`nextCollectionStage`で20→50→100→300を明示した。既存独立collectorはGET only、最大30R/run、逐次処理、heap guard、append-only、duplicate-safe、restart-safe、fail-openを維持する。

## 20R baseline

- races 20、riders 155、tags 1,121
- AUTO_DIRECT 0、STRONG_PROXY 41（INITIATIVE 36 / LINE_TRACKING 5）
- manual pending 20R、race-level 5判断/R
- prediction / purchase hash mismatch 0 / 0

## 27R checkpoint（50R未達）

- races 27（追加7）、riders 201、tags 1,463
- AUTO_DIRECT 0
- STRONG_PROXY 59（INITIATIVE 51 / LINE_TRACKING 8）
- manual completed 1R、manual pending 26R
- manual completionは独立行動証拠なしを5項目すべてUNKNOWNとして保存したE2E。推測値なし
- UNKNOWN judgments 5、conflict 0
- pending placeholders 1,399（rider/state単位。実操作はrace-level queue 26R）
- tags/R 54.19、STRONG_PROXY rate 4.03%
- manual completed / pending rate 3.70% / 96.30%
- UNKNOWN rate 0.34%、evidence-missing rate 0.34%
- post-result observation rate 4.37%。結果後tagはtraining eligibleではない

### State別

| state | AUTO_DIRECT | STRONG_PROXY | manual confirmed/supported | UNKNOWN | pending |
|---|---:|---:|---:|---:|---:|
| INITIATIVE | 0 | 51 | 0 / 0 | 0 | 0 |
| LEAD_PRESSURE | 0 | 0 | 0 / 0 | 1 | 201 |
| ENERGY_STATE | 0 | 0 | 0 / 0 | 1 | 201 |
| BANTE_RESPONSE | 0 | 0 | 0 / 0 | 1 | 201 |
| LINE_TRACKING | 0 | 8 | 0 / 0 | 0 | 193 |
| ATTACK_OUTCOME | 0 | 0 | 0 / 0 | 0 | 201 |
| LINE_STATE / collapse | 0 | 0 | 0 / 0 | 1 | 201 |
| OTHER_LINE_SURVIVAL | 0 | 0 | 0 / 0 | 1 | 201 |

50R/100R checkpointは未到達のため数値を捏造せず`NOT_AVAILABLE`とする。

## Review保存品質

実race `20260912-34-6`でqueue→5回答→append-only review→resumeを確認した。各tagはraceKey、state/value、confidence=0、reviewer、reviewedAt、evidence source、POST_RESULT_OBSERVATION、UNKNOWN status、schema versionを保持する。独立証拠がないためCONFIRMED/SUPPORTEDへ昇格していない。

conflictは既存review schemaの`originalAutoCandidate / finalHumanJudgment / disagreement`として両観測を保持する。上書きせず、unit testでconflict=1の集計を確認した。

## Rider / conditional cells

201 riderすべてmin sample 10未満で`INSUFFICIENT`。選手特性の断定はしていない。usableなCONFIRMED/SUPPORTEDが0のため、実データconditional cellは0、50件到達cellも0。

## Pair-support readiness

| 項目 | evidence | usable | status |
|---|---:|---:|---|
| first-conditioned second | 59 proxy | 0 | PARTIAL |
| tracking | 8 proxy | 0 | PARTIAL |
| switch | 0 | 0 | INSUFFICIENT |
| other-line survival | 0 | 0 | INSUFFICIENT |
| bante response | 0 | 0 | INSUFFICIENT |
| positional conflict | 0 | 0 | INSUFFICIENT |

proxyはPOSSIBLEでありusable verified countへ含めない。V6開始に必要なpair固有supportは未充足。

## Gates

- independent action-tagged: 27 / 300（9.0%）
- major state >=60 usable: 0 / 8
- conditional cell >=50: 0

## Production負荷・integrity

- 追加run: attempted 24、accepted 7、excluded 17、technical failure 0
- duration: 128.0秒（API取得込み）、local append latencyは全体に包含
- local heap peak: 27,172,512 bytes。checkpoint集計は5,403,840 → 6,959,000 bytes
- local RSS checkpoint: 37,814,272 → peak/after 44,146,688 bytes
- Railway CPU/RSS/heap: 公開statusにないため取得不能
- collector/storage/browser: healthy / healthy / connected
- failureCount 0、lastError null
- 502 / 503 / timeout: 0 / 0 / 0
- restart: なし、OOM: なし。store restart/resumeはPASS
- prediction hash mismatch 0、purchase hash mismatch 0
- production runtime import/deploy/write 0

## Blocker

同日の利用可能正常raceが27Rまでで、50Rに23R不足している。また独立映像/event evidenceを自動取得するsourceがないため、主要stateのmanual verified countは増えていない。次回は新規正常raceが23R以上自然確定した後に最大10Rずつ収集し、50Rで同じcheckpointを再実行する。

## Safety

- production prediction changed: NO
- production purchase changed: NO
- production UI changed: NO
- Research baseline changed: NO
- historical mutation count: 0
- 403〜502 tuning/review use: NO
- result-derived CONFIRMED: NO
- UNKNOWN imputation: NO
- production write: 0
