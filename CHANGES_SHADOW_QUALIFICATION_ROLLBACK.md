# v118 シャドー運用判定・ロールバック監査

シャドー比較結果を条件パッケージ単位で集計。

状態:
- SAMPLE_BUILDING: 20件未満
- SHADOW_CONTINUE: 20件以上だが判定未確定
- SHADOW_VALIDATED: 平均LogLoss改善、シャドー勝率55%以上、前後半とも改善
- ROLLBACK_RECOMMENDED: 直近サンプルで改善消失または方向反転

SHADOW_VALIDATEDでも本番昇格はしない。
ROLLBACK_RECOMMENDEDはシャドー承認解除・追加監査へ戻す候補。
