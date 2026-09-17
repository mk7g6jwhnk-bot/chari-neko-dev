# Manual Review availability 運用整理

- verdict: `MANUAL_REVIEW_AVAILABILITY_READY`
- status: `REVIEW_UNAVAILABLE_OLD_VIDEO` を追加。`UNKNOWN`、未確認、確認済みとは別状態。
- 判定: 日本時間で今日・昨日はreview対象。2日前以前かつ保存済み公式映像URLなしはレビュー不能。既存V2回答があるraceは日付にかかわらず確認済みを優先。
- 保存: availabilityはrace/V2 reviewから都度算出し、V1/V2回答やrace eventを更新しない。レビュー不能へのV2保存もserver側で拒否。
- 母数: `reviewTarget = confirmed + pending`。レビュー不能はpendingと母数から除外。
- UI: 収集総数、V2確認済み、V2未確認、レビュー不能、進捗、UNKNOWNを含む確認済み、男子/ガールズ確認済みを分離表示。通常一覧からレビュー不能を除外し、専用toggleをONにした場合だけ表示する。
- UNKNOWN: UNKNOWNを含むV2 reviewも確認済みとして集計。
- safety: V1変更0、V2 historical変更0、historical mutation 0、production prediction/purchase変更0。

## Tests

30 tests PASS / 0 FAIL。今日、昨日、2日前、公式映像例外、確認済み優先、pending除外、母数・進捗率、UNKNOWN、男女集計、filter、JST 0時境界、V1/V2保存path、save/read、duplicate防止、prediction/purchase regressionを確認。

## Remaining limitations

- availabilityは保存metadataではなく現在日時からの派生値。日付が進むと、未確認かつ公式映像URLなしのraceは自動的にレビュー不能になる。
- V2進捗は確認者IDごとに集計する。複数reviewerを横断した合算ではない。
