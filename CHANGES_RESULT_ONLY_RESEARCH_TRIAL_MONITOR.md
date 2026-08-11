# v193 Result-only research trial monitor

- v192 の SHADOW_ONLY 研究試験ランを監視する Seal 付きモニターを追加。
- 30R 未満・停止条件なしは `RESEARCH_TRIAL_MONITORING_CONTINUES`。
- 停止条件が1件でも発動した場合は `RESEARCH_TRIAL_STOP_REQUIRED` / `STOP_RESEARCH_TRIAL`。
- `predictionImpactZero != 1` は自動で `PREDICTION_MUTATION_DETECTED` として停止。
- 最低30R到達・無違反でも `RETAIN_FOR_POST_RESEARCH_TRIAL_REVIEW_ONLY` に止め、自動昇格しない。
- 4評価指標、4停止条件、対象コホート、件数、監視時刻を Seal 固定。
- 予想利用・予想変更・確率校正・本番反映は引き続き禁止。
