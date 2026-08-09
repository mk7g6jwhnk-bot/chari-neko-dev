# チャリ猫 Branch Deploy

- UI bundle: v28
- Keirin engine: `KEIRIN-0.5.6-natural-branch-tiers`
- Main-branch selection: removed the forced upper/lower 2-cluster split. The uniquely highest structural branch (exact ties allowed) is the core scenario; remaining branches become contenders, and are only split into contender/sub tiers when the lower-tail adjacent-score distribution contains a robust natural break.
- Removed from main-branch selection: fixed `top score × 90%` cutoff and forced 2-group clustering.
- Terminal generation, weighted branch support, purchase thresholds, odds handling, and UI v24 navigation/deadline features are otherwise unchanged from v27.
