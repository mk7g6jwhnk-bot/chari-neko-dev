# v120 最終手動承認 + 0%カナリア

FINAL_REVIEW_READY の候補に最終手動承認を追加。

判断:
- APPROVE_CANARY
- HOLD
- REJECT

APPROVE_CANARYでも本番変更は禁止。
生成されるのは CANARY_SHADOW プランのみ。

カナリア:
- trafficShare = 0
- 表示予想に影響しない
- 買い目に影響しない
- 本番パラメータに影響しない
- 監査指紋一致必須
- 指紋が変わったら STALE_APPROVAL で再承認

productionWriteAllowed=false
productionPromotionAllowed=false
