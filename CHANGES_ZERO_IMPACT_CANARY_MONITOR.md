# v121 0%カナリア監視

最終手動承認後にCANARY_SHADOWを開始・停止・監視。

- 開始時点までのシャドー比較件数をbaselineとして固定
- baseline以後の新規比較だけで評価
- 20件以上 + 平均LogLoss改善 + シャドー勝率55%以上 → CANARY_VALIDATED
- 直近5件以上でLogLoss改善が負へ反転 → CANARY_ROLLBACK_RECOMMENDED
- 10件以上でシャドー勝率50%未満 → CANARY_ROLLBACK_RECOMMENDED
- 監査指紋変更 → CANARY_STALE

本番影響0%。表示予想・買い目・本番パラメータは変更しない。
