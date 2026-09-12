# Action-tag continuous collection report

## Verdict

`CONTINUOUS_COLLECTION_READY_WITH_LIMITS`

Research-only の低頻度 scheduled scan を実装した。production の lifecycle/status、保存済み prediction、sealed result は read-only で参照し、action-tag はローカル Research store にだけ append-only 保存する。production prediction、purchase、UI、Research baseline には接続していない。

制限はデータ量である。自動収集経路は動作しているが、usable な human-reviewed state と conditional cell はまだ 0 であり、pair-support V6 を開始できない。

## Architecture and scan mode

- 実行単位: `npm run research:action-continuous`
- 方式: production lifecycle に hook を追加せず、独立した Research scheduled scan を1回実行する one-shot worker
- 推奨 cadence: 15分 (`ACTION_TAG_SCAN_INTERVAL_MS=900000`)
- 安全下限: 5分。設定値が短くても 300,000 ms へ丸める
- 1 scan 最大10R、逐次処理、event-loop yield、heap guard 192 MiB
- 502/503/timeout は1回だけ retry。失敗は分類して checkpoint に残し、production へ伝播させない
- kill switch: `ACTION_TAG_COLLECTION_ENABLED=false`

外部 scheduler は上記 one-shot command を15分間隔で起動すればよい。固定の秒単位 polling や production runtime hook は導入していない。

## Eligibility and duplicate guard

`isActionTagCollectionEligible` に対象判定を集約した。canonical raceKey、`RESULT_CONFIRMED`、enrollment 後に自然確定した race、未収集、protected cohort 外をすべて満たす場合だけ収集する。同一 raceKey の既存 event を先に確認し、保存は既存 `appendEvent` の exclusive-create を使うため、再実行時の duplicate append は 0 である。

403〜502 comparison の protected cohort は除外する。既存raceの更新やbackfillは行わず、resultからCONFIRMEDを生成しない。

## Checkpoints and milestones

scan ごとに `research/action-tag-live-data/continuous/checkpoints/` へ immutable snapshot を追加する。race数が変わらなくてもmanual review進捗を再集計する。50R、100R、200R、300Rの初回到達時だけ `continuous/milestones/` へ別snapshotを保存し、既存milestoneは上書きしない。

snapshotにはrace/rider/tag、DIRECT/STRONG_PROXY、manual completed/pending、UNKNOWN/conflict、state別進捗、conditional cell、pair-support readiness、CPU/heap/RSS、fetch/storage latency、health、502/503/timeout、hash regressionを含む。`LINE_COLLAPSE` の進捗は現行schemaの `LINE_STATE=COLLAPSED` として集計する。

## Manual queue and readiness

新規raceの既存review caseをそのままqueue対象にする。raceKey単位で重複せず、review eventがあるraceはpendingから外れ、UNKNOWN回答もcompletedとして再表示しない。race eventとreview eventはいずれもappend-onlyなのでrestart後も再開でき、順序はraceKeyで安定する。

pair-support判定はfirst-conditioned second、tracking、switch、other-line survival、bante response、positional conflictを `READY / PARTIAL / INSUFFICIENT` で更新する。300R、major state各60、conditional cell各50のgateは維持し、自動昇格は行わない。50R/100R milestoneでも評価だけを保存し、READYでなければV6を開始しない。300R到達時もreview候補になるだけである。

## Live validation

2026-09-12のproduction read-only scanでは、開始時27Rから新たに自然確定した3Rを自動検出してappendし、30Rへ進んだ。prediction/purchase hash mismatchは0、production writeは0、historical mutationは0だった。

直後の再scanは accepted 0 の正常no-opとなり、30R/1,616 tagsを維持した。既収集30Rは検出段階でskipされ、race eventのduplicate appendは0だった。manual queueもcompleted 1R / pending 29Rのまま維持された。

| metric | result |
|---|---:|
| tagged races | 30 |
| riders | 222 |
| tags | 1,616 |
| AUTO_DIRECT | 0 |
| STRONG_PROXY | 65 |
| manual completed / pending | 1 / 29 |
| UNKNOWN | 5 |
| major state >=60 | 0 / 8 |
| conditional cell >=50 | 0 |
| next milestone | 50R (remaining 20R) |
| accepted / duplicate append | 3 / 0 |
| peak heap / peak RSS | 26.78 MB / 115.83 MB |
| fetch / storage latency | 84.16 s / 44.63 ms |
| 502 / 503 / timeout | 0 / 0 / 0 |
| restart / OOM | 0 / 0 |
| prediction / purchase mismatch | 0 / 0 |

Status healthはcollector、storage、browserすべてhealthy、failure 0、lastError nullだった。長いfetch時間は21Rのdetail/result/hash再読取を逐次実施した合計で、heap guard超過や増加継続は観測していない。

## Remaining blockers

- usable tracking、bante、switch、other-line survival、first-conditioned secondはいずれもhuman verificationが未充足
- major state 60件 gateは0/8、conditional cell 50件 gateは0
- official winning-method source blockは本変更の対象外
- 現在のpair-supportはfirst-conditioned second/trackingが`PARTIAL`、他は`INSUFFICIENT`

従ってcollectorは継続運用可能だが、pair-supportは `NOT READY` のままである。

## Safety

- production prediction changed: NO
- production purchase changed: NO
- production UI changed: NO
- Research baseline changed: NO
- historical mutation: 0
- result-derived CONFIRMED: 0
- UNKNOWN imputation: 0
- protected cohort tuning/review use: NO
- production write: 0
