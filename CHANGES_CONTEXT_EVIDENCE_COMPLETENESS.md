# v165 Context Evidence Completeness

- Prevent global thick-learning candidates when context dimensions are unaudited or under-sampled.
- Add `minimumAuditedDimensions` (default 1).
- A dimension is audited only with at least two qualifying groups and each group meeting `minimumContextEvaluated`.
- Dimension states are `LOCALIZED`, `DISTRIBUTED`, or `INSUFFICIENT` (with a reason).
- Global candidates now require zero localized dimensions and at least the configured number of distributed audited dimensions.
- Adds `CONTEXT_AUDIT_COVERAGE_SHORTAGE` counterevidence when coverage is insufficient.
- Insufficient context cannot populate `globalLedger`.
- Research-only and production-write protections remain unchanged.
