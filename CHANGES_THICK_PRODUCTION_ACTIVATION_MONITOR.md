# Thick production activation monitor

- Adds sealed monitoring for the production activation run.
- Requires the same cohort, 100% exposure, all five monitoring metrics, and all locked rollback evaluations.
- Any rollback breach immediately returns `STOP_AND_ROLLBACK`.
- Before the 100-race minimum, clean observations only continue monitoring.
- At or above 100 clean races, the candidate is retained only for manual post-production-activation review.
- Production writes, persistent production mutation, and automatic promotion/finalization remain disabled.
- Monitoring observations are sealed and mutation-verifiable.
