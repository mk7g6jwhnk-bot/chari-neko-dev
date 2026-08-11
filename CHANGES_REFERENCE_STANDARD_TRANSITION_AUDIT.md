# v161 Reference → Standard Transition Audit

- Reference-only bets are display-only and can never be promoted/copied into standard purchase.
- Any input refresh must rerun scoring → branches → terminals → classification → purchase.
- Added `referenceToStandardTransitionAudit` with carryover detection and explicit transition decision.
- A standard plan fails audit if any row still has `referenceOnly=true` or if standard and reference plans coexist.
