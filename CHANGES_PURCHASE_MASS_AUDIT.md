# v155 Purchase Probability Mass Audit

- 購入点数ではなく、購入対象として自然成立した終端の確率質量をどれだけ覆っているかを監査する。
- `purchaseMassAudit` を追加し、全終端質量、購入質量、自然購入候補質量、購入カバー率を保存する。
- 各1着ファミリーの既存カバー目標を自然候補質量で加重し、全体の期待カバー目標を算出する。
- 同じ点数で上位自然候補を選んだ場合の最大質量と比較し `massEfficiency` を算出する。
- `UNDER_COVERED` / `OVER_SPREAD` / `INEFFICIENT` / `BALANCED` を監査ラベルとして保存する。
- この監査自体は買い目を自動増減させない。既存のMAIN/COVER/BUYABLE_HIGH判定、安全装置、終端保存ルールは変更しない。
