# v143 選手能力評価 v3

- 素の能力評価とライン役割・位置価値を分離。
- raw mechanism から rolePrior を除外。
- first/second/third の raw ability placement を先に計算。
- role/line context は後段で小さく補正。
- 並び未取得時は context weight を下げる。
- 3着評価も「三番手だから高い」ではなく能力を先に評価。
- rawAbilityPlacementScores / contextPriorScores / contextAdjustment を保存。
- riderAbilityEvaluationAudit を追加。
