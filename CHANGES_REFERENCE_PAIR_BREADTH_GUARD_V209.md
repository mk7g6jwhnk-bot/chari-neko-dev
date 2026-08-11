# v209 Reference / pair breadth guard

- Reference-only rows are now explicit `REFERENCE` / `参考表示`; they are never COVER or a funded standard purchase class.
- SECOND_PAIR_BREADTH_RECOVERY is restricted to the primary first-family. Non-primary heads retain their independent first-family/cover guards but do not inherit every near-tied second-place pair.
- This prevents multi-head cross-expansion while preserving the v156 10-12 point breadth regressions.
- No fixed ticket-count cap is used.
