# v199 Result-only limited research application monitor

- `RESEARCH_SANDBOX_ONLY` の限定研究適用ランを最大対象R数まで監視。
- 5ロールバック条件を監視し、1件でも発動したら即 `LIMITED_RESEARCH_APPLICATION_ROLLED_BACK`。
- 対象R数超過または研究スコア補正上限超過は `APPLICATION_SCOPE_BREACH`。
- `predictionImpactZero != 1` は `PREDICTION_MUTATION_DETECTED`。
- 本番書込み試行は `PRODUCTION_WRITE_ATTEMPTED`。
- 最大対象R数到達後も自動昇格せず `POST_LIMITED_RESEARCH_APPLICATION_REVIEW_REQUIRED`。
- 通常予想・買い目・確率校正・本番書込みは引き続き禁止。
