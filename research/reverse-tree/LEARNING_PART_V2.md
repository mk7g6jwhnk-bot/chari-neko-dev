チャリ猫 学習パート v2

変更点:
- 未予想レースでも、公式結果が検証済みなら「結果構造学習」の対象にする。
- 予想誤差学習だけは prediction seal を必須にする。
- 2種類の学習を完全分離。
  1. resultLearning: 未予想でも可
  2. predictionErrorLearning: 予想済みのみ
- 結果後に予想を作り直して「当たったこと」にすることは禁止。
- 本番パラメータへの自動反映は禁止。

配置:
research/reverse-tree/engine/learning.mjs
