# v154 Thick limited canary run

- v153 activation approval and v152 plan seals are re-verified immediately before start.
- Cohort, exposure share, monitoring metrics, rollback types, and immediate-stop policy must exactly match the sealed plan.
- The active run is sealed; post-start mutation produces `SEAL_MISMATCH`.
- Status is `CANARY_MONITORING_ACTIVE` / `MONITOR_CANARY_ONLY`.
- Research-only: no production writes, no automatic promotion, no full rollout or exposure expansion.
