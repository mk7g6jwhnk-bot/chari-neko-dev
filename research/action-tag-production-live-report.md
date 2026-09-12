# Action-tag production live collection report

実施日: 2026-09-12  
判定: `LIVE_COLLECTION_READY_WITH_LIMITS`

## 結論

productionの既存read-only APIから、enrollment後に自然確定した実raceを取得し、ローカルResearch append-only storeへ20R保存した。production prediction / result / purchase recordへのwriteは0。初回5R safety gate、段階拡張、restart/resume、duplicate-safe、local review queue表示を完了した。

production statusはcomparison sequenceを返さないためsequenceを推測せず、2026-09-11T10:35:19.980Zの既存enrollmentより後に結果確定し、かつenrollmentのJST翌日以降のraceだけを`PRODUCTION_LIVE_STATUS_V1` forward cohortとして許可した。403〜502を示す既知識別子がrecord/metadataにあれば拒否する。sealed-result read projectionに公式決まり手がないためAUTO_DIRECTは生成せず、結果から行動を逆算していない。

## 接続と保存

- 入力: `keirin-collector-status`、`keirin-saved-prediction-detail`、`keirin-sealed-result`（GET only）
- 出力: `research/action-tag-live-data/`（Git対象外、Research-only、append-only）
- production runtime import / deploy: なし
- prediction collector待機: なし（独立CLI、逐次・bounded、fail-open）
- 1 run上限: 30R、既定5R、heap guard 192 MiB

## 実race E2E

| 項目 | 接続診断 | 修正後5R gate | 段階拡張 | 累積 |
|---|---:|---:|---:|---:|
| 新規保存 | 5 | 5 | 10 | 20 |
| technical failure | 9（分類不備） | 0 | 0 | 修正後0 |
| HTTP 502 / 503 / timeout | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| prediction hash mismatch | 0 | 0 | 0 | 0 |
| purchase hash mismatch | 0 | 0 | 0 | 0 |
| peak local heap | 約32.5 MiB | 約32.5 MiB以下 | 約28.3 MiB | < 192 MiB guard |

最初の接続試行でcancelled等9件を`RESULT_NOT_READY`としてfailure計上する分類不備を発見した。保存済み正常5Rに影響はなく、非confirmed resultを明示的なexcludedへ変更後、5R gateを再実行してfailure 0を確認した。異常raceはaction tag化していない。

production healthは両runともcollector process healthy、storage healthy、browser connected、failureCount 0、lastError null。取得中のrestart、browser crash、OOM兆候、502/503は観測されなかった。Railway process memoryは公開statusにないためproduction RSS/heapの数値比較は不能で、Research sidecarのlocal heapだけを実測した。

## Coverage / review queue

- action-tagged races: 20
- unique riders: 155
- 保存tag: 1,121
- AUTO_DIRECT: 0
- STRONG_PROXY (`POSSIBLE`): 41（INITIATIVE 36、LINE_TRACKING 5）
- MANUAL_REVIEW placeholder: 1,080
- race-level pending review: 20R
- race-level判断数: 5/R、計100
- local review API: HTTP 200、20R表示
- confirmed / strongly supported: 0 / 0（human review未実施）

AUTO_DIRECT率は0%。strong proxyを含む自動候補率はtag全体の3.66%。実際の手動操作負荷はrider別1,080判断ではなく、race-level workflowにより5判断/Rである。CLEAN/CONTESTED_LEAD、ENERGY_STATE、BANTE_RESPONSE、SWITCH/LINE_STATE、OTHER_LINE_SURVIVALは独立映像・event evidenceがなく手動必須。UNKNOWNを埋めていない。

## Resume / integrity

- 新processでstoreを再open: 20R復元
- enrollment timestamp: 不変
- 保存済みrace再投入: append 0 (`duplicateAccepted=false`)
- original predictionHash再読込差分: 0
- purchaseEvaluation hash再読込差分: 0
- historical record mutation: 0

## 次の安全な運用

新規raceの確定後に5Rずつ`npm run research:action-collect -- 5`を実行する。HTTP error、hash mismatch、health異常、heap guardのいずれかが発生したrunでは拡張しない。AUTO_DIRECTを増やすには、公式決まり手を独立証拠・source hash付きでread-only projectionへ追加する別作業が必要であり、現状は推定で代替しない。

## Safety

- production prediction changed: NO
- production purchase changed: NO
- production UI changed: NO
- Research baseline changed: NO
- historical mutation count: 0
- 403〜502 tuning/review use: NO
- result-derived CONFIRMED: NO
- UNKNOWN imputation: NO
- production record mutation: 0
- production write: 0
