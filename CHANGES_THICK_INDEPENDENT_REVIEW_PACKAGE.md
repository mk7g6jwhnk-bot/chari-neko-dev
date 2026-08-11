# v146 厚め独立レビュー判定パッケージ

- v145のシャドー並列比較通過候補だけを対象に、独立レビュー用パッケージを生成。
- OOS再現・副作用事前監査・シャドー提案封印・並列比較結果を1つのsource chainへ固定。
- supporting evidenceだけでなくcounter evidenceを必須化。反証が0件なら `COUNTER_EVIDENCE_REQUIRED` で保留。
- 未解決質問、変更scope、proposal seal、baseline/shadow差分を保存。
- 判定は `MANUAL_INDEPENDENT_REVIEW_ONLY`。本番書込み・自動昇格は禁止。
