# v229 MAIN invariant diagnostic-only fix

- Root cause: `mainInvariant.passed=false` was used as a race-wide hard blocker. Once MAIN count became zero, all terminals were overwritten with `MAIN_INVARIANT_FAILED`, hiding their original individual classification reasons and forcing standard bets to 0.
- Fix: MAIN invariant remains an audit/quality warning but no longer blocks the whole purchase engine.
- Natural COVER / BUYABLE_HIGH candidates remain eligible even when MAIN is absent.
- Missing official/evidence conditions remain hard blockers.
- Reference fallback for a genuine standard-0 race now uses `NO_STANDARD_PURCHASE_CANDIDATE`, not the misleading `MAIN_INVARIANT_FAILED` default.
- Added `purchase.mainInvariantAudit` with diagnostic-only status and counts.
