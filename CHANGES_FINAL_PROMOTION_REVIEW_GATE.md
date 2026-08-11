# v119 最終昇格審査ゲート

SHADOW_VALIDATED の先に、最終手動審査へ進めるかを判定する固定ゲートを追加。

条件:
- SHADOW_VALIDATED
- 結果付きシャドー比較30件以上
- 3会場以上
- 直近でもLogLoss改善
- 前半・後半とも改善
- シャドー勝率55%以上
- ロールバック信号なし

通過すると FINAL_REVIEW_READY。
ただし productionWriteAllowed=false / productionPromotionAllowed=false のまま。
本番反映は次工程で最終手動承認と分離して扱う。
