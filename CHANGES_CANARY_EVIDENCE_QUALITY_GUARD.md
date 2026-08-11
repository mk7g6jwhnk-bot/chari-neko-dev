# v132 カナリア証拠品質ロールバック

v120からrollbackOnEvidenceQualityDrop=trueを宣言していたが、実判定が未実装だった部分を接続。

- カナリア開始時に対象condition familyの証拠品質をbaseline保存
- decisive = CONFIRMED / REFUTED
- unresolved = UNKNOWN / EVIDENCE_PENDING
- 開始後5件以上の証拠で、確定率が max(60%, baseline-20pt) 未満なら EVIDENCE_QUALITY_DROP
- 確定証拠総数がbaselineより減った場合も EVIDENCE_DECISIVE_COUNT_DROPPED
- 該当時は CANARY_ROLLBACK_RECOMMENDED
- UIに現在/開始後の証拠確定率と理由を表示

本番値・表示予想・買い目には影響なし。
