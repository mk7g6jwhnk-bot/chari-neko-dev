# v133 カナリア比較コホート + 証拠ゲート

現行methodologyEpoch / shadowEvaluationEpoch / ISOLATED_NORMALIZEDだけをカナリア母数に採用。旧epoch・非孤立比較は除外。LogLoss/勝率だけではVALIDATEDにせず、開始後の確定証拠5件以上かつ確定率60%以上を追加条件にした。本番影響0%。
