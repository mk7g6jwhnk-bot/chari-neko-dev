# Action Research 運用手順

## PCで使う

1. `chari-neko-dev-new` フォルダで `npm run research:action-review`。npmがないPCでは `research-action-review.cmd` をダブルクリックするか、`node research/action-tag-live-server.mjs` を実行。
2. ブラウザで http://localhost:8767 を開く。
3. 確認者IDを入力し「未確認レース」を押す。
4. 1Rを選び、取得済みなら「公式映像を開く」。URL未取得なら公式サイトで確認する。映像URLは推測生成しない。
5. 対象選手を確認し、Q1主導権争い・Q2脚状態・Q3番手反応・Q4ライン状態を選ぶ。Q5は必要な場合のみ。
6. 確認できた項目には映像URL／観測メモと独立観測チェックを付けて「保存して次へ」。分からない項目はUNKNOWN。映像を見ず結果から回答しない。

Uで現在の質問をUNKNOWN、上下キーで質問を移動、1〜6で選択、Ctrl+Enterで保存、Alt+左で前R。全項目UNKNOWNボタンもある。下書きは同じブラウザ・同じ確認者IDで復元される。確定データはPCのディスクに残り、ブラウザを閉じても失われない。

**現在は自動接続未設定で、実データは0R。** UI起動だけでRailwayの実データを取得する状態にはまだなっていない。画面の「自動接続：未設定」を稼働中と解釈しない。

## 収集接続の条件

この実装は別プロセスで動くread-only sidecar。prediction/purchaseの呼出しチェーンにimportしない。productionへのhookや新規APIは現時点で追加していない。

`action-tag-live.config.example.json` を参考に、`research/action-tag-live.config.json` に `metadataFile` と `recordsDirectory` を指定できる。既存production collectorが保存したrecordのread-only mirrorと、**確定したcohort番号付きmetadata feed** が必要。現productionにはこのfeedがなく、exporterとの接続は未完了。

metadataは1行1JSON、改行で確定するJSONL。列は `raceKey`、整数`sequence`、ISO日時`collectedAt`、mirror内の相対`recordPath`。番号は403〜502を定義した元の固定順序でなければならない。現時点のファイル順／取得順で採番し直してはいけない。

- `sequence > 502` の確実なmembershipだけを許可。403〜502、欠落、文字列番号、historical/backfillは本文を読む前に除外。
- 初回起動の `enrollment.json` 以後に取得された新規結果だけを許可。過去データのbackfillはしない。
- metadata feedを30秒間隔でstream読取。最大20raceの待機queue、1record最大2MiB、metadata行最大16Ki文字、heap guard 128MiB。
- source側のread-only mirrorが残っていれば、失敗・中断raceは次回scanで再処理する。完了したrace bundleがcheckpoint。キュー待機中のraceは完了扱いにしない。
- source directoryとResearch保存先は分離。symlinkでsource外へ出るrecordPathを拒否する。
- metadata/sourceの欠損や破損はResearch側の失敗件数に記録。本体collectorを停止させる経路はない。

## 保存形式

既定保存先は `research/action-tag-live-data/`（Git対象外）。`races/`にはauto tag、manual case、元の証拠・inputHashをまとめたrace単位イベント。`reviews/<race hash>/`にはreviewerごとのreviewイベント。

tempへ完全書込→fsync→排他的linkで確定する。既存ファイルを上書きするAPIはない。同一race・同一reviewerの二重確定は409。同一raceの別reviewerは別イベント。reviewerId、reviewedAt、originalAutoCandidate、humanJudgment、verificationStatus、disagreement、evidenceSource、evidenceHash、対象riderを保存する。

`evidenceHash`は入力されたURL／観測メモ文字列のSHA-256であり、動画バイナリの検証hashではない。sourceのinputHashは取り込んだrecordのhash。UNKNOWNの補完やtrait集約はしない。

AUTO_DIRECTは既存observerの公式決まり手イベントのみ。STRONG_PROXYは `AUTO_CANDIDATE/POSSIBLE` として保持し、自動でverifiedへ昇格しない。手動必須stateはrace review caseに集約し、Q1〜Q4＋任意Q5で回答する。

coverageはrawイベント件数。別reviewerの独立した判定も別件として計上。UNKNOWN率は人の回答が分母、未回答placeholderは分母に含めない。conditional cellはstate×value×保存されたライン条件でありtraitの重み付けではない。

## 検証

`node tests/action-tag-live.mjs`：保存・同時二重確定・別reviewer・resume・final-test除外・fail-open・heap guard・CSRF検証。

`node --max-old-space-size=128 tests/action-tag-live-load.mjs`：300Rのsynthetic負荷・再開試験。テストはOS一時ディレクトリを使い、運用データには入らない。

実race E2Eは接続後、final test外の新規5Rで別途必須。syntheticのPASSだけでREAL_ACTION_COLLECTION_RUNNINGとは判定しない。
