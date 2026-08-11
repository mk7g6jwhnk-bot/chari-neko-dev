# v190 Result-only research trial plan

- v189で承認された `RESEARCH_TRIAL_CANDIDATE_ONLY` から、研究版試験の計画をSeal化。
- 実行モードは `SHADOW_ONLY` 固定。実予想・買い目・確率・本番設定は変更しない。
- 対象仮説、対象コホート、最低試験件数（30R以上）、評価4指標、停止4条件、試験後レビュー必須を固定。
- 必須評価指標: directionalAgreement / top3ProbabilityDelta / top2ProbabilityDelta / predictionImpactZero。
- 必須停止条件: DATA_LEAKAGE_DETECTED / PREDICTION_MUTATION_DETECTED / SOURCE_SEAL_MISMATCH / TRIAL_SCOPE_BREACH。
- 計画完成後も `MANUAL_RESEARCH_TRIAL_ACTIVATION_REVIEW_ONLY`。試験実行・予想利用・確率校正・本番反映は不可。
- 計画Seal後の改変は `SEAL_MISMATCH`。
