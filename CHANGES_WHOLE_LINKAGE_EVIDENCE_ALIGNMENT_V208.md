# v208 Whole-linkage evidence alignment

- Base: v207 merged (v163 app + v206 research).
- Whole-linkage audit upgraded to v2.
- Low natural-convergence purchases are no longer rejected by a blanket threshold when a recognized recovery path has independent second/third support and an explicit recorded purchase reason.
- `SECOND_PAIR_BREADTH_RECOVERY` requires second support >= 0.94, third support >= 0.90, explicit purchase reason, and MAIN/COVER classification to be treated as evidence-confirmed.
- Missing recovery evidence remains a high-severity warning.
- Ability-to-head probability checks now use rider role and actual head-branch existence. Three-position/follower roles are not falsely treated as missing head scenarios merely because raw first score is close.
- Line-independent fallback branches under uncertain line information are treated as unresolved reference context rather than a probability-link contradiction.
- UI displays resolved/evidence-confirmed linkage items separately from warnings.
- No purchase-generation, bet-count, class, or funding rules changed.
