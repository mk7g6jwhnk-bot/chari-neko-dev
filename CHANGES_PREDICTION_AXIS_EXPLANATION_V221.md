# v221 Prediction-axis explanation

Version: `KEIRIN-0.17.2-prediction-axis-explanation`

## Purpose

予想詳細の説明を、購入された買い目から逆算する方式から、予測エンジンが生成した展開枝・終端・着順条件を直接説明する方式へ分離する。

## Changes

- `keirin/engine/prediction-explanation.mjs` を新設。
- 予測エンジンが `explanation` を生成し、購入エンジンは説明生成に関与しない。
- 軸展開は予測枝の確率寄与とCENTER/main構造から選定。
- 番手差し、先行押し切り、捲り、踏み合い、単騎浮上、追走崩れについて具体的な時系列文章を生成。
- 根拠として branch score trace、枝確率寄与、1/2/3着ノードの成立条件・条件付き確率、ライン役割を保存。
- 代表終端と代替展開を保存。
- `predictionExplanation` を予想スナップショットへ保存。
- UIを「軸になった展開と根拠」と「購入エンジン：なぜこの買い目を採用したか」に分離。
- 標準購入0点でも予測側の軸展開説明は表示する。

## Boundary invariants

- `generatedFrom=PREDICTION_ENGINE_ONLY`
- `purchaseFieldsUsed=false`
- `purchaseClassificationUsed=false`
- `oddsUsed=false`
- オッズ変更で `predictionExplanation` が変化しないことを専用テストで確認。

## Tests

- `tests/keirin-prediction-axis-explanation-v221.mjs`
