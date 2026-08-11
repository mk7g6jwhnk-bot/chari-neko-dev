# v161 Thick staged expansion monitor

- Adds staged expansion monitoring for the active staged run.
- Any rollback breach stops the staged expansion immediately, even before the minimum sample.
- Requires the sealed cohort, exposure share, five monitoring metrics, and all rollback evaluations.
- Reaching the minimum sample without a breach only allows post-staged-expansion review.
- No production write, automatic promotion, full rollout, or further expansion.
