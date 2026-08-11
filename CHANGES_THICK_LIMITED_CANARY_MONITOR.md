# v155 Thick limited canary monitor

- Adds sealed monitoring records for an active v154 limited canary run.
- Requires the exact frozen cohort, all five monitoring metrics, and explicit evaluation of all five rollback condition types.
- Any rollback breach produces `CANARY_ROLLBACK_REQUIRED` / `STOP_AND_ROLLBACK` immediately, even before the minimum sample is reached.
- Before 30 races with no breach: `CANARY_MONITORING_CONTINUES`.
- At/after the frozen minimum sample with no breach: `CANARY_MINIMUM_SAMPLE_REACHED_NO_BREACH`, which is only eligible for manual post-canary review.
- Monitoring output is sealed; mutation invalidates it.
- No production write, automatic promotion, exposure expansion, or full rollout is enabled.
