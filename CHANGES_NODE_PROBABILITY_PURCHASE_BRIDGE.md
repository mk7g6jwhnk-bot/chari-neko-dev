# v103 ノード成立確率 → 自然収束・購入接続

スクリーンショットで確認した2点を修正。

1. 展開説明の自然収束度が0%表示
- purchasePlanが naturalConvergenceScore 等を落としていた。
- 保存時nullになり、UIがNumber(null)=0として表示していた。
- 必要フィールドをpurchasePlan・snapshotまで引き継ぎ、nullは「不明」と表示。

2. MAINが広がり過ぎる
- v102のノード条件付き成立確率は監査用で、購入のnaturalConvergenceへ未接続だった。
- v103からnodeTraceがある新予想では、
  P(1着), P(2着|1着状態), P(3着|1-2着状態) と新規追加条件をnaturalConvergenceへ反映。
- 追加条件が多い2着/3着枝は自然にMAINから下がる。
- 親ですでに成立した条件は再ペナルティしない。
- 旧保存データや旧テストはnodeTraceがないため従来式を維持。

点数上限は導入していない。
