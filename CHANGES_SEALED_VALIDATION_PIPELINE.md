# v130 sealed validation pipeline

v124で訓練側だけの候補生成に直した後も、下流の会場横断・独立監査・感度監査・昇格パッケージで全データ再計算が残っていた部分を修正。

- 提案値と現行基準値をtrainCandidateで固定
- context robustnessはsealed holdoutのみ
- independent auditもsealed holdoutの会場別評価のみ
- sensitivityは固定提案値周辺をsealed holdoutで評価
- 全データからsuggested/currentを再学習しない
- promotion packageのcurrentProbabilityもtrainCandidate.predictedAvgを採用
- proposalSource=TRAIN_ONLY_FIXED
- validationScope=SEALED_HOLDOUT_ONLY
- selectionLeakagePrevented=true

標本不足ならINSUFFICIENTとして止める。訓練データを足して通過させない。
