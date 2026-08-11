# v110 証拠ベース成立条件校正

- CONFIRMED / REFUTED の証拠付き条件だけを確率校正へ使用。
- UNKNOWN / EVIDENCE_PENDING / 例外レースは母数から除外。
- 選手番号を除いた条件ファミリー単位で集計。
  例: MAKURI_REACH_5 -> MAKURI_REACH_N
- 条件ごとに:
  - 予測平均
  - 実現率
  - 差
  - Brier Score
  - Log Loss
  - Wilson 95%区間
  - 公式証拠による自動判定数
  を算出。
- 研究表示:
  - 標本不足
  - 現状維持/判定保留
  - 要監視
  - 再校正候補
- 再校正候補でも本番ロジックは自動変更しない。
