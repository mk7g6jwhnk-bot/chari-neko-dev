# Manual review UI 改善報告

- verdict: `MANUAL_REVIEW_UI_IMPROVED_WITH_LIMITS`
- 対象: Research 専用 action-tag manual review UI
- 日本語化: Q1〜Q5の回答、操作、証拠確認を日本語表示。内部enumは維持。
- 一覧: 日付降順、会場順、R昇順。日付・会場ごとに折り畳み可能。
- filter: 今日、昨日、直近3日、すべて。初期値は今日・昨日。
- 映像補助: 日付・会場・RからGoogle検索語を生成。公式URLがある場合だけ公式映像リンクを表示。
- ガールズ: `raceCategory=girls` またはL級で判定。ライン前提のQ3〜Q5は `NOT_APPLICABLE` として非送信。男子の質問・enum・payloadは維持。
- 保存動線: 保存後は未確認一覧の新しい日付、会場、R順で次へ進む。完了済みは未確認一覧に再表示しない。
- safety: production prediction/purchase変更なし、historical mutation 0、既存Researchデータ変更なし。

## Tests

- `tests/action-review-ui.mjs`: 日本語ラベル、enum固定、ソート、期間filter、次レース選択、男子/ガールズ分離、N/A非送信。
- `tests/action-tag-live.mjs`: independent evidence guard、UNKNOWN保存、完了済み除外、live store/API。
- `tests/action-tag-race-review.mjs`: action-tag payloadと既存男子workflow。
- 上記は全件PASS。
- repository full suiteは既存のprediction系6件がFAIL（branch prior、global main、adaptive export、high odds gate、payout class）。今回の変更対象ファイルにはprediction/purchase実装を含まない。

## Remaining limitations

- 進捗件数はAPIの1ページ（最大100件）内で集計する。100件超の厳密な全件進捗には集計APIが必要。
- 映像検索は検索支援のみで、映像内容や結果を自動判定しない。
