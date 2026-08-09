# チャリ猫 Branch Deploy

- UI bundle: v29
- Keirin engine: `KEIRIN-0.5.7-start-power-single-shrink`
- Start power: B/H frequency keeps the existing empirical-Bayes prior shrinkage, but the second `startsQuality` pull toward neutral 5 is removed. `startsQuality` remains diagnostic/confidence metadata only.
- Purpose: restore meaningful separation between riders while retaining the original small-sample protection in the B/H frequency estimate.
- Branch tiers, terminal generation, weighted branch support, purchase logic, odds handling, and UI navigation/deadline features are unchanged from v28.
