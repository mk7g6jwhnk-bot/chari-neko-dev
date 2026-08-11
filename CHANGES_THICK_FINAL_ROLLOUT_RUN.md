# Thick final rollout run

- Added sealed final-rollout run start after manual activation approval.
- Re-verifies the final rollout plan and activation seals before start.
- Requires exact 100% exposure, the sealed cohort, all five monitoring metrics, all five rollback types, immediate stop, and mandatory post-rollout review.
- Any mismatch blocks start.
- Run state is sealed as `FINAL_ROLLOUT_MONITORING_ACTIVE`; mutation yields `SEAL_MISMATCH`.
- Production writes, automatic promotion, and production activation remain forbidden.
