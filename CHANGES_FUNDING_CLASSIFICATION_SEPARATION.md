# v158 Funding / Classification Separation

- Purchase category (MAIN/COVER/BUYABLE_HIGH) no longer changes the automatic thick-bet priority score.
- Thick priority is derived only from terminal probability, natural convergence and available odds quality.
- The former "main thick" preview fallback that multiplied MAIN stakes even when no thick cluster existed was removed.
- The manual allocation option is now "厚め優先"; when no thick cluster exists it leaves standard allocation unchanged.
- The explicit "高配当重視" manual override remains user-selected and may intentionally use category.
- Purchase categories and terminal generation are unchanged.
