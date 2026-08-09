# KEIRIN-0.5.8-start-power-input-audit

- 予想ロジックは0.5.7から変更なし。
- 保存済み予想に startPowerEvidence を保持。
- レース詳細に主導権入力監査（B/H/出走数/生頻度/縮小後頻度/latentScore/最終値/confidence）を追加。

# チャリ猫 Branch Deploy

- UI bundle: v29
- Keirin engine: `KEIRIN-0.5.7-start-power-single-shrink`
- Start power: B/H frequency keeps the existing empirical-Bayes prior shrinkage, but the second `startsQuality` pull toward neutral 5 is removed. `startsQuality` remains diagnostic/confidence metadata only.
- Purpose: restore meaningful separation between riders while retaining the original small-sample protection in the B/H frequency estimate.
- Branch tiers, terminal generation, weighted branch support, purchase logic, odds handling, and UI navigation/deadline features are unchanged from v28.
