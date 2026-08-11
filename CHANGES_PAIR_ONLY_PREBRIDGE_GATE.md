# v142 1-2着専用の購入評価入口

v141では全3着を購入ブリッジへ渡す構造を入れたが、その手前の `allNatural` が
full terminal naturalConvergenceScore >= 0.46 を要求していたため、
3着評価が弱い終端はブリッジ到達前に落ちる余地が残っていた。

修正:
- `derivePairNaturalConvergence` を追加。
- FIRST / SECOND の着順比率、FIRST / SECONDノード条件、1-2着ライン整合だけで評価。
- THIRDのratio、THIRD条件、THIRDライン残りは一切入力しない。
- 1-2着枝の購入評価入口は `pairNaturalConvergenceScore >= 0.46` に変更。
- SECOND群の比較・undercoverage recoveryもpair-only scoreで順位付け。
- THIRDは1-2着枝が選ばれた後にだけ購入ブリッジで比較。
- `pairGateUsesThirdInput:false` を監査に追加。
