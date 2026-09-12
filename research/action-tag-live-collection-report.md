# Action-tag live collection audit — 2026-09-11

## 判定

**LOCAL_REVIEW_READY_BUT_AUTO_HOOK_BLOCKED**

実データ収集は未開始。tagged race **0**、pending review **0**、300R進捗 **0/300 (0%)**。localhost UI、append-only store、read-only sidecar adapterとテストは実装済み。実race 5R E2Eは未達であり、依頼全体を完了とは判定しない。

production接続を有効化していない理由：

1. 403〜502を定義した固定番号とraceKeyの対応metadataを取得できていない。現collectorのstatusは総数を返すがmembershipを返さない。ローカル既存コードは`comparedAt`＋raceKey順を使うが、現在の取得順で採番し直すと固定cohortと一致する保証がない。
2. 既存productionに本adapter用のmetadata feed／read-only record mirrorがない。これらを作るproducer側exporterと自動配信は未接続。ファイル入力adapterを「production hook稼働」とは扱わない。
3. productionの独立した2回のstatus観測でmemoryが大きく変動しており、hook追加後の安定性を保証できない。認証設定の変更・SSH鍵追加・認証bypassは行っていない。

Railwayの既存ログイン済み画面ではVolumeのディレクトリ名まで確認した。consoleは別タブで使用中であり、他の作業を奪って実行していない。保護対象race本文を取得せず、raceデータのコピー／擬似採番による代替もしなかった。

## 実装したもの

- `research/action-review/`：localhost専用のHTTP UI。Q1〜Q4、任意Q5、対象rider、確認強度、証拠入力、大きな選択ボタン、keyboard shortcut、保存→次R、前R、reviewerごとの未確認filter、保存済みの再表示。
- `action-tag-live-server.mjs`：127.0.0.1限定bind。Host/Origin/Fetch-Site検査、JSON＋専用header必須、32KiB request上限、CSP、no-store。production user UIや既存runtimeからのimportなし。
- `action-tag-live-store.mjs`：1raceのauto tags＋manual review caseを1イベントで保存。reviewはrace×reviewer単位の別append-onlyイベント。完全書込＋fsync後の排他的linkで二重書込／半端な確定を防ぐ。既存イベントの上書き経路なし。
- `action-tag-live-adapter.mjs`：30秒のread-only sidecar scan。metadata streaming、bounded queue 20、heap guard 128MiB、1record 2MiB上限、失敗race再試行、永続raceイベントをcheckpointとしてresume。
- `action-tag-live-coverage.mjs`：tagged/reviewed/pending、AUTO_DIRECT、STRONG_PROXY、CONFIRMED、STRONGLY_SUPPORTED、UNKNOWN率、stateとconditional cellの進捗。300/60/50の目標を表示。全race本文をメモリに一括保持しない。
- 起動script、npm scripts、日本語README、設定例。

Research保存先は`research/action-tag-live-data/`。テストデータはOS一時ディレクトリのみで運用件数には含めない。設定値・運用データはGit対象外。入力元とResearch出力先の重複を拒否する。

## 収集・確認ルール

自動で保存するもの：既存observerが公式決まり手イベントから作るAUTO_DIRECT、およびMULTI_SOURCE_STRONG_PROXY候補。候補の保存laneは既存schemaに合わせてAUTO_CANDIDATE、statusはPOSSIBLE。STRONG_PROXY→verified自動昇格なし。単なる着順から決まり手を補うコードなし。

人が回答するもの：主導権争い、主導権選手の脚状態、番手反応、ライン状態。別線残存は任意Q5。UNKNOWNはUNKNOWNのまま保持。非UNKNOWNには対象選手と独立観測の明示を要求。既存候補とのdisagreementは同じrider・stateで照合する。

reviewerId、reviewedAt、originalAutoCandidate、humanJudgment、verificationStatus、disagreement、evidenceSource、evidenceHash、targetRidersを保存。同じreviewerは同じraceを二重確定できず、別reviewerは別recordを保持できる。証拠hashはURL／観測メモ文字列のSHA-256であり映像そのもののhashではない。

state判定は4＋任意1。ただし対象選手の指定、証拠メモの入力、映像視聴時間は別途必要。既存の44秒/Rは推定値のままで、今回実測していない。rider behavior traitの集約・重み付けは実施していない。

## final test保護

- source本文を開く前にmetadataの`sequence`を検査。403〜502、番号欠落、文字列番号、502以前を拒否。ライブ収集は整数503以後のみ。
- `sealed`、`metadata`、`cohort`内の保護番号も検査。record受入れ・review保存にも再検査。
- 初回起動のenrollment以後の新規取得／新規結果だけを許可。既存結果の日時やcohort番号を変えて取り込まない。
- 既存の候補生成関数にも保護対象のearly returnを追加。
- 固定cohort metadataがない状態はfail-closed。これはResearchだけの停止であり、本体collectorは待たない。

