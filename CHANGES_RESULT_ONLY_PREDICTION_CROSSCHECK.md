# v187 Result-only prediction crosscheck ledger

- v186の時系列・会場ゲート通過仮説を、保存済み予想スナップショットと別台帳で照合する。
- 選手仮説は、予想時の全終端確率から上位2/3着に含まれる確率質量を計算し、出走人数由来の中立比率と比較する。
- 予想ありスナップショット5件未満は `PREDICTION_CROSSCHECK_PENDING`。5件以上は `PREDICTION_CROSSCHECK_OBSERVED`。
- 方向支持は研究レビュー用の診断値であり、自動昇格条件にはしない。
- 結果のみ研究は引き続き予想精度・回収率・確率校正の母数に入れず、本番書込みも禁止する。
