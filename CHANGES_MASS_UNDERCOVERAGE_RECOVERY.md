# v156 Mass undercoverage recovery

- Uses probability mass coverage, not ticket-count quotas, to detect genuine undercoverage.
- Recovery runs only when purchaseable natural MAIN/COVER mass is more than 10 percentage points below its weighted family target.
- Adds only terminals that already satisfy normal MAIN/COVER natural-convergence, branch-head, and position-support rules.
- SUB / high-payout branches are never promoted by mass recovery; their odds/value gate remains mandatory.
- Recovery stops when the weighted coverage target is reached.
- OVER_SPREAD and INEFFICIENT remain audit warnings only; there is no automatic deletion.
- Adds `massCoverageRecoveryAudit` and per-terminal `massCoverageRecovery` provenance.