## 公式映像監査

既存browser collector sourceにreplay/video専用取得フィールド生成が見つからなかった。KEIRIN.JPには公式LIVE／digest導線が存在するが、raceごとの安定した自動取得URL契約は未確認。[公式の映像案内](https://www.keirin.jp/pc/dfw/portal/guest/campaign/midnight_keirin/race.html)、[公式の配信・視聴案内](https://keirin.jp/pc/dfw/portal/guest/news/2026khn/01/news20260122_01a.html)。

入力に既存のkeirin.jp HTTPS URLがあれば保持し、1clickで別タブに開く。URLがないときは未取得と表示する。現段階のallowlistはkeirin.jp/www.keirin.jpだけで、他会場ドメインや公式YouTubeの自動認定はしない。login、bypass、非公式動画取得、動画解析は一切行っていない。

## 検証結果

| 検証 | 結果 |
|---|---|
| action-tag-live API/store E2E（synthetic 6R） | PASS |
| 403〜502全番号・nested番号・番号欠落の拒否 | PASS |
| 保護metadataの本文pathを開かない | PASS（存在しないpathで検証） |
| 同一reviewer同時POST | 201×1、409×1 |
| 元record不変・同一reviewer二重確定禁止 | PASS |
| 別reviewerの別record、disagreement、conditional context | PASS |
| 欠損source復旧後の再処理・heap guard | PASS |
| HTTP server再起動後のrace/review復元 | PASS |
| Origin不一致・独立観測欠落の拒否 | PASS |
| ブラウザ下書き→reload復元、U、Ctrl+Enter、前R | PASS（分離したsynthetic UI） |
| 既存action-tag collection / auto observation / race review | PASS |
| prediction-flow / purchase-five-races回帰 | PASS |
| 実raceから自然生成→review→restartの5R E2E | **BLOCKED / 未実施** |

300R synthetic負荷（`node --max-old-space-size=128 tests/action-tag-live-load.mjs`）：

- 300R、総処理1,676ms、最大race処理109ms、queue peak 20。
- failures 0、heap guard 0、再開で重複300Rを回避。
- 終了時heap 10,746,000 bytes、RSS 55,365,632 bytes。peak heap/RSSを測定した数字ではない。
- OOM／test process restartなし。実際のproduction recordサイズ・実raceの負荷測定の代わりにはならない。

## production負荷の読取監査

変更前から接続先は既存の`/keirin/status/snapshot`。確認はmetadataのみ。今回Railwayにコード・環境変数・データを書き込んでいない。

| UTC時刻 | HTTP | heap bytes | RSS bytes | compared | operational/browser/storage |
|---|---:|---:|---:|---:|---|
| 2026-09-11 10:32:28 | 200 | 194,982,440 | 1,172,606,976 | 547 | true / true / true |
| 2026-09-11 10:44:28 | 200 | 1,223,316,832 | 1,820,737,536 | 548 | true / true / true |

両snapshotのlastRefreshErrorはnull。2回のGETで502はなかったが、長時間の502/OOM/restart/browser crash監査は未実施。メモリ増加は未接続のlocal Research処理に起因するものではなく、原因は今回未特定。production hook追加前後の比較は**未実施**であり、「安定性悪化なし」を証明したとはしない。deployしない。

## 残作業と再開条件

1. 固定cohort metadataを正規のread-only経路で取得し、403〜502のraceKey対応と番号定義を確定する。
2. production保存後のmetadata feed＋read-only record mirrorを用意し、sidecarへ接続。prediction/purchaseへawaitや依存を追加しない。
3. 503以後かつenrollment以後の実新規5RでAUTO_DIRECT/STRONG_PROXY/manual queueの自然生成を確認する。証拠がない手動stateはUNKNOWN。
4. 実UI保存とプロセスrestart/resume、実負荷を確認。これが揃うまでREAL_ACTION_COLLECTION_RUNNINGへ昇格しない。

## 安全確認

- production prediction changed: NO
- production purchase changed: NO
- production user UI changed: NO
- Research baseline changed: NO
- historical mutation: 0
- UNKNOWN imputation: NO
- result-derived action confirmation: NO（公式決まり手イベント以外の結果逆算なし）
- 403〜502 tuning/review use: NO
- production deploy: NO / deployment ID: N/A

今回commitはResearch UI・adapter・tests・docs・起動scriptとResearch guardのみ。commit IDは最終応答を参照。
