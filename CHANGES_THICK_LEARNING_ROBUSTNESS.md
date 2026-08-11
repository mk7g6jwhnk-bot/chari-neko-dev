# v139 厚め学習候補の期間再現性・反証監査

- v138 の厚め失敗段階候補を、そのまま学習候補として扱わない。
- 最低母数に加えて複数日の証拠を必須化する。
- 日付順の前半・後半に分け、同じ失敗段階の偏りが両期間で再現した場合のみ `ROBUST_REVIEW_CANDIDATE` とする。
- 片期間だけの偏りは `TEMPORAL_INSTABILITY` とし、反証 `TEMPORAL_NON_REPLICATION` を保存する。
- 日数不足・期間別母数不足はそれぞれ `INSUFFICIENT_PERIOD_EVIDENCE` / `INSUFFICIENT_WINDOW_EVIDENCE` で保留する。
- 研究専用。予想生成・購入採否・厚め配分・本番承認には影響しない。
